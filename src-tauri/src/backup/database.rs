use crate::backup::archive::{create_7z_archive, verify_7z_archive};
use crate::backup::common::{
    BackupResult, acquire_database_backup_operation_lock, ensure_database_backup_available,
    mark_database_backup_unavailable, next_backup_filename, resolve_backup_dir,
    temporary_sibling_path,
};
use crate::backup::covers::scan_and_copy_custom_covers;
use crate::database::db::close_connection;
use migration::{Migrator, MigratorTrait};
use sea_orm::{
    ConnectOptions, ConnectionTrait, Database, DatabaseConnection, DbBackend, Statement,
};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{State, command};

use reina_path::get_db_path;

/// 数据库导入结果
#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub success: bool,
    pub message: String,
    pub backup_path: Option<String>,
    pub requires_backup_confirmation: bool,
    pub restart_required: bool,
    pub warning: Option<String>,
    pub recovery_path: Option<String>,
    pub covers_recovery_path: Option<String>,
}

// ==================== 数据库备份和导入 ====================

/// 生成不会覆盖同秒已有备份的文件名。
fn generate_backup_filename(backup_dir: &Path) -> Result<String, String> {
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    next_backup_filename(backup_dir, "reina_manager_", &timestamp, ".db")
}

/// 热备份数据库，可选包含自定义封面的完整数据包。
#[command]
pub async fn backup_database(
    db: State<'_, DatabaseConnection>,
    include_covers: bool,
) -> Result<BackupResult, String> {
    let _operation_guard = acquire_database_backup_operation_lock().await;
    ensure_database_backup_available()?;
    if include_covers {
        backup_data_file(&db, &reina_path::get_base_data_dir()?.join("covers")).await
    } else {
        backup_database_file(&db).await
    }
}

async fn backup_data_file(db: &DatabaseConnection, covers: &Path) -> Result<BackupResult, String> {
    let backup_dir = resolve_backup_dir(db).await?;
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let name = next_backup_filename(&backup_dir, "reina_data_", &timestamp, ".7z")?;
    backup_data_archive_to(db, covers, &backup_dir.join(name), None).await
}

