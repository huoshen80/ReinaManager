use crate::database::repository::games_repository::GamesRepository;
use crate::database::repository::settings_repository::{DbSettingsExt, SettingsRepository};
use crate::entity::prelude::Savedata;
use crate::entity::savedata::Model as SavedataModel;
use sea_orm::{DatabaseConnection, EntityTrait};
use serde::Serialize;
use std::ffi::OsString;
use std::fs::{self, File};
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{State, command};
use tokio::sync::{Mutex, MutexGuard};

static SAVEDATA_BACKUP_OPERATION_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SavedataBackupMigrationStatus {
    Completed,
    Failed,
    CompletedWithResidue,
}

#[derive(Debug, Serialize)]
pub struct SavedataBackupMigrationFailure {
    pub source_path: Option<String>,
    pub target_path: Option<String>,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct SavedataBackupRootMigrationResult {
    pub status: SavedataBackupMigrationStatus,
    pub old_path: Option<String>,
    pub new_path: Option<String>,
    pub message: String,
    pub failures: Vec<SavedataBackupMigrationFailure>,
    pub residue_path: Option<String>,
    pub requires_confirmation: bool,
    pub cleaned_record_count: u64,
}

pub(super) async fn acquire_savedata_backup_operation_lock() -> MutexGuard<'static, ()> {
    SAVEDATA_BACKUP_OPERATION_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .await
}

#[derive(Debug)]
enum PreparedMigration {
    NoSource,
    Ready {
        old_path: PathBuf,
        new_path: PathBuf,
    },
}

#[derive(Debug)]
struct PreparedMigrationError {
    failures: Vec<SavedataBackupMigrationFailure>,
    requires_confirmation: bool,
}

#[derive(Debug)]
enum SourceState {
    Missing,
    Directory,
}

