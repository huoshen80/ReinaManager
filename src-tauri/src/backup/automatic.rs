use crate::backup::common::{
    BackupResult, acquire_database_backup_operation_lock, cleanup_auto_backup_batches,
    ensure_database_backup_available, mark_database_backup_unavailable, next_backup_id,
    resolve_backup_dir,
};
use crate::backup::database::{
    backup_data_archive_to, backup_database_file_to, copy_database_file_cold_to,
};
use crate::database::db::close_connection;
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use tauri::{State, command};

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AutoBackupTrigger {
    Scheduled,
    Exit,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackupRequest {
    pub trigger: AutoBackupTrigger,
    pub include_covers: bool,
    pub max_auto_backups: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AutoBackupResult {
    pub batch_id: String,
    pub backup: BackupResult,
    pub warnings: Vec<String>,
}

/// 创建一个数据库自动备份批次，并按批次统一清理数据库和封面文件。
#[command]
pub async fn create_auto_backup(
    request: AutoBackupRequest,
    db: State<'_, DatabaseConnection>,
) -> Result<AutoBackupResult, String> {
    let _operation_guard = acquire_database_backup_operation_lock().await;
    ensure_database_backup_available()?;

    let backup_dir = resolve_backup_dir(&db).await?;
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let batch_id = next_backup_id(
        &backup_dir,
        &timestamp,
        &[
            ("reina_manager_auto_", ".db"),
            ("custom_covers_auto_", ".7z"),
            ("reina_data_auto_", ".7z"),
        ],
    )?;
    let cold_database_path = match request.trigger {
        AutoBackupTrigger::Scheduled => None,
        AutoBackupTrigger::Exit => Some(reina_path::get_db_path()?),
    };
    let mut warnings = Vec::new();

    if cold_database_path.is_some() {
        close_connection(db.inner().clone())
            .await
            .map_err(|e| format!("关闭数据库连接失败: {e}"))?;
        mark_database_backup_unavailable();
    }
    let backup = if request.include_covers {
        backup_data_archive_to(
            &db,
            &reina_path::get_base_data_dir()?.join("covers"),
            &backup_dir.join(format!("reina_data_auto_{batch_id}.7z")),
            cold_database_path.as_deref(),
        )
        .await?
    } else {
        let name = format!("reina_manager_auto_{batch_id}.db");
        if let Some(source) = cold_database_path.as_deref() {
            copy_database_file_cold_to(source, &backup_dir, &name)?
        } else {
            backup_database_file_to(&db, &backup_dir, &name).await?
        }
    };

    if let Err(error) = cleanup_auto_backup_batches(&backup_dir, request.max_auto_backups) {
        log::warn!("自动备份批次 {batch_id} 已创建，但清理旧批次失败: {error}");
        warnings.push(format!("清理旧自动备份失败: {error}"));
    }

    log::info!(
        "自动备份批次创建成功 batch_id={} trigger={:?}",
        batch_id,
        request.trigger
    );

    Ok(AutoBackupResult {
        batch_id,
        backup,
        warnings,
    })
}