pub(super) async fn backup_data_archive_to(
    db: &DatabaseConnection,
    covers_dir: &Path,
    archive_path: &Path,
    cold_source: Option<&Path>,
) -> Result<BackupResult, String> {
    ensure_target_does_not_exist(archive_path, "数据备份")?;
    let temporary_archive = temporary_sibling_path(archive_path, "reina-creating")?;
    let staging = std::env::temp_dir().join(format!("reina-data-backup-{}", uuid::Uuid::now_v7()));
    let result = async {
        fs::create_dir_all(staging.join("data"))
            .map_err(|e| format!("创建备份临时目录失败: {e}"))?;
        if let Some(source) = cold_source {
            copy_database_file_cold_to(source, &staging.join("data"), "reina_manager.db")?;
        } else {
            backup_database_file_to(db, &staging.join("data"), "reina_manager.db").await?;
        }
        // 缺少封面目录是正常情况，其他读取错误必须中止完整数据备份。
        match fs::metadata(covers_dir) {
            Ok(metadata) if metadata.is_dir() => {
                scan_and_copy_custom_covers(covers_dir, &staging.join("covers"))?;
            }
            Ok(_) => return Err("封面路径不是目录，无法备份".into()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
            Err(e) => return Err(format!("读取封面目录失败: {e}")),
        }
        create_7z_archive(&staging, &temporary_archive)
            .map_err(|e| format!("创建数据备份失败: {e}"))?;
        verify_7z_archive(&temporary_archive).map_err(|e| format!("校验数据备份失败: {e}"))?;
        ensure_target_does_not_exist(archive_path, "数据备份")?;
        fs::rename(&temporary_archive, archive_path)
            .map_err(|e| format!("发布数据备份失败: {e}"))?;
        Ok(BackupResult {
            success: true,
            path: Some(archive_path.to_string_lossy().into_owned()),
            message: "数据备份成功".to_string(),
        })
    }
    .await;
    if let Err(error) = fs::remove_dir_all(&staging) {
        log::warn!("清理数据备份临时目录失败 {}: {error}", staging.display());
    }
    if result.is_err() {
        let _ = fs::remove_file(&temporary_archive);
    }
    result
}

#[command]
pub async fn open_database_backup_folder(db: State<'_, DatabaseConnection>) -> Result<(), String> {
    let path = resolve_backup_dir(&db).await?;
    crate::utils::fs::open_directory(path.to_string_lossy().into_owned()).await
}

pub async fn backup_database_file(db: &DatabaseConnection) -> Result<BackupResult, String> {
    let backup_dir = resolve_backup_dir(db).await?;
    let backup_name = generate_backup_filename(&backup_dir)?;
    backup_database_file_to(db, &backup_dir, &backup_name).await
}

pub(super) async fn backup_database_file_to(
    db: &DatabaseConnection,
    backup_dir: &Path,
    backup_name: &str,
) -> Result<BackupResult, String> {
    let target_path = backup_dir.join(backup_name);
    ensure_target_does_not_exist(&target_path, "数据库备份")?;
    let temporary_path = temporary_sibling_path(&target_path, "reina-creating")?;

    // 将路径转换为字符串
    // SQLite 在 Windows 上也支持正斜杠，使用正斜杠可以避免转义问题
    let temporary_path_str = temporary_path
        .to_str()
        .ok_or("备份路径包含无效字符")?
        .replace('\\', "/"); // 将所有反斜杠转换为正斜杠

    // 使用 VACUUM INTO 进行热备份
    // 只需要转义单引号，路径分隔符使用正斜杠不需要转义
    let escaped_path = temporary_path_str.replace('\'', "''");
    let vacuum_sql = format!("VACUUM INTO '{}'", escaped_path);

    // 执行 VACUUM INTO
    if let Err(error) = db
        .execute_raw(Statement::from_string(DbBackend::Sqlite, vacuum_sql))
        .await
    {
        // SQLite 失败时可能留下不完整目标，不能让它被误认为有效备份。
        fs::remove_file(&temporary_path).ok();
        return Err(format!("VACUUM INTO 备份失败: {error}"));
    }

    if let Err(error) = ensure_target_does_not_exist(&target_path, "数据库备份") {
        fs::remove_file(&temporary_path).ok();
        return Err(error);
    }
    if let Err(error) = fs::rename(&temporary_path, &target_path) {
        fs::remove_file(&temporary_path).ok();
        return Err(format!("提交数据库备份失败: {error}"));
    }

    let target_path_str = target_path.to_string_lossy().into_owned();

    log::info!("数据库热备份成功: {}", target_path_str);

    Ok(BackupResult {
        success: true,
        path: Some(target_path_str),
        message: "数据库备份成功".to_string(),
    })
}

pub(super) fn copy_database_file_cold_to(
    db_path: &Path,
    backup_dir: &Path,
    backup_name: &str,
) -> Result<BackupResult, String> {
    if !db_path.exists() {
        return Err(format!("当前数据库文件不存在: {}", db_path.display()));
    }

    let backup_file_path = backup_dir.join(backup_name);
    ensure_target_does_not_exist(&backup_file_path, "数据库备份")?;
    let temporary_path = temporary_sibling_path(&backup_file_path, "reina-creating")?;
    if let Err(error) = copy_file_fully(db_path, &temporary_path) {
        fs::remove_file(&temporary_path).ok();
        return Err(format!("数据库冷备份失败: {error}"));
    }
    if let Err(error) = ensure_target_does_not_exist(&backup_file_path, "数据库备份") {
        fs::remove_file(&temporary_path).ok();
        return Err(error);
    }
    if let Err(error) = fs::rename(&temporary_path, &backup_file_path) {
        fs::remove_file(&temporary_path).ok();
        return Err(format!("提交数据库冷备份失败: {error}"));
    }

    let path_str = backup_file_path.to_string_lossy().to_string();
    log::info!("数据库冷备份成功: {}", path_str);

    Ok(BackupResult {
        success: true,
        path: Some(path_str),
        message: "数据库备份成功".to_string(),
    })
}

/// 先在同目录副本中校验、迁移，再以改名保留旧库并提交新库。
#[command]
pub async fn import_database(
    source_path: String,
    allow_backup_failure: Option<bool>,
    db: State<'_, DatabaseConnection>,
) -> Result<ImportResult, String> {
    let target = get_db_path()?;
    let covers = reina_path::get_base_data_dir()?.join("covers");
    import_database_at_paths(
        Path::new(&source_path),
        &target,
        &covers,
        allow_backup_failure.unwrap_or(false),
        db.inner(),
    )
    .await
}

async fn import_database_at_paths(
    source: &Path,
    target: &Path,
    covers: &Path,
    allow_backup_failure: bool,
    db: &DatabaseConnection,
) -> Result<ImportResult, String> {
    if !source.is_absolute() || !source.is_file() {
        return Err("请选择有效的备份文件绝对路径".into());
    }
    if source
        .extension()
        .and_then(|e| e.to_str())
        .is_some_and(|e| e.eq_ignore_ascii_case("7z"))
    {
        let extracted = temporary_sibling_path(covers, "reina-extracted")?;
        fs::create_dir(&extracted).map_err(|e| format!("创建解压目录失败: {e}"))?;
        let result = async {
            extract_data_archive(source, &extracted)?;
            import_prepared_database(
                &extracted.join("data/reina_manager.db"),
                target,
                covers,
                allow_backup_failure,
                db,
                Some(&extracted.join("covers")),
            )
            .await
        }
        .await;
        if !matches!(&result, Ok(import) if import.recovery_path.is_some())
            && let Err(error) = fs::remove_dir_all(&extracted)
        {
            log::warn!("清理解压目录失败 {}: {error}", extracted.display());
        }
        result
    } else {
        import_prepared_database(source, target, covers, allow_backup_failure, db, None).await
    }
}

fn extract_data_archive(source: &Path, output: &Path) -> Result<(), String> {
    use sevenz_rust2::{ArchiveReader, Password};
    let mut reader = ArchiveReader::open(source, Password::empty())
        .map_err(|e| format!("打开数据包失败: {e}"))?;
    let (entries, _) =
        crate::backup::savedata::archive::inspect::validate_entries(&reader.archive().files, false)
            .map_err(|e| format!("数据包不安全: {e}"))?;
    let mut has_database = false;
    for (parts, directory) in entries {
        let name = parts.join("/");
        let allowed = if directory {
            name == "data" || name == "covers" || name == "covers/custom"
        } else if name == "data/reina_manager.db" {
            has_database = true;
            true
        } else {
            parts.len() == 3 && parts[0] == "covers" && parts[1] == "custom"
        };
        if !allowed {
            return Err(format!("数据包包含不支持的内容: {name}"));
        }
    }
    if !has_database {
        return Err("数据包缺少 data/reina_manager.db".into());
    }
    crate::backup::savedata::restore::common::extract_archive(&mut reader, output)
        .map_err(|e| format!("解压数据包失败: {e}"))?;
    fs::create_dir_all(output.join("covers/custom"))
        .map_err(|e| format!("准备封面目录失败: {e}"))?;
    Ok(())
}

async fn import_prepared_database(
    source: &Path,
    target: &Path,
    covers: &Path,
    allow_backup_failure: bool,
    db: &DatabaseConnection,
    imported_covers: Option<&Path>,
) -> Result<ImportResult, String> {
    if !source.is_absolute() {
        return Err("源数据库路径必须是绝对路径".into());
    }
    if !source.is_file() {
        return Err("请选择有效的数据库文件".into());
    }
    if !source
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("db"))
    {
        return Err("无效的数据库文件，请选择 .db 文件".into());
    }
    if fs::canonicalize(source).map_err(|error| import_error("无法访问待导入数据库", error))?
        == fs::canonicalize(target).map_err(|error| import_error("无法访问当前数据库", error))?
    {
        return Err("不能导入当前正在使用的数据库文件".into());
    }
    let _operation_guard = acquire_database_backup_operation_lock().await;
    ensure_database_backup_available()?;

    let staged = temporary_sibling_path(target, "reina-importing")?;
    let rollback = temporary_sibling_path(target, "reina-before-import")?;
    let covers_rollback = temporary_sibling_path(covers, "reina-before-import")?;
    let preparation = async {
        ensure_database_logs_flushed(source)?;
        copy_file_fully(source, &staged)
            .map_err(|error| import_error("复制数据库失败，请检查磁盘空间和访问权限", error))?;
        validate_and_migrate_import(&staged).await
    }
    .await;
    if let Err(error) = preparation {
        fs::remove_file(&staged).ok();
        return Err(error);
    }

    // 常规备份失败时仍保持连接可用；确认跳过只影响备份，不影响改名回滚保障。
    let (backup_path, backup_error) = match backup_data_file(db, covers).await {
        Ok(result) => (result.path, None),
        Err(error) => (None, Some(import_error("旧数据备份失败", error))),
    };
    if let Some(error) = &backup_error
        && !allow_backup_failure
    {
        fs::remove_file(&staged).ok();
        return Ok(ImportResult {
            success: false,
            message: error.clone(),
            backup_path,
            requires_backup_confirmation: true,
            restart_required: false,
            warning: None,
            recovery_path: None,
            covers_recovery_path: None,
        });
    }

    // 先检查 WAL 已落盘，避免只改名主文件而遗漏尚未提交到主文件的旧数据。
    if let Err(error) = checkpoint_database(db).await {
        fs::remove_file(&staged).ok();
        return Err(error);
    }
    mark_database_backup_unavailable();
    if let Err(error) = close_connection(db.clone()).await {
        fs::remove_file(&staged).ok();
        return Ok(import_failure(
            import_error("关闭数据库失败，旧数据未改动", error),
            backup_path,
            None,
            None,
        ));
    }

    let commit = commit_import_files_with(
        &staged,
        target,
        &rollback,
        covers,
        &covers_rollback,
        imported_covers,
        |from, to| fs::rename(from, to),
    );
    match commit {
        Ok(()) => {
            // 清理函数会自行取得操作锁，且必须读取已经替换的新库。
            drop(_operation_guard);
            let mut warnings = Vec::new();
            if backup_error.is_some() {
                warnings.push("已跳过失败的保护备份");
            }
            if let Err(error) =
                cleanup_after_import(target, covers, &rollback, &covers_rollback).await
            {
                log::warn!("导入成功，后续清理未完成: {error}");
                warnings.push("后续清理未完成，请查看日志");
            }
            Ok(ImportResult {
                success: true,
                message: "数据库导入成功".into(),
                backup_path,
                requires_backup_confirmation: false,
                restart_required: true,
                warning: (!warnings.is_empty()).then(|| warnings.join("；")),
                recovery_path: None,
                covers_recovery_path: None,
            })
        }
        Err(error) => {
            // 回滚失败时保留所有文件，禁止自动重启，以免启动流程创建空库。
            if error.recovery_path.is_none() {
                fs::remove_file(&staged).ok();
            }
            Ok(import_failure(
                error.message,
                backup_path,
                error.recovery_path,
                error.covers_recovery_path,
            ))
        }
    }
}