#[command]
pub async fn change_savedata_backup_root(
    db: State<'_, DatabaseConnection>,
    new_path: String,
    force_missing_source: bool,
) -> Result<SavedataBackupRootMigrationResult, String> {
    let _operation_guard = acquire_savedata_backup_operation_lock().await;
    let settings = db.get_settings().await?;
    let savedata_records = Savedata::find()
        .all(db.inner())
        .await
        .map_err(|error| format!("读取存档备份记录失败: {error}"))?;
    let savedata_count = savedata_records.len() as u64;
    let configured_new_path = new_path.trim();
    let configured_new_path =
        (!configured_new_path.is_empty()).then(|| configured_new_path.to_string());

    if let Some(path) = configured_new_path.as_deref()
        && let Err(error) = crate::utils::fs::validate_configured_user_path(path)
    {
        return Ok(failed_migration_result(
            settings.save_root_path.clone(),
            Some(path.to_string()),
            vec![migration_failure(None, Some(Path::new(path)), error)],
        ));
    }

    let old_backup_path = match resolve_configured_backup_root(settings.save_root_path.as_deref()) {
        Ok(path) => Some(path),
        Err(_error) if savedata_count == 0 => None,
        Err(error) => {
            return Ok(failed_migration_result(
                settings.save_root_path.clone(),
                configured_new_path.clone(),
                vec![migration_failure(
                    settings.save_root_path.as_deref().map(Path::new),
                    None,
                    error,
                )],
            ));
        }
    };
    let new_backup_path = match resolve_configured_backup_root(configured_new_path.as_deref()) {
        Ok(path) => path,
        Err(error) => {
            return Ok(failed_migration_result(
                settings.save_root_path.clone(),
                configured_new_path.clone(),
                vec![migration_failure(
                    None,
                    configured_new_path.as_deref().map(Path::new),
                    error,
                )],
            ));
        }
    };

    let prepared = if let Some(old_backup_path) = old_backup_path {
        let source_path = old_backup_path.clone();
        let target_path = new_backup_path.clone();
        let source_for_task = source_path.clone();
        let target_for_task = target_path.clone();
        let force_for_task = force_missing_source;
        let records_for_task = savedata_records;
        let prepared = tokio::task::spawn_blocking(move || {
            let source_exists = matches!(
                fs::symlink_metadata(&source_for_task),
                Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink()
            );
            let stale_record_ids = if source_exists {
                collect_missing_savedata_records(&source_for_task, &records_for_task)?
            } else if force_for_task
                && matches!(
                    fs::symlink_metadata(&source_for_task),
                    Err(error) if error.kind() == std::io::ErrorKind::NotFound
                )
            {
                records_for_task.iter().map(|record| record.id).collect()
            } else {
                Vec::new()
            };
            let prepared = prepare_backup_migration(
                &source_for_task,
                &target_for_task,
                savedata_count,
                force_for_task,
            )?;
            Ok::<_, PreparedMigrationError>((stale_record_ids, prepared))
        })
        .await
        .map_err(|error| format!("准备存档备份目录迁移失败: {error}"))?;
        match prepared {
            Ok((stale_record_ids, prepared)) => (stale_record_ids, prepared),
            Err(error) => {
                return Ok(failed_migration_result_with_confirmation(
                    Some(source_path.to_string_lossy().into_owned()),
                    Some(target_path.to_string_lossy().into_owned()),
                    error.failures,
                    error.requires_confirmation,
                ));
            }
        }
    } else {
        (Vec::new(), PreparedMigration::NoSource)
    };

    let (stale_record_ids, prepared) = prepared;
    let clear_records = !stale_record_ids.is_empty();
    let cleaned_record_count = stale_record_ids.len() as u64;
    let update_result = if clear_records {
        SettingsRepository::update_save_root_path_and_delete_savedata_records(
            db.inner(),
            configured_new_path.clone(),
            &stale_record_ids,
        )
        .await
    } else {
        SettingsRepository::update_save_root_path(db.inner(), configured_new_path.clone()).await
    };
    if let Err(error) = update_result {
        let mut failures = vec![migration_failure(
            None,
            Some(&new_backup_path),
            format!("保存新的存档备份路径失败: {error}"),
        )];
        if let PreparedMigration::Ready { new_path, .. } = &prepared {
            let cleanup_path = new_path.clone();
            if let Err(cleanup_error) =
                tokio::task::spawn_blocking(move || fs::remove_dir_all(&cleanup_path))
                    .await
                    .map_err(|error| error.to_string())
                    .and_then(|result| result.map_err(|error| error.to_string()))
            {
                failures.push(migration_failure(
                    None,
                    Some(new_path),
                    format!("回滚新备份目录失败: {cleanup_error}"),
                ));
            }
        }
        return Ok(failed_migration_result(
            settings.save_root_path,
            configured_new_path,
            failures,
        ));
    }
    if cleaned_record_count > 0 {
        log::info!(
            "存档备份目录迁移清理失效记录 count={} old_path={} new_path={}",
            cleaned_record_count,
            settings.save_root_path.as_deref().unwrap_or("<default>"),
            configured_new_path.as_deref().unwrap_or("<default>")
        );
    }

    let PreparedMigration::Ready { old_path, .. } = prepared else {
        return Ok(completed_migration_result(
            settings.save_root_path,
            configured_new_path,
            if clear_records {
                "已清理失效备份记录并更新配置"
            } else {
                "没有需要迁移的历史存档备份，已更新配置"
            },
            cleaned_record_count,
        ));
    };

    let cleanup_path = old_path.clone();
    let cleanup_result =
        tokio::task::spawn_blocking(move || remove_old_backup_directory(&cleanup_path))
            .await
            .map_err(|error| error.to_string())
            .and_then(|result| result.map_err(|error| error.to_string()));
    match cleanup_result {
        Ok(()) => Ok(completed_migration_result(
            Some(old_path.to_string_lossy().into_owned()),
            configured_new_path,
            "存档备份目录迁移完成，配置已更新",
            cleaned_record_count,
        )),
        Err(error) => Ok(SavedataBackupRootMigrationResult {
            status: SavedataBackupMigrationStatus::CompletedWithResidue,
            old_path: Some(old_path.to_string_lossy().into_owned()),
            new_path: configured_new_path,
            message: format!("配置已更新，但旧备份目录清理不完整: {error}"),
            failures: vec![migration_failure(
                Some(&old_path),
                None,
                format!("删除旧备份目录失败: {error}"),
            )],
            residue_path: Some(old_path.to_string_lossy().into_owned()),
            requires_confirmation: false,
            cleaned_record_count,
        }),
    }
}

