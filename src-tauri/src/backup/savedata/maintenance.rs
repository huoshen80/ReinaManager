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
    SavedWithWarning,
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
    pub cleaned_record_count: u64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum SavedataBackupDeleteStatus {
    Deleted,
    MissingFile,
    FileInaccessible,
}

#[derive(Debug, Serialize)]
pub struct SavedataBackupDeleteResult {
    pub status: SavedataBackupDeleteStatus,
    pub message: Option<String>,
}

#[derive(Debug)]
enum BackupFileDeleteFailure {
    MissingFile,
    FileInaccessible(String),
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
        target_commit: PreparedTargetCommit,
    },
}

#[derive(Clone, Debug)]
enum PreparedTargetCommit {
    Replaced { target_existed: bool },
    FlattenedNestedRoot { copied_entries: Vec<OsString> },
    ExistingVerifiedCopy,
}

#[derive(Debug)]
struct PreparedMigrationError {
    failures: Vec<SavedataBackupMigrationFailure>,
}

#[derive(Debug)]
enum SourceState {
    Missing,
    Directory,
}

enum RequestedBackupRoot {
    Resolved(PathBuf),
    UndefinedVariable(String),
}

#[command]
pub async fn change_savedata_backup_root(
    db: State<'_, DatabaseConnection>,
    new_path: String,
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

    let new_backup_path = match resolve_requested_backup_root(configured_new_path.as_deref()) {
        Ok(RequestedBackupRoot::Resolved(path)) => path,
        Ok(RequestedBackupRoot::UndefinedVariable(variable)) if savedata_count == 0 => {
            return save_without_migration(
                db.inner(),
                settings.save_root_path.clone(),
                configured_new_path,
                format!("存档备份根目录解析失败: 环境变量未定义: {variable}"),
            )
            .await;
        }
        Ok(RequestedBackupRoot::UndefinedVariable(variable)) => {
            return Err(format!(
                "存档备份目录迁移失败，配置未切换: 存档备份根目录解析失败: 环境变量未定义: {variable}"
            ));
        }
        Err(error) => {
            return Err(format!("存档备份目录迁移失败，配置未切换: {error}"));
        }
    };

    let old_backup_path = if savedata_count == 0 {
        None
    } else {
        match resolve_configured_backup_root(settings.save_root_path.as_deref()) {
            Ok(path) => Some(path),
            Err(error) => {
                return Err(format!("存档备份目录迁移失败，配置未切换: {error}"));
            }
        }
    };

    let prepared = if let Some(old_backup_path) = old_backup_path {
        let source_path = old_backup_path.clone();
        let target_path = new_backup_path.clone();
        let records_for_task = savedata_records;
        let prepared = tokio::task::spawn_blocking(move || {
            ensure_existing_directory(&source_path)?;
            let missing_record_ids =
                collect_missing_savedata_records(&source_path, &records_for_task)?;
            let prepared = prepare_backup_migration(&source_path, &target_path, savedata_count)?;
            Ok::<_, PreparedMigrationError>((missing_record_ids, prepared))
        })
        .await
        .map_err(|error| format!("准备存档备份目录迁移失败: {error}"))?;
        match prepared {
            Ok((missing_record_ids, prepared)) => (missing_record_ids, prepared),
            Err(error) => return Err(format_migration_failures(error.failures)),
        }
    } else {
        (Vec::new(), PreparedMigration::NoSource)
    };

    let (missing_record_ids, prepared) = prepared;
    let clear_records = !missing_record_ids.is_empty();
    let cleaned_record_count = missing_record_ids.len() as u64;
    let update_result = if clear_records {
        SettingsRepository::update_save_root_path_and_delete_savedata_records(
            db.inner(),
            configured_new_path.clone(),
            &missing_record_ids,
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
        if let PreparedMigration::Ready {
            old_path,
            new_path,
            target_commit,
        } = &prepared
        {
            let rollback_source = old_path.clone();
            let rollback_target = new_path.clone();
            let rollback_target_commit = target_commit.clone();
            match tokio::task::spawn_blocking(move || {
                rollback_prepared_migration(
                    &rollback_source,
                    &rollback_target,
                    &rollback_target_commit,
                )
            })
            .await
            {
                Ok(rollback_failures) => failures.extend(rollback_failures),
                Err(rollback_error) => failures.push(migration_failure(
                    Some(old_path),
                    Some(new_path),
                    format!("回滚新备份目录任务失败: {rollback_error}"),
                )),
            }
        }
        return Err(format_migration_failures(failures));
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

    let cleanup_path = old_path;
    let reported_old_path = cleanup_path.clone();
    let cleanup_result =
        tokio::task::spawn_blocking(move || remove_old_backup_directory(&cleanup_path))
            .await
            .map_err(|error| error.to_string())
            .and_then(|result| result.map_err(|error| error.to_string()));
    match cleanup_result {
        Ok(()) => Ok(completed_migration_result(
            Some(reported_old_path.to_string_lossy().into_owned()),
            configured_new_path,
            "存档备份目录迁移完成，配置已更新",
            cleaned_record_count,
        )),
        Err(error) => Ok(SavedataBackupRootMigrationResult {
            status: SavedataBackupMigrationStatus::SavedWithWarning,
            old_path: Some(reported_old_path.to_string_lossy().into_owned()),
            new_path: configured_new_path,
            message: format!("配置已更新，但旧备份目录清理不完整: {error}"),
            failures: vec![migration_failure(
                Some(&reported_old_path),
                None,
                format!("删除旧备份目录失败: {error}"),
            )],
            residue_path: Some(reported_old_path.to_string_lossy().into_owned()),
            cleaned_record_count,
        }),
    }
}

fn ensure_existing_directory(path: &Path) -> Result<(), PreparedMigrationError> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => Ok(()),
        Ok(metadata) if metadata.file_type().is_symlink() => {
            Err(prepared_migration_error(vec![migration_failure(
                Some(path),
                None,
                "路径是符号链接，无法确认目录是否可访问",
            )]))
        }
        Ok(_) => Err(prepared_migration_error(vec![migration_failure(
            Some(path),
            None,
            "路径存在但不是目录",
        )])),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            Err(prepared_migration_error(vec![migration_failure(
                Some(path),
                None,
                "目录不存在，已跳过旧备份迁移",
            )]))
        }
        Err(error) => Err(prepared_migration_error(vec![migration_failure(
            Some(path),
            None,
            format!("无法访问目录，已跳过旧备份迁移: {error}"),
        )])),
    }
}