async fn cleanup_after_import(
    target: &Path,
    covers: &Path,
    rollback: &Path,
    covers_rollback: &Path,
) -> Result<(), String> {
    let mut cleanup_failed = false;
    for (path, directory) in [(rollback, false), (covers_rollback, true)] {
        let removal = if directory {
            fs::remove_dir_all(path)
        } else {
            fs::remove_file(path)
        };
        if let Err(error) = removal
            && error.kind() != std::io::ErrorKind::NotFound
        {
            cleanup_failed = true;
            log::warn!("清理导入回滚副本失败 {}: {error}", path.display());
        }
    }
    // 原连接已关闭；只读打开新库，避免清理时重建数据库或更改持久化设置。
    let url = url::Url::from_file_path(target).map_err(|_| "导入数据库路径无效")?;
    let mut options = ConnectOptions::new(format!("sqlite:{}?mode=ro", url.path()));
    options
        .max_connections(1)
        .min_connections(1)
        .sqlx_logging(false);
    let connection = Database::connect(options)
        .await
        .map_err(|e| e.to_string())?;
    let result = crate::game::cover::assets::clean_unused_covers_at(&connection, covers).await;
    let close = connection.close().await.map_err(|e| e.to_string());
    let result = result?;
    if result.failed_files > 0 || cleanup_failed {
        return Err(format!(
            "回滚副本或无用封面清理未完成，封面失败数 {}",
            result.failed_files
        ));
    }
    close?;
    log::info!(
        "导入后清理无用封面完成，删除 {} 个文件",
        result.deleted_files
    );
    Ok(())
}

// 界面只显示简短原因，底层错误和路径保留在日志中供排查。
fn import_error(message: &str, error: impl std::fmt::Display) -> String {
    log::error!("{message}: {error}");
    message.to_owned()
}

fn import_failure(
    message: String,
    backup_path: Option<String>,
    recovery_path: Option<PathBuf>,
    covers_recovery_path: Option<PathBuf>,
) -> ImportResult {
    ImportResult {
        success: false,
        message,
        backup_path,
        requires_backup_confirmation: false,
        restart_required: recovery_path.is_none(),
        warning: None,
        recovery_path: recovery_path.map(|path| path.to_string_lossy().into_owned()),
        covers_recovery_path: covers_recovery_path.map(|path| path.to_string_lossy().into_owned()),
    }
}

async fn checkpoint_database(db: &DatabaseConnection) -> Result<(), String> {
    let row = db
        .query_one_raw(Statement::from_string(
            DbBackend::Sqlite,
            "PRAGMA wal_checkpoint(TRUNCATE)",
        ))
        .await
        .map_err(|error| import_error("保存当前数据库失败，请稍后重试", error))?
        .ok_or("无法检查数据库写入落盘状态")?;
    let busy = row
        .try_get::<i32>("", "busy")
        .map_err(|error| import_error("无法检查当前数据库的保存状态", error))?;
    if busy != 0 {
        return Err("数据库仍被其他连接写入，已停止导入，请稍后重试".into());
    }
    Ok(())
}

async fn validate_and_migrate_import(path: &Path) -> Result<(), String> {
    if fs::metadata(path)
        .map_err(|error| import_error("无法读取待导入数据库", error))?
        .len()
        == 0
    {
        return Err("不能导入零字节的空数据库文件".into());
    }
    let url = url::Url::from_file_path(path).map_err(|_| "导入临时路径无效")?;
    let mut options = ConnectOptions::new(format!("sqlite:{}?mode=rw", url.path()));
    options
        .max_connections(1)
        .min_connections(1)
        .sqlx_logging(false);
    let connection = Database::connect(options)
        .await
        .map_err(|error| import_error("无法打开待导入数据库，请确认文件有效", error))?;
    let result = async {
        verify_import_integrity(&connection).await?;
        // 只检查各代库共有的最小业务结构，避免空库进入新用户建表分支；允许没有游戏记录。
        connection
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT games.id, games.id_type, user.id FROM games, user LIMIT 0",
            ))
            .await
            .map_err(|error| import_error("数据库缺少业务结构，无法导入", error))?;
        // 只读迁移状态检查会拒绝本程序不认识的迁移，旧版本缺少迁移则正常补齐。
        Migrator::get_pending_migrations_read_only(&connection)
            .await
            .map_err(|error| import_error("数据库结构版本不兼容，请尝试更新应用", error))?;
        connection
            .execute_unprepared("PRAGMA foreign_keys = ON")
            .await
            .map_err(|error| import_error("无法启用数据库关联检查", error))?;
        // 迁移的输入本来就是副本，失败时直接丢弃；不能读取源库配置另建常规备份。
        Migrator::up(&connection, None)
            .await
            .map_err(|error| import_error("数据库迁移失败，旧数据未改动", error))?;
        verify_import_integrity(&connection).await?;
        // integrity_check 不检查外键，启用外键约束也不会追查已有的孤立记录。
        if connection
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "PRAGMA foreign_key_check",
            ))
            .await
            .map_err(|error| import_error("数据库外键检查失败，无法导入", error))?
            .is_some()
        {
            return Err("数据库外键检查失败，存在引用缺失的数据".into());
        }
        connection
            .execute_unprepared("PRAGMA journal_mode = DELETE")
            .await
            .map_err(|error| import_error("无法保存升级后的数据库", error))?;
        Ok(())
    }
    .await;
    let close = connection
        .close()
        .await
        .map_err(|error| import_error("关闭临时数据库失败", error));
    result.and(close)?;
    fs::OpenOptions::new()
        .write(true)
        .open(path)
        .and_then(|file| file.sync_all())
        .map_err(|error| import_error("保存临时数据库失败，请检查磁盘空间和访问权限", error))
}

