use crate::backup::common::{
    BackupResult, acquire_database_backup_operation_lock, ensure_database_backup_available,
    mark_database_backup_unavailable, next_backup_filename, resolve_backup_dir,
    temporary_sibling_path,
};
use crate::backup::covers::{backup_custom_covers_archive, delete_all_covers_dir};
use crate::database::db::close_connection;
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::{State, command};

use reina_path::get_db_path;

/// 数据库导入结果
#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub success: bool,
    pub message: String,
    pub backup_path: Option<String>,
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

/// 导入数据库文件（覆盖现有数据库）
///
/// # Arguments
///
/// * `source_path` - 要导入的数据库文件路径
///
/// # Returns
///
/// 导入结果，包含备份路径（如果备份成功）
#[command]
pub async fn import_database(
    source_path: String,
    db: State<'_, DatabaseConnection>,
) -> Result<ImportResult, String> {
    let src_path = std::path::PathBuf::from(&source_path);
    if !src_path.is_absolute() {
        return Err("源数据库路径必须是绝对路径".to_string());
    }

    // 检查源路径确实是文件，避免把同名目录交给后续导入流程。
    if !src_path.is_file() {
        return Err(format!(
            "源数据库文件不存在或不是文件: {}",
            src_path.display()
        ));
    }

    // 检查文件扩展名
    if src_path.extension().and_then(|e| e.to_str()) != Some("db") {
        return Err("无效的数据库文件，请选择 .db 文件".to_string());
    }

    // 获取当前数据库路径（自动判断便携模式）
    let target_db_path = get_db_path()?;
    if let (Ok(source), Ok(target)) = (
        fs::canonicalize(&src_path),
        fs::canonicalize(&target_db_path),
    ) && source == target
    {
        return Err("不能导入当前正在使用的数据库文件".to_string());
    }

    let _operation_guard = acquire_database_backup_operation_lock().await;
    ensure_database_backup_available()?;

    // 步骤1：关闭连接前读取备份目录配置，关闭后无法再查询设置
    let backup_dir = resolve_backup_dir(&db).await?;

    // 步骤2：导入前备份自定义封面，后续会清空 covers 避免旧 id 封面错配新库
    backup_custom_covers_archive(&db).await?;

    // 步骤3：关闭数据库连接，后续对数据库文件做冷备份和覆盖
    close_connection(db.inner().clone())
        .await
        .map_err(|error| format!("关闭数据库连接失败: {error}"))?;
    mark_database_backup_unavailable();
    log::info!("数据库连接已关闭，准备冷备份和导入");

    // 步骤4：尽力冷备份当前数据库；失败时记录警告并继续原有导入流程。
    let result_backup_path = match generate_backup_filename(&backup_dir).and_then(|backup_name| {
        copy_database_file_cold_to(&target_db_path, &backup_dir, &backup_name)
    }) {
        Ok(result) => result.path,
        Err(error) => {
            log::warn!("导入前备份失败: {error}，继续导入");
            None
        }
    };

    // 步骤5：删除整个封面目录。云端封面缓存会按新数据库重新下载，
    // 自定义封面已单独备份，不自动恢复到新库。
    delete_all_covers_dir()?;
    log::info!("导入数据库前已清空封面目录");

    // 步骤6：复制文件覆盖现有数据库
    fs::copy(&src_path, &target_db_path).map_err(|error| format!("复制数据库文件失败: {error}"))?;
    log::info!("数据库文件已复制: {} -> {:?}", source_path, target_db_path);

    // 导入成功，前端将负责重启应用以重新连接数据库
    Ok(ImportResult {
        success: true,
        message: "数据库导入成功，已备份自定义封面并清空封面缓存，应用将自动重启".to_string(),
        backup_path: result_backup_path,
    })
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
    fs::File::open(target)
        .and_then(|file| file.sync_all())
        .map_err(|error| format!("同步临时文件失败 {}: {error}", target.display()))
}

#[cfg(test)]
mod tests {
    use super::{backup_database_file_to, copy_database_file_cold_to};
    use sea_orm::{ConnectOptions, ConnectionTrait, Database};
    use std::fs;
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
}
