use crate::backup::common::{
    BackupResult, acquire_database_backup_operation_lock, ensure_database_backup_available,
    mark_database_backup_unavailable, next_backup_filename, resolve_backup_dir,
    temporary_sibling_path,
};
use crate::backup::covers::backup_custom_covers_archive;
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
}

// ==================== 数据库备份和导入 ====================

/// 生成不会覆盖同秒已有备份的文件名。
fn generate_backup_filename(backup_dir: &Path) -> Result<String, String> {
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    next_backup_filename(backup_dir, "reina_manager_", &timestamp, ".db")
}

/// 使用 VACUUM INTO 进行数据库热备份
///
/// 此方法使用 SQLite 的 VACUUM INTO 语句，可以在数据库正在使用时安全地创建备份。
/// VACUUM INTO 会创建一个优化后的数据库副本，同时保持原数据库的完整性。
///
/// 备份路径从数据库的 user 表中读取配置：
/// - 优先使用 user.db_backup_path（如果设置且非空）
/// - 否则使用默认路径
///
/// # Returns
///
/// 备份结果，包含备份文件的路径
#[command]
pub async fn backup_database(db: State<'_, DatabaseConnection>) -> Result<BackupResult, String> {
    let _operation_guard = acquire_database_backup_operation_lock().await;
    ensure_database_backup_available()?;
    backup_database_file(&db).await
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
    if !source.is_absolute() {
        return Err("源数据库路径必须是绝对路径".into());
    }
    if !source.is_file() {
        return Err(format!(
            "源数据库文件不存在或不是文件: {}",
            source.display()
        ));
    }
    if source.extension().and_then(|extension| extension.to_str()) != Some("db") {
        return Err("无效的数据库文件，请选择 .db 文件".into());
    }
    if fs::canonicalize(source).map_err(|error| error.to_string())?
        == fs::canonicalize(target).map_err(|error| error.to_string())?
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
        copy_file_fully(source, &staged)?;
        validate_and_migrate_import(&staged).await
    }
    .await;
    if let Err(error) = preparation {
        fs::remove_file(&staged).ok();
        return Err(error);
    }

    // 常规备份失败时仍保持连接可用；确认跳过只影响备份，不影响改名回滚保障。
    let mut backup_path = None;
    let mut backup_errors = Vec::new();
    match backup_database_file(db).await {
        Ok(result) => backup_path = result.path,
        Err(error) => backup_errors.push(format!("旧数据库备份失败: {error}")),
    }
    if let Err(error) = backup_custom_covers_archive(db).await {
        backup_errors.push(format!("自定义封面备份失败: {error}"));
    }
    if !backup_errors.is_empty() && !allow_backup_failure {
        fs::remove_file(&staged).ok();
        return Ok(ImportResult {
            success: false,
            message: backup_errors.join("；"),
            backup_path,
            requires_backup_confirmation: true,
            restart_required: false,
            warning: None,
            recovery_path: None,
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
            format!("关闭数据库连接失败: {error}"),
            backup_path,
            None,
        ));
    }

    let commit = commit_import_files(&staged, target, &rollback, covers, &covers_rollback);
    match commit {
        Ok(()) => {
            // 保留同卷旧库和封面，直到用户确认新库可用后仍可手动找回。
            let warning = if backup_errors.is_empty() {
                None
            } else {
                Some(format!(
                    "{}；旧库保留在 {}，旧封面保留在 {}",
                    backup_errors.join("；"),
                    rollback.display(),
                    covers_rollback.display()
                ))
            };
            Ok(ImportResult {
                success: true,
                message: "数据库导入成功，旧数据库和封面已保留，应用将自动重启".into(),
                backup_path: backup_path.or_else(|| Some(rollback.to_string_lossy().into_owned())),
                requires_backup_confirmation: false,
                restart_required: true,
                warning,
                recovery_path: None,
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
            ))
        }
    }
}

fn import_failure(
    message: String,
    backup_path: Option<String>,
    recovery_path: Option<PathBuf>,
) -> ImportResult {
    ImportResult {
        success: false,
        message,
        backup_path,
        requires_backup_confirmation: false,
        restart_required: recovery_path.is_none(),
        warning: None,
        recovery_path: recovery_path.map(|path| path.to_string_lossy().into_owned()),
    }
}

