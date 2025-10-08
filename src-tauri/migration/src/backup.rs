use std::fs;
use std::path::PathBuf;

use chrono::Local;
use sea_orm_migration::sea_orm::DbErr;

/// 备份 SQLite 数据库文件。
///
/// 自动读取数据库中 `user.db_backup_path` 字段：
/// - 若存在且非空，则备份到该路径下
/// - 否则备份到数据库所在目录的 `backups/` 子目录
pub async fn backup_sqlite(version: &str) -> Result<PathBuf, DbErr> {
    let db_path = get_db_path_file()?;
    let db_url = path_to_sqlite_url(&db_path)?;

    // 查询 user.db_backup_path
    let pool = sqlx::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| DbErr::Custom(format!("Failed to connect: {}", e)))?;

    let custom_path: Option<String> = sqlx::query_scalar("SELECT db_backup_path FROM user LIMIT 1")
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten();

    pool.close().await;

    // 选择目标目录
    let target_dir = match custom_path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p.trim()),
        _ => db_path.parent().unwrap().join("backups"),
    };

    fs::create_dir_all(&target_dir)
        .map_err(|e| DbErr::Custom(format!("Failed to create backup dir: {}", e)))?;

    let timestamp = Local::now().format("%Y%m%d_%H%M%S");
    let backup_path = target_dir.join(format!("reina_manager_{}_{}.db", version, timestamp));

    fs::copy(&db_path, &backup_path)
        .map_err(|e| DbErr::Custom(format!("Failed to copy database: {}", e)))?;

    Ok(backup_path)
}

/// 获取数据库文件的本地路径
fn get_db_path_file() -> Result<PathBuf, DbErr> {
    let base = dirs_next::config_dir()
        .or_else(dirs_next::data_dir)
        .ok_or_else(|| DbErr::Custom("Failed to resolve user data directory".to_string()))?;

    Ok(base
        .join("com.reinamanager.dev")
        .join("data")
        .join("reina_manager.db"))
}

/// 将文件路径转换为 sqlite 连接 URL
fn path_to_sqlite_url(path: &PathBuf) -> Result<String, DbErr> {
    let db_url = url::Url::from_file_path(path)
        .map_err(|_| DbErr::Custom("Invalid database path".to_string()))?;
    Ok(format!("sqlite:{}?mode=rwc", db_url.path()))
}

/// 从系统目录推导数据库连接字符串（兼容旧代码）
pub fn get_db_path() -> Result<String, DbErr> {
    let db_path = get_db_path_file()?;
    path_to_sqlite_url(&db_path)
}
