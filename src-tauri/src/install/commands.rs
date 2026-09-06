use super::{
    persistence::{
        fail_task, find_active_task_by_dedupe, find_task, remove_download_artifacts,
        remove_task_artifacts, set_task_cancelled,
    },
    runner::spawn_task,
    types::{
        ACTIVE_TASK_STATUSES, GAME_INSTALL_TASK_TYPE, GameInstallTaskPayloadV1, TaskFailure,
        TaskRuntimeState, wait_for_task_completion,
    },
    workflow::{
        emit_game_install_failed, game_install_dedupe_key, import_installed_game,
        parse_game_install_payload, parse_game_install_result,
    },
};
use crate::database::dto::InsertGameData;
use crate::entity::tasks;
use crate::install::protocol::InstallRequest;
use crate::utils::fs::normalize_install_root_path;
use sea_orm::*;
use std::path::Path;
use tauri::{Manager, State};

#[tauri::command]
pub async fn create_game_install_task(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
    request: InstallRequest,
    install_root: String,
) -> Result<tasks::Model, String> {
    let request = request.validate()?;
    let install_root = normalize_install_root_path(&install_root)?;
    let payload = GameInstallTaskPayloadV1::new(request.clone(), &install_root);

    let dedupe_key = game_install_dedupe_key(&request);
    if find_active_task_by_dedupe(db.inner(), &dedupe_key)
        .await?
        .is_some()
    {
        return Err("该资源已有进行中的安装任务".to_string());
    }

    let now = chrono::Utc::now().timestamp();
    let task = tasks::ActiveModel {
        id: NotSet,
        task_type: Set(GAME_INSTALL_TASK_TYPE.to_string()),
        title: Set(request.title.clone()),
        status: Set("pending".to_string()),
        stage: Set(None),
        payload_json: Set(serde_json::to_value(&payload)
            .map_err(|error| format!("序列化安装请求失败: {error}"))?),
        result_json: Set(None),
        progress_current: Set(0),
        progress_total: Set(Some(request.size as i64)),
        progress_unit: Set(Some("bytes".to_string())),
        dedupe_key: Set(Some(dedupe_key)),
        error_code: Set(None),
        error_message: Set(None),
        created_at: Set(now),
        started_at: Set(None),
        updated_at: Set(now),
        finished_at: Set(None),
    }
    .insert(db.inner())
    .await
    .map_err(|error| format!("创建安装任务失败: {error}"))?;

    spawn_task(app, db.inner().clone(), task.id)?;
    Ok(task)
}

#[tauri::command]
pub async fn list_tasks(db: State<'_, DatabaseConnection>) -> Result<Vec<tasks::Model>, String> {
    tasks::Entity::find()
        .order_by_desc(tasks::Column::CreatedAt)
        .all(db.inner())
        .await
        .map_err(|error| format!("读取任务失败: {error}"))
}

