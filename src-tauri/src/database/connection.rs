use sea_orm::{ConnectOptions, Database, DatabaseConnection, DbErr, RuntimeErr};
use std::time::Duration;
use tauri::{AppHandle, Manager};
use url::Url; // 导入 Url

/// Establish a SeaORM database connection.
pub async fn establish_connection(app: &AppHandle) -> Result<DatabaseConnection, DbErr> {
    // 1. 解析数据库文件路径
    let db_path = app
        .path()
        .app_data_dir()
        .map_err(|e| {
            DbErr::Conn(RuntimeErr::Internal(format!(
                "Failed to resolve app data directory: {e}"
            )))
        })?
        .join("data/reina_manager.db");

    // 2. 确保数据库所在的目录存在
    if let Some(parent_dir) = db_path.parent() {
        std::fs::create_dir_all(parent_dir).map_err(|e| {
            DbErr::Conn(RuntimeErr::Internal(format!(
                "Failed to create database directory: {e}"
            )))
        })?;
    }

    // 3. 使用 `url` crate 安全地构建连接字符串
    let db_url = Url::from_file_path(&db_path).map_err(|_| {
        DbErr::Conn(RuntimeErr::Internal(format!(
            "Invalid database path: {}",
            db_path.display()
        )))
    })?;

    // 注意：对于本地文件，sqlite 驱动通常期望的格式是 sqlite:path (没有 //)
    // 但 sqlx-sqlite 对 sqlite:// 也有很好的兼容性。更通用的写法是直接用路径。
    let connection_string = format!("sqlite:{}?mode=rwc", db_url.path());

    // 4. 设置连接选项
    let mut options = ConnectOptions::new(connection_string);
    options
        .max_connections(1) // 对于本地 SQLite，连接池大小为 1 即可
        .min_connections(1)
        .connect_timeout(Duration::from_secs(8));

    // 5. 在开发模式下启用日志，在发布模式下禁用
    #[cfg(debug_assertions)]
    {
        options.sqlx_logging(true);
        println!("Database connection string: {}", options.get_url());
    }
    #[cfg(not(debug_assertions))]
    {
        options.sqlx_logging(false);
    }

    // 6. 连接数据库
    Database::connect(options).await
}

/// 关闭数据库连接
pub async fn close_connection(conn: DatabaseConnection) -> Result<(), DbErr> {
    conn.close().await?;
    Ok(())
}
