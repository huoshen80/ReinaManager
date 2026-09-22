use crate::database::repository::settings_repository::DbSettingsExt;
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};
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

/// 为同一秒内创建的备份分配不会覆盖现有文件的编号。
///
/// `artifacts` 列出共享该编号的所有产物；任意一个产物已存在都会跳过该编号。
pub fn next_backup_id(
    backup_dir: &Path,
    timestamp: &str,
    artifacts: &[(&str, &str)],
) -> Result<String, String> {
    for suffix in 0..1000 {
        let backup_id = if suffix == 0 {
            timestamp.to_string()
        } else {
            format!("{timestamp}_{suffix:03}")
        };
        let mut occupied = false;
        for (prefix, extension) in artifacts {
            let candidate = backup_dir.join(format!("{prefix}{backup_id}{extension}"));
            match fs::symlink_metadata(&candidate) {
                Ok(_) => {
                    occupied = true;
                    break;
                }
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(error) => {
                    return Err(format!(
                        "检查备份文件名是否冲突失败 {}: {error}",
                        candidate.display()
                    ));
                }
            }
        }
        if !occupied {
            return Ok(backup_id);
        }
    }
    Err("同一时间生成的备份文件过多，请稍后重试".to_string())
}

pub fn next_backup_filename(
    backup_dir: &Path,
    prefix: &str,
    timestamp: &str,
    extension: &str,
) -> Result<String, String> {
    let backup_id = next_backup_id(backup_dir, timestamp, &[(prefix, extension)])?;
    Ok(format!("{prefix}{backup_id}{extension}"))
}

/// 在目标文件同目录生成唯一临时路径，确保后续提交不依赖跨卷移动。
pub fn temporary_sibling_path(target: &Path, marker: &str) -> Result<PathBuf, String> {
    let parent = target
        .parent()
        .ok_or_else(|| format!("目标文件缺少父目录: {}", target.display()))?;
    let name = target
        .file_name()
        .ok_or_else(|| format!("目标文件缺少有效名称: {}", target.display()))?
        .to_string_lossy();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("获取临时文件时间失败: {error}"))?
        .as_nanos();
    for index in 0..1000_u32 {
        let candidate = parent.join(format!(
            ".{name}.{marker}-{}-{timestamp}-{index}",
            std::process::id()
        ));
        match fs::symlink_metadata(&candidate) {
            Ok(_) => continue,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(candidate),
            Err(error) => {
                return Err(format!(
                    "检查临时文件路径失败 {}: {error}",
                    candidate.display()
                ));
            }
        }
    }
    Err("无法生成唯一的临时文件路径".to_string())
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
    use super::{cleanup_auto_backup_batches, next_backup_filename, next_backup_id};
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

    #[test]
    fn allocates_one_id_for_every_artifact_in_a_batch() {
        let root = std::env::temp_dir().join(format!(
            "reina_backup_name_{}_{}",
            std::process::id(),
            chrono::Local::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
        ));
        fs::create_dir_all(&root).unwrap();
        fs::write(
            root.join("custom_covers_auto_20260922_193000.7z"),
            b"covers",
        )
        .unwrap();

        let batch_id = next_backup_id(
            &root,
            "20260922_193000",
            &[
                ("reina_manager_auto_", ".db"),
                ("custom_covers_auto_", ".7z"),
            ],
        )
        .unwrap();

        assert_eq!(batch_id, "20260922_193000_001");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn allocates_suffix_for_a_manual_backup_collision() {
        let root = std::env::temp_dir().join(format!(
            "reina_manual_backup_name_{}_{}",
            std::process::id(),
            chrono::Local::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
        ));
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("reina_manager_20260922_193000.db"), b"db").unwrap();

        let filename =
            next_backup_filename(&root, "reina_manager_", "20260922_193000", ".db").unwrap();

        assert_eq!(filename, "reina_manager_20260922_193000_001.db");
        fs::remove_dir_all(root).unwrap();
    }
}