async fn save_without_migration(
    db: &DatabaseConnection,
    old_configured_path: Option<String>,
    new_path: Option<String>,
    reason: String,
) -> Result<SavedataBackupRootMigrationResult, String> {
    let old_path = configured_backup_path_for_message(old_configured_path.as_deref());
    SettingsRepository::update_save_root_path(db, new_path.clone())
        .await
        .map_err(|error| format!("保存新的存档备份路径失败: {error}"))?;
    log::warn!(
        "存档备份目录已更新但未迁移旧备份 old_path={} new_path={} reason={}",
        old_path.as_deref().unwrap_or("<default>"),
        new_path.as_deref().unwrap_or("<default>"),
        reason
    );
    Ok(SavedataBackupRootMigrationResult {
        status: SavedataBackupMigrationStatus::SavedWithWarning,
        old_path,
        new_path,
        message: reason,
        failures: Vec::new(),
        residue_path: None,
        cleaned_record_count: 0,
    })
}

fn configured_backup_path_for_message(configured_path: Option<&str>) -> Option<String> {
    resolve_configured_backup_root(configured_path)
        .ok()
        .map(|path| path.to_string_lossy().into_owned())
        .or_else(|| configured_path.map(ToOwned::to_owned))
}

fn resolve_configured_backup_root(configured_path: Option<&str>) -> Result<PathBuf, String> {
    match configured_path {
        Some(path) => reina_path::resolve_user_path(path)
            .map_err(|error| format!("存档备份根目录解析失败: {error}")),
        None => reina_path::get_default_savedata_backup_path(),
    }
}

fn resolve_requested_backup_root(
    configured_path: Option<&str>,
) -> Result<RequestedBackupRoot, String> {
    match configured_path {
        Some(path) => match reina_path::resolve_user_path(path) {
            Ok(path) => Ok(RequestedBackupRoot::Resolved(path)),
            Err(reina_path::PathResolveError::UndefinedVariable(variable)) => {
                Ok(RequestedBackupRoot::UndefinedVariable(variable))
            }
            Err(error) => Err(format!("存档备份根目录解析失败: {error}")),
        },
        None => reina_path::get_default_savedata_backup_path().map(RequestedBackupRoot::Resolved),
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
        cleaned_record_count,
    }
}