async fn verify_import_integrity(connection: &DatabaseConnection) -> Result<(), String> {
    let rows = connection
        .query_all_raw(Statement::from_string(
            DbBackend::Sqlite,
            "PRAGMA integrity_check",
        ))
        .await
        .map_err(|error| import_error("数据库完整性检查失败，无法导入", error))?;
    if rows.len() == 1
        && rows[0]
            .try_get::<String>("", "integrity_check")
            .map_err(|error| import_error("无法读取数据库完整性检查结果", error))?
            == "ok"
    {
        Ok(())
    } else {
        log::error!("数据库完整性检查失败: {rows:?}");
        Err("数据库完整性检查失败，文件可能已损坏".into())
    }
}

#[derive(Debug)]
struct ImportCommitError {
    message: String,
    recovery_path: Option<PathBuf>,
    covers_recovery_path: Option<PathBuf>,
}

fn ensure_database_logs_flushed(path: &Path) -> Result<(), String> {
    for suffix in ["-wal", "-journal"] {
        let mut log_name = path.as_os_str().to_os_string();
        log_name.push(suffix);
        let log_path = PathBuf::from(log_name);
        match fs::metadata(&log_path) {
            Ok(metadata) if metadata.len() != 0 => {
                return Err(import_error(
                    "数据库仍有事务日志，请正常关闭使用该数据库的程序后重试",
                    log_path.display(),
                ));
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(import_error("无法检查数据库事务日志", error)),
        }
    }
    Ok(())
}

#[cfg(test)]
fn commit_import_files(
    staged: &Path,
    target: &Path,
    rollback: &Path,
    covers: &Path,
    covers_rollback: &Path,
) -> Result<(), ImportCommitError> {
    commit_import_files_with(
        staged,
        target,
        rollback,
        covers,
        covers_rollback,
        None,
        |from, to| fs::rename(from, to),
    )
}

fn commit_import_files_with(
    staged: &Path,
    target: &Path,
    rollback: &Path,
    covers: &Path,
    covers_rollback: &Path,
    imported_covers: Option<&Path>,
    mut rename: impl FnMut(&Path, &Path) -> std::io::Result<()>,
) -> Result<(), ImportCommitError> {
    let mut old_moved = false;
    let mut new_moved = false;
    let mut old_custom_moved = false;
    let mut covers_rollback_created = false;
    let custom = covers.join("custom");
    let custom_rollback = covers_rollback.join("custom");
    let result = (|| {
        // 关闭池后仍有事务日志时不能只移动主文件，避免遗漏旧数据或污染新库。
        ensure_database_logs_flushed(target)?;
        ensure_target_does_not_exist(rollback, "回滚数据库")?;

        rename(target, rollback)
            .map_err(|error| import_error("无法保留旧数据库，已停止导入", error))?;
        old_moved = true;
        ensure_target_does_not_exist(target, "正式数据库")?;
        rename(staged, target).map_err(|error| import_error("替换数据库失败", error))?;
        new_moved = true;
        if let Some(source) = imported_covers {
            ensure_target_does_not_exist(covers_rollback, "回滚封面")?;
            fs::create_dir_all(covers).map_err(|e| import_error("准备封面目录失败", e))?;
            fs::create_dir(covers_rollback).map_err(|e| import_error("准备封面回滚目录失败", e))?;
            covers_rollback_created = true;
            // 数据包只包含 custom，其他目录（包括 cloud）留在原位。
            match fs::symlink_metadata(&custom) {
                Ok(_) => {
                    rename(&custom, &custom_rollback)
                        .map_err(|e| import_error("无法保留旧自定义封面", e))?;
                    old_custom_moved = true;
                }
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => return Err(import_error("无法读取自定义封面目录", e)),
            }
            ensure_target_does_not_exist(&custom, "正式自定义封面")?;
            rename(&source.join("custom"), &custom).map_err(|e| import_error("恢复封面失败", e))?;
        }
        Ok(())
    })();
    if let Err(message) = result {
        let recovery = (|| {
            if old_custom_moved {
                ensure_target_does_not_exist(&custom, "待恢复封面")?;
                rename(&custom_rollback, &custom).map_err(|e| format!("恢复旧封面失败: {e}"))?;
                old_custom_moved = false;
            }
            if covers_rollback_created && let Err(error) = fs::remove_dir(covers_rollback) {
                log::warn!("清理封面回滚空目录失败: {error}");
            }
            if new_moved {
                ensure_target_does_not_exist(staged, "导入临时库")?;
                rename(target, staged).map_err(|error| format!("移回导入临时库失败: {error}"))?;
            }
            if old_moved {
                ensure_target_does_not_exist(target, "待恢复数据库")?;
                rename(rollback, target).map_err(|error| format!("恢复旧数据库失败: {error}"))?;
            }
            if !target.is_file() {
                return Err("正式数据库文件不可用，禁止自动重启".into());
            }
            Ok::<(), String>(())
        })();
        return Err(match recovery {
            Ok(()) => ImportCommitError {
                message: format!(
                    "{message}。{}",
                    if old_moved {
                        "已回滚到旧数据。"
                    } else {
                        "旧数据未改动。"
                    }
                ),
                recovery_path: None,
                covers_recovery_path: None,
            },
            Err(error) => {
                log::error!(
                    "{message}；回滚失败: {error}；旧数据库位置: {}；封面位置: {}；旧自定义封面位置: {}",
                    rollback.display(),
                    covers.display(),
                    covers_rollback.display()
                );
                ImportCommitError {
                    message: "自动回滚未完成，需手动恢复旧数据".into(),
                    recovery_path: Some(rollback.to_path_buf()),
                    covers_recovery_path: old_custom_moved.then_some(custom_rollback),
                }
            }
        });
    }
    Ok(())
}

fn ensure_target_does_not_exist(path: &Path, label: &str) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(_) => Err(format!("{label}文件已存在，拒绝覆盖: {}", path.display())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("检查{label}目标失败 {}: {error}", path.display())),
    }
}

fn copy_file_fully(source: &Path, target: &Path) -> Result<(), String> {
    let expected_size = fs::metadata(source)
        .map_err(|error| format!("读取源文件失败 {}: {error}", source.display()))?
        .len();
    let copied_size = fs::copy(source, target).map_err(|error| {
        format!(
            "复制文件失败 {} -> {}: {error}",
            source.display(),
            target.display()
        )
    })?;
    if copied_size != expected_size {
        return Err(format!(
            "复制文件大小不一致，期望 {expected_size} 字节，实际 {copied_size} 字节"
        ));
    }
    fs::OpenOptions::new()
        .write(true)
        .open(target)
        .and_then(|file| file.sync_all())
        .map_err(|error| format!("同步临时文件失败 {}: {error}", target.display()))
}