fn resolve_configured_backup_root(configured_path: Option<&str>) -> Result<PathBuf, String> {
    match configured_path {
        Some(path) => reina_path::resolve_user_path(path)
            .map(|path| path.join("backups"))
            .map_err(|error| format!("存档备份根目录解析失败: {error}")),
        None => reina_path::get_default_savedata_backup_path(),
    }
}

fn completed_migration_result(
    old_path: Option<String>,
    new_path: Option<String>,
    message: &str,
    cleaned_record_count: u64,
) -> SavedataBackupRootMigrationResult {
    SavedataBackupRootMigrationResult {
        status: SavedataBackupMigrationStatus::Completed,
        old_path,
        new_path,
        message: message.to_string(),
        failures: Vec::new(),
        residue_path: None,
        requires_confirmation: false,
        cleaned_record_count,
    }
}

fn failed_migration_result(
    old_path: Option<String>,
    new_path: Option<String>,
    failures: Vec<SavedataBackupMigrationFailure>,
) -> SavedataBackupRootMigrationResult {
    SavedataBackupRootMigrationResult {
        status: SavedataBackupMigrationStatus::Failed,
        old_path,
        new_path,
        message: "存档备份目录迁移失败，配置未切换".to_string(),
        failures,
        residue_path: None,
        requires_confirmation: false,
        cleaned_record_count: 0,
    }
}

fn failed_migration_result_with_confirmation(
    old_path: Option<String>,
    new_path: Option<String>,
    failures: Vec<SavedataBackupMigrationFailure>,
    requires_confirmation: bool,
) -> SavedataBackupRootMigrationResult {
    SavedataBackupRootMigrationResult {
        requires_confirmation,
        ..failed_migration_result(old_path, new_path, failures)
    }
}

fn migration_failure(
    source_path: Option<&Path>,
    target_path: Option<&Path>,
    message: impl Into<String>,
) -> SavedataBackupMigrationFailure {
    SavedataBackupMigrationFailure {
        source_path: source_path.map(|path| path.to_string_lossy().into_owned()),
        target_path: target_path.map(|path| path.to_string_lossy().into_owned()),
        message: message.into(),
    }
}

fn collect_missing_savedata_records(
    backup_root: &Path,
    records: &[SavedataModel],
) -> Result<Vec<i32>, PreparedMigrationError> {
    let mut missing_record_ids = Vec::new();
    let mut failures = Vec::new();
    for record in records {
        let backup_path = backup_root
            .join(format!("game_{}", record.game_id))
            .join(&record.file);
        match fs::symlink_metadata(&backup_path) {
            Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {}
            Ok(_) => failures.push(migration_failure(
                Some(&backup_path),
                None,
                "数据库记录对应的备份路径不是普通文件",
            )),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                missing_record_ids.push(record.id);
            }
            Err(error) => failures.push(migration_failure(
                Some(&backup_path),
                None,
                format!("检查数据库记录对应的备份文件失败: {error}"),
            )),
        }
    }
    if failures.is_empty() {
        Ok(missing_record_ids)
    } else {
        Err(prepared_migration_error(failures))
    }
}