fn format_migration_failures(failures: Vec<SavedataBackupMigrationFailure>) -> String {
    let details = failures
        .into_iter()
        .map(|failure| {
            [
                failure.source_path,
                failure.target_path,
                Some(failure.message),
            ]
            .into_iter()
            .flatten()
            .collect::<Vec<_>>()
            .join(" → ")
        })
        .collect::<Vec<_>>()
        .join("；");
    if details.is_empty() {
        "存档备份目录迁移失败，配置未切换".to_string()
    } else {
        format!("存档备份目录迁移失败，配置未切换: {details}")
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
        return Err(prepared_migration_error(vec![migration_failure(
            Some(source),
            None,
            if savedata_count > 0 {
                format!("旧备份目录不存在，但数据库仍有 {savedata_count} 条备份记录")
            } else {
                "旧备份目录不存在".to_string()
            },
        )]));
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
    let mut existing_verified_copy = false;
    let nested_wrapper = if paths_overlap(&source_overlap, &target_overlap) {
        if same_path(&source_overlap, &target_overlap) {
            return Ok(PreparedMigration::NoSource);
        }
        if source_overlap
            .parent()
            .is_some_and(|parent| same_path(parent, &target_overlap))
            && normalized_source
                .parent()
                .is_some_and(|parent| same_path(parent, &normalized_target))
        {
            if let Err(error) =
                ensure_direct_nested_source_is_only_entry(&normalized_target, &normalized_source)
            {
                let failures = verify_nested_flatten_copy(
                    &normalized_source,
                    &normalized_target,
                    &normalized_source,
                );
                if failures.is_empty() {
                    existing_verified_copy = true;
                } else {
                    return Err(error);
                }
            }
            Some(normalized_source.clone())
        } else {
            return Err(prepared_migration_error(vec![migration_failure(
                Some(source),
                Some(target),
                "新旧备份目录存在不受支持的父子或符号链接重叠关系，已拒绝迁移",
            )]));
        }
    } else {
        None
    };

    let target_existed = if nested_wrapper.is_some() {
        false
    } else {
        match fs::symlink_metadata(target) {
            Ok(metadata) if metadata.file_type().is_symlink() => {
                return Err(prepared_migration_error(vec![migration_failure(
                    Some(source),
                    Some(target),
                    "目标备份目录不能是符号链接",
                )]));
            }
            Ok(metadata) if metadata.is_dir() => match fs::read_dir(target) {
                Ok(mut entries) => match entries.next() {
                    None => true,
                    Some(Ok(_)) => {
                        let failures = verify_copy(source, target);
                        if failures.is_empty() {
                            existing_verified_copy = true;
                            false
                        } else {
                            return Err(prepared_migration_error(vec![migration_failure(
                                Some(source),
                                Some(target),
                                "目标备份目录不是空目录，请选择空目录",
                            )]));
                        }
                    }
                    Some(Err(error)) => {
                        return Err(prepared_migration_error(vec![migration_failure(
                            Some(source),
                            Some(target),
                            format!("读取目标备份目录失败: {error}"),
                        )]));
                    }
                },
                Err(error) => {
                    return Err(prepared_migration_error(vec![migration_failure(
                        Some(source),
                        Some(target),
                        format!("无法检查目标备份目录是否为空: {error}"),
                    )]));
                }
            },
            Ok(_) => {
                return Err(prepared_migration_error(vec![migration_failure(
                    Some(source),
                    Some(target),
                    "目标备份路径存在但不是目录",
                )]));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
            Err(error) => {
                return Err(prepared_migration_error(vec![migration_failure(
                    Some(source),
                    Some(target),
                    format!("无法检查目标备份目录: {error}"),
                )]));
            }
        }
    };

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

    if existing_verified_copy {
        return Ok(PreparedMigration::Ready {
            old_path: source.to_path_buf(),
            new_path: target.to_path_buf(),
            target_commit: PreparedTargetCommit::ExistingVerifiedCopy,
        });
    }

    if let Some(wrapper_path) = nested_wrapper {
        let copied_entries = copy_nested_source_into_target(source, target, &wrapper_path)?;
        return Ok(PreparedMigration::Ready {
            old_path: source.to_path_buf(),
            new_path: target.to_path_buf(),
            target_commit: PreparedTargetCommit::FlattenedNestedRoot { copied_entries },
        });
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
    if target_existed && let Err(error) = fs::remove_dir(target) {
        let mut failures = vec![migration_failure(
            Some(source),
            Some(target),
            format!("提交迁移前删除空目标目录失败: {error}"),
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
    if let Err(error) = fs::rename(&temporary_target, target) {
        let mut failures = vec![migration_failure(
            Some(source),
            Some(target),
            format!("临时目录切换到目标位置失败: {error}"),
        )];
        if target_existed && let Err(restore_error) = fs::create_dir(target) {
            failures.push(migration_failure(
                None,
                Some(target),
                format!("恢复原空目标目录失败: {restore_error}"),
            ));
        }
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
        target_commit: PreparedTargetCommit::Replaced { target_existed },
    })
}

fn ensure_direct_nested_source_is_only_entry(
    target: &Path,
    source: &Path,
) -> Result<(), PreparedMigrationError> {
    let metadata = fs::symlink_metadata(target).map_err(|error| {
        prepared_migration_error(vec![migration_failure(
            Some(source),
            Some(target),
            format!("无法检查嵌套备份目标目录: {error}"),
        )])
    })?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(prepared_migration_error(vec![migration_failure(
            Some(source),
            Some(target),
            "嵌套备份目标必须是真实目录",
        )]));
    }

    let mut entries = fs::read_dir(target).map_err(|error| {
        prepared_migration_error(vec![migration_failure(
            Some(source),
            Some(target),
            format!("无法读取嵌套备份目标目录: {error}"),
        )])
    })?;
    let only_entry = match entries.next() {
        Some(Ok(entry)) => entry,
        Some(Err(error)) => {
            return Err(prepared_migration_error(vec![migration_failure(
                Some(source),
                Some(target),
                format!("读取嵌套备份目录项失败: {error}"),
            )]));
        }
        None => {
            return Err(prepared_migration_error(vec![migration_failure(
                Some(source),
                Some(target),
                "嵌套备份目标目录没有包含旧备份根",
            )]));
        }
    };
    if let Some(extra_entry) = entries.next() {
        let detail = match extra_entry {
            Ok(entry) => format!("发现额外目录项: {}", entry.path().display()),
            Err(error) => format!("读取额外目录项失败: {error}"),
        };
        return Err(prepared_migration_error(vec![migration_failure(
            Some(source),
            Some(target),
            format!("只有目标仅包含旧备份根目录时才能扁平迁移；{detail}"),
        )]));
    }

    let entry_type = only_entry.file_type().map_err(|error| {
        prepared_migration_error(vec![migration_failure(
            Some(source),
            Some(target),
            format!("读取嵌套备份目录类型失败: {error}"),
        )])
    })?;
    if entry_type.is_symlink() || !entry_type.is_dir() {
        return Err(prepared_migration_error(vec![migration_failure(
            Some(source),
            Some(target),
            "目标中的唯一目录项不是可迁移的真实目录",
        )]));
    }

    let actual_source = fs::canonicalize(only_entry.path()).map_err(|error| {
        prepared_migration_error(vec![migration_failure(
            Some(source),
            Some(target),
            format!("解析目标中的旧备份根失败: {error}"),
        )])
    })?;
    let expected_source = fs::canonicalize(source).map_err(|error| {
        prepared_migration_error(vec![migration_failure(
            Some(source),
            Some(target),
            format!("解析旧备份根失败: {error}"),
        )])
    })?;
    if !same_path(&actual_source, &expected_source) {
        return Err(prepared_migration_error(vec![migration_failure(
            Some(source),
            Some(target),
            "目标中的唯一目录项不是当前旧备份根",
        )]));
    }

    Ok(())
}

fn copy_nested_source_into_target(
    source: &Path,
    target: &Path,
    wrapper_path: &Path,
) -> Result<Vec<OsString>, PreparedMigrationError> {
    let entries = fs::read_dir(source).map_err(|error| {
        prepared_migration_error(vec![migration_failure(
            Some(source),
            Some(target),
            format!("读取嵌套备份根目录失败: {error}"),
        )])
    })?;
    let mut copied_entries = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|error| {
            prepared_migration_error(vec![migration_failure(
                Some(source),
                Some(target),
                format!("读取嵌套备份目录项失败: {error}"),
            )])
        })?;
        let entry_name = entry.file_name();
        let target_path = target.join(&entry_name);
        match fs::symlink_metadata(&target_path) {
            Ok(_) => {
                return Err(prepared_migration_error(vec![migration_failure(
                    Some(&entry.path()),
                    Some(&target_path),
                    "扁平迁移目标出现同名目录项",
                )]));
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(prepared_migration_error(vec![migration_failure(
                    Some(&entry.path()),
                    Some(&target_path),
                    format!("检查扁平迁移目标失败: {error}"),
                )]));
            }
        }
        copied_entries.push(entry_name);
    }

    let mut failures = Vec::new();
    copy_dir_recursive(source, target, &mut failures);
    if failures.is_empty() {
        failures.extend(verify_nested_flatten_copy(source, target, wrapper_path));
    }
    if !failures.is_empty() {
        cleanup_copied_entries(target, &copied_entries, &mut failures);
        return Err(prepared_migration_error(failures));
    }

    Ok(copied_entries)
}

fn verify_nested_flatten_copy(
    source: &Path,
    target: &Path,
    wrapper_path: &Path,
) -> Vec<SavedataBackupMigrationFailure> {
    let mut failures = Vec::new();
    verify_source_tree(source, target, &mut failures);
    let entries = match fs::read_dir(target) {
        Ok(entries) => entries,
        Err(error) => {
            failures.push(migration_failure(
                Some(source),
                Some(target),
                format!("验证扁平迁移目标目录失败: {error}"),
            ));
            return failures;
        }
    };
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                failures.push(migration_failure(
                    Some(source),
                    Some(target),
                    format!("验证扁平迁移目标目录项失败: {error}"),
                ));
                continue;
            }
        };
        let target_path = entry.path();
        if same_path(&normalize_for_overlap(&target_path), wrapper_path) {
            continue;
        }
        let source_path = source.join(entry.file_name());
        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) => {
                failures.push(migration_failure(
                    Some(&source_path),
                    Some(&target_path),
                    format!("验证扁平迁移目标类型失败: {error}"),
                ));
                continue;
            }
        };
        match fs::symlink_metadata(&source_path) {
            Ok(metadata)
                if file_type.is_dir()
                    && metadata.is_dir()
                    && !file_type.is_symlink()
                    && !metadata.file_type().is_symlink() =>
            {
                verify_target_tree(&target_path, &source_path, &mut failures);
            }
            Ok(metadata)
                if file_type.is_file()
                    && metadata.is_file()
                    && !file_type.is_symlink()
                    && !metadata.file_type().is_symlink() => {}
            Ok(_) => failures.push(migration_failure(
                Some(&source_path),
                Some(&target_path),
                "扁平迁移目标中的目录项类型与源不一致",
            )),
            Err(error) => failures.push(migration_failure(
                Some(&source_path),
                Some(&target_path),
                format!("扁平迁移目标包含源中不存在的目录项: {error}"),
            )),
        }
    }
    failures
}

