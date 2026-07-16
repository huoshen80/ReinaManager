use crate::backup::common::{
    BackupOptions, BackupResult, cleanup_auto_backup_files, resolve_backup_dir,
};
use crate::backup::covers::{backup_custom_covers_archive, delete_all_covers_dir};
use crate::database::db::close_connection;
use crate::database::dto::FullGameData;
use crate::database::repository::games_repository::GamesRepository;
use crate::database::repository::settings_repository::DbSettingsExt;
use sea_orm::{ConnectionTrait, DatabaseConnection};
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

/// 生成带时间戳的备份文件名
fn generate_backup_filename() -> String {
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    format!("reina_manager_{}.db", timestamp)
}

/// 生成带自动备份标记的数据库备份文件名，便于保留策略只清理自动备份。
fn generate_auto_backup_filename() -> String {
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    format!("reina_manager_auto_{}.db", timestamp)
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
pub async fn backup_database(
    db: State<'_, DatabaseConnection>,
    options: Option<BackupOptions>,
) -> Result<BackupResult, String> {
    let options = options.unwrap_or_default();
    if options.auto {
        return backup_database_file_cold(&db, options.max_auto_backups).await;
    }

    let result = backup_database_file(&db).await?;

    Ok(result)
}

pub async fn backup_database_file(db: &DatabaseConnection) -> Result<BackupResult, String> {
    // 生成备份文件名并确定目标路径
    let backup_name = generate_backup_filename();
    let backup_dir = resolve_backup_dir(db).await?;
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

async fn backup_database_file_cold(
    db: &DatabaseConnection,
    max_auto_backups: Option<usize>,
) -> Result<BackupResult, String> {
    // 自动冷备份用于退出流程，会关闭连接；关闭前必须先读取配置。
    let backup_dir = resolve_backup_dir(db).await?;
    let db_path = get_db_path()?;
    close_connection(db.clone())
        .await
        .map_err(|e| format!("关闭数据库连接失败: {}", e))?;
    log::info!("数据库连接已关闭，准备执行文件操作");

    let result = copy_database_file_cold(&db_path, &backup_dir, true)?;

    if let Some(max_auto_backups) = max_auto_backups
        && let Err(e) =
            cleanup_auto_backup_files(&backup_dir, "reina_manager_auto_", ".db", max_auto_backups)
    {
        log::warn!("清理旧数据库自动备份失败: {}", e);
    }

    Ok(result)
}

fn copy_database_file_cold(
    db_path: &Path,
    backup_dir: &Path,
    auto: bool,
) -> Result<BackupResult, String> {
    if !db_path.exists() {
        return Err(format!("当前数据库文件不存在: {}", db_path.display()));
    }

    let backup_name = if auto {
        generate_auto_backup_filename()
    } else {
        generate_backup_filename()
    };
    let backup_file_path = backup_dir.join(&backup_name);

    fs::copy(db_path, &backup_file_path).map_err(|e| format!("数据库冷备份失败: {}", e))?;

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
    let src_path = Path::new(&source_path);

    // 检查源文件是否存在
    if !src_path.exists() {
        return Err(format!("源数据库文件不存在: {}", source_path));
    }

    // 检查文件扩展名
    if src_path.extension().and_then(|e| e.to_str()) != Some("db") {
        return Err("无效的数据库文件，请选择 .db 文件".to_string());
    }

    // 获取当前数据库路径（自动判断便携模式）
    let target_db_path = get_db_path()?;
    if let (Ok(source), Ok(target)) = (
        fs::canonicalize(src_path),
        fs::canonicalize(&target_db_path),
    ) && source == target
    {
        return Err("不能导入当前正在使用的数据库文件".to_string());
    }

    // 步骤1：关闭连接前读取备份目录配置，关闭后无法再查询设置
    let backup_dir = resolve_backup_dir(&db).await?;

    // 步骤2：导入前备份自定义封面，后续会清空 covers 避免旧 id 封面错配新库
    backup_custom_covers_archive(&db, false).await?;

    // 步骤3：关闭数据库连接，后续对数据库文件做冷备份和覆盖
    close_connection(db.inner().clone())
        .await
        .map_err(|e| format!("关闭数据库连接失败: {}", e))?;
    log::info!("数据库连接已关闭，准备冷备份和导入");

    // 步骤4：冷备份当前数据库文件，避免覆盖后无法回滚
    let result_backup_path = match copy_database_file_cold(&target_db_path, &backup_dir, false) {
        Ok(result) => result.path,
        Err(e) => {
            log::warn!("导入前备份失败: {}，继续导入", e);
            None
        }
    };

    // 步骤5：删除整个封面目录。云端封面缓存会按新数据库重新下载，
    // 自定义封面已单独备份，不自动恢复到新库。
    delete_all_covers_dir()?;
    log::info!("导入数据库前已清空封面目录");

    // 步骤6：复制文件覆盖现有数据库
    fs::copy(src_path, &target_db_path).map_err(|e| format!("复制数据库文件失败: {}", e))?;
    log::info!("数据库文件已复制: {} -> {:?}", source_path, target_db_path);

    // 导入成功，前端将负责重启应用以重新连接数据库
    Ok(ImportResult {
        success: true,
        message: "数据库导入成功，已备份自定义封面并清空封面缓存，应用将自动重启".to_string(),
        backup_path: result_backup_path,
    })
}

// ==================== WebDAV 存档上传辅助函数 ====================

/// 从游戏数据中获取显示名称。
/// 优先级：custom_data.name > sources 中的 name_cn > sources 中的 name > "Game_{id}"
fn get_game_display_name(game: &FullGameData) -> String {
    // 1. 自定义名称
    if let Some(ref custom) = game.custom_data {
        if let Some(ref name) = custom.name {
            if !name.trim().is_empty() {
                return name.trim().to_string();
            }
        }
    }

    // 2. 从 sources 中找 name_cn 或 name
    for source in &game.sources {
        if let Some(ref data) = source.data {
            if let Some(name_cn) = data.get("name_cn").and_then(|v| v.as_str()) {
                if !name_cn.is_empty() {
                    return name_cn.to_string();
                }
            }
            if let Some(name) = data.get("name").and_then(|v| v.as_str()) {
                if !name.is_empty() {
                    return name.to_string();
                }
            }
        }
    }

    // 3. 兜底
    format!("Game_{}", game.id)
}

/// 清理文件路径非法字符。
/// 删除: \ / : * ? " < > |
fn sanitize_folder_name(name: &str) -> String {
    name.chars()
        .filter(|c| !matches!(c, '\\' | '/' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        .collect::<String>()
        .trim()
        .to_string()
}

// ==================== WebDAV 备份和导入 ====================

/// 执行本地数据库备份并上传到 WebDAV
#[command]
pub async fn webdav_backup_database(
    db: State<'_, DatabaseConnection>,
) -> Result<BackupResult, String> {
    let settings = db.get_settings().await?;

    // 检查 WebDAV 是否启用
    if !settings.webdav_enabled_value() {
        return Err("WebDAV 未启用，请在设置中配置并启用 WebDAV".to_string());
    }

    let url = settings.webdav_url_value().ok_or("WebDAV URL 未配置")?;
    let username = settings.webdav_username_value().ok_or("WebDAV 用户名未配置")?;
    let password = settings.webdav_password_value().ok_or("WebDAV 密码未配置")?;
    let root = settings.webdav_root.clone();

    // 1. 执行本地备份
    let backup_result = backup_database_file(&db).await?;

    let local_path = backup_result.path.as_ref().ok_or("备份文件路径为空")?;
    let filename = std::path::Path::new(local_path)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("无法获取备份文件名")?;

    // 2. 上传到 WebDAV
    crate::backup::webdav::upload_backup(url, username, password, &root, filename, local_path).await?;

    // 构造远程 URL 作为返回路径
    let remote_url = crate::backup::webdav::build_remote_url(url, &root, filename);

    Ok(BackupResult {
        success: true,
        path: Some(remote_url),
        message: "WebDAV 备份成功".to_string(),
    })
}

/// 上传游戏存档备份到 WebDAV。
#[command]
pub async fn webdav_upload_savedata_backup(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
    local_path: String,
) -> Result<BackupResult, String> {
    let settings = db.get_settings().await?;

    if !settings.webdav_enabled_value() {
        return Err("WebDAV 未启用，请在设置中配置并启用 WebDAV".to_string());
    }

    let url = settings.webdav_url_value().ok_or("WebDAV URL 未配置")?;
    let username = settings.webdav_username_value().ok_or("WebDAV 用户名未配置")?;
    let password = settings.webdav_password_value().ok_or("WebDAV 密码未配置")?;
    let root = settings.webdav_root.clone();

    // 获取游戏信息
    let game = GamesRepository::find_by_id(&db, game_id)
        .await
        .map_err(|e| format!("获取游戏信息失败: {}", e))?
        .ok_or_else(|| format!("游戏不存在: game_id={}", game_id))?;

    // 获取并清理游戏名
    let game_name = sanitize_folder_name(&get_game_display_name(&game));
    if game_name.is_empty() {
        return Err("游戏名称为空，无法创建远程目录".to_string());
    }

    // 解析本地文件名为远程文件名
    let local_path = std::path::Path::new(&local_path);
    let filename = local_path
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or("无法获取备份文件名")?;

    // 构建子目录路径
    let remote_subdir = match root.as_ref().filter(|r| !r.trim().is_empty()) {
        Some(r) => format!("{}/{}", r.trim_end_matches('/'), &game_name),
        None => game_name.clone(),
    };

    // 确保远程游戏目录存在
    crate::backup::webdav::ensure_nested_remote_dir(
        &url,
        &username,
        &password,
        &remote_subdir,
    )
    .await?;

    // 上传文件
    crate::backup::webdav::upload_backup(
        &url,
        &username,
        &password,
        &root,
        &format!("{}/{}", game_name, filename),
        &local_path.to_string_lossy(),
    )
    .await?;

    let remote_url = crate::backup::webdav::build_remote_url(
        &url,
        &root,
        &format!("{}/{}", game_name, filename),
    );

    log::info!("游戏存档已上传到 WebDAV game_id={} remote={}", game_id, remote_url);

    Ok(BackupResult {
        success: true,
        path: Some(remote_url),
        message: "游戏存档 WebDAV 上传成功".to_string(),
    })
}

/// 从 WebDAV 下载备份并导入数据库
#[command]
pub async fn webdav_import_database(
    remote_filename: String,
    db: State<'_, DatabaseConnection>,
) -> Result<ImportResult, String> {
    let settings = db.get_settings().await?;

    if !settings.webdav_enabled_value() {
        return Err("WebDAV 未启用".to_string());
    }

    let url = settings.webdav_url_value().ok_or("WebDAV URL 未配置")?;
    let username = settings.webdav_username_value().ok_or("WebDAV 用户名未配置")?;
    let password = settings.webdav_password_value().ok_or("WebDAV 密码未配置")?;
    let root = settings.webdav_root.clone();

    // 创建临时目录用于下载
    let temp_dir = std::env::temp_dir().join("reina_manager_webdav");
    tokio::fs::create_dir_all(&temp_dir)
        .await
        .map_err(|e| format!("创建临时目录失败: {}", e))?;
    let local_path = temp_dir.join(&remote_filename);
    let local_path_str = local_path.to_string_lossy().to_string();

    // 1. 从 WebDAV 下载备份文件
    crate::backup::webdav::download_backup(
        url, username, password, &root, &remote_filename, &local_path_str,
    )
    .await?;

    // 2. 检查文件扩展名
    if !remote_filename.ends_with(".db") {
        return Err("无效的备份文件，请选择 .db 文件".to_string());
    }

    // 3. 执行本地导入流程（复用 import_database 逻辑）
    let src_path = std::path::Path::new(&local_path_str);

    // 检查源文件是否存在
    if !src_path.exists() {
        return Err(format!("下载的备份文件不存在: {}", local_path_str));
    }

    // 获取当前数据库路径
    let target_db_path = reina_path::get_db_path()?;

    // 关闭连接前读取备份目录配置
    let backup_dir = crate::backup::common::resolve_backup_dir(&db).await?;

    // 导入前备份自定义封面
    backup_custom_covers_archive(&db, false).await?;

    // 关闭数据库连接
    crate::database::db::close_connection(db.inner().clone())
        .await
        .map_err(|e| format!("关闭数据库连接失败: {}", e))?;
    log::info!("数据库连接已关闭，准备 WebDAV 导入");

    // 冷备份当前数据库
    let result_backup_path = copy_database_file_cold(&target_db_path, &backup_dir, false)
        .map_err(|e| format!("导入前冷备份失败，已中止导入: {}", e))?
        .path;

    // 清空封面目录
    delete_all_covers_dir()?;
    log::info!("导入数据库前已清空封面目录");

    // 复制下载的文件覆盖现有数据库
    std::fs::copy(src_path, &target_db_path)
        .map_err(|e| format!("复制数据库文件失败: {}", e))?;
    log::info!("WebDAV 备份已导入: {} -> {:?}", local_path_str, target_db_path);

    // 清理临时文件
    let _ = std::fs::remove_file(&local_path_str);

    Ok(ImportResult {
        success: true,
        message: "WebDAV 数据库导入成功，已备份自定义封面并清空封面缓存，应用将自动重启".to_string(),
        backup_path: result_backup_path,
    })
}

/// 列举 WebDAV 远程备份文件
#[command]
pub async fn list_webdav_backups(
    db: State<'_, DatabaseConnection>,
) -> Result<Vec<crate::backup::webdav::WebdavBackupInfo>, String> {
    let settings = db.get_settings().await?;

    if !settings.webdav_enabled_value() {
        return Err("WebDAV 未启用".to_string());
    }

    let url = settings.webdav_url_value().ok_or("WebDAV URL 未配置")?;
    let username = settings.webdav_username_value().ok_or("WebDAV 用户名未配置")?;
    let password = settings.webdav_password_value().ok_or("WebDAV 密码未配置")?;
    let root = settings.webdav_root.clone();

    crate::backup::webdav::list_backups(url, username, password, &root).await
}

/// 删除 WebDAV 远程备份文件
#[command]
pub async fn delete_webdav_backup(
    remote_filename: String,
    db: State<'_, DatabaseConnection>,
) -> Result<(), String> {
    let settings = db.get_settings().await?;

    if !settings.webdav_enabled_value() {
        return Err("WebDAV 未启用".to_string());
    }

    let url = settings.webdav_url_value().ok_or("WebDAV URL 未配置")?;
    let username = settings.webdav_username_value().ok_or("WebDAV 用户名未配置")?;
    let password = settings.webdav_password_value().ok_or("WebDAV 密码未配置")?;
    let root = settings.webdav_root.clone();

    crate::backup::webdav::delete_backup(url, username, password, &root, &remote_filename).await
}

/// 测试 WebDAV 连接（使用显式参数，不保存到数据库）
#[command]
pub async fn test_webdav_connection(
    url: String,
    username: String,
    password: String,
) -> Result<bool, String> {
    crate::backup::webdav::test_connection(&url, &username, &password).await
}

