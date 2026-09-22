use crate::database::repository::settings_repository::DbSettingsExt;
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::sync::{Mutex, MutexGuard};

const DATABASE_AUTO_PREFIX: &str = "reina_manager_auto_";
const DATABASE_AUTO_EXTENSION: &str = ".db";
const COVERS_AUTO_PREFIX: &str = "custom_covers_auto_";
const COVERS_AUTO_EXTENSION: &str = ".7z";

static DATABASE_BACKUP_OPERATION_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static DATABASE_BACKUP_AVAILABLE: AtomicBool = AtomicBool::new(true);

#[derive(Debug, Serialize, Deserialize)]
pub struct BackupResult {
    pub success: bool,
    pub path: Option<String>,
    pub message: String,
}

pub async fn acquire_database_backup_operation_lock() -> MutexGuard<'static, ()> {
    DATABASE_BACKUP_OPERATION_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .await
}

pub fn ensure_database_backup_available() -> Result<(), String> {
    if DATABASE_BACKUP_AVAILABLE.load(Ordering::Acquire) {
        Ok(())
    } else {
        Err("数据库正在关闭或等待应用重启，无法继续备份".to_string())
    }
}

pub fn mark_database_backup_unavailable() {
    DATABASE_BACKUP_AVAILABLE.store(false, Ordering::Release);
}

pub async fn resolve_backup_dir(db: &DatabaseConnection) -> Result<PathBuf, String> {
    let settings = db.get_settings().await?;

    if let Some(custom) = settings.db_backup_path_value() {
        match reina_path::resolve_user_path(custom) {
            Ok(custom_path) if custom_path.is_dir() => return Ok(custom_path),
            Ok(custom_path) => log::warn!(
                "自定义数据库备份目录不存在或不是文件夹，保留配置并回退默认目录: {}",
                custom_path.display()
            ),
            Err(error) => log::warn!(
                "自定义数据库备份目录解析失败，保留配置并回退默认目录: configured={}, error={error}",
                custom
            ),
        }
    }

    let backup_dir = reina_path::get_default_db_backup_path()?;
    fs::create_dir_all(&backup_dir).map_err(|e| format!("无法创建备份目录: {}", e))?;

    Ok(backup_dir)
}

pub fn cleanup_auto_backup_batches(
    backup_dir: &Path,
    max_count: usize,
) -> Result<Vec<String>, String> {
    let max_count = max_count.max(1);
    let entries = fs::read_dir(backup_dir).map_err(|e| format!("读取备份目录失败: {}", e))?;
    let mut batches: BTreeMap<String, Vec<PathBuf>> = BTreeMap::new();

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取备份文件失败: {}", e))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(file_name) = path.file_name().and_then(|name| name.to_str()) else {
            continue;
        };

        let batch_id = extract_auto_backup_batch_id(file_name);
        if let Some(batch_id) = batch_id {
            batches.entry(batch_id.to_string()).or_default().push(path);
        }
    }

    if batches.len() <= max_count {
        return Ok(Vec::new());
    }

    let remove_count = batches.len() - max_count;
    let mut deleted_files = Vec::new();
    for (_, paths) in batches.into_iter().take(remove_count) {
        for path in paths {
            fs::remove_file(&path)
                .map_err(|e| format!("删除旧自动备份失败 {}: {}", path.to_string_lossy(), e))?;
            if let Some(file_name) = path.file_name().and_then(|name| name.to_str()) {
                deleted_files.push(file_name.to_string());
            }
        }
    }

    Ok(deleted_files)
}

fn extract_auto_backup_batch_id(file_name: &str) -> Option<&str> {
    file_name
        .strip_prefix(DATABASE_AUTO_PREFIX)
        .and_then(|name| name.strip_suffix(DATABASE_AUTO_EXTENSION))
        .or_else(|| {
            file_name
                .strip_prefix(COVERS_AUTO_PREFIX)
                .and_then(|name| name.strip_suffix(COVERS_AUTO_EXTENSION))
        })
        .filter(|batch_id| !batch_id.is_empty())
}

#[cfg(test)]
mod tests {
    use super::cleanup_auto_backup_batches;
    use std::fs;

    #[test]
    fn cleans_database_and_cover_files_by_shared_batch() {
        let root = std::env::temp_dir().join(format!(
            "reina_auto_backup_cleanup_{}_{}",
            std::process::id(),
            chrono::Local::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
        ));
        fs::create_dir_all(&root).unwrap();

        for batch in ["20260101_000000_000", "20260102_000000_000"] {
            fs::write(root.join(format!("reina_manager_auto_{batch}.db")), b"db").unwrap();
            fs::write(
                root.join(format!("custom_covers_auto_{batch}.7z")),
                b"covers",
            )
            .unwrap();
        }
        fs::write(root.join("reina_manager_20250101_000000.db"), b"manual").unwrap();

        let deleted = cleanup_auto_backup_batches(&root, 1).unwrap();

        assert_eq!(deleted.len(), 2);
        assert!(
            !root
                .join("reina_manager_auto_20260101_000000_000.db")
                .exists()
        );
        assert!(
            !root
                .join("custom_covers_auto_20260101_000000_000.7z")
                .exists()
        );
        assert!(
            root.join("reina_manager_auto_20260102_000000_000.db")
                .exists()
        );
        assert!(
            root.join("custom_covers_auto_20260102_000000_000.7z")
                .exists()
        );
        assert!(root.join("reina_manager_20250101_000000.db").exists());

        fs::remove_dir_all(root).unwrap();
    }
}
