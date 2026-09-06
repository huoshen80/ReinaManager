use super::types::{
    ACTIVE_TASK_STATUSES, GAME_INSTALL_TASK_TYPE, GameInstallResultV1, GameInstallTaskPayloadV1,
    TaskControl, TaskFailure, TaskProgressEvent,
};
use crate::entity::tasks;
use crate::install::archive::archive_wrapper_directory;
use sea_orm::sea_query::Expr;
use sea_orm::*;
use serde_json::Value;
use std::path::Path;
use tauri::Emitter;
use tokio::sync::watch;

pub async fn recover_interrupted_tasks(db: &DatabaseConnection) -> Result<Vec<i64>, DbErr> {
    let now = chrono::Utc::now().timestamp();

    // matching_metadata/importing_game 需要前端完成元数据鉴权和导入，后端保留为 running，
    // 由 InstallRequestHandler 启动时扫描恢复；pending 任务则交给后端 runner 自动续跑。
    // 文件已经移动到正式目录的任务只需重新执行元数据匹配与入库。
    tasks::Entity::update_many()
        .col_expr(
            tasks::Column::Stage,
            Expr::value(Some("matching_metadata".to_string())),
        )
        .col_expr(tasks::Column::UpdatedAt, Expr::value(now))
        .filter(tasks::Column::TaskType.eq(GAME_INSTALL_TASK_TYPE))
        .filter(tasks::Column::Status.eq("running"))
        .filter(tasks::Column::Stage.is_in(["matching_metadata", "importing_game"]))
        .exec(db)
        .await?;

    tasks::Entity::update_many()
        .col_expr(tasks::Column::Status, Expr::value("failed".to_string()))
        .col_expr(
            tasks::Column::ErrorCode,
            Expr::value(Some("interrupted".to_string())),
        )
        .col_expr(
            tasks::Column::ErrorMessage,
            Expr::value(Some(
                "应用在任务完成前退出；临时文件已保留，可重试任务".to_string(),
            )),
        )
        .col_expr(tasks::Column::UpdatedAt, Expr::value(now))
        .col_expr(tasks::Column::FinishedAt, Expr::value(Some(now)))
        .filter(tasks::Column::Status.eq("running"))
        .filter(
            tasks::Column::Stage
                .is_null()
                .or(tasks::Column::Stage.is_not_in(["matching_metadata", "importing_game"])),
        )
        .exec(db)
        .await?;

    tasks::Entity::find()
        .select_only()
        .column(tasks::Column::Id)
        .filter(tasks::Column::Status.eq("pending"))
        .into_tuple::<i64>()
        .all(db)
        .await
}

pub(crate) async fn find_active_task_by_dedupe(
    db: &DatabaseConnection,
    dedupe_key: &str,
) -> Result<Option<tasks::Model>, String> {
    tasks::Entity::find()
        .filter(tasks::Column::DedupeKey.eq(dedupe_key))
        .filter(tasks::Column::Status.is_in(ACTIVE_TASK_STATUSES.iter().copied()))
        .one(db)
        .await
        .map_err(|error| format!("检查重复任务失败: {error}"))
}

pub(crate) async fn find_task(
    db: &DatabaseConnection,
    task_id: i64,
) -> Result<tasks::Model, String> {
    tasks::Entity::find_by_id(task_id)
        .one(db)
        .await
        .map_err(|error| format!("读取任务失败: {error}"))?
        .ok_or_else(|| "任务不存在".to_string())
}

pub(crate) async fn set_task_stage(
    db: &DatabaseConnection,
    task_id: i64,
    stage: &str,
) -> Result<tasks::Model, TaskFailure> {
    let task = find_task(db, task_id)
        .await
        .map_err(|message| TaskFailure::new("task_not_found", message))?;
    let now = chrono::Utc::now().timestamp();
    let started_at = task.started_at;
    let mut active: tasks::ActiveModel = task.into();
    active.status = Set("running".to_string());
    active.stage = Set(Some(stage.to_string()));
    if started_at.is_none() {
        active.started_at = Set(Some(now));
    }
    active.error_code = Set(None);
    active.error_message = Set(None);
    active.updated_at = Set(now);
    active.finished_at = Set(None);
    active
        .update(db)
        .await
        .map_err(|error| TaskFailure::new("task_update_failed", error.to_string()))
}

pub(crate) async fn claim_game_import(
    db: &DatabaseConnection,
    task_id: i64,
) -> Result<tasks::Model, TaskFailure> {
    let now = chrono::Utc::now().timestamp();
    let updated = tasks::Entity::update_many()
        .col_expr(
            tasks::Column::Stage,
            Expr::value(Some("importing_game".to_string())),
        )
        .col_expr(tasks::Column::UpdatedAt, Expr::value(now))
        .filter(tasks::Column::Id.eq(task_id))
        .filter(tasks::Column::Status.eq("running"))
        .filter(tasks::Column::Stage.eq("matching_metadata"))
        .exec(db)
        .await
        .map_err(|error| TaskFailure::new("task_update_failed", error.to_string()))?;
    if updated.rows_affected != 1 {
        return Err(TaskFailure::new(
            "invalid_task_state",
            "安装任务已不再等待元数据导入",
        ));
    }
    find_task(db, task_id)
        .await
        .map_err(|message| TaskFailure::new("task_not_found", message))
}

