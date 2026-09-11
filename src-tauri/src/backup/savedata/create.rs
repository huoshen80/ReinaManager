use super::archive::create_savedata_archive;
use super::maintenance::{cleanup_old_backups, resolve_savedata_backup_root};
use crate::database::repository::games_repository::GamesRepository;
use chrono::Utc;
use sea_orm::DatabaseConnection;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
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
    let source_path = PathBuf::from(source_path);
    if !source_path.exists() {
        return Err("源存档文件或文件夹不存在".to_string());
    }
    let backup_root = resolve_savedata_backup_root(&db).await?;
    let game_backup_dir = backup_root.join(format!("game_{game_id}"));
    fs::create_dir_all(&game_backup_dir).map_err(|error| format!("创建备份目录失败: {error}"))?;

    let now = Utc::now();
    let backup_filename = format!(
        "savedata_v2_{}_{}_{}.7z",
        game_id,
        now.format("%Y%m%d_%H%M%S"),
        now.timestamp_subsec_nanos()
    );
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
            ));
        }
    };

    let game_id = i32::try_from(game_id).map_err(|_| {
        remove_failed_archive(&backup_file_path, "游戏 ID 超出数据库范围".to_string())
    })?;
    let database_size = i64::try_from(backup_size).map_err(|_| {
        remove_failed_archive(&backup_file_path, "备份文件大小超出数据库范围".to_string())
    })?;
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
            ));
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

fn remove_failed_archive(path: &Path, error: String) -> String {
    match fs::remove_file(path) {
        Ok(()) => error,
        Err(cleanup_error) if cleanup_error.kind() == std::io::ErrorKind::NotFound => error,
        Err(cleanup_error) => format!(
            "{error}；同时清理未登记归档失败 {}: {cleanup_error}",
            path.display()
        ),
    }
}