fn prepare_backup_migration(
    source: &Path,
    target: &Path,
    savedata_count: u64,
    force_missing_source: bool,
) -> Result<PreparedMigration, PreparedMigrationError> {
    let source_state = match fs::symlink_metadata(source) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            return Err(prepared_migration_error(vec![migration_failure(
                Some(source),
                Some(target),
                "旧备份目录不能是符号链接",
            )]));
        }
        Ok(metadata) if metadata.is_dir() => SourceState::Directory,
        Ok(_) => {
            return Err(prepared_migration_error(vec![migration_failure(
                Some(source),
                Some(target),
                "旧备份路径不是目录",
            )]));
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => SourceState::Missing,
        Err(error) => {
            return Err(prepared_migration_error(vec![migration_failure(
                Some(source),
                None,
                format!("无法读取旧备份目录: {error}"),
            )]));
        }
    };
    if matches!(source_state, SourceState::Missing) {
        if savedata_count > 0 && !force_missing_source {
            return Err(PreparedMigrationError {
                failures: vec![migration_failure(
                    Some(source),
                    None,
                    format!("旧备份目录不存在，但数据库仍有 {savedata_count} 条备份记录"),
                )],
                requires_confirmation: true,
            });
        }
        if savedata_count > 0 {
            validate_missing_source_target(source, target).map_err(prepared_migration_error)?;
            return Ok(PreparedMigration::NoSource);
        }
        return Ok(PreparedMigration::NoSource);
    }

    let normalized_source = normalize_for_overlap(source);
    let normalized_target = normalize_for_overlap(target);
    let source_overlap = resolve_for_overlap(&normalized_source);
    let target_overlap = resolve_for_overlap(&normalized_target);
    let (source_overlap, target_overlap) = match (source_overlap, target_overlap) {
        (Ok(source_overlap), Ok(target_overlap)) => (source_overlap, target_overlap),
        (Err(error), _) | (_, Err(error)) => {
            return Err(prepared_migration_error(vec![migration_failure(
                Some(source),
                Some(target),
                format!("无法确认新旧备份目录是否重叠: {error}"),
            )]));
        }
    };
    if paths_overlap(&source_overlap, &target_overlap) {
        if same_path(&source_overlap, &target_overlap) {
            return Ok(PreparedMigration::NoSource);
        }
        return Err(prepared_migration_error(vec![migration_failure(
            Some(source),
            Some(target),
            "新旧备份目录存在父子或符号链接重叠关系，已拒绝迁移",
        )]));
    }

    match fs::symlink_metadata(target) {
        Ok(metadata) => {
            return Err(prepared_migration_error(vec![migration_failure(
                Some(source),
                Some(target),
                if metadata.file_type().is_symlink() {
                    "目标备份目录是符号链接，请先手动处理"
                } else {
                    "目标备份目录已存在，请先手动处理"
                },
            )]));
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(error) => {
            return Err(prepared_migration_error(vec![migration_failure(
                Some(source),
                Some(target),
                format!("无法检查目标备份目录: {error}"),
            )]));
        }
    }

    let Some(parent) = target.parent() else {
        return Err(prepared_migration_error(vec![migration_failure(
            Some(source),
            Some(target),
            "目标备份目录缺少父目录",
        )]));
    };
    if let Err(error) = fs::create_dir_all(parent) {
        return Err(prepared_migration_error(vec![migration_failure(
            Some(source),
            Some(parent),
            format!("无法创建目标父目录: {error}"),
        )]));
    }
    let temporary_target = match temporary_migration_path(target) {
        Ok(path) => path,
        Err(error) => {
            return Err(prepared_migration_error(vec![migration_failure(
                Some(source),
                Some(target),
                error,
            )]));
        }
    };
    let mut failures = Vec::new();
    copy_dir_recursive(source, &temporary_target, &mut failures);
    if failures.is_empty() {
        failures.extend(verify_copy(source, &temporary_target));
    }
    if !failures.is_empty() {
        if let Err(error) = fs::remove_dir_all(&temporary_target) {
            failures.push(migration_failure(
                None,
                Some(&temporary_target),
                format!("清理迁移临时目录失败: {error}"),
            ));
        }
        return Err(prepared_migration_error(failures));
    }
    if let Err(error) = fs::rename(&temporary_target, target) {
        let mut failures = vec![migration_failure(
            Some(source),
            Some(target),
            format!("临时目录切换到目标位置失败: {error}"),
        )];
        if let Err(cleanup_error) = fs::remove_dir_all(&temporary_target) {
            failures.push(migration_failure(
                None,
                Some(&temporary_target),
                format!("清理迁移临时目录失败: {cleanup_error}"),
            ));
        }
        return Err(prepared_migration_error(failures));
    }
    Ok(PreparedMigration::Ready {
        old_path: source.to_path_buf(),
        new_path: target.to_path_buf(),
    })
}

fn prepared_migration_error(
    failures: Vec<SavedataBackupMigrationFailure>,
) -> PreparedMigrationError {
    PreparedMigrationError {
        failures,
        requires_confirmation: false,
    }
}

fn remove_old_backup_directory(path: &Path) -> Result<(), std::io::Error> {
    fs::remove_dir_all(path)?;
    let Some(parent) = path.parent() else {
        return Ok(());
    };
    match fs::remove_dir(parent) {
        Ok(()) => Ok(()),
        Err(error)
            if matches!(
                error.kind(),
                std::io::ErrorKind::NotFound | std::io::ErrorKind::DirectoryNotEmpty
            ) =>
        {
            Ok(())
        }
        Err(error) => Err(error),
    }
}