fn cleanup_copied_entries(
    target: &Path,
    copied_entries: &[OsString],
    failures: &mut Vec<SavedataBackupMigrationFailure>,
) {
    for entry_name in copied_entries {
        let path = target.join(entry_name);
        let result = match fs::symlink_metadata(&path) {
            Ok(metadata) if metadata.is_dir() && !metadata.file_type().is_symlink() => {
                fs::remove_dir_all(&path)
            }
            Ok(_) => fs::remove_file(&path),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(error) => Err(error),
        };
        if let Err(error) = result {
            failures.push(migration_failure(
                None,
                Some(&path),
                format!("清理扁平迁移副本失败: {error}"),
            ));
        }
    }
}

fn prepared_migration_error(
    failures: Vec<SavedataBackupMigrationFailure>,
) -> PreparedMigrationError {
    PreparedMigrationError { failures }
}

fn remove_old_backup_directory(path: &Path) -> Result<(), std::io::Error> {
    fs::remove_dir_all(path)
}

fn rollback_prepared_migration(
    source: &Path,
    target: &Path,
    target_commit: &PreparedTargetCommit,
) -> Vec<SavedataBackupMigrationFailure> {
    match target_commit {
        PreparedTargetCommit::Replaced { target_existed } => {
            rollback_replaced_target(source, target, *target_existed)
        }
        PreparedTargetCommit::FlattenedNestedRoot { copied_entries, .. } => {
            rollback_flattened_nested_root(target, copied_entries)
        }
        PreparedTargetCommit::ExistingVerifiedCopy => Vec::new(),
    }
}

