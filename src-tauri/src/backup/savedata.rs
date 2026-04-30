use super::archive::{create_7z_archive, extract_7z_archive};
use crate::database::repository::games_repository::GamesRepository;
use chrono::Utc;
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupInfo {
    pub folder_name: String,
    pub backup_time: i64,
    pub file_size: u64,
    pub backup_path: String,
}
/// 创建游戏存档备份
///
/// 备份目录优先级：
/// 1. 使用 user.save_root_path/backups（如果设置且非空）
/// 2. 使用默认路径：
///    - 便携模式：程序目录/backups
///    - 非便携模式：AppData/backups
///
/// # Arguments
/// * `app` - Tauri应用句柄
/// * `game_id` - 游戏ID
/// * `source_path` - 源存档文件夹路径
///
/// # Returns
/// * `Result<BackupInfo, String>` - 备份信息或错误消息
#[tauri::command]
pub async fn create_savedata_backup(
    db: State<'_, DatabaseConnection>,
    game_id: i64,
    source_path: String,
) -> Result<BackupInfo, String> {
    let source_path = Path::new(&source_path);

    // 验证源路径是否存在
    if !source_path.exists() {
        return Err("源存档文件夹不存在".to_string());
    }

    if !source_path.is_dir() {
        return Err("源路径必须是一个文件夹".to_string());
    }

    let backup_root = resolve_savedata_backup_root(&db).await?;

    // 创建游戏专属备份目录
    let game_backup_dir = backup_root.join(format!("game_{}", game_id));

    fs::create_dir_all(&game_backup_dir).map_err(|e| format!("创建备份目录失败: {}", e))?;

    // 检查并清理超出限制的备份（异步处理）
    cleanup_old_backups(&db, &game_backup_dir, game_id).await?;

    // 生成备份文件名（带时间戳）
    let now = Utc::now();
    let timestamp = now.timestamp();
    let backup_filename = format!("savedata_{}_{}.7z", game_id, now.format("%Y%m%d_%H%M%S"));
    let backup_file_path = game_backup_dir.join(&backup_filename);

    // 创建7z压缩包
    let backup_size = create_7z_archive(source_path, &backup_file_path)
        .map_err(|e| format!("创建压缩包失败: {}", e))?;

    Ok(BackupInfo {
        folder_name: backup_filename,
        backup_time: timestamp,
        file_size: backup_size,
        backup_path: backup_file_path.to_string_lossy().to_string(),
    })
}

/// 恢复存档备份
///
/// # Arguments
/// * `backup_file_path` - 备份文件完整路径
/// * `target_path` - 目标恢复路径
///
/// # Returns
/// * `Result<(), String>` - 成功或错误消息
#[tauri::command]
pub async fn restore_savedata_backup(
    backup_file_path: String,
    target_path: String,
) -> Result<(), String> {
    let backup_path = Path::new(&backup_file_path);
    let target_path = Path::new(&target_path);

    // 验证备份文件是否存在
    if !backup_path.exists() {
        return Err("备份文件不存在".to_string());
    }

    // 确保目标路径存在
    if !target_path.exists() {
        fs::create_dir_all(target_path).map_err(|e| format!("创建目标目录失败: {}", e))?;
    }

    // 解压7z文件
    extract_7z_archive(backup_path, target_path).map_err(|e| format!("解压备份失败: {}", e))?;

    Ok(())
}

/// 删除单个备份记录（文件 + 数据库）
///
/// 通用函数：即使文件删除失败，也会继续删除数据库记录
///
/// # Arguments
/// * `db` - 数据库连接
/// * `backup_file_path` - 备份文件完整路径
/// * `backup_id` - 数据库记录 ID
///
/// # Returns
/// * `Option<String>` - 如果有错误返回错误信息，否则返回 None
async fn delete_backup_record(
    db: &DatabaseConnection,
    backup_file_path: &Path,
    backup_id: i32,
) -> Option<String> {
    let mut errors: Vec<String> = Vec::new();
    // 删除备份文件（如果存在），失败时收集错误

    if let Err(e) = fs::remove_file(backup_file_path) {
        errors.push(format!("删除备份文件失败 {:?}: {}", backup_file_path, e));
    }

    // 无论文件删除是否成功，都继续删除数据库记录
    if let Err(e) = GamesRepository::delete_savedata_record(db, backup_id).await {
        errors.push(format!("删除数据库记录失败 (ID: {}): {}", backup_id, e));
    }

    if errors.is_empty() {
        None
    } else {
        Some(errors.join("; "))
    }
}