pub(crate) async fn remove_task_artifacts(
    payload: &GameInstallTaskPayloadV1,
    task_id: i64,
) -> Result<(), TaskFailure> {
    let download_path = payload.download_path(task_id)?;
    remove_download_artifacts(&download_path).await?;

    let staging = payload.staging_directory(task_id)?;
    for directory in [&staging, &archive_wrapper_directory(&staging)] {
        if directory.exists() {
            tokio::fs::remove_dir_all(directory)
                .await
                .map_err(|error| TaskFailure::new("task_cleanup_failed", error.to_string()))?;
        }
    }
    Ok(())
}

pub(crate) async fn remove_download_artifacts(download_path: &Path) -> Result<(), TaskFailure> {
    let mut paths = reina_download::artifact_paths(download_path);
    // 旧版 Takanawa 下载器的遗留文件，升级后一并清理。
    for legacy_suffix in [".part", ".part.lock"] {
        let mut value = download_path.as_os_str().to_owned();
        value.push(legacy_suffix);
        paths.push(std::path::PathBuf::from(value));
    }
    let mut first_error = None;
    for path in &paths {
        match tokio::fs::remove_file(path).await {
            Ok(()) => {}
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) if first_error.is_none() => {
                first_error = Some(format!("{}: {error}", path.display()));
            }
            Err(_) => {}
        }
    }
    first_error.map_or(Ok(()), |message| {
        Err(TaskFailure::new("task_cleanup_failed", message))
    })
}

pub(crate) async fn cleanup_task_artifacts(payload: &GameInstallTaskPayloadV1, task_id: i64) {
    if let Err(error) = remove_task_artifacts(payload, task_id).await {
        log::warn!(
            "清理安装任务文件失败 task_id={task_id} code={}: {}",
            error.code,
            error.message
        );
    }
}

pub(crate) async fn update_task_progress(
    db: &DatabaseConnection,
    task_id: i64,
    current: i64,
    total: Option<i64>,
) -> Result<(), TaskFailure> {
    tasks::Entity::update_many()
        .col_expr(tasks::Column::ProgressCurrent, Expr::value(current))
        .col_expr(tasks::Column::ProgressTotal, Expr::value(total))
        .col_expr(
            tasks::Column::UpdatedAt,
            Expr::value(chrono::Utc::now().timestamp()),
        )
        .filter(tasks::Column::Id.eq(task_id))
        .exec(db)
        .await
        .map_err(|error| TaskFailure::new("task_update_failed", error.to_string()))?;
    Ok(())
}

pub(crate) async fn save_game_install_result(
    db: &DatabaseConnection,
    task_id: i64,
    result: &GameInstallResultV1,
) -> Result<(), TaskFailure> {
    let value = serde_json::to_value(result)
        .map_err(|error| TaskFailure::new("task_result_failed", error.to_string()))?;
    tasks::Entity::update_many()
        .col_expr(tasks::Column::ResultJson, Expr::value(Some(value)))
        .col_expr(
            tasks::Column::UpdatedAt,
            Expr::value(chrono::Utc::now().timestamp()),
        )
        .filter(tasks::Column::Id.eq(task_id))
        .exec(db)
        .await
        .map_err(|error| TaskFailure::new("task_update_failed", error.to_string()))?;
    Ok(())
}

pub(crate) async fn complete_task_in_transaction<C>(
    db: &C,
    task: &tasks::Model,
    result: &GameInstallResultV1,
) -> Result<tasks::Model, DbErr>
where
    C: ConnectionTrait,
{
    let now = chrono::Utc::now().timestamp();
    let mut active: tasks::ActiveModel = task.clone().into();
    active.status = Set("completed".to_string());
    active.stage = Set(Some("importing_game".to_string()));
    active.result_json =
        Set(Some(serde_json::to_value(result).map_err(|error| {
            DbErr::Custom(format!("序列化任务结果失败: {error}"))
        })?));
    if let Some(total) = task.progress_total {
        active.progress_current = Set(total);
    }
    active.error_code = Set(None);
    active.error_message = Set(None);
    active.updated_at = Set(now);
    active.finished_at = Set(Some(now));
    active.update(db).await
}

pub(crate) async fn fail_task(
    db: &DatabaseConnection,
    task_id: i64,
    error_code: &str,
    error_message: &str,
    result: Option<Value>,
) -> Result<tasks::Model, TaskFailure> {
    fail_task_with_progress(db, task_id, error_code, error_message, result, None).await
}