fn rollback_replaced_target(
    source: &Path,
    target: &Path,
    target_existed: bool,
) -> Vec<SavedataBackupMigrationFailure> {
    let mut failures = Vec::new();
    let rollback_path = match temporary_migration_path(target) {
        Ok(path) => path,
        Err(error) => {
            failures.push(migration_failure(
                Some(source),
                Some(target),
                format!("无法准备回滚目录，新备份副本保留在目标位置: {error}"),
            ));
            return failures;
        }
    };

    if let Err(error) = fs::rename(target, &rollback_path) {
        failures.push(migration_failure(
            Some(source),
            Some(target),
            format!("无法移出已提交的新备份目录，副本保留在目标位置: {error}"),
        ));
        return failures;
    }

    if target_existed && let Err(error) = fs::create_dir(target) {
        failures.push(migration_failure(
            None,
            Some(target),
            format!("无法恢复迁移前的空目标目录: {error}"),
        ));
    }

    let verification_failures = verify_copy(source, &rollback_path);
    if verification_failures.is_empty() {
        if let Err(error) = fs::remove_dir_all(&rollback_path) {
            failures.push(migration_failure(
                None,
                Some(&rollback_path),
                format!("删除已验证的回滚副本失败: {error}"),
            ));
        }
    } else {
        failures.push(migration_failure(
            Some(source),
            Some(&rollback_path),
            "回滚副本与旧备份目录不一致，已保留回滚副本以避免数据丢失",
        ));
        failures.extend(verification_failures);
    }

    failures
}