fn validate_missing_source_target(
    source: &Path,
    target: &Path,
) -> Result<(), Vec<SavedataBackupMigrationFailure>> {
    let normalized_source = normalize_for_overlap(source);
    let normalized_target = normalize_for_overlap(target);
    let source_overlap = resolve_for_overlap(&normalized_source);
    let target_overlap = resolve_for_overlap(&normalized_target);
    let (source_overlap, target_overlap) = match (source_overlap, target_overlap) {
        (Ok(source_overlap), Ok(target_overlap)) => (source_overlap, target_overlap),
        (Err(error), _) | (_, Err(error)) => {
            return Err(vec![migration_failure(
                Some(source),
                Some(target),
                format!("无法确认新旧备份目录是否重叠: {error}"),
            )]);
        }
    };
    if paths_overlap(&source_overlap, &target_overlap)
        && !same_path(&source_overlap, &target_overlap)
    {
        return Err(vec![migration_failure(
            Some(source),
            Some(target),
            "新旧备份目录存在父子或符号链接重叠关系，已拒绝迁移",
        )]);
    }
    match fs::symlink_metadata(target) {
        Ok(metadata) => Err(vec![migration_failure(
            Some(source),
            Some(target),
            if metadata.file_type().is_symlink() {
                "目标备份目录是符号链接，请先手动处理"
            } else {
                "目标备份目录已存在，请先手动处理"
            },
        )]),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(vec![migration_failure(
            Some(source),
            Some(target),
            format!("无法检查目标备份目录: {error}"),
        )]),
    }
}

fn copy_dir_recursive(
    source: &Path,
    target: &Path,
    failures: &mut Vec<SavedataBackupMigrationFailure>,
) {
    if let Err(error) = fs::create_dir_all(target) {
        failures.push(migration_failure(
            Some(source),
            Some(target),
            format!("创建目标目录失败: {error}"),
        ));
        return;
    }
    let entries = match fs::read_dir(source) {
        Ok(entries) => entries,
        Err(error) => {
            failures.push(migration_failure(
                Some(source),
                Some(target),
                format!("读取源目录失败: {error}"),
            ));
            return;
        }
    };
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                failures.push(migration_failure(
                    Some(source),
                    Some(target),
                    format!("读取源目录项失败: {error}"),
                ));
                continue;
            }
        };
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) => {
                failures.push(migration_failure(
                    Some(&source_path),
                    Some(&target_path),
                    format!("读取文件类型失败: {error}"),
                ));
                continue;
            }
        };
        if file_type.is_symlink() {
            failures.push(migration_failure(
                Some(&source_path),
                Some(&target_path),
                "备份目录中不允许包含符号链接",
            ));
        } else if file_type.is_dir() {
            copy_dir_recursive(&source_path, &target_path, failures);
        } else if file_type.is_file() {
            if let Err(error) = fs::copy(&source_path, &target_path) {
                failures.push(migration_failure(
                    Some(&source_path),
                    Some(&target_path),
                    format!("复制文件失败: {error}"),
                ));
            }
        } else {
            failures.push(migration_failure(
                Some(&source_path),
                Some(&target_path),
                "不支持的文件类型",
            ));
        }
    }
}

fn verify_copy(source: &Path, target: &Path) -> Vec<SavedataBackupMigrationFailure> {
    let mut failures = Vec::new();
    verify_source_tree(source, target, &mut failures);
    verify_target_tree(target, source, &mut failures);
    failures
}

