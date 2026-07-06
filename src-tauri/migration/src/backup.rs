use std::fs;
use std::path::{Path, PathBuf};

use chrono::Local;
use reina_path::get_db_path;
use sea_orm_migration::sea_orm::DbErr;

/// 使用 SQLite 一致性快照备份数据库。
///
/// 自动读取数据库中 `user.db_backup_path` 字段：
/// - 若存在且非空，则备份到该路径下
/// - 否则备份到数据库所在目录的 `backups/` 子目录
pub async fn backup_sqlite(version: &str) -> Result<PathBuf, DbErr> {
    let db_path =
        get_db_path().map_err(|e| DbErr::Custom(format!("Failed to get database path: {}", e)))?;
    let db_url = path_to_sqlite_url(&db_path)?;

    let pool = sqlx::SqlitePool::connect(&db_url)
        .await
        .map_err(|e| DbErr::Custom(format!("Failed to connect: {}", e)))?;

    verify_integrity(&pool, "源数据库").await?;

    let custom_path: Option<String> = sqlx::query_scalar("SELECT db_backup_path FROM user LIMIT 1")
        .fetch_optional(&pool)
        .await
        .ok()
        .flatten();

    let target_dir = match custom_path {
        Some(p) if !p.trim().is_empty() => PathBuf::from(p.trim()),
        _ => db_path.parent().unwrap().join("backups"),
    };

    fs::create_dir_all(&target_dir)
        .map_err(|e| DbErr::Custom(format!("Failed to create backup dir: {}", e)))?;

    let timestamp = Local::now().format("%Y%m%d_%H%M%S_%3f");
    let backup_path = target_dir.join(format!("reina_manager_{}_{}.db", version, timestamp));

    create_snapshot(&pool, &backup_path).await?;

    pool.close().await;

    let backup_url = path_to_sqlite_url_with_mode(&backup_path, "ro")?;
    let backup_pool = sqlx::SqlitePool::connect(&backup_url)
        .await
        .map_err(|e| DbErr::Custom(format!("Failed to open backup: {}", e)))?;
    verify_integrity(&backup_pool, "备份数据库").await?;
    backup_pool.close().await;

    Ok(backup_path)
}

/// 将文件路径转换为 sqlite 连接 URL
pub fn path_to_sqlite_url(path: &Path) -> Result<String, DbErr> {
    path_to_sqlite_url_with_mode(path, "rwc")
}

fn path_to_sqlite_url_with_mode(path: &Path, mode: &str) -> Result<String, DbErr> {
    let db_url = url::Url::from_file_path(path)
        .map_err(|_| DbErr::Custom("Invalid database path".to_string()))?;
    Ok(format!("sqlite:{}?mode={}", db_url.path(), mode))
}

async fn verify_integrity(pool: &sqlx::SqlitePool, label: &str) -> Result<(), DbErr> {
    let result: String = sqlx::query_scalar("PRAGMA integrity_check")
        .fetch_one(pool)
        .await
        .map_err(|e| DbErr::Custom(format!("Failed to check {} integrity: {}", label, e)))?;

    if result.eq_ignore_ascii_case("ok") {
        Ok(())
    } else {
        Err(DbErr::Custom(format!(
            "{}完整性检查失败: {}",
            label, result
        )))
    }
}

async fn create_snapshot(pool: &sqlx::SqlitePool, path: &Path) -> Result<(), DbErr> {
    sqlx::query("VACUUM INTO ?")
        .bind(path.to_string_lossy().as_ref())
        .execute(pool)
        .await
        .map_err(|e| DbErr::Custom(format!("Failed to create SQLite snapshot: {}", e)))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[async_std::test]
    async fn vacuum_into_creates_readable_snapshot() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "reina_backup_test_{}_{}",
            std::process::id(),
            unique
        ));
        fs::create_dir_all(&directory).unwrap();
        let source_path = directory.join("source.db");
        let backup_path = directory.join("backup.db");

        let source_pool = sqlx::SqlitePool::connect(&path_to_sqlite_url(&source_path).unwrap())
            .await
            .unwrap();
        sqlx::query("CREATE TABLE values_table(value TEXT NOT NULL)")
            .execute(&source_pool)
            .await
            .unwrap();
        sqlx::query("INSERT INTO values_table(value) VALUES ('kept')")
            .execute(&source_pool)
            .await
            .unwrap();

        create_snapshot(&source_pool, &backup_path).await.unwrap();
        source_pool.close().await;

        let backup_pool =
            sqlx::SqlitePool::connect(&path_to_sqlite_url_with_mode(&backup_path, "ro").unwrap())
                .await
                .unwrap();
        verify_integrity(&backup_pool, "测试备份").await.unwrap();
        let value: String = sqlx::query_scalar("SELECT value FROM values_table")
            .fetch_one(&backup_pool)
            .await
            .unwrap();
        assert_eq!(value, "kept");
        backup_pool.close().await;

        fs::remove_dir_all(directory).unwrap();
    }
}
