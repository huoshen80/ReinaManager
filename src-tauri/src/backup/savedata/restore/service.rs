use super::common::RestoreSavedataResult;
use super::{legacy, rooted};
use sevenz_rust2::{ArchiveReader, Password};
use std::fs;
use std::path::Path;
use std::sync::{Mutex, OnceLock};
use tauri::command;

static RESTORE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SaveBackupFormat {
    LegacyV1,
    RootedV2,
}

#[command]
pub async fn restore_savedata_backup(
    backup_file_path: String,
    target_path: String,
) -> Result<RestoreSavedataResult, String> {
    if !Path::new(&backup_file_path).is_file() {
        return Err("备份文件不存在".to_string());
    }
    tokio::task::spawn_blocking(move || restore_sync(&backup_file_path, &target_path))
        .await
        .map_err(|error| format!("恢复任务异常退出: {error}"))?
}

fn restore_sync(
    backup_file_path: &str,
    target_path: &str,
) -> Result<RestoreSavedataResult, String> {
    let backup_path = Path::new(backup_file_path);
    let target_path = Path::new(target_path);
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
    restore_sync(
        &backup_path.to_string_lossy(),
        &target_path.to_string_lossy(),
    )
}
