use super::common::RestoreSavedataResult;
use super::{legacy, rooted};
use crate::backup::savedata::maintenance::{
    acquire_savedata_backup_operation_lock, resolve_savedata_backup_root,
};
use crate::database::repository::games_repository::GamesRepository;
use sea_orm::DatabaseConnection;
use sevenz_rust2::{ArchiveReader, Password};
use std::fs;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use tauri::{State, command};

static RESTORE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SaveBackupFormat {
    LegacyV1,
    RootedV2,
}

#[command]
pub async fn restore_savedata_backup(
    db: State<'_, DatabaseConnection>,
    backup_id: i32,
    target_path: String,
) -> Result<RestoreSavedataResult, String> {
    let _operation_guard = acquire_savedata_backup_operation_lock().await;
    let record = GamesRepository::get_savedata_record_by_id(&db, backup_id)
        .await
        .map_err(|error| format!("获取备份记录失败: {error}"))?
        .ok_or_else(|| "备份记录不存在".to_string())?;
    let backup_file_path = resolve_savedata_backup_root(&db)
        .await?
        .join(format!("game_{}", record.game_id))
        .join(record.file);
    let backup_path_for_check = backup_file_path.clone();
    let backup_exists = tokio::task::spawn_blocking(move || backup_path_for_check.is_file())
        .await
        .map_err(|error| format!("检查备份文件任务失败: {error}"))?;
    if !backup_exists {
        return Err("备份文件不存在".to_string());
    }
    let target_path = reina_path::resolve_user_path(&target_path)
        .map_err(|error| format!("恢复目标路径解析失败: {error}"))?;
    tokio::task::spawn_blocking(move || restore_sync(&backup_file_path, &target_path))
        .await
        .map_err(|error| format!("恢复任务异常退出: {error}"))?
}

fn restore_sync(
    backup_file_path: &Path,
    target_path: &Path,
) -> Result<RestoreSavedataResult, String> {
    let backup_path = backup_file_path;
    if !target_path.is_absolute()
        || target_path
            .components()
            .any(|part| matches!(part, std::path::Component::ParentDir))
    {
        return Err("恢复目标路径必须是绝对路径".to_string());
    }
    let _guard = RESTORE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "恢复锁已损坏".to_string())?;
    let mut reader = ArchiveReader::open(backup_path, Password::empty())
        .map_err(|error| format!("打开备份失败: {error}"))?;
    match detect_backup_format(backup_path) {
        SaveBackupFormat::LegacyV1 => legacy::restore(&mut reader, target_path),
        SaveBackupFormat::RootedV2 => rooted::restore(&mut reader, target_path),
    }
}

fn detect_backup_format(path: &Path) -> SaveBackupFormat {
    if path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.starts_with("savedata_v2_") && name.ends_with(".7z"))
    {
        SaveBackupFormat::RootedV2
    } else {
        SaveBackupFormat::LegacyV1
    }
}

pub(super) fn remove_staging(path: &Path) {
    if let Err(error) = fs::remove_dir_all(path)
        && error.kind() != std::io::ErrorKind::NotFound
    {
        log::warn!("清理存档恢复临时目录失败 {}: {error}", path.display());
    }
}

#[cfg(test)]
pub(super) fn restore_for_test(
    backup_path: &Path,
    target_path: &Path,
) -> Result<RestoreSavedataResult, String> {
    restore_sync(backup_path, target_path)
}