/// 删除备份文件和数据库记录
///
/// 二合一功能：同时删除备份文件和对应的数据库记录
/// 即使文件删除失败，也会删除数据库记录，最后返回所有错误
///
/// # Arguments
/// * `app` - Tauri应用句柄
/// * `db` - 数据库连接
/// * `backup_id` - 备份记录ID
///
/// # Returns
/// * `Result<(), String>` - 成功或错误消息
#[tauri::command]
pub async fn delete_savedata_backup(
    db: State<'_, DatabaseConnection>,
    backup_id: i32,
) -> Result<(), String> {
    // 先从数据库获取备份记录
    let record = GamesRepository::get_savedata_record_by_id(&db, backup_id)
        .await
        .map_err(|e| format!("获取备份记录失败: {}", e))?
        .ok_or_else(|| "备份记录不存在".to_string())?;

    let backup_root = resolve_savedata_backup_root(&db).await?;
    let game_backup_dir = backup_root.join(format!("game_{}", record.game_id));
    let backup_path = game_backup_dir.join(&record.file);

    // 使用通用函数删除备份记录
    if let Some(error) = delete_backup_record(&db, &backup_path, backup_id).await {
        return Err(error);
    }

    Ok(())
}

async fn resolve_savedata_backup_root(db: &DatabaseConnection) -> Result<PathBuf, String> {
    use crate::database::repository::settings_repository::DbSettingsExt;
    let settings = db.get_settings().await?;

    let backup_root = if let Some(custom) = settings.save_root_path_value() {
        PathBuf::from(custom).join("backups")
    } else {
        reina_path::get_base_data_dir()?.join("backups")
    };

    Ok(backup_root)
}

/// 清理超出数量限制的旧备份（基于数据库记录，异步处理）
///
/// 从 games 表中读取该游戏的 maxbackups 设置
///
/// # Arguments
/// * `db` - 数据库连接
/// * `backup_dir` - 备份目录路径
/// * `game_id` - 游戏ID
///
/// # Returns
/// * `Result<(), String>` - 成功或错误消息
async fn cleanup_old_backups(
    db: &DatabaseConnection,
    backup_dir: &Path,
    game_id: i64,
) -> Result<(), String> {
    // 从数据库获取游戏信息，读取 maxbackups 设置
    let game = GamesRepository::find_by_id(db, game_id as i32)
        .await
        .map_err(|e| format!("获取游戏信息失败: {}", e))?;

    // 获取最大备份数量（前端已设置默认值20，不会为null）
    let max_backups = game
        .and_then(|g| g.maxbackups)
        .expect("maxbackups should not be null") as usize;

    // 从数据库获取该游戏的所有备份记录
    let mut records = GamesRepository::get_savedata_records(db, game_id as i32)
        .await
        .map_err(|e| format!("获取备份记录失败: {}", e))?;

    // 如果备份数量未超过限制，直接返回
    if records.len() < max_backups {
        return Ok(());
    }

    // 按备份时间排序（最旧的在前）
    records.sort_by_key(|r| r.backup_time);

    // 计算需要删除的备份数量（保留最新的 max_backups - 1 个，为新备份留出空间）
    let to_delete_count = records.len() - (max_backups - 1);
    let records_to_delete = &records[..to_delete_count];

    // 收集错误信息，不中断循环
    let mut errors: Vec<String> = Vec::new();

    // 使用通用函数删除文件和数据库记录
    for record in records_to_delete {
        let backup_file_path = backup_dir.join(&record.file);

        if let Some(error) = delete_backup_record(db, &backup_file_path, record.id).await {
            errors.push(error);
        }
    }

    // 有错误时记录日志，但不终止备份流程
    if !errors.is_empty() {
        log::warn!(
            "清理旧备份时遇到 {} 个错误:\n{}",
            errors.len(),
            errors.join("\n")
        );
    }

    Ok(())
}
