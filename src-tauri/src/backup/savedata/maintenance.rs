use crate::database::repository::games_repository::GamesRepository;
use sea_orm::DatabaseConnection;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{State, command};

#[derive(Debug, Serialize)]
pub struct MoveResult {
    pub success: bool,
    pub message: String,
}

#[command]
pub async fn move_backup_folder(old_path: String, new_path: String) -> Result<MoveResult, String> {
    let old_backup_path = Path::new(&old_path);
    let new_backup_path = Path::new(&new_path);
    if !old_backup_path.exists() {
        return Ok(MoveResult {
            success: true,
            message: "旧备份文件夹不存在，无需移动".to_string(),
        });
    }
    if let Some(parent) = new_backup_path.parent()
        && !parent.exists()
        && let Err(error) = fs::create_dir_all(parent)
    {
        return Ok(MoveResult {
            success: false,
            message: format!("无法创建目标目录: {error}"),
        });
    }
    if new_backup_path.exists() {
        return Ok(MoveResult {
            success: false,
            message: "目标位置已存在备份文件夹，请手动处理".to_string(),
        });
    }
    match fs::rename(old_backup_path, new_backup_path) {
        Ok(()) => Ok(MoveResult {
            success: true,
            message: "备份文件夹移动成功".to_string(),
        }),
        Err(_) => move_backup_folder_by_copy(old_backup_path, new_backup_path),
    }
}

fn move_backup_folder_by_copy(source: &Path, target: &Path) -> Result<MoveResult, String> {
    match copy_dir_recursive(source, target) {
        Ok(()) => match fs::remove_dir_all(source) {
            Ok(()) => Ok(MoveResult {
                success: true,
                message: "备份文件夹移动成功（通过复制）".to_string(),
            }),
            Err(error) => Ok(MoveResult {
                success: false,
                message: format!("文件夹已复制到新位置，但删除旧文件夹失败: {error}"),
            }),
        },
        Err(error) => Ok(MoveResult {
            success: false,
            message: format!("移动文件夹失败: {error}"),
        }),
    }
}

fn copy_dir_recursive(source: &Path, target: &Path) -> Result<(), Box<dyn std::error::Error>> {
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir_recursive(&source_path, &target_path)?;
        } else {
            fs::copy(source_path, target_path)?;
        }
    }
    Ok(())
}

async fn delete_backup_record(
    db: &DatabaseConnection,
    backup_file_path: &Path,
    backup_id: i32,
) -> Option<String> {
    let mut errors = Vec::new();
    if let Err(error) = fs::remove_file(backup_file_path) {
        errors.push(format!(
            "删除备份文件失败 {}: {error}",
            backup_file_path.display()
        ));
    }
    if let Err(error) = GamesRepository::delete_savedata_record(db, backup_id).await {
        errors.push(format!("删除数据库记录失败 (ID: {backup_id}): {error}"));
    }
    (!errors.is_empty()).then(|| errors.join("; "))
}

#[command]
pub async fn delete_savedata_backup(
    db: State<'_, DatabaseConnection>,
    backup_id: i32,
) -> Result<(), String> {
    let record = GamesRepository::get_savedata_record_by_id(&db, backup_id)
        .await
        .map_err(|error| format!("获取备份记录失败: {error}"))?
        .ok_or_else(|| "备份记录不存在".to_string())?;
    let backup_root = resolve_savedata_backup_root(&db).await?;
    let backup_path = backup_root
        .join(format!("game_{}", record.game_id))
        .join(&record.file);
    if let Some(error) = delete_backup_record(&db, &backup_path, backup_id).await {
        return Err(error);
    }
    log::info!(
        "存档备份删除成功 backup_id={} game_id={}",
        backup_id,
        record.game_id
    );
    Ok(())
}

pub(super) async fn resolve_savedata_backup_root(
    db: &DatabaseConnection,
) -> Result<PathBuf, String> {
    use crate::database::repository::settings_repository::DbSettingsExt;
    let settings = db.get_settings().await?;
    Ok(if let Some(custom) = settings.save_root_path_value() {
        PathBuf::from(custom).join("backups")
    } else {
        reina_path::get_base_data_dir()?.join("backups")
    })
}

pub(super) async fn cleanup_old_backups(
    db: &DatabaseConnection,
    backup_dir: &Path,
    game_id: i64,
) -> Result<(), String> {
    let max_backups = GamesRepository::find_by_id(db, game_id as i32)
        .await
        .map_err(|error| format!("获取游戏信息失败: {error}"))?
        .and_then(|game| game.maxbackups)
        .expect("maxbackups should not be null") as usize;
    let mut records = GamesRepository::get_savedata_records(db, game_id as i32)
        .await
        .map_err(|error| format!("获取备份记录失败: {error}"))?;
    if records.len() < max_backups {
        return Ok(());
    }
    records.sort_by_key(|record| record.backup_time);
    let delete_count = records.len() - (max_backups - 1);
    let mut errors = Vec::new();
    for record in &records[..delete_count] {
        let backup_file_path = backup_dir.join(&record.file);
        if let Some(error) = delete_backup_record(db, &backup_file_path, record.id).await {
            errors.push(error);
        }
    }
    if !errors.is_empty() {
        log::warn!("清理旧备份时遇到错误:\n{}", errors.join("\n"));
    }
    Ok(())
}