async fn fail_task_with_progress(
    db: &DatabaseConnection,
    task_id: i64,
    error_code: &str,
    error_message: &str,
    result: Option<Value>,
    progress_current: Option<i64>,
) -> Result<tasks::Model, TaskFailure> {
    let task = find_task(db, task_id)
        .await
        .map_err(|message| TaskFailure::new("task_not_found", message))?;
    let now = chrono::Utc::now().timestamp();
    let mut active: tasks::ActiveModel = task.into();
    active.status = Set("failed".to_string());
    if let Some(result) = result {
        active.result_json = Set(Some(result));
    }
    if let Some(progress_current) = progress_current {
        active.progress_current = Set(progress_current);
    }
    active.error_code = Set(Some(error_code.to_string()));
    active.error_message = Set(Some(error_message.to_string()));
    active.updated_at = Set(now);
    active.finished_at = Set(Some(now));
    active
        .update(db)
        .await
        .map_err(|error| TaskFailure::new("task_update_failed", error.to_string()))
}

pub(crate) async fn set_task_paused(
    db: &DatabaseConnection,
    task_id: i64,
) -> Result<tasks::Model, TaskFailure> {
    let now = chrono::Utc::now().timestamp();
    let updated = tasks::Entity::update_many()
        .col_expr(tasks::Column::Status, Expr::value("paused".to_string()))
        .col_expr(tasks::Column::ErrorCode, Expr::value(None::<String>))
        .col_expr(tasks::Column::ErrorMessage, Expr::value(None::<String>))
        .col_expr(tasks::Column::UpdatedAt, Expr::value(now))
        .col_expr(tasks::Column::FinishedAt, Expr::value(None::<i64>))
        .filter(tasks::Column::Id.eq(task_id))
        .filter(tasks::Column::Status.eq("running"))
        .filter(tasks::Column::Stage.eq("downloading"))
        .exec(db)
        .await
        .map_err(|error| TaskFailure::new("task_update_failed", error.to_string()))?;
    if updated.rows_affected != 1 {
        return Err(TaskFailure::new(
            "task_not_pausable",
            "下载任务已不再处于可暂停状态",
        ));
    }
    find_task(db, task_id)
        .await
        .map_err(|message| TaskFailure::new("task_not_found", message))
}

pub(crate) async fn set_task_cancelled(
    db: &DatabaseConnection,
    task_id: i64,
) -> Result<tasks::Model, TaskFailure> {
    let now = chrono::Utc::now().timestamp();
    let updated = tasks::Entity::update_many()
        .col_expr(tasks::Column::Status, Expr::value("cancelled".to_string()))
        .col_expr(tasks::Column::ErrorCode, Expr::value(None::<String>))
        .col_expr(tasks::Column::ErrorMessage, Expr::value(None::<String>))
        .col_expr(tasks::Column::UpdatedAt, Expr::value(now))
        .col_expr(tasks::Column::FinishedAt, Expr::value(Some(now)))
        .filter(tasks::Column::Id.eq(task_id))
        .filter(tasks::Column::Status.is_in(ACTIVE_TASK_STATUSES.iter().copied()))
        .filter(
            tasks::Column::Stage
                .is_null()
                .or(tasks::Column::Stage.ne("importing_game")),
        )
        .exec(db)
        .await
        .map_err(|error| TaskFailure::new("task_update_failed", error.to_string()))?;
    let task = find_task(db, task_id)
        .await
        .map_err(|message| TaskFailure::new("task_not_found", message))?;
    if updated.rows_affected == 1
        || matches!(task.status.as_str(), "completed" | "failed" | "cancelled")
    {
        Ok(task)
    } else {
        Err(TaskFailure::new(
            "task_not_cancellable",
            "任务正在写入最终结果，当前不能取消",
        ))
    }
}

pub(crate) fn emit_progress(
    app: &tauri::AppHandle,
    task_id: i64,
    status: &str,
    stage: Option<&str>,
    progress_current: i64,
    progress_total: Option<i64>,
    progress_unit: Option<&str>,
) {
    emit_task_progress(
        app,
        TaskProgressEvent {
            task_id,
            status: status.to_string(),
            stage: stage.map(str::to_string),
            progress_current,
            progress_total,
            progress_unit: progress_unit.map(str::to_string),
            bytes_per_second: None,
            received_bytes: None,
        },
    );
}

pub(crate) fn emit_download_progress(
    app: &tauri::AppHandle,
    task_id: i64,
    progress_current: i64,
    progress_total: i64,
    bytes_per_second: f64,
    received_bytes: i64,
) {
    emit_task_progress(
        app,
        TaskProgressEvent {
            task_id,
            status: "running".to_string(),
            stage: Some("downloading".to_string()),
            progress_current,
            progress_total: Some(progress_total),
            progress_unit: Some("bytes".to_string()),
            bytes_per_second: Some(bytes_per_second),
            received_bytes: Some(received_bytes),
        },
    );
}

fn emit_task_progress(app: &tauri::AppHandle, event: TaskProgressEvent) {
    let _ = app.emit("task-progress", event);
}

pub(crate) fn check_task_control(
    control: &watch::Receiver<TaskControl>,
) -> Result<(), TaskFailure> {
    match *control.borrow() {
        TaskControl::Running => Ok(()),
        TaskControl::Pause => Err(TaskFailure::new("paused", "任务已暂停")),
        TaskControl::Cancel => Err(TaskFailure::new("cancelled", "任务已取消")),
    }
}
