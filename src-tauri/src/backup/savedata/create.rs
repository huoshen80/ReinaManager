use super::archive::create_savedata_archive;
use super::maintenance::{
    acquire_savedata_backup_operation_lock, cleanup_old_backups, resolve_savedata_backup_root,
};
use crate::backup::common::next_backup_filename as allocate_backup_filename;
use crate::database::repository::games_repository::GamesRepository;
use chrono::Utc;
use sea_orm::DatabaseConnection;
use serde::Serialize;
use std::fs;
use std::path::Path;
use tauri::{State, command};

#[derive(Debug, Serialize)]
pub struct BackupInfo {
    pub folder_name: String,
    pub backup_time: i64,
    pub file_size: u64,
    pub backup_path: String,
}

/// 创建带根对象的 V2 游戏存档备份。
#[command]
pub async fn create_savedata_backup(
    db: State<'_, DatabaseConnection>,
    game_id: i64,
    source_path: String,
) -> Result<BackupInfo, String> {
    let _operation_guard = acquire_savedata_backup_operation_lock().await;
    let source_path = reina_path::resolve_user_path(&source_path)
        .map_err(|error| format!("存档路径解析失败: {error}"))?;
    let source_for_check = source_path.clone();
    tokio::task::spawn_blocking(move || fs::symlink_metadata(&source_for_check))
        .await
        .map_err(|error| format!("检查源存档失败: {error}"))?
        .map_err(|error| {
            if error.kind() == std::io::ErrorKind::NotFound {
                "源存档文件或文件夹不存在".to_string()
            } else {
                format!("检查源存档失败: {error}")
            }
        })?;
    let backup_root = resolve_savedata_backup_root(&db).await?;
    let game_backup_dir = backup_root.join(format!("game_{game_id}"));
    let now = Utc::now();
    let directory_for_setup = game_backup_dir.clone();
    let backup_filename = tokio::task::spawn_blocking(move || {
        fs::create_dir_all(&directory_for_setup)
            .map_err(|error| format!("创建备份目录失败: {error}"))?;
        next_backup_filename(&directory_for_setup, game_id, now)
    })
    .await
    .map_err(|error| format!("准备备份目录任务失败: {error}"))??;
    let backup_file_path = game_backup_dir.join(&backup_filename);
    let archive_source = source_path.clone();
    let archive_path = backup_file_path.clone();
    let archive_result = tokio::task::spawn_blocking(move || {
        create_savedata_archive(&archive_source, &archive_path)
            .map_err(|error| format!("创建压缩包失败: {error}"))
    })
    .await;
    let backup_size = match archive_result {
        Ok(result) => result?,
        Err(error) => {
            return Err(remove_failed_archive(
                &backup_file_path,
                format!("备份任务异常退出: {error}"),
            )
            .await);
        }
    };

    let game_id = match i32::try_from(game_id) {
        Ok(game_id) => game_id,
        Err(_) => {
            return Err(remove_failed_archive(
                &backup_file_path,
                "游戏 ID 超出数据库范围".to_string(),
            )
            .await);
        }
    };
    let database_size = match i64::try_from(backup_size) {
        Ok(database_size) => database_size,
        Err(_) => {
            return Err(remove_failed_archive(
                &backup_file_path,
                "备份文件大小超出数据库范围".to_string(),
            )
            .await);
        }
    };
    let backup_id = match GamesRepository::save_savedata_record(
        &db,
        game_id,
        &backup_filename,
        now.timestamp(),
        database_size,
    )
    .await
    {
        Ok(backup_id) => backup_id,
        Err(error) => {
            return Err(remove_failed_archive(
                &backup_file_path,
                format!("保存存档备份记录失败: {error}"),
            )
            .await);
        }
    };

    // 新归档已登记后再清理历史记录；清理失败不应把有效的新备份报告为失败。
    if let Err(error) = cleanup_old_backups(&db, &game_backup_dir, game_id, backup_id).await {
        log::warn!("新备份已创建，但清理旧备份失败 game_id={game_id}: {error}");
    }
    log::info!(
        "存档备份创建成功 game_id={} file={} size={} bytes",
        game_id,
        backup_filename,
        backup_size
    );
    Ok(BackupInfo {
        folder_name: backup_filename,
        backup_time: now.timestamp(),
        file_size: backup_size,
        backup_path: backup_file_path.to_string_lossy().into_owned(),
    })
}

fn next_backup_filename(
    backup_dir: &Path,
    game_id: i64,
    now: chrono::DateTime<Utc>,
) -> Result<String, String> {
    let prefix = format!("savedata_v2_{game_id}_");
    let timestamp = now.format("%Y%m%d_%H%M%S").to_string();
    allocate_backup_filename(backup_dir, &prefix, &timestamp, ".7z")
}

async fn remove_failed_archive(path: &Path, error: String) -> String {
    let path = path.to_path_buf();
    let cleanup_result = tokio::task::spawn_blocking(move || fs::remove_file(&path)).await;
    match cleanup_result {
        Ok(Ok(())) => error,
        Ok(Err(cleanup_error)) if cleanup_error.kind() == std::io::ErrorKind::NotFound => error,
        Err(cleanup_error) => format!("{error}；同时清理未登记归档任务失败: {cleanup_error}"),
        Ok(Err(cleanup_error)) => format!("{error}；同时清理未登记归档失败: {cleanup_error}"),
    }
}