async fn checkpoint_database(db: &DatabaseConnection) -> Result<(), String> {
    let row = db
        .query_one_raw(Statement::from_string(
            DbBackend::Sqlite,
            "PRAGMA wal_checkpoint(TRUNCATE)",
        ))
        .await
        .map_err(|error| format!("数据库写入落盘失败，已停止导入: {error}"))?
        .ok_or("无法检查数据库写入落盘状态")?;
    let busy = row
        .try_get::<i32>("", "busy")
        .map_err(|error| error.to_string())?;
    if busy != 0 {
        return Err("数据库仍被其他连接写入，已停止导入，请稍后重试".into());
    }
    Ok(())
}

async fn validate_and_migrate_import(path: &Path) -> Result<(), String> {
    if fs::metadata(path)
        .map_err(|error| format!("读取导入数据库文件失败: {error}"))?
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
        .map_err(|error| format!("无法读取导入数据库: {error}"))?;
    let result = async {
        verify_import_integrity(&connection).await?;
        // 只检查各代库共有的最小业务结构，避免空库进入新用户建表分支；允许没有游戏记录。
        connection
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT games.id, games.id_type, user.id FROM games, user LIMIT 0",
            ))
            .await
            .map_err(|error| format!("导入数据库缺少已有业务结构，已停止导入: {error}"))?;
        // 只读迁移状态检查会拒绝本程序不认识的迁移，旧版本缺少迁移则正常补齐。
        Migrator::get_pending_migrations_read_only(&connection)
            .await
            .map_err(|error| format!("数据库结构版本不兼容，可能来自较新版本的应用: {error}"))?;
        connection
            .execute_unprepared("PRAGMA foreign_keys = ON")
            .await
            .map_err(|error| format!("启用导入数据库外键失败: {error}"))?;
        // 迁移的输入本来就是副本，失败时直接丢弃；不能读取源库配置另建常规备份。
        Migrator::up(&connection, None)
            .await
            .map_err(|error| format!("导入数据库迁移失败，原数据库未修改: {error}"))?;
        verify_import_integrity(&connection).await?;
        // integrity_check 不检查外键，启用外键约束也不会追查已有的孤立记录。
        if connection
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "PRAGMA foreign_key_check",
            ))
            .await
            .map_err(|error| format!("导入数据库外键检查失败: {error}"))?
            .is_some()
        {
            return Err("导入数据库外键检查失败，存在引用缺失的数据，原数据库未修改".into());
        }
        connection
            .execute_unprepared("PRAGMA journal_mode = DELETE")
            .await
            .map_err(|error| format!("提交导入数据库日志失败: {error}"))?;
        Ok(())
    }
    .await;
    let close = connection
        .close()
        .await
        .map_err(|error| format!("关闭导入临时数据库失败: {error}"));
    result.and(close)?;
    fs::OpenOptions::new()
        .write(true)
        .open(path)
        .and_then(|file| file.sync_all())
        .map_err(|error| format!("同步导入临时数据库失败: {error}"))
}

async fn verify_import_integrity(connection: &DatabaseConnection) -> Result<(), String> {
    let rows = connection
        .query_all_raw(Statement::from_string(
            DbBackend::Sqlite,
            "PRAGMA integrity_check",
        ))
        .await
        .map_err(|error| format!("导入数据库完整性检查失败: {error}"))?;
    if rows.len() == 1
        && rows[0]
            .try_get::<String>("", "integrity_check")
            .map_err(|error| error.to_string())?
            == "ok"
    {
        Ok(())
    } else {
        Err("导入数据库完整性检查失败，原数据库未修改".into())
    }
}

#[derive(Debug)]
struct ImportCommitError {
    message: String,
    recovery_path: Option<PathBuf>,
}

fn ensure_database_logs_flushed(path: &Path) -> Result<(), String> {
    for suffix in ["-wal", "-journal"] {
        let mut log_name = path.as_os_str().to_os_string();
        log_name.push(suffix);
        let log_path = PathBuf::from(log_name);
        match fs::metadata(&log_path) {
            Ok(metadata) if metadata.len() != 0 => {
                return Err(format!(
                    "数据库仍有未清理的事务日志，请正常关闭使用该数据库的程序或先导出备份后重试: {}",
                    log_path.display()
                ));
            }
            Ok(_) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("检查数据库事务日志失败: {error}")),
        }
    }
    Ok(())
}

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
        |from, to| fs::rename(from, to),
    )
}