fn rollback_flattened_nested_root(
    target: &Path,
    copied_entries: &[OsString],
) -> Vec<SavedataBackupMigrationFailure> {
    let mut failures = Vec::new();
    cleanup_copied_entries(target, copied_entries, &mut failures);
    failures
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
    if let Err(error) = remove_backup_file(backup_file_path).await {
        return Some(format_backup_file_delete_failure(backup_file_path, &error));
    }
    GamesRepository::delete_savedata_record(db, backup_id)
        .await
        .err()
        .map(|error| format!("删除数据库记录失败 (ID: {backup_id}): {error}"))
}

async fn remove_backup_file(path: &Path) -> Result<(), BackupFileDeleteFailure> {
    let path = path.to_path_buf();
    tokio::task::spawn_blocking(move || match fs::remove_file(&path) {
        Ok(()) => Ok(()),
        Err(error) => Err(classify_backup_file_delete_error(&path, error)),
    })
    .await
    .map_err(|error| BackupFileDeleteFailure::FileInaccessible(error.to_string()))?
}

fn classify_backup_file_delete_error(
    path: &Path,
    error: std::io::Error,
) -> BackupFileDeleteFailure {
    if error.kind() != std::io::ErrorKind::NotFound {
        return BackupFileDeleteFailure::FileInaccessible(error.to_string());
    }

    let Some(parent) = path.parent() else {
        return BackupFileDeleteFailure::MissingFile;
    };
    match fs::metadata(parent) {
        Ok(metadata) if metadata.is_dir() => BackupFileDeleteFailure::MissingFile,
        Ok(_) => BackupFileDeleteFailure::FileInaccessible("备份文件所在路径不是目录".to_string()),
        Err(parent_error) => BackupFileDeleteFailure::FileInaccessible(format!(
            "无法访问备份文件所在目录: {parent_error}"
        )),
    }
}

fn format_backup_file_delete_failure(path: &Path, failure: &BackupFileDeleteFailure) -> String {
    match failure {
        BackupFileDeleteFailure::MissingFile => {
            format!("备份文件不存在: {}，数据库记录未变更", path.display())
        }
        BackupFileDeleteFailure::FileInaccessible(error) => format!(
            "无法删除备份文件: {}，文件可能仍然存在，数据库记录未变更: {error}",
            path.display()
        ),
    }
}

fn backup_file_delete_result(
    path: &Path,
    failure: BackupFileDeleteFailure,
) -> SavedataBackupDeleteResult {
    let (status, message) = match failure {
        BackupFileDeleteFailure::MissingFile => (
            SavedataBackupDeleteStatus::MissingFile,
            Some(format!("备份文件不存在: {}", path.display())),
        ),
        BackupFileDeleteFailure::FileInaccessible(error) => (
            SavedataBackupDeleteStatus::FileInaccessible,
            Some(format!(
                "无法删除备份文件: {}，文件可能仍然存在: {error}",
                path.display()
            )),
        ),
    };
    SavedataBackupDeleteResult { status, message }
}

#[command]
pub async fn delete_savedata_backup(
    db: State<'_, DatabaseConnection>,
    backup_id: i32,
) -> Result<SavedataBackupDeleteResult, String> {
    let _operation_guard = acquire_savedata_backup_operation_lock().await;
    let record = GamesRepository::get_savedata_record_by_id(&db, backup_id)
        .await
        .map_err(|error| format!("获取备份记录失败: {error}"))?
        .ok_or_else(|| "备份记录不存在".to_string())?;
    let backup_root = match resolve_savedata_backup_root(&db).await {
        Ok(path) => path,
        Err(error) => {
            log::warn!(
                "存档备份文件无法解析，保留数据库记录 backup_id={} error={}",
                backup_id,
                error
            );
            return Ok(SavedataBackupDeleteResult {
                status: SavedataBackupDeleteStatus::FileInaccessible,
                message: Some(error),
            });
        }
    };
    let backup_path = backup_root
        .join(format!("game_{}", record.game_id))
        .join(&record.file);
    if let Err(error) = remove_backup_file(&backup_path).await {
        log::warn!(
            "存档备份文件删除失败，保留数据库记录 backup_id={} game_id={} error={}",
            backup_id,
            record.game_id,
            format_backup_file_delete_failure(&backup_path, &error)
        );
        return Ok(backup_file_delete_result(&backup_path, error));
    }
    if let Err(error) = GamesRepository::delete_savedata_record(&db, backup_id).await {
        return Err(format!("删除数据库记录失败 (ID: {backup_id}): {error}"));
    }
    log::info!(
        "存档备份删除成功 backup_id={} game_id={}",
        backup_id,
        record.game_id
    );
    Ok(SavedataBackupDeleteResult {
        status: SavedataBackupDeleteStatus::Deleted,
        message: None,
    })
}