fn verify_source_tree(
    source: &Path,
    target: &Path,
    failures: &mut Vec<SavedataBackupMigrationFailure>,
) {
    let entries = match fs::read_dir(source) {
        Ok(entries) => entries,
        Err(error) => {
            failures.push(migration_failure(
                Some(source),
                Some(target),
                format!("验证源目录失败: {error}"),
            ));
            return;
        }
    };
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                failures.push(migration_failure(
                    Some(source),
                    Some(target),
                    format!("验证源目录项失败: {error}"),
                ));
                continue;
            }
        };
        let source_path = entry.path();
        let target_path = target.join(entry.file_name());
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) => {
                failures.push(migration_failure(
                    Some(&source_path),
                    Some(&target_path),
                    format!("验证文件类型失败: {error}"),
                ));
                continue;
            }
        };
        if file_type.is_symlink() {
            failures.push(migration_failure(
                Some(&source_path),
                Some(&target_path),
                "备份目录中不允许包含符号链接",
            ));
        } else if file_type.is_dir() {
            match fs::symlink_metadata(&target_path) {
                Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
                    verify_source_tree(&source_path, &target_path, failures);
                }
                Ok(_) => failures.push(migration_failure(
                    Some(&source_path),
                    Some(&target_path),
                    "复制结果中的目录类型不匹配",
                )),
                Err(error) => failures.push(migration_failure(
                    Some(&source_path),
                    Some(&target_path),
                    format!("复制结果缺少目录: {error}"),
                )),
            }
        } else if file_type.is_file() {
            match fs::symlink_metadata(&target_path) {
                Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() => {
                    match files_equal(&source_path, &target_path) {
                        Ok(true) => {}
                        Ok(false) => failures.push(migration_failure(
                            Some(&source_path),
                            Some(&target_path),
                            "复制结果文件内容不一致",
                        )),
                        Err(error) => failures.push(migration_failure(
                            Some(&source_path),
                            Some(&target_path),
                            format!("验证文件内容失败: {error}"),
                        )),
                    }
                }
                Ok(_) => failures.push(migration_failure(
                    Some(&source_path),
                    Some(&target_path),
                    "复制结果中的文件类型不匹配",
                )),
                Err(error) => failures.push(migration_failure(
                    Some(&source_path),
                    Some(&target_path),
                    format!("复制结果缺少文件: {error}"),
                )),
            }
        }
    }
}

fn verify_target_tree(
    target: &Path,
    source: &Path,
    failures: &mut Vec<SavedataBackupMigrationFailure>,
) {
    let entries = match fs::read_dir(target) {
        Ok(entries) => entries,
        Err(error) => {
            failures.push(migration_failure(
                Some(source),
                Some(target),
                format!("验证目标目录失败: {error}"),
            ));
            return;
        }
    };
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                failures.push(migration_failure(
                    Some(source),
                    Some(target),
                    format!("验证目标目录项失败: {error}"),
                ));
                continue;
            }
        };
        let target_path = entry.path();
        let source_path = source.join(entry.file_name());
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) => {
                failures.push(migration_failure(
                    Some(&source_path),
                    Some(&target_path),
                    format!("验证目标文件类型失败: {error}"),
                ));
                continue;
            }
        };
        if file_type.is_symlink() {
            failures.push(migration_failure(
                Some(&source_path),
                Some(&target_path),
                "目标目录中出现不允许的符号链接",
            ));
        } else if file_type.is_dir() {
            if let Err(error) = fs::symlink_metadata(&source_path) {
                if error.kind() == std::io::ErrorKind::NotFound {
                    failures.push(migration_failure(
                        Some(&source_path),
                        Some(&target_path),
                        "目标目录包含源目录不存在的目录",
                    ));
                }
            } else {
                verify_target_tree(&target_path, &source_path, failures);
            }
        } else if file_type.is_file()
            && let Err(error) = fs::symlink_metadata(&source_path)
            && error.kind() == std::io::ErrorKind::NotFound
        {
            failures.push(migration_failure(
                Some(&source_path),
                Some(&target_path),
                "目标目录包含源目录不存在的文件",
            ));
        }
    }
}

fn files_equal(source: &Path, target: &Path) -> Result<bool, std::io::Error> {
    let source_metadata = fs::metadata(source)?;
    let target_metadata = fs::metadata(target)?;
    if source_metadata.len() != target_metadata.len() {
        return Ok(false);
    }
    let mut source_file = File::open(source)?;
    let mut target_file = File::open(target)?;
    let mut source_buffer = [0_u8; 64 * 1024];
    let mut target_buffer = [0_u8; 64 * 1024];
    loop {
        let source_read = source_file.read(&mut source_buffer)?;
        let target_read = target_file.read(&mut target_buffer)?;
        if source_read != target_read {
            return Ok(false);
        }
        if source_read == 0 {
            return Ok(true);
        }
        if source_buffer[..source_read] != target_buffer[..target_read] {
            return Ok(false);
        }
    }
}

