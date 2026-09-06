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
    let payload_json = serde_json::to_value(&updated_payload)
        .map_err(|error| format!("序列化安装请求失败: {error}"))?;
    // 下载数据和它的控制文件必须一起迁移，否则新路径上无法续传。
    // 返回已移动的对，便于数据库写入失败时恢复原路径。
    let moved_artifacts =
        migrate_download_artifacts(&previous_download_path, &updated_download_path).await?;
    let mut active: tasks::ActiveModel = task.into();
    active.title = Set(request.title.clone());
    active.payload_json = Set(payload_json);
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
    let task = match active.update(db.inner()).await {
        Ok(task) => task,
        Err(error) => {
            // 数据库仍保留旧 payload 时必须把文件也恢复到旧路径，否则下一次重试
            // 无法找到旧下载。恢复失败不掩盖原始数据库错误，并明确列出残留风险。
            if let Err(rollback_error) = rollback_download_artifacts(&moved_artifacts).await {
                return Err(format!(
                    "重置任务失败: {error}；下载文件回滚失败: {rollback_error}"
                ));
            }
            return Err(format!("重置任务失败: {error}"));
        }
    };

    spawn_task(app, db.inner().clone(), task.id)?;
    Ok(task)
}

/// 按目标、控制文件、控制文件临时文件的固定顺序迁移下载产物。
///
/// 先检查每一对路径，避免把已有用户文件当成迁移目标覆盖；中途失败时只回滚
/// 本次已经移动的文件。若数据库更新失败，调用方还会复用同一回滚逻辑恢复旧 payload。
async fn migrate_download_artifacts(
    source_path: &Path,
    destination_path: &Path,
) -> Result<Vec<(std::path::PathBuf, std::path::PathBuf)>, String> {
    if source_path == destination_path {
        return Ok(Vec::new());
    }
    let sources = reina_download::artifact_paths(source_path);
    let destinations = reina_download::artifact_paths(destination_path);
    let mut pending = Vec::new();
    let mut source_exists_any = false;
    let mut destination_exists_any = false;
    for (source, destination) in sources.into_iter().zip(destinations) {
        let source_exists = source.exists();
        let destination_exists = destination.exists();
        source_exists_any |= source_exists;
        destination_exists_any |= destination_exists;
        if source_exists {
            pending.push((source, destination));
        }
    }
    if source_exists_any && destination_exists_any {
        return Err("新旧下载临时文件同时存在，未执行迁移，请先处理冲突文件".to_string());
    }

    let mut moved = Vec::with_capacity(pending.len());
    for (source, destination) in pending {
        if let Err(error) = tokio::fs::rename(&source, &destination).await {
            let rollback_result = rollback_download_artifacts(&moved).await;
            return match rollback_result {
                Ok(()) => Err(format!("迁移下载临时文件失败: {error}")),
                Err(rollback_error) => Err(format!(
                    "迁移下载临时文件失败: {error}；下载文件回滚失败: {rollback_error}"
                )),
            };
        }
        moved.push((source, destination));
    }
    Ok(moved)
}

