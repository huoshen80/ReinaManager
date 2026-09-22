use crate::backup::common::{
    BackupResult, acquire_database_backup_operation_lock, cleanup_auto_backup_batches,
    ensure_database_backup_available, mark_database_backup_unavailable, next_backup_id,
    resolve_backup_dir,
};
use crate::backup::covers::backup_custom_covers_archive_to;
use crate::backup::database::{backup_database_file_to, copy_database_file_cold_to};
use crate::database::db::close_connection;
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::fs;
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
    pub database: BackupResult,
    pub covers: Option<BackupResult>,
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
        ],
    )?;
    let cold_database_path = match request.trigger {
        AutoBackupTrigger::Scheduled => None,
        AutoBackupTrigger::Exit => Some(reina_path::get_db_path()?),
    };
    let mut warnings = Vec::new();

    let covers = if request.include_covers {
        let archive_name = format!("custom_covers_auto_{batch_id}.7z");
        match backup_custom_covers_archive_to(&backup_dir, &archive_name) {
            Ok(result) => Some(result),
            Err(error) => {
                log::warn!("自动备份批次 {batch_id} 的自定义封面备份失败: {error}");
                warnings.push(format!("自定义封面备份失败: {error}"));
                None
            }
        }
    } else {
        None
    };

    let database_name = format!("reina_manager_auto_{batch_id}.db");
    let database_result = match request.trigger {
        AutoBackupTrigger::Scheduled => {
            backup_database_file_to(&db, &backup_dir, &database_name).await
        }
        AutoBackupTrigger::Exit => match close_connection(db.inner().clone()).await {
            Ok(()) => {
                mark_database_backup_unavailable();
                log::info!("数据库连接已关闭，准备执行退出自动备份");
                copy_database_file_cold_to(
                    cold_database_path
                        .as_deref()
                        .expect("退出自动备份应预先获取数据库路径"),
                    &backup_dir,
                    &database_name,
                )
            }
            Err(error) => Err(format!("关闭数据库连接失败: {error}")),
        },
    };

    let database = match database_result {
        Ok(result) => result,
        Err(error) => {
            if let Some(path) = covers.as_ref().and_then(|result| result.path.as_deref())
                && let Err(cleanup_error) = fs::remove_file(path)
            {
                log::warn!(
                    "数据库自动备份失败后清理同批次封面失败 batch_id={batch_id}: {cleanup_error}"
                );
            }
            return Err(error);
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
        database,
        covers,
        warnings,
    })
}