#[tauri::command]
pub async fn retry_task(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
    task_id: i64,
    payload: Option<InstallRequest>,
    archive_password: Option<String>,
) -> Result<tasks::Model, String> {
    let mut task = find_task(db.inner(), task_id).await?;
    if task.task_type != GAME_INSTALL_TASK_TYPE {
        return Err("当前任务类型尚不支持重试".to_string());
    }
    if !matches!(task.status.as_str(), "failed" | "cancelled") {
        return Err("只有失败或已取消的任务可以重试".to_string());
    }

    if let Some(completion) = app.state::<TaskRuntimeState>().completion(task_id) {
        wait_for_task_completion(completion).await;
        task = find_task(db.inner(), task_id).await?;
        if !matches!(task.status.as_str(), "failed" | "cancelled") {
            return Err("只有失败或已取消的任务可以重试".to_string());
        }
    }

    let stored_payload = parse_game_install_payload(&task).map_err(|failure| failure.message)?;
    let mut request = match payload {
        Some(request) => request,
        None => stored_payload.request.clone(),
    };
    if let Some(archive_password) = archive_password {
        request.archive_password = Some(archive_password);
    }
    let request = request.validate()?;
    let dedupe_key = game_install_dedupe_key(&request);
    if tasks::Entity::find()
        .filter(tasks::Column::Id.ne(task_id))
        .filter(tasks::Column::DedupeKey.eq(&dedupe_key))
        .filter(tasks::Column::Status.is_in(ACTIVE_TASK_STATUSES.iter().copied()))
        .one(db.inner())
        .await
        .map_err(|error| format!("检查重复任务失败: {error}"))?
        .is_some()
    {
        return Err("该资源已有进行中的安装任务".to_string());
    }

    let has_installed_files = parse_game_install_result(&task)
        .ok()
        .flatten()
        .is_some_and(|result| Path::new(&result.install_path).is_dir());
    // checksum/size 不符说明已下载的数据本身有问题，必须清掉重来；
    // url_expired 不在其列——数据没问题，换新直链后可以从断点续传。
    let reset_partial_download = matches!(
        task.error_code.as_deref(),
        Some("checksum_mismatch" | "size_mismatch")
    );
    if reset_partial_download {
        let partial_path = stored_payload
            .download_path(task_id)
            .map_err(|failure| failure.message)?;
        remove_download_artifacts(&partial_path)
            .await
            .map_err(|failure| failure.message)?;
    }
    let updated_payload = GameInstallTaskPayloadV1 {
        request: request.clone(),
        install_root: stored_payload.install_root.clone(),
    };
    let previous_download_path = stored_payload
        .download_path(task_id)
        .map_err(|failure| failure.message)?;
    let updated_download_path = updated_payload
        .download_path(task_id)
        .map_err(|failure| failure.message)?;
    if previous_download_path != updated_download_path {
        // 下载数据和它的控制文件必须一起迁移，否则新路径上无法续传。
        let sources = reina_download::artifact_paths(&previous_download_path);
        let destinations = reina_download::artifact_paths(&updated_download_path);
        if sources.iter().any(|path| path.exists()) && destinations.iter().any(|path| path.exists())
        {
            return Err("新的下载临时文件已存在，请先清理冲突文件".to_string());
        }
        for (source, destination) in sources.iter().zip(&destinations) {
            if !source.exists() {
                continue;
            }
            tokio::fs::rename(source, destination)
                .await
                .map_err(|error| format!("迁移下载临时文件失败: {error}"))?;
        }
    }
    let mut active: tasks::ActiveModel = task.into();
    active.title = Set(request.title.clone());
    active.payload_json = Set(serde_json::to_value(updated_payload)
        .map_err(|error| format!("序列化安装请求失败: {error}"))?);
    active.status = Set("pending".to_string());
    active.stage = Set(None);
    if !has_installed_files {
        active.result_json = Set(None);
        if reset_partial_download {
            active.progress_current = Set(0);
        }
    }
    active.progress_total = Set(Some(request.size as i64));
    active.progress_unit = Set(Some("bytes".to_string()));
    active.dedupe_key = Set(Some(dedupe_key));
    active.error_code = Set(None);
    active.error_message = Set(None);
    active.started_at = Set(None);
    active.updated_at = Set(chrono::Utc::now().timestamp());
    active.finished_at = Set(None);
    let task = active
        .update(db.inner())
        .await
        .map_err(|error| format!("重置任务失败: {error}"))?;

    spawn_task(app, db.inner().clone(), task.id)?;
    Ok(task)
}

#[tauri::command]
pub async fn pause_task(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
    task_id: i64,
) -> Result<tasks::Model, String> {
    let task = find_task(db.inner(), task_id).await?;
    if task.status == "paused" {
        return Ok(task);
    }
    if task.task_type != GAME_INSTALL_TASK_TYPE
        || task.status != "running"
        || task.stage.as_deref() != Some("downloading")
    {
        return Err("只有正在下载的任务可以暂停".to_string());
    }

    let completion = app
        .state::<TaskRuntimeState>()
        .pause(task_id)
        .ok_or_else(|| "下载任务当前不在运行".to_string())?;
    wait_for_task_completion(completion).await;

    let task = find_task(db.inner(), task_id).await?;
    if task.status == "paused"
        || matches!(task.status.as_str(), "completed" | "failed" | "cancelled")
    {
        Ok(task)
    } else {
        Err("下载任务未能进入暂停状态".to_string())
    }
}