#[command]
pub async fn delete_savedata_backup_record(
    db: State<'_, DatabaseConnection>,
    backup_id: i32,
) -> Result<(), String> {
    let _operation_guard = acquire_savedata_backup_operation_lock().await;
    let record = GamesRepository::get_savedata_record_by_id(&db, backup_id)
        .await
        .map_err(|error| format!("获取备份记录失败: {error}"))?
        .ok_or_else(|| "备份记录不存在".to_string())?;
    GamesRepository::delete_savedata_record(&db, backup_id)
        .await
        .map_err(|error| format!("清除备份数据库记录失败 (ID: {backup_id}): {error}"))?;
    log::warn!(
        "用户确认仅清除存档备份数据库记录 backup_id={} game_id={} file={}",
        backup_id,
        record.game_id,
        record.file
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
        let source = root.join("old");
        let target = root.join("new");
        fs::create_dir_all(source.join("game_1")).unwrap();
        fs::write(source.join("game_1").join("backup.7z"), b"backup").unwrap();

        let prepared = prepare_backup_migration(&source, &target, 1).unwrap();

        assert!(matches!(prepared, PreparedMigration::Ready { .. }));
        assert_eq!(
            fs::read(target.join("game_1").join("backup.7z")).unwrap(),
            b"backup"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn replaces_an_existing_empty_target_with_verified_copy() {
        let root = test_directory();
        let source = root.join("old");
        let target = root.join("new");
        fs::create_dir_all(source.join("game_1")).unwrap();
        fs::write(source.join("game_1").join("backup.7z"), b"backup").unwrap();
        fs::create_dir_all(&target).unwrap();

        let prepared = prepare_backup_migration(&source, &target, 1).unwrap();

        assert!(matches!(
            prepared,
            PreparedMigration::Ready {
                target_commit: PreparedTargetCommit::Replaced {
                    target_existed: true
                },
                ..
            }
        ));
        assert_eq!(
            fs::read(target.join("game_1").join("backup.7z")).unwrap(),
            b"backup"
        );
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn resumes_when_target_is_already_a_verified_copy() {
        let root = test_directory();
        let source = root.join("old");
        let target = root.join("new");
        fs::create_dir_all(source.join("game_1")).unwrap();
        fs::create_dir_all(target.join("game_1")).unwrap();
        fs::write(source.join("game_1").join("backup.7z"), b"backup").unwrap();
        fs::write(target.join("game_1").join("backup.7z"), b"backup").unwrap();

        let prepared = prepare_backup_migration(&source, &target, 1).unwrap();

        assert!(matches!(
            prepared,
            PreparedMigration::Ready {
                target_commit: PreparedTargetCommit::ExistingVerifiedCopy,
                ..
            }
        ));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn flattens_a_nested_backup_root_when_it_is_the_only_entry() {
        let root = test_directory();
        let target = root.join("configured");
        let source = target.join("backups");
        fs::create_dir_all(source.join("game_1")).unwrap();
        fs::write(source.join("game_1").join("backup.7z"), b"backup").unwrap();

        let prepared = prepare_backup_migration(&source, &target, 1).unwrap();

        assert!(matches!(
            prepared,
            PreparedMigration::Ready {
                target_commit: PreparedTargetCommit::FlattenedNestedRoot { .. },
                ..
            }
        ));
        assert_eq!(
            fs::read(target.join("game_1").join("backup.7z")).unwrap(),
            b"backup"
        );
        assert_eq!(
            fs::read(source.join("game_1").join("backup.7z")).unwrap(),
            b"backup"
        );

        remove_old_backup_directory(&source).unwrap();
        assert!(target.is_dir());
        assert!(!source.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_nested_flatten_when_the_outer_directory_has_extra_entries() {
        let root = test_directory();
        let target = root.join("configured");
        let source = target.join("backups");
        fs::create_dir_all(&source).unwrap();
        fs::write(target.join("keep.txt"), b"keep").unwrap();

        let error = prepare_backup_migration(&source, &target, 1).unwrap_err();

        assert!(error.failures[0].message.contains("仅包含"));
        assert_eq!(fs::read(target.join("keep.txt")).unwrap(), b"keep");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn flattens_an_arbitrarily_named_child_directory() {
        let root = test_directory();
        let target = root.join("configured");
        let source = target.join("archive");
        fs::create_dir_all(source.join("game_1")).unwrap();
        fs::write(source.join("game_1").join("backup.7z"), b"backup").unwrap();

        let prepared = prepare_backup_migration(&source, &target, 1).unwrap();

        assert!(matches!(
            prepared,
            PreparedMigration::Ready {
                target_commit: PreparedTargetCommit::FlattenedNestedRoot { .. },
                ..
            }
        ));
        assert!(source.is_dir());
        assert!(target.join("game_1").join("backup.7z").is_file());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn resumes_an_already_copied_nested_flatten() {
        let root = test_directory();
        let target = root.join("configured");
        let source = target.join("archive");
        fs::create_dir_all(source.join("game_1")).unwrap();
        fs::create_dir_all(target.join("game_1")).unwrap();
        fs::write(source.join("game_1").join("backup.7z"), b"backup").unwrap();
        fs::write(target.join("game_1").join("backup.7z"), b"backup").unwrap();

        let prepared = prepare_backup_migration(&source, &target, 1).unwrap();

        assert!(matches!(
            prepared,
            PreparedMigration::Ready {
                target_commit: PreparedTargetCommit::ExistingVerifiedCopy,
                ..
            }
        ));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_a_multi_level_nested_source() {
        let root = test_directory();
        let target = root.join("configured");
        let source = target.join("level_1").join("level_2");
        fs::create_dir_all(source.join("game_1")).unwrap();
        fs::write(source.join("game_1").join("backup.7z"), b"backup").unwrap();

        let error = prepare_backup_migration(&source, &target, 1).unwrap_err();

        assert!(error.failures[0].message.contains("不受支持"));
        assert!(source.join("game_1").join("backup.7z").is_file());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_a_non_empty_target() {
        let root = test_directory();
        let source = root.join("old");
        let target = root.join("new");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("existing.txt"), b"existing").unwrap();

        let error = prepare_backup_migration(&source, &target, 1).unwrap_err();

        assert!(error.failures[0].message.contains("空目录"));
        assert_eq!(fs::read(target.join("existing.txt")).unwrap(), b"existing");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rolls_back_a_nested_root_flatten() {
        let root = test_directory();
        let target = root.join("configured");
        let source = target.join("backups");
        fs::create_dir_all(source.join("game_1")).unwrap();
        fs::write(source.join("game_1").join("backup.7z"), b"backup").unwrap();
        let prepared = prepare_backup_migration(&source, &target, 1).unwrap();
        let PreparedMigration::Ready { target_commit, .. } = prepared else {
            panic!("应准备原地扁平迁移");
        };

        let failures = rollback_prepared_migration(&source, &target, &target_commit);

        assert!(failures.is_empty());
        assert!(source.join("game_1").join("backup.7z").is_file());
        assert!(!target.join("game_1").exists());
        assert_eq!(fs::read_dir(&target).unwrap().count(), 1);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_parent_directory_overlap() {
        let root = test_directory();
        let source = root.join("backups");
        let target = source.join("nested").join("backups");
        fs::create_dir_all(&source).unwrap();

        let failures = prepare_backup_migration(&source, &target, 0)
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
        let target = root.join("new");

        let error = prepare_backup_migration(&source, &target, 1).unwrap_err();

        assert!(error.failures[0].message.contains("数据库仍有"));
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_invalid_requested_backup_root_syntax() {
        assert!(resolve_requested_backup_root(Some("relative/path")).is_err());
    }

    #[test]
    fn distinguishes_an_undefined_variable_from_invalid_paths() {
        #[cfg(target_os = "windows")]
        let path = r"%REINA_TEST_UNDEFINED_BACKUP_ROOT%\backups";
        #[cfg(not(target_os = "windows"))]
        let path = "$REINA_TEST_UNDEFINED_BACKUP_ROOT/backups";

        assert!(matches!(
            resolve_requested_backup_root(Some(path)),
            Ok(RequestedBackupRoot::UndefinedVariable(variable))
                if variable == "REINA_TEST_UNDEFINED_BACKUP_ROOT"
        ));
    }

    #[test]
    fn collects_missing_savedata_records_without_deleting_them() {
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
    fn removes_old_backup_root_but_keeps_its_parent() {
        let root = test_directory();
        let configured_root = root.join("configured");
        fs::create_dir_all(configured_root.join("game_1")).unwrap();

        remove_old_backup_directory(&configured_root).unwrap();

        assert!(!configured_root.exists());
        assert!(root.exists());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rolls_back_to_the_original_empty_target() {
        let root = test_directory();
        let source = root.join("old");
        let target = root.join("new");
        fs::create_dir_all(source.join("game_1")).unwrap();
        fs::write(source.join("game_1").join("backup.7z"), b"backup").unwrap();
        fs::create_dir_all(&target).unwrap();
        prepare_backup_migration(&source, &target, 1).unwrap();

        let failures = rollback_prepared_migration(
            &source,
            &target,
            &PreparedTargetCommit::Replaced {
                target_existed: true,
            },
        );

        assert!(failures.is_empty());
        assert!(target.is_dir());
        assert!(fs::read_dir(&target).unwrap().next().is_none());
        assert_eq!(
            fs::read(source.join("game_1").join("backup.7z")).unwrap(),
            b"backup"
        );
        fs::remove_dir_all(root).unwrap();
    }
}