#[cfg(test)]
mod tests {
    use super::{
        backup_database_file_to, commit_import_files, commit_import_files_with,
        copy_database_file_cold_to, ensure_database_logs_flushed, import_database_at_paths,
        validate_and_migrate_import,
    };
    use migration::{Migrator, MigratorTrait};
    use sea_orm::{ConnectOptions, ConnectionTrait, Database};
    use std::fs;
    use std::path::{Path, PathBuf};
    use url::Url;

    #[tokio::test]
    async fn data_backup_contains_database_and_custom_covers_and_never_publishes_failures() {
        let root =
            std::env::temp_dir().join(format!("reina-data-backup-test-{}", uuid::Uuid::now_v7()));
        fs::create_dir_all(root.join("covers/custom")).unwrap();
        fs::create_dir_all(root.join("covers/cloud")).unwrap();
        fs::create_dir_all(root.join("covers/game_1")).unwrap();
        fs::write(root.join("covers/custom/cover.webp"), b"custom").unwrap();
        fs::write(root.join("covers/custom/unfinished.part"), b"partial").unwrap();
        fs::write(root.join("covers/cloud/cloud.webp"), b"cloud").unwrap();
        fs::write(root.join("covers/game_1/cover_1_png_123.png"), b"legacy").unwrap();
        let source_url = Url::from_file_path(root.join("source.db")).unwrap();
        let mut options = ConnectOptions::new(format!("sqlite:{}?mode=rwc", source_url.path()));
        options.max_connections(1).min_connections(1);
        let db = Database::connect(options).await.unwrap();
        db.execute_unprepared(
            "CREATE TABLE example (id INTEGER PRIMARY KEY); INSERT INTO example VALUES (42)",
        )
        .await
        .unwrap();
        let archive = root.join("data.7z");
        super::backup_data_archive_to(&db, &root.join("covers"), &archive, None)
            .await
            .unwrap();
        let mut reader =
            sevenz_rust2::ArchiveReader::open(&archive, sevenz_rust2::Password::empty()).unwrap();
        let mut files = std::collections::BTreeMap::new();
        reader
            .for_each_entries(|entry, input| {
                if !entry.is_directory() {
                    let mut bytes = Vec::new();
                    input.read_to_end(&mut bytes)?;
                    files.insert(entry.name().replace('\\', "/"), bytes);
                }
                Ok(true)
            })
            .unwrap();
        assert_eq!(files.len(), 2);
        assert_eq!(files["covers/custom/cover.webp"], b"custom");
        fs::write(root.join("restored.db"), &files["data/reina_manager.db"]).unwrap();
        let restored = Database::connect(format!(
            "sqlite:{}?mode=ro",
            root.join("restored.db")
                .to_string_lossy()
                .replace('\\', "/")
        ))
        .await
        .unwrap();
        let row = restored
            .query_one_raw(sea_orm::Statement::from_string(
                sea_orm::DbBackend::Sqlite,
                "SELECT id FROM example",
            ))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(row.try_get::<i32>("", "id").unwrap(), 42);
        restored.close().await.unwrap();
        drop(reader);
        let extracted = root.join("extracted");
        fs::create_dir(&extracted).unwrap();
        super::extract_data_archive(&archive, &extracted).unwrap();
        assert_eq!(
            fs::read(extracted.join("covers/custom/cover.webp")).unwrap(),
            b"custom"
        );
        assert_eq!(
            fs::read(extracted.join("data/reina_manager.db")).unwrap(),
            files["data/reina_manager.db"]
        );
        let original = fs::read(&archive).unwrap();
        assert!(
            super::backup_data_archive_to(&db, &root.join("covers"), &archive, None)
                .await
                .is_err()
        );
        assert_eq!(fs::read(&archive).unwrap(), original);
        let empty_archive = root.join("no-covers.7z");
        super::backup_data_archive_to(&db, &root.join("missing"), &empty_archive, None)
            .await
            .unwrap();
        fs::write(root.join("invalid-covers"), b"not a directory").unwrap();
        let failed_archive = root.join("failed.7z");
        assert!(
            super::backup_data_archive_to(&db, &root.join("invalid-covers"), &failed_archive, None)
                .await
                .is_err()
        );
        assert!(!failed_archive.exists());
        db.clone().close().await.unwrap();
        let cold_archive = root.join("cold.7z");
        super::backup_data_archive_to(
            &db,
            &root.join("covers"),
            &cold_archive,
            Some(&root.join("source.db")),
        )
        .await
        .unwrap();
        let cold_output = root.join("cold-output");
        fs::create_dir(&cold_output).unwrap();
        super::extract_data_archive(&cold_archive, &cold_output).unwrap();
        assert_eq!(
            fs::read(cold_output.join("data/reina_manager.db")).unwrap(),
            fs::read(root.join("source.db")).unwrap()
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn hot_backup_keeps_database_connection_usable() {
        let root = std::env::temp_dir().join(format!(
            "reina_hot_backup_{}_{}",
            std::process::id(),
            chrono::Local::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
        ));
        fs::create_dir_all(&root).unwrap();
        let source_path = root.join("source.db");
        let source_url = Url::from_file_path(&source_path).unwrap();
        let mut options = ConnectOptions::new(format!("sqlite:{}?mode=rwc", source_url.path()));
        options.max_connections(1).min_connections(1);
        let db = Database::connect(options).await.unwrap();
        db.execute_unprepared("CREATE TABLE example (id INTEGER PRIMARY KEY)")
            .await
            .unwrap();

        let result = backup_database_file_to(&db, &root, "scheduled.db")
            .await
            .unwrap();

        assert!(result.success);
        assert!(
            root.join("scheduled.db").is_file(),
            "热备份结果路径: {:?}",
            result.path
        );
        db.execute_unprepared("INSERT INTO example (id) VALUES (1)")
            .await
            .unwrap();

        db.close().await.unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn hot_backup_never_removes_an_existing_target() {
        let root = std::env::temp_dir().join(format!(
            "reina_hot_backup_collision_{}_{}",
            std::process::id(),
            chrono::Local::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
        ));
        fs::create_dir_all(&root).unwrap();
        let source_path = root.join("source.db");
        let source_url = Url::from_file_path(&source_path).unwrap();
        let mut options = ConnectOptions::new(format!("sqlite:{}?mode=rwc", source_url.path()));
        options.max_connections(1).min_connections(1);
        let db = Database::connect(options).await.unwrap();
        db.execute_unprepared("CREATE TABLE example (id INTEGER PRIMARY KEY)")
            .await
            .unwrap();
        fs::write(root.join("existing.db"), b"keep").unwrap();

        assert!(
            backup_database_file_to(&db, &root, "existing.db")
                .await
                .is_err()
        );
        assert_eq!(fs::read(root.join("existing.db")).unwrap(), b"keep");

        db.close().await.unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn cold_backup_never_overwrites_an_existing_target() {
        let root = std::env::temp_dir().join(format!(
            "reina_cold_backup_collision_{}_{}",
            std::process::id(),
            chrono::Local::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
        ));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("source.db"), b"source").unwrap();
        fs::write(root.join("existing.db"), b"keep").unwrap();

        assert!(copy_database_file_cold_to(&root.join("source.db"), &root, "existing.db").is_err());
        assert_eq!(fs::read(root.join("existing.db")).unwrap(), b"keep");

        fs::remove_dir_all(root).unwrap();
    }

    fn test_directory(label: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "reina_import_{label}_{}_{}",
            std::process::id(),
            chrono::Local::now().timestamp_nanos_opt().unwrap()
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    async fn test_connection(path: &Path) -> sea_orm::DatabaseConnection {
        let url = Url::from_file_path(path).unwrap();
        let mut options = ConnectOptions::new(format!("sqlite:{}?mode=rwc", url.path()));
        options
            .max_connections(1)
            .min_connections(1)
            .sqlx_logging(false);
        Database::connect(options).await.unwrap()
    }

    #[tokio::test]
    async fn import_rejects_corrupt_files() {
        let root = test_directory("invalid");
        let corrupt = root.join("corrupt.db");
        let db = test_connection(&corrupt).await;
        // 构造可正常打开但完整性检查失败的库，避免连接失败的后台清理与 Windows 删文件竞争。
        db.execute_unprepared(
            "CREATE TABLE example(value INTEGER CHECK(value > 0)); \
             PRAGMA ignore_check_constraints = ON; \
             INSERT INTO example(value) VALUES(-1)",
        )
        .await
        .unwrap();
        db.close().await.unwrap();
        assert!(
            validate_and_migrate_import(&corrupt)
                .await
                .unwrap_err()
                .contains("完整性检查失败")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn import_rejects_empty_and_missing_business_schemas_without_replacing_current() {
        let root = test_directory("empty");
        let target = root.join("current.db");
        let covers = root.join("covers");
        let current = test_connection(&target).await;
        current
            .execute_unprepared("CREATE TABLE example(id INTEGER); INSERT INTO example VALUES(7)")
            .await
            .unwrap();
        let original = fs::read(&target).unwrap();

        for kind in ["zero", "empty", "tracking_only", "unrelated", "games_only"] {
            let source = root.join(format!("{kind}.db"));
            if kind == "zero" {
                fs::write(&source, []).unwrap();
            } else {
                let connection = test_connection(&source).await;
                match kind {
                    "empty" => {
                        connection
                            .execute_unprepared(
                                "CREATE TABLE example(id INTEGER); DROP TABLE example",
                            )
                            .await
                            .unwrap();
                    }
                    "tracking_only" => Migrator::install(&connection).await.unwrap(),
                    "unrelated" => {
                        connection
                            .execute_unprepared("CREATE TABLE unrelated(id INTEGER)")
                            .await
                            .unwrap();
                    }
                    "games_only" => {
                        connection
                            .execute_unprepared("CREATE TABLE games(id INTEGER, id_type TEXT)")
                            .await
                            .unwrap();
                    }
                    _ => unreachable!(),
                }
                connection.close().await.unwrap();
                assert!(!fs::read(&source).unwrap().is_empty());
            }
            let source_original = fs::read(&source).unwrap();
            let error = import_database_at_paths(&source, &target, &covers, false, &current)
                .await
                .unwrap_err();
            assert!(
                error.contains("空数据库") || error.contains("业务结构"),
                "{error}"
            );
            assert_eq!(fs::read(&target).unwrap(), original);
            assert_eq!(fs::read(&source).unwrap(), source_original);
            assert!(
                current
                    .query_one_raw(sea_orm::Statement::from_string(
                        sea_orm::DbBackend::Sqlite,
                        "SELECT id FROM example WHERE id = 7",
                    ))
                    .await
                    .unwrap()
                    .is_some()
            );
        }

        current.close().await.unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn import_accepts_empty_game_library_with_existing_schema() {
        let root = test_directory("empty_library");
        let source = root.join("source.db");
        let db = test_connection(&source).await;
        Migrator::up(&db, None).await.unwrap();
        db.close().await.unwrap();
        validate_and_migrate_import(&source).await.unwrap();
        let db = test_connection(&source).await;
        let count = db
            .query_one_raw(sea_orm::Statement::from_string(
                sea_orm::DbBackend::Sqlite,
                "SELECT COUNT(*) AS count FROM games",
            ))
            .await
            .unwrap()
            .unwrap()
            .try_get::<i64>("", "count")
            .unwrap();
        assert_eq!(count, 0);
        db.close().await.unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn import_accepts_legacy_schema_without_migration_records() {
        let root = test_directory("legacy");
        let source = root.join("source.db");
        let db = test_connection(&source).await;
        db.execute_unprepared(include_str!(
            "../../migration/old_migrations/001_database_initialization.sql"
        ))
        .await
        .unwrap();
        db.execute_unprepared(
            "INSERT INTO games(id, bgm_id, id_type, name) VALUES(1, '123', 'bgm', '旧版名称')",
        )
        .await
        .unwrap();
        db.close().await.unwrap();
        let original = fs::read(&source).unwrap();
        let staged = root.join("staged.db");
        fs::copy(&source, &staged).unwrap();
        validate_and_migrate_import(&staged).await.unwrap();
        assert_eq!(fs::read(&source).unwrap(), original);
        let db = test_connection(&staged).await;
        let row = db
            .query_one_raw(sea_orm::Statement::from_string(
                sea_orm::DbBackend::Sqlite,
                "SELECT json_extract(data, '$.name') AS name FROM game_sources \
                 WHERE game_id = 1 AND source = 'bgm'",
            ))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(row.try_get::<String>("", "name").unwrap(), "旧版名称");
        db.close().await.unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn import_rejects_orphan_sessions_and_sources_after_all_migrations() {
        for table in ["game_sessions", "game_sources"] {
            let root = test_directory(table);
            let source = root.join("source.db");
            let db = test_connection(&source).await;
            Migrator::up(&db, None).await.unwrap();
            assert!(
                Migrator::get_pending_migrations_read_only(&db)
                    .await
                    .unwrap()
                    .is_empty()
            );
            db.execute_unprepared("PRAGMA foreign_keys = OFF")
                .await
                .unwrap();
            let insert = if table == "game_sessions" {
                "INSERT INTO game_sessions(game_id, start_time, end_time, duration, date) \
                 VALUES(9999, 1, 2, 1, '2026-10-23')"
            } else {
                "INSERT INTO game_sources(game_id, source, external_id, data) \
                 VALUES(9999, 'bgm', '123', '{\"name\":\"孤立来源\"}')"
            };
            db.execute_unprepared(insert).await.unwrap();
            let integrity = db
                .query_one_raw(sea_orm::Statement::from_string(
                    sea_orm::DbBackend::Sqlite,
                    "PRAGMA integrity_check",
                ))
                .await
                .unwrap()
                .unwrap();
            assert_eq!(
                integrity.try_get::<String>("", "integrity_check").unwrap(),
                "ok"
            );
            db.close().await.unwrap();
            let original = fs::read(&source).unwrap();
            let staged = root.join("staged.db");
            fs::copy(&source, &staged).unwrap();
            let error = validate_and_migrate_import(&staged).await.unwrap_err();
            assert!(error.contains("外键检查失败"), "{error}");
            assert_eq!(fs::read(&source).unwrap(), original);
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[tokio::test]
    async fn import_migrates_old_copy_without_changing_source() {
        let root = test_directory("upgrade");
        let source = root.join("source.db");
        let db = test_connection(&source).await;
        Migrator::up(&db, Some(3)).await.unwrap();
        db.execute_unprepared("INSERT INTO games(id, bgm_id, id_type) VALUES(1, '123', 'bgm'); INSERT INTO bgm_data(game_id, name) VALUES(1, '保留数据')").await.unwrap();
        db.close().await.unwrap();
        let original = fs::read(&source).unwrap();
        let staged = root.join("staged.db");
        fs::copy(&source, &staged).unwrap();
        validate_and_migrate_import(&staged).await.unwrap();
        assert_eq!(fs::read(&source).unwrap(), original);
        let upgraded = test_connection(&staged).await;
        assert!(
            Migrator::get_pending_migrations_read_only(&upgraded)
                .await
                .unwrap()
                .is_empty()
        );
        let row = upgraded
            .query_one_raw(sea_orm::Statement::from_string(
                sea_orm::DbBackend::Sqlite,
                "SELECT games.id, game_sources.external_id, json_extract(game_sources.data, '$.name') AS name \
                 FROM games JOIN game_sources ON game_sources.game_id = games.id \
                 WHERE games.id = 1 AND game_sources.source = 'bgm'",
            ))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(row.try_get::<i32>("", "id").unwrap(), 1);
        assert_eq!(row.try_get::<String>("", "external_id").unwrap(), "123");
        assert_eq!(row.try_get::<String>("", "name").unwrap(), "保留数据");
        upgraded.close().await.unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn import_rejects_unknown_newer_migrations() {
        let root = test_directory("future");
        let path = root.join("future.db");
        let db = test_connection(&path).await;
        Migrator::up(&db, None).await.unwrap();
        db.execute_unprepared("INSERT INTO seaql_migrations(version, applied_at) VALUES('m20990101_000999_future', 1)").await.unwrap();
        db.close().await.unwrap();
        assert!(
            validate_and_migrate_import(&path)
                .await
                .unwrap_err()
                .contains("版本不兼容")
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn import_migration_failure_does_not_modify_original() {
        let root = test_directory("migration_failure");
        let source = root.join("source.db");
        let db = test_connection(&source).await;
        Migrator::up(&db, Some(21)).await.unwrap();
        db.execute_unprepared("INSERT INTO games(id, id_type) VALUES(1, 'kun'); INSERT INTO game_sources(game_id, source, external_id, data) VALUES(1, 'kun', '923', '{}'); CREATE TRIGGER reject_reset BEFORE UPDATE ON game_sources BEGIN SELECT RAISE(ABORT, '测试失败'); END;").await.unwrap();
        db.close().await.unwrap();
        let original = fs::read(&source).unwrap();
        let staged = root.join("staged.db");
        fs::copy(&source, &staged).unwrap();
        assert!(
            validate_and_migrate_import(&staged)
                .await
                .unwrap_err()
                .contains("迁移失败")
        );
        assert_eq!(fs::read(&source).unwrap(), original);
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn uppercase_database_import_keeps_connection_usable_when_backup_fails() {
        let root = test_directory("backup_failure");
        let source = root.join("source.DB");
        let source_db = test_connection(&source).await;
        Migrator::up(&source_db, None).await.unwrap();
        source_db.close().await.unwrap();
        let target = root.join("current.db");
        let covers = root.join("covers");
        fs::create_dir(&covers).unwrap();
        fs::write(covers.join("custom.jpg"), b"original cover").unwrap();
        let db = test_connection(&target).await;
        // 缺少设置表使保护备份失败，测试不访问用户的默认备份或封面目录。
        db.execute_unprepared("CREATE TABLE example(id INTEGER)")
            .await
            .unwrap();
        let original = fs::read(&target).unwrap();
        let result = import_database_at_paths(&source, &target, &covers, false, &db)
            .await
            .unwrap();
        assert!(!result.success);
        assert!(result.requires_backup_confirmation);
        assert!(!result.restart_required);
        assert!(result.recovery_path.is_none());
        assert!(result.message.contains("旧数据备份失败"));
        assert_eq!(fs::read(&target).unwrap(), original);
        assert_eq!(
            fs::read(covers.join("custom.jpg")).unwrap(),
            b"original cover"
        );
        db.execute_unprepared("INSERT INTO example(id) VALUES(1)")
            .await
            .unwrap();
        db.close().await.unwrap();
        fs::remove_dir_all(root).unwrap();
    }

    fn commit_fixture(root: &Path) -> [PathBuf; 5] {
        let paths = [
            root.join("staged.db"),
            root.join("current.db"),
            root.join("old.db"),
            root.join("covers"),
            root.join("old-covers"),
        ];
        fs::write(&paths[0], b"new database").unwrap();
        fs::write(&paths[1], b"old database").unwrap();
        fs::create_dir_all(paths[3].join("custom")).unwrap();
        fs::create_dir_all(paths[3].join("cloud")).unwrap();
        fs::write(paths[3].join("custom/old.jpg"), b"old cover").unwrap();
        fs::write(paths[3].join("cloud/cached.jpg"), b"cloud cache").unwrap();
        paths
    }

    #[test]
    fn database_import_preserves_existing_cover_directory() {
        let root = test_directory("commit");
        let [staged, target, rollback, covers, covers_rollback] = commit_fixture(&root);
        commit_import_files(&staged, &target, &rollback, &covers, &covers_rollback).unwrap();
        assert_eq!(fs::read(target).unwrap(), b"new database");
        assert_eq!(fs::read(rollback).unwrap(), b"old database");
        assert!(!covers_rollback.exists());
        assert_eq!(
            fs::read(covers.join("custom/old.jpg")).unwrap(),
            b"old cover"
        );
        assert_eq!(
            fs::read(covers.join("cloud/cached.jpg")).unwrap(),
            b"cloud cache"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn data_import_commits_covers_or_rolls_back_both() {
        for failure_at in 0..=4 {
            let root = test_directory("data_commit");
            let [staged, target, rollback, covers, covers_rollback] = commit_fixture(&root);
            let incoming = root.join("incoming-covers");
            fs::create_dir_all(incoming.join("custom")).unwrap();
            fs::write(incoming.join("custom/new.webp"), b"new cover").unwrap();
            let mut call = 0;
            let result = commit_import_files_with(
                &staged,
                &target,
                &rollback,
                &covers,
                &covers_rollback,
                Some(&incoming),
                |from, to| {
                    call += 1;
                    if call == failure_at {
                        return Err(std::io::Error::other("模拟提交失败"));
                    }
                    fs::rename(from, to)
                },
            );
            if failure_at != 0 {
                assert!(result.unwrap_err().recovery_path.is_none());
                assert_eq!(fs::read(&target).unwrap(), b"old database");
                assert_eq!(
                    fs::read(covers.join("custom/old.jpg")).unwrap(),
                    b"old cover"
                );
                assert_eq!(fs::read(&staged).unwrap(), b"new database");
                assert!(!rollback.exists());
                assert!(incoming.join("custom/new.webp").is_file());
                assert!(!covers_rollback.exists());
            } else {
                result.unwrap();
                assert_eq!(fs::read(&target).unwrap(), b"new database");
                assert_eq!(
                    fs::read(covers.join("custom/new.webp")).unwrap(),
                    b"new cover"
                );
                assert_eq!(
                    fs::read(covers_rollback.join("custom/old.jpg")).unwrap(),
                    b"old cover"
                );
            }
            assert_eq!(
                fs::read(covers.join("cloud/cached.jpg")).unwrap(),
                b"cloud cache"
            );
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn empty_cover_archive_clears_custom_but_keeps_cloud() {
        let root = test_directory("empty_covers");
        let [staged, target, rollback, covers, covers_rollback] = commit_fixture(&root);
        let input = root.join("input");
        fs::create_dir_all(input.join("data")).unwrap();
        fs::write(input.join("data/reina_manager.db"), b"database").unwrap();
        let archive = root.join("data.7z");
        crate::backup::archive::create_7z_archive(&input, &archive).unwrap();
        let output = root.join("output");
        fs::create_dir(&output).unwrap();
        super::extract_data_archive(&archive, &output).unwrap();
        commit_import_files_with(
            &staged,
            &target,
            &rollback,
            &covers,
            &covers_rollback,
            Some(&output.join("covers")),
            |from, to| fs::rename(from, to),
        )
        .unwrap();
        assert_eq!(fs::read_dir(covers.join("custom")).unwrap().count(), 0);
        assert_eq!(
            fs::read(covers.join("cloud/cached.jpg")).unwrap(),
            b"cloud cache"
        );
        assert_eq!(
            fs::read(covers_rollback.join("custom/old.jpg")).unwrap(),
            b"old cover"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn data_import_rejects_unexpected_or_missing_database() {
        for file in [
            "covers/custom/only.webp",
            "covers/game_1/cover_1.jpg",
            "covers/cloud/cache.jpg",
            "data/other.db",
            "unexpected.txt",
        ] {
            let root = test_directory("invalid_data_archive");
            let input = root.join("input");
            fs::create_dir_all(input.join(file).parent().unwrap()).unwrap();
            fs::write(input.join(file), b"fixture").unwrap();
            if file != "covers/custom/only.webp" {
                fs::create_dir_all(input.join("data")).unwrap();
                fs::write(input.join("data/reina_manager.db"), b"database").unwrap();
            }
            let archive = root.join("invalid.7z");
            crate::backup::archive::create_7z_archive(&input, &archive).unwrap();
            let output = root.join("output");
            fs::create_dir(&output).unwrap();
            let error = super::extract_data_archive(&archive, &output).unwrap_err();
            assert!(error.contains(if file == "covers/custom/only.webp" {
                "缺少 data/reina_manager.db"
            } else {
                "不支持的内容"
            }));
            assert_eq!(fs::read_dir(&output).unwrap().count(), 0);
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn rollback_failure_reports_remaining_recovery_paths() {
        for (with_covers, rollback_failure_at) in [(false, 2), (true, 4), (true, 6)] {
            let root = test_directory("rollback_failure");
            let [staged, target, rollback, covers, covers_rollback] = commit_fixture(&root);
            let incoming = root.join("incoming-covers");
            fs::create_dir_all(incoming.join("custom")).unwrap();
            fs::write(incoming.join("custom/new.jpg"), b"new cover").unwrap();
            let commit_failure_at = if with_covers { 4 } else { 2 };
            let mut call = 0;
            let error = commit_import_files_with(
                &staged,
                &target,
                &rollback,
                &covers,
                &covers_rollback,
                with_covers.then_some(incoming.as_path()),
                |from, to| {
                    call += 1;
                    if call == commit_failure_at || call >= rollback_failure_at {
                        Err(std::io::Error::other("模拟替换和恢复失败"))
                    } else {
                        fs::rename(from, to)
                    }
                },
            )
            .unwrap_err();
            let result = super::import_failure(
                error.message,
                None,
                error.recovery_path,
                error.covers_recovery_path,
            );
            assert!(!result.restart_required);
            assert_eq!(result.recovery_path.as_deref(), rollback.to_str());
            let custom_still_moved = with_covers && rollback_failure_at == 4;
            assert_eq!(
                result.covers_recovery_path,
                custom_still_moved.then(|| covers_rollback
                    .join("custom")
                    .to_string_lossy()
                    .into_owned())
            );
            assert_eq!(fs::read(rollback).unwrap(), b"old database");
            if with_covers {
                assert_eq!(fs::read(&target).unwrap(), b"new database");
                assert_eq!(
                    fs::read(if custom_still_moved {
                        covers_rollback.join("custom/old.jpg")
                    } else {
                        covers.join("custom/old.jpg")
                    })
                    .unwrap(),
                    b"old cover"
                );
                assert_eq!(
                    fs::read(incoming.join("custom/new.jpg")).unwrap(),
                    b"new cover"
                );
            } else {
                assert_eq!(fs::read(staged).unwrap(), b"new database");
            }
            assert_eq!(
                fs::read(covers.join("cloud/cached.jpg")).unwrap(),
                b"cloud cache"
            );
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn import_never_replaces_database_with_remaining_transaction_logs() {
        for suffix in ["-wal", "-journal"] {
            let root = test_directory("remaining_logs");
            let [staged, target, rollback, covers, covers_rollback] = commit_fixture(&root);
            fs::write(
                root.join(format!("current.db{suffix}")),
                b"unflushed old data",
            )
            .unwrap();
            let error = commit_import_files(&staged, &target, &rollback, &covers, &covers_rollback)
                .unwrap_err();
            assert!(error.recovery_path.is_none());
            assert_eq!(fs::read(target).unwrap(), b"old database");
            assert_eq!(fs::read(staged).unwrap(), b"new database");
            assert!(covers.is_dir());
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn import_source_rejects_nonempty_transaction_logs() {
        for suffix in ["-wal", "-journal"] {
            let root = test_directory("source_logs");
            let source = root.join("source.db");
            fs::write(&source, b"source database").unwrap();
            let journal = root.join(format!("source.db{suffix}"));
            fs::write(&journal, b"pending transaction data").unwrap();
            assert!(
                ensure_database_logs_flushed(&source)
                    .unwrap_err()
                    .contains("正常关闭")
            );
            assert_eq!(fs::read(&source).unwrap(), b"source database");
            fs::write(&journal, b"").unwrap();
            ensure_database_logs_flushed(&source).unwrap();
            fs::remove_dir_all(root).unwrap();
        }
    }
}