#[tauri::command]
pub async fn resume_task(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
    task_id: i64,
) -> Result<tasks::Model, String> {
    let task = find_task(db.inner(), task_id).await?;
    if task.task_type != GAME_INSTALL_TASK_TYPE
        || task.status != "paused"
        || task.stage.as_deref() != Some("downloading")
    {
        return Err("只有已暂停的下载任务可以继续".to_string());
    }

    let mut active: tasks::ActiveModel = task.into();
    active.status = Set("pending".to_string());
    active.error_code = Set(None);
    active.error_message = Set(None);
    active.updated_at = Set(chrono::Utc::now().timestamp());
    active.finished_at = Set(None);
    let task = active
        .update(db.inner())
        .await
        .map_err(|error| format!("恢复下载任务失败: {error}"))?;

    spawn_task(app, db.inner().clone(), task.id)?;
    Ok(task)
}

#[tauri::command]
pub async fn cancel_task(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
    task_id: i64,
) -> Result<tasks::Model, String> {
    let task = find_task(db.inner(), task_id).await?;
    if matches!(task.status.as_str(), "completed" | "failed" | "cancelled") {
        return Ok(task);
    }

    if let Some(completion) = app.state::<TaskRuntimeState>().cancel(task_id) {
        wait_for_task_completion(completion).await;
    }

    let task = find_task(db.inner(), task_id).await?;
    if matches!(task.status.as_str(), "completed" | "failed" | "cancelled") {
        return Ok(task);
    }
    set_task_cancelled(db.inner(), task_id)
        .await
        .map_err(|failure| failure.message)
}

#[tauri::command]
pub async fn delete_task(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
    task_id: i64,
) -> Result<(), String> {
    let mut task = find_task(db.inner(), task_id).await?;
    if !matches!(task.status.as_str(), "failed" | "completed" | "cancelled") {
        return Err("只有失败、已完成或已取消的任务可以删除".to_string());
    }

    if let Some(completion) = app.state::<TaskRuntimeState>().completion(task_id) {
        wait_for_task_completion(completion).await;
        task = find_task(db.inner(), task_id).await?;
        if !matches!(task.status.as_str(), "failed" | "completed" | "cancelled") {
            return Err("任务状态已变化，当前不能删除".to_string());
        }
    }

    let payload = parse_game_install_payload(&task).map_err(|failure| failure.message)?;
    remove_task_artifacts(&payload, task_id)
        .await
        .map_err(|failure| failure.message)?;
    tasks::Entity::delete_by_id(task_id)
        .exec(db.inner())
        .await
        .map_err(|error| format!("删除任务失败: {error}"))?;
    Ok(())
}

#[tauri::command]
pub async fn complete_game_install_task(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
    task_id: i64,
    metadata: InsertGameData,
) -> Result<tasks::Model, String> {
    match import_installed_game(&app, db.inner(), task_id, metadata).await {
        Ok(task) => Ok(task),
        Err(failure) => {
            if failure.code != "invalid_task_state"
                && let Ok(task) = find_task(db.inner(), task_id).await
                && task.status == "running"
                && matches!(
                    task.stage.as_deref(),
                    Some("matching_metadata" | "importing_game")
                )
            {
                let failed =
                    fail_task(db.inner(), task_id, &failure.code, &failure.message, None).await;
                emit_game_install_failed(&app, task_id, failed.as_ref().ok(), &failure);
            }
            Err(failure.message)
        }
    }
}

#[tauri::command]
pub async fn fail_game_install_metadata(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
    task_id: i64,
    error_message: String,
) -> Result<tasks::Model, String> {
    let task = find_task(db.inner(), task_id).await?;
    if matches!(task.status.as_str(), "completed" | "failed" | "cancelled") {
        return Ok(task);
    }
    if task.task_type != GAME_INSTALL_TASK_TYPE
        || task.stage.as_deref() != Some("matching_metadata")
    {
        return Err("安装任务当前不在元数据导入阶段".to_string());
    }

    let failure = TaskFailure::new("metadata_fetch_failed", error_message);
    let task = fail_task(db.inner(), task_id, &failure.code, &failure.message, None)
        .await
        .map_err(|failure| failure.message)?;
    emit_game_install_failed(&app, task_id, Some(&task), &failure);
    Ok(task)
}
