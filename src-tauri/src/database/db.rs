use sea_orm::{ConnectOptions, ConnectionTrait, Database, DatabaseConnection, DbErr, RuntimeErr};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;
use tauri::{command, AppHandle, Manager};
use url::Url;

use crate::utils::fs::{move_dir_recursive, move_file};
use reina_path::{
    get_base_data_dir_for_mode, get_db_path, is_portable_mode, DB_BACKUP_SUBDIR, DB_DATA_DIR,
    DB_FILE_NAME,
};

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

/// 解析备份目标目录（使用统一的路径管理器）
async fn resolve_backup_dir(
    app_handle: &AppHandle,
    db: &DatabaseConnection,
) -> Result<PathBuf, String> {
    use crate::utils::fs::PathManager;

    let path_manager = app_handle.state::<PathManager>();
    let backup_dir = path_manager.get_db_backup_path(db).await?;

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
/// - 否则使用默认的 AppData/data/backups 目录（或便携模式下的程序目录）
///
/// # Arguments
///
/// * `app_handle` - Tauri 应用句柄
///
/// # Returns
///
/// 备份结果，包含备份文件的路径
#[command]
pub async fn backup_database(app_handle: AppHandle) -> Result<BackupResult, String> {
    // 获取数据库连接
    let db = app_handle
        .try_state::<DatabaseConnection>()
        .ok_or("数据库连接不可用")?;

    // 生成备份文件名并确定目标路径
    let backup_name = generate_backup_filename();
    let backup_dir = resolve_backup_dir(&app_handle, &db).await?;
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
/// * `app_handle` - Tauri 应用句柄
///
/// # Returns
///
/// 导入结果，包含备份路径（如果备份成功）
#[command]
pub async fn import_database(
    source_path: String,
    app_handle: AppHandle,
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
    let backup_dir = if let Some(conn_state) = app_handle.try_state::<DatabaseConnection>() {
        resolve_backup_dir(&app_handle, conn_state.inner())
            .await
            .ok()
    } else {
        None
    };

    // 获取当前数据库路径（自动判断便携模式）
    let target_db_path = get_db_path()?;

    // 步骤1：关闭数据库连接（必须先关闭才能安全备份和覆盖）
    if let Some(conn_state) = app_handle.try_state::<DatabaseConnection>() {
        let conn = conn_state.inner().clone();
        close_connection(conn)
            .await
            .map_err(|e| format!("关闭数据库连接失败: {}", e))?;
        log::info!("数据库连接已关闭，准备备份和导入");
    }

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

// ==================== 便携模式切换辅助函数 ====================

/// **重要说明**：
/// - 此函数会关闭数据库连接以确保数据安全迁移
/// - 使用**剪切**操作（移动文件），源文件将被删除
/// - 切换模式后应用会自动重启，使用新位置的数据库
/// - 便携模式：文件存储在软件安装目录/resources 下
/// - 标准模式：文件存储在系统 AppData 目录下
///
/// 迁移数据文件到新的数据目录
///
/// 用于在便携模式切换时迁移数据库文件、数据库备份和存档备份
///
/// # Arguments
/// * `to_portable` - 是否切换到便携模式
/// * `user_save_root_path` - 用户自定义的存档路径（用于判断是否迁移存档备份）
///
/// # Returns
/// * `Result<MigrationResult, String>` - 迁移结果或错误消息
pub async fn migrate_data_files(
    app: &AppHandle,
    to_portable: bool,
    user_save_root_path: Option<String>,
) -> Result<MigrationResult, String> {
    // 步骤1：关闭数据库连接（必须先关闭才能安全迁移数据库文件）
    if let Some(conn_state) = app.try_state::<DatabaseConnection>() {
        let conn = conn_state.inner().clone();
        close_connection(conn)
            .await
            .map_err(|e| format!("关闭数据库连接失败: {}", e))?;
        log::info!("数据库连接已关闭，准备迁移数据文件");
    }

    // 获取源目录和目标目录
    // 使用 get_base_data_dir_for_mode 明确指定模式，不依赖文件存在性判断
    // 这样可以确保在迁移过程中获取正确的源目录和目标目录
    let from_base_dir = get_base_data_dir_for_mode(!to_portable)?;
    let to_base_dir = get_base_data_dir_for_mode(to_portable)?;

    let mut result = MigrationResult {
        database_migrated: false,
        database_backups_count: 0,
        savedata_backups_count: 0,
        total_files: 0,
    };

    log::info!(
        "开始迁移数据文件: {} -> {}",
        from_base_dir.display(),
        to_base_dir.display()
    );

    // 2. 迁移数据库文件（data/reina_manager.db）
    let from_db_file = from_base_dir.join(DB_DATA_DIR).join(DB_FILE_NAME);
    let to_db_file = to_base_dir.join(DB_DATA_DIR).join(DB_FILE_NAME);

    if from_db_file.exists() {
        // 数据库文件迁移是关键操作，如果失败需要明确报错
        match move_file(&from_db_file, &to_db_file) {
            Ok(_) => {
                result.database_migrated = true;
                result.total_files += 1;
                log::info!(
                    "已迁移数据库文件: {} -> {}",
                    from_db_file.display(),
                    to_db_file.display()
                );
            }
            Err(e) => {
                let error_msg = format!(
                    "迁移数据库文件失败: {}\n源文件: {}\n目标文件: {}\n提示: 请检查目标目录是否有写入权限，或目标文件是否被占用。源数据库文件保持不变",
                    e,
                    from_db_file.display(),
                    to_db_file.display()
                );
                log::error!("{}", error_msg);

                // 清理可能创建的不完整目标文件
                if to_db_file.exists() {
                    log::warn!("清理不完整的目标数据库文件");
                    let _ = fs::remove_file(&to_db_file);
                }

                return Err(error_msg);
            }
        }
    }

    // 3. 迁移数据库备份文件（data/backups/*.db）
    let from_db_backups_dir = from_base_dir.join(DB_DATA_DIR).join(DB_BACKUP_SUBDIR);
    let to_db_backups_dir = to_base_dir.join(DB_DATA_DIR).join(DB_BACKUP_SUBDIR);

    if from_db_backups_dir.exists() && from_db_backups_dir.is_dir() {
        match move_dir_recursive(&from_db_backups_dir, &to_db_backups_dir) {
            Ok(count) => {
                result.database_backups_count = count;
                result.total_files += count;
                if count > 0 {
                    log::info!("已迁移 {} 个数据库备份文件", count);
                    // 删除空的源目录
                    let _ = fs::remove_dir(&from_db_backups_dir);
                }
            }
            Err(e) => {
                let error_msg = format!(
                    "迁移数据库备份文件失败: {}\n源目录: {}\n目标目录: {}\n提示: 数据库文件已迁移，但备份文件迁移失败。源备份文件保持不变，请解决问题后手动迁移",
                    e,
                    from_db_backups_dir.display(),
                    to_db_backups_dir.display()
                );
                log::error!("{}", error_msg);

                return Err(error_msg);
            }
        }
    }

    // 4. 迁移存档备份文件（backups/game_*/*.7z）
    // 如果用户使用了自定义存档路径，则不迁移（由用户自行管理）
    if user_save_root_path.is_none()
        || user_save_root_path
            .as_ref()
            .is_none_or(|p| p.trim().is_empty())
    {
        let from_savedata_backups_dir = from_base_dir.join("backups");
        let to_savedata_backups_dir = to_base_dir.join("backups");

        if from_savedata_backups_dir.exists() && from_savedata_backups_dir.is_dir() {
            match move_dir_recursive(&from_savedata_backups_dir, &to_savedata_backups_dir) {
                Ok(count) => {
                    result.savedata_backups_count = count;
                    result.total_files += count;
                    if count > 0 {
                        log::info!("已迁移 {} 个存档备份文件", count);
                        // 删除空的源目录
                        let _ = fs::remove_dir(&from_savedata_backups_dir);
                    }
                }
                Err(e) => {
                    let error_msg = format!(
                        "迁移存档备份文件失败: {}\n源目录: {}\n目标目录: {}\n提示: 数据库和数据库备份已迁移，但存档备份迁移失败。源存档备份保持不变，请解决问题后手动迁移",
                        e,
                        from_savedata_backups_dir.display(),
                        to_savedata_backups_dir.display()
                    );
                    log::error!("{}", error_msg);

                    return Err(error_msg);
                }
            }
        }
    } else {
        log::info!("用户使用了自定义存档路径，跳过存档备份迁移");
    }

    log::info!(
        "数据文件迁移完成: 数据库={}, 数据库备份={}, 存档备份={}, 总计={} 个文件",
        result.database_migrated,
        result.database_backups_count,
        result.savedata_backups_count,
        result.total_files
    );

    Ok(result)
}

/// 数据迁移结果
#[derive(Debug, Clone)]
pub struct MigrationResult {
    /// 是否迁移了数据库文件
    pub database_migrated: bool,
    /// 迁移的数据库备份文件数量
    pub database_backups_count: usize,
    /// 迁移的存档备份文件数量
    pub savedata_backups_count: usize,
    /// 迁移的文件总数
    pub total_files: usize,
}