fn commit_import_files_with(
    staged: &Path,
    target: &Path,
    rollback: &Path,
    covers: &Path,
    covers_rollback: &Path,
    mut rename: impl FnMut(&Path, &Path) -> std::io::Result<()>,
) -> Result<(), ImportCommitError> {
    let mut old_moved = false;
    let mut new_moved = false;
    let result = (|| {
        // 关闭池后仍有事务日志时不能只移动主文件，避免遗漏旧数据或污染新库。
        ensure_database_logs_flushed(target)?;
        ensure_target_does_not_exist(rollback, "回滚数据库")?;
        ensure_target_does_not_exist(covers_rollback, "回滚封面")?;
        rename(target, rollback)
            .map_err(|error| format!("保留旧数据库失败，已停止导入: {error}"))?;
        old_moved = true;
        ensure_target_does_not_exist(target, "正式数据库")?;
        rename(staged, target).map_err(|error| format!("替换数据库失败: {error}"))?;
        new_moved = true;
        // 封面最后处理，整目录改名而不删除，保留旧库 ID 对应的所有封面。
        match fs::symlink_metadata(covers) {
            Ok(_) => rename(covers, covers_rollback)
                .map_err(|error| format!("保留旧封面失败: {error}"))?,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => return Err(format!("检查封面目录失败: {error}")),
        }
        Ok(())
    })();
    if let Err(message) = result {
        let recovery = (|| {
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
                message: format!("{message}；原数据库已保留，请重启恢复使用"),
                recovery_path: None,
            },
            Err(error) => ImportCommitError {
                message: format!(
                    "{message}；{error}；请勿继续操作，旧数据库保留在 {}",
                    rollback.display()
                ),
                recovery_path: Some(rollback.to_path_buf()),
            },
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
    async fn failed_pre_import_backup_keeps_current_connection_usable() {
        let root = test_directory("backup_failure");
        let source = root.join("source.db");
        let source_db = test_connection(&source).await;
        Migrator::up(&source_db, None).await.unwrap();
        source_db.close().await.unwrap();
        let target = root.join("current.db");
        let covers = root.join("covers");
        fs::create_dir(&covers).unwrap();
        fs::write(covers.join("custom.jpg"), b"original cover").unwrap();
        let db = test_connection(&target).await;
        // 缺少设置表使两项真实备份都失败，测试不访问用户的默认备份或封面目录。
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
        assert!(result.message.contains("旧数据库备份失败"));
        assert!(result.message.contains("自定义封面备份失败"));
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
        fs::create_dir(&paths[3]).unwrap();
        fs::write(paths[3].join("custom.jpg"), b"old cover").unwrap();
        paths
    }

    #[test]
    fn import_commit_keeps_old_database_and_covers() {
        let root = test_directory("commit");
        let [staged, target, rollback, covers, covers_rollback] = commit_fixture(&root);
        commit_import_files(&staged, &target, &rollback, &covers, &covers_rollback).unwrap();
        assert_eq!(fs::read(target).unwrap(), b"new database");
        assert_eq!(fs::read(rollback).unwrap(), b"old database");
        assert!(!covers.exists());
        assert_eq!(
            fs::read(covers_rollback.join("custom.jpg")).unwrap(),
            b"old cover"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn failed_replacement_and_cover_move_restore_old_state() {
        for failure_at in [1, 2, 3] {
            let root = test_directory("rollback");
            let [staged, target, rollback, covers, covers_rollback] = commit_fixture(&root);
            let mut call = 0;
            let error = commit_import_files_with(
                &staged,
                &target,
                &rollback,
                &covers,
                &covers_rollback,
                |from, to| {
                    call += 1;
                    if call == failure_at {
                        Err(std::io::Error::other("模拟提交失败"))
                    } else {
                        fs::rename(from, to)
                    }
                },
            )
            .unwrap_err();
            assert!(error.recovery_path.is_none());
            assert_eq!(fs::read(target).unwrap(), b"old database");
            assert_eq!(fs::read(covers.join("custom.jpg")).unwrap(), b"old cover");
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn rollback_failure_reports_preserved_old_database() {
        let root = test_directory("rollback_failure");
        let [staged, target, rollback, covers, covers_rollback] = commit_fixture(&root);
        let mut call = 0;
        let error = commit_import_files_with(
            &staged,
            &target,
            &rollback,
            &covers,
            &covers_rollback,
            |from, to| {
                call += 1;
                if call >= 2 {
                    Err(std::io::Error::other("模拟替换和恢复失败"))
                } else {
                    fs::rename(from, to)
                }
            },
        )
        .unwrap_err();
        assert_eq!(error.recovery_path, Some(rollback.clone()));
        assert_eq!(fs::read(rollback).unwrap(), b"old database");
        assert_eq!(fs::read(staged).unwrap(), b"new database");
        assert!(covers.is_dir());
        fs::remove_dir_all(root).unwrap();
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
