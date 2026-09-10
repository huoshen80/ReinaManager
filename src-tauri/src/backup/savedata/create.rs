use super::archive::create_savedata_archive;
use super::maintenance::{cleanup_old_backups, resolve_savedata_backup_root};
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
    let source_path = Path::new(&source_path);
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
    let backup_size = create_savedata_archive(source_path, &backup_file_path)
        .map_err(|error| format!("创建压缩包失败: {error}"))?;

    // 新归档完成并通过预检后，才为它腾出保留名额。
    cleanup_old_backups(&db, &game_backup_dir, game_id).await?;
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