fn temporary_migration_path(target: &Path) -> Result<PathBuf, String> {
    let parent = target
        .parent()
        .ok_or_else(|| "目标备份目录缺少父目录".to_string())?;
    let name = target
        .file_name()
        .ok_or_else(|| "目标备份目录缺少有效名称".to_string())?
        .to_string_lossy();
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("获取迁移临时目录时间失败: {error}"))?
        .as_nanos();
    for index in 0..100_u32 {
        let candidate = parent.join(format!(
            ".{name}.reina-migrating-{}-{timestamp}-{index}",
            std::process::id()
        ));
        if fs::symlink_metadata(&candidate).is_err() {
            return Ok(candidate);
        }
    }
    Err("无法生成唯一的迁移临时目录".to_string())
}

fn normalize_for_overlap(path: &Path) -> PathBuf {
    let mut normalized = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                normalized.pop();
            }
            _ => normalized.push(component.as_os_str()),
        }
    }
    normalized
}

fn resolve_for_overlap(path: &Path) -> Result<PathBuf, String> {
    let mut current = path.to_path_buf();
    let mut suffix = Vec::<OsString>::new();
    loop {
        match fs::canonicalize(&current) {
            Ok(mut resolved) => {
                for component in suffix.iter().rev() {
                    resolved.push(component);
                }
                return Ok(resolved);
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                let Some(name) = current.file_name() else {
                    return Err(format!("无法解析路径: {}", path.display()));
                };
                suffix.push(name.to_os_string());
                if !current.pop() {
                    return Err(format!("无法解析路径: {}", path.display()));
                }
            }
            Err(error) => return Err(format!("{}: {error}", path.display())),
        }
    }
}

fn paths_overlap(left: &Path, right: &Path) -> bool {
    is_path_prefix(left, right) || is_path_prefix(right, left)
}

fn same_path(left: &Path, right: &Path) -> bool {
    let left_components = left.components().collect::<Vec<_>>();
    let right_components = right.components().collect::<Vec<_>>();
    left_components.len() == right_components.len()
        && left_components
            .iter()
            .zip(right_components.iter())
            .all(|(left, right)| components_equal(left, right))
}

fn is_path_prefix(prefix: &Path, path: &Path) -> bool {
    let prefix_components = prefix.components().collect::<Vec<_>>();
    let path_components = path.components().collect::<Vec<_>>();
    prefix_components.len() <= path_components.len()
        && prefix_components
            .iter()
            .zip(path_components.iter())
            .all(|(left, right)| components_equal(left, right))
}

fn components_equal(left: &Component<'_>, right: &Component<'_>) -> bool {
    #[cfg(windows)]
    {
        left.as_os_str()
            .to_string_lossy()
            .eq_ignore_ascii_case(&right.as_os_str().to_string_lossy())
    }
    #[cfg(not(windows))]
    {
        left == right
    }
}

async fn delete_backup_record(
    db: &DatabaseConnection,
    backup_file_path: &Path,
    backup_id: i32,
) -> Option<String> {
    match fs::remove_file(backup_file_path) {
        Ok(()) => {}
        Err(error) => {
            // 文件不存在或无法访问时保留数据库记录，避免丢失仍可能存在的备份线索。
            return Some(format!(
                "删除备份文件失败 {}，数据库记录未变更: {error}",
                backup_file_path.display()
            ));
        }
    }
    GamesRepository::delete_savedata_record(db, backup_id)
        .await
        .err()
        .map(|error| format!("删除数据库记录失败 (ID: {backup_id}): {error}"))
}

#[command]
pub async fn delete_savedata_backup(
    db: State<'_, DatabaseConnection>,
    backup_id: i32,
) -> Result<(), String> {
    let _operation_guard = acquire_savedata_backup_operation_lock().await;
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
    let settings = db.get_settings().await?;
    resolve_configured_backup_root(settings.save_root_path_value())
}

#[command]
pub async fn open_savedata_backup_folder(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
) -> Result<(), String> {
    let _operation_guard = acquire_savedata_backup_operation_lock().await;
    let path = resolve_savedata_backup_root(&db)
        .await?
        .join(format!("game_{game_id}"));
    let create_path = path.clone();
    tokio::task::spawn_blocking(move || fs::create_dir_all(&create_path))
        .await
        .map_err(|error| format!("创建存档备份目录任务失败: {error}"))?
        .map_err(|error| format!("创建存档备份目录失败: {error}"))?;
    crate::utils::fs::open_directory(path.to_string_lossy().into_owned()).await
}

