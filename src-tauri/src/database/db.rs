use sea_orm::{ConnectOptions, ConnectionTrait, Database, DatabaseConnection, DbErr, RuntimeErr};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{State, command};
use url::Url;

use reina_path::{get_db_path, get_default_db_backup_path, is_portable_mode};

/// 数据库备份结果
#[derive(Debug, Serialize, Deserialize)]
pub struct BackupResult {
    pub success: bool,
    pub path: Option<String>,
    pub message: String,
}

/// 数据库导入结果
#[derive(Debug, Serialize, Deserialize)]
pub struct ImportResult {
    pub success: bool,
    pub message: String,
    pub backup_path: Option<String>,
}

// ==================== 数据库连接管理 ====================

/// Establish a SeaORM database connection.
pub async fn establish_connection() -> Result<DatabaseConnection, DbErr> {
    // 1. 获取数据库路径（自动判断便携模式）
    let db_path = get_db_path().map_err(|e| DbErr::Conn(RuntimeErr::Internal(e)))?;

    fn mode() -> &'static str {
        if is_portable_mode() {
            "便携"
        } else {
            "标准"
        }
    }

    // 2. 如果数据库不存在，创建目录
    if !db_path.exists() {
        if let Some(parent) = db_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                DbErr::Conn(RuntimeErr::Internal(format!("无法创建数据库目录: {}", e)))
            })?;
        }
        log::info!("首次启动，创建{}模式数据库: {}", mode(), db_path.display());
    } else {
        log::info!("使用{}模式数据库: {}", mode(), db_path.display());
    }

    // 3. 使用 `url` crate 安全地构建连接字符串
    let db_url = Url::from_file_path(&db_path).map_err(|_| {
        DbErr::Conn(RuntimeErr::Internal(format!(
            "Invalid database path: {}",
            db_path.display()
        )))
    })?;

    let connection_string = format!("sqlite:{}?mode=rwc", db_url.path());

    // 4. 设置连接选项
    let mut options = ConnectOptions::new(connection_string);
    options
        .max_connections(1)
        .min_connections(1)
        .connect_timeout(Duration::from_secs(8));

    // 5. 在开发模式下启用日志
    #[cfg(debug_assertions)]
    {
        options.sqlx_logging(false);
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

// ==================== 数据库备份和导入 ====================

/// 生成带时间戳的备份文件名
fn generate_backup_filename() -> String {
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    format!("reina_manager_{}.db", timestamp)
}

/// 解析备份目标目录（按需读取 user.db_backup_path）
pub async fn resolve_backup_dir(db: &DatabaseConnection) -> Result<PathBuf, String> {
    use crate::database::repository::settings_repository::DbSettingsExt;

    let settings = db.get_settings().await?;

    let backup_dir = if let Some(custom) = settings.db_backup_path_value() {
        PathBuf::from(custom)
    } else {
        get_default_db_backup_path()?
    };

    // 确保目录存在
    if !backup_dir.exists() {
        fs::create_dir_all(&backup_dir).map_err(|e| format!("无法创建备份目录: {}", e))?;
    }

    Ok(backup_dir)
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
    // 生成备份文件名并确定目标路径
    let backup_name = generate_backup_filename();
    let backup_dir = resolve_backup_dir(&db).await?;
    let target_path = backup_dir.join(&backup_name);

    // 将路径转换为字符串
    // SQLite 在 Windows 上也支持正斜杠，使用正斜杠可以避免转义问题
    let target_path_str = target_path
        .to_str()
        .ok_or("备份路径包含无效字符")?
        .replace('\\', "/"); // 将所有反斜杠转换为正斜杠

    // 使用 VACUUM INTO 进行热备份
    // 只需要转义单引号，路径分隔符使用正斜杠不需要转义
    let escaped_path = target_path_str.replace('\'', "''");
    let vacuum_sql = format!("VACUUM INTO '{}'", escaped_path);

    // 执行 VACUUM INTO
    db.execute_unprepared(&vacuum_sql)
        .await
        .map_err(|e| format!("VACUUM INTO 备份失败: {}", e))?;

    log::info!("数据库热备份成功: {}", target_path_str);

    Ok(BackupResult {
        success: true,
        path: Some(target_path_str),
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
    let src_path = Path::new(&source_path);

    // 检查源文件是否存在
    if !src_path.exists() {
        return Err(format!("源数据库文件不存在: {}", source_path));
    }

    // 检查文件扩展名
    if src_path.extension().and_then(|e| e.to_str()) != Some("db") {
        return Err("无效的数据库文件，请选择 .db 文件".to_string());
    }

    // 在关闭连接前读取备份配置
    let backup_dir = resolve_backup_dir(&db).await.ok();

    // 获取当前数据库路径（自动判断便携模式）
    let target_db_path = get_db_path()?;

    // 步骤1：关闭数据库连接（必须先关闭才能安全备份和覆盖）
    let conn = db.inner().clone();
    close_connection(conn)
        .await
        .map_err(|e| format!("关闭数据库连接失败: {}", e))?;
    log::info!("数据库连接已关闭，准备备份和导入");

    // 步骤2：使用 fs::copy 进行冷备份（连接已关闭，可以安全复制）
    let result_backup_path = if target_db_path.exists() {
        if let Some(dir) = backup_dir {
            let backup_name = generate_backup_filename();
            let backup_file_path = dir.join(&backup_name);

            match fs::copy(&target_db_path, &backup_file_path) {
                Ok(_) => {
                    let path_str = backup_file_path.to_string_lossy().to_string();
                    log::info!("导入前冷备份成功: {}", path_str);
                    Some(path_str)
                }
                Err(e) => {
                    log::warn!("导入前备份失败: {}，继续导入", e);
                    None
                }
            }
        } else {
            log::warn!("无法确定备份目录，跳过备份");
            None
        }
    } else {
        None
    };

    // 步骤3：复制文件覆盖现有数据库
    fs::copy(src_path, &target_db_path).map_err(|e| format!("复制数据库文件失败: {}", e))?;
    log::info!("数据库文件已复制: {} -> {:?}", source_path, target_db_path);

    // 导入成功，前端将负责重启应用以重新连接数据库
    Ok(ImportResult {
        success: true,
        message: "数据库导入成功，应用将自动重启".to_string(),
        backup_path: result_backup_path,
    })
}