async fn rollback_download_artifacts(
    moved: &[(std::path::PathBuf, std::path::PathBuf)],
) -> Result<(), String> {
    let mut errors = Vec::new();
    for (source, destination) in moved.iter().rev() {
        // 回滚也绝不能覆盖迁移期间出现的用户文件；这种情况下保留新文件并报告。
        if source.exists() {
            errors.push(format!("原路径已存在，未覆盖 {}", source.display()));
            continue;
        }
        if !destination.exists() {
            errors.push(format!("新路径已不存在，无法恢复 {}", source.display()));
            continue;
        }
        if let Err(error) = tokio::fs::rename(destination, source).await {
            errors.push(format!(
                "{} -> {}: {error}",
                destination.display(),
                source.display()
            ));
        }
    }
    if errors.is_empty() {
        Ok(())
    } else {
        Err(errors.join("；"))
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_directory() -> std::path::PathBuf {
        static NEXT_DIRECTORY: AtomicU64 = AtomicU64::new(0);
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("系统时间应晚于 Unix epoch")
            .as_nanos();
        let sequence = NEXT_DIRECTORY.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "reina-retry-migration-{}-{nonce}-{sequence}",
            std::process::id(),
        ))
    }

    #[tokio::test]
    async fn migration_does_not_overwrite_existing_destination() {
        let directory = test_directory();
        std::fs::create_dir_all(&directory).unwrap();
        let source = directory.join("old.zip");
        let destination = directory.join("new.zip");
        std::fs::write(&source, b"partial download").unwrap();
        std::fs::write(&destination, b"user file").unwrap();

        let result = migrate_download_artifacts(&source, &destination).await;

        assert!(result.is_err());
        assert_eq!(std::fs::read(&source).unwrap(), b"partial download");
        assert_eq!(std::fs::read(&destination).unwrap(), b"user file");
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn migration_moves_all_download_artifacts_together() {
        let directory = test_directory();
        std::fs::create_dir_all(&directory).unwrap();
        let source = directory.join("old.zip");
        let destination = directory.join("new.zip");
        std::fs::write(&source, b"partial download").unwrap();
        for (index, path) in reina_download::artifact_paths(&source)
            .into_iter()
            .skip(1)
            .enumerate()
        {
            std::fs::write(path, format!("artifact-{index}")).unwrap();
        }

        let moved = migrate_download_artifacts(&source, &destination)
            .await
            .unwrap();

        assert_eq!(moved.len(), reina_download::artifact_paths(&source).len());
        for (index, path) in reina_download::artifact_paths(&source)
            .into_iter()
            .enumerate()
        {
            let destination_path = reina_download::artifact_paths(&destination)[index].clone();
            assert!(!path.exists());
            assert!(destination_path.exists());
        }
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn rollback_restores_all_artifacts_without_overwrite() {
        let directory = test_directory();
        std::fs::create_dir_all(&directory).unwrap();
        let source = directory.join("old.zip");
        let destination = directory.join("new.zip");
        for (index, path) in reina_download::artifact_paths(&source)
            .into_iter()
            .enumerate()
        {
            std::fs::write(path, format!("artifact-{index}")).unwrap();
        }

        let moved = migrate_download_artifacts(&source, &destination)
            .await
            .unwrap();
        rollback_download_artifacts(&moved).await.unwrap();

        for (index, path) in reina_download::artifact_paths(&source)
            .into_iter()
            .enumerate()
        {
            assert_eq!(
                std::fs::read(path).unwrap(),
                format!("artifact-{index}").as_bytes()
            );
        }
        for path in reina_download::artifact_paths(&destination) {
            assert!(!path.exists());
        }
        std::fs::remove_dir_all(directory).unwrap();
    }

    #[tokio::test]
    async fn rollback_conflict_reports_error_and_retains_conflicting_new_file() {
        let directory = test_directory();
        std::fs::create_dir_all(&directory).unwrap();
        let source = directory.join("old.zip");
        let destination = directory.join("new.zip");
        for (index, path) in reina_download::artifact_paths(&source)
            .into_iter()
            .enumerate()
        {
            std::fs::write(path, format!("artifact-{index}")).unwrap();
        }

        let moved = migrate_download_artifacts(&source, &destination)
            .await
            .unwrap();
        let conflicting_source = reina_download::artifact_paths(&source)[1].clone();
        std::fs::write(&conflicting_source, b"new user file").unwrap();

        let result = rollback_download_artifacts(&moved).await;

        assert!(result.is_err());
        assert_eq!(std::fs::read(conflicting_source).unwrap(), b"new user file");
        // 没有冲突的产物仍应完成恢复，避免回滚失败扩大损失。
        assert_eq!(std::fs::read(&source).unwrap(), b"artifact-0");
        assert_eq!(
            std::fs::read(reina_download::artifact_paths(&destination)[1].clone()).unwrap(),
            b"artifact-1"
        );
        std::fs::remove_dir_all(directory).unwrap();
    }
}