pub(super) async fn cleanup_old_backups(
    db: &DatabaseConnection,
    backup_dir: &Path,
    game_id: i32,
    protected_backup_id: i32,
) -> Result<(), String> {
    let game = GamesRepository::find_by_id(db, game_id)
        .await
        .map_err(|error| format!("获取游戏信息失败: {error}"))?
        .ok_or_else(|| format!("游戏不存在: {game_id}"))?;
    let max_backups = game.maxbackups.unwrap_or(20).max(1) as usize;
    let mut records = GamesRepository::get_savedata_records(db, game_id)
        .await
        .map_err(|error| format!("获取备份记录失败: {error}"))?;
    if records.len() <= max_backups {
        return Ok(());
    }
    let delete_count = records.len() - max_backups;
    records.retain(|record| record.id != protected_backup_id);
    records.sort_by_key(|record| (record.backup_time, record.id));
    let mut errors = Vec::new();
    for record in &records[..delete_count] {
        let backup_file_path = backup_dir.join(&record.file);
        if let Some(error) = delete_backup_record(db, &backup_file_path, record.id).await {
            errors.push(error);
        }
    }
    if !errors.is_empty() {
        return Err(format!("清理旧备份时遇到错误:\n{}", errors.join("\n")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};

    fn test_directory() -> PathBuf {
        static NEXT_ID: AtomicU64 = AtomicU64::new(0);
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "reina-savedata-migration-{}-{id}",
            std::process::id()
        ))
    }

    #[test]
    fn prepares_and_verifies_directory_copy() {
        let root = test_directory();
        let source = root.join("old").join("backups");
        let target = root.join("new").join("backups");
        fs::create_dir_all(source.join("game_1")).unwrap();
        fs::write(source.join("game_1").join("backup.7z"), b"backup").unwrap();

        let prepared = prepare_backup_migration(&source, &target, 1, false).unwrap();

        assert!(matches!(prepared, PreparedMigration::Ready { .. }));
        assert_eq!(
            fs::read(target.join("game_1").join("backup.7z")).unwrap(),
            b"backup"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_parent_directory_overlap() {
        let root = test_directory();
        let source = root.join("backups");
        let target = source.join("nested").join("backups");
        fs::create_dir_all(&source).unwrap();

        let failures = prepare_backup_migration(&source, &target, 0, false)
            .unwrap_err()
            .failures;

        assert!(failures[0].message.contains("父子"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_missing_source_when_records_exist() {
        let root = test_directory();
        fs::create_dir_all(&root).unwrap();
        let source = root.join("missing");
        let target = root.join("new").join("backups");

        let error = prepare_backup_migration(&source, &target, 1, false).unwrap_err();

        assert!(error.failures[0].message.contains("数据库仍有"));
        assert!(error.requires_confirmation);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn force_allows_missing_source_with_records() {
        let root = test_directory();
        fs::create_dir_all(&root).unwrap();
        let source = root.join("missing");
        let target = root.join("new").join("backups");

        let prepared = prepare_backup_migration(&source, &target, 1, true).unwrap();

        assert!(matches!(prepared, PreparedMigration::NoSource));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn collects_only_missing_savedata_records() {
        let root = test_directory();
        fs::create_dir_all(root.join("game_1")).unwrap();
        fs::write(root.join("game_1").join("existing.7z"), b"backup").unwrap();
        let records = vec![
            SavedataModel {
                id: 1,
                game_id: 1,
                file: "existing.7z".to_string(),
                backup_time: 0,
                file_size: 6,
            },
            SavedataModel {
                id: 2,
                game_id: 1,
                file: "missing.7z".to_string(),
                backup_time: 0,
                file_size: 0,
            },
        ];

        let missing = collect_missing_savedata_records(&root, &records).unwrap();

        assert_eq!(missing, vec![2]);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn removes_empty_configured_backup_parent() {
        let root = test_directory();
        let configured_root = root.join("configured");
        let backup_root = configured_root.join("backups");
        fs::create_dir_all(&backup_root).unwrap();

        remove_old_backup_directory(&backup_root).unwrap();

        assert!(!configured_root.exists());
        fs::remove_dir_all(root).unwrap();
    }
}
