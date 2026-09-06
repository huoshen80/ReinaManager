use super::{
    download::{download_file, verify_file},
    persistence::check_task_control,
    persistence::{
        cleanup_task_artifacts, emit_progress, fail_task, find_task, save_game_install_result,
        set_task_cancelled, set_task_paused, set_task_stage,
    },
    types::{
        GAME_INSTALL_TASK_TYPE, GameInstallResultV1, TaskControl, TaskFailure, TaskRuntimeState,
    },
    workflow::{
        emit_game_install_failed, game_directory_name, parse_game_install_payload,
        parse_game_install_result, prepare_game_import,
    },
};
use crate::entity::tasks;
use crate::install::archive::{
    ArchiveError, collapse_single_directory_layers, extract_archive, move_game_root,
};
use sea_orm::DatabaseConnection;
use std::path::Path;
use std::sync::OnceLock;
use tauri::Manager;
use tokio::sync::{Semaphore, SemaphorePermit, watch};

// 多任务的总连接数由 download.rs 的全局连接预算约束，单任务限流时各自独立降级。
const MAX_CONCURRENT_DOWNLOADS: usize = 3;
const MAX_CONCURRENT_EXTRACTS: usize = 1;

static DOWNLOAD_SEMAPHORE: OnceLock<Semaphore> = OnceLock::new();
static EXTRACT_SEMAPHORE: OnceLock<Semaphore> = OnceLock::new();

pub fn resume_pending_tasks(app: &tauri::AppHandle, db: &DatabaseConnection, task_ids: Vec<i64>) {
    for task_id in task_ids {
        if let Err(error) = spawn_task(app.clone(), db.clone(), task_id) {
            log::error!("恢复等待任务失败 task_id={task_id}: {error}");
        }
    }
}

pub(crate) fn spawn_task(
    app: tauri::AppHandle,
    db: DatabaseConnection,
    task_id: i64,
) -> Result<(), String> {
    let control = app.state::<TaskRuntimeState>().start(task_id)?;
    tauri::async_runtime::spawn(async move {
        if let Err(failure) = run_task(&app, &db, task_id, control).await {
            match failure.code.as_str() {
                "paused" => {
                    if let Ok(task) = set_task_paused(&db, task_id).await {
                        emit_progress(
                            &app,
                            task_id,
                            &task.status,
                            task.stage.as_deref(),
                            task.progress_current,
                            task.progress_total,
                            task.progress_unit.as_deref(),
                        );
                    }
                }
                "cancelled" => {
                    let _ = set_task_cancelled(&db, task_id).await;
                }
                _ => {
                    log::error!(
                        "任务失败 task_id={} code={}: {}",
                        task_id,
                        failure.code,
                        failure.message
                    );
                    // 直链过期不再清理已下载的数据：续传身份与 URL 无关，
                    // 用新直链重试可以从断点继续。
                    let failed =
                        fail_task(&db, task_id, &failure.code, &failure.message, None).await;
                    if let Ok(task) = &failed {
                        emit_progress(
                            &app,
                            task_id,
                            &task.status,
                            task.stage.as_deref(),
                            task.progress_current,
                            task.progress_total,
                            task.progress_unit.as_deref(),
                        );
                    }
                    emit_game_install_failed(&app, task_id, failed.as_ref().ok(), &failure);
                }
            }
        }
        app.state::<TaskRuntimeState>().finish(task_id);
    });
    Ok(())
}

fn download_semaphore() -> &'static Semaphore {
    DOWNLOAD_SEMAPHORE.get_or_init(|| Semaphore::new(MAX_CONCURRENT_DOWNLOADS))
}

fn extract_semaphore() -> &'static Semaphore {
    EXTRACT_SEMAPHORE.get_or_init(|| Semaphore::new(MAX_CONCURRENT_EXTRACTS))
}

async fn acquire_stage_permit(
    semaphore: &'static Semaphore,
    control: &mut watch::Receiver<TaskControl>,
) -> Result<SemaphorePermit<'static>, TaskFailure> {
    loop {
        tokio::select! {
            permit = semaphore.acquire() => {
                return permit.map_err(|_| {
                    TaskFailure::new("task_scheduler_closed", "任务调度器已关闭")
                });
            }
            changed = control.changed() => {
                if changed.is_err() {
                    return Err(TaskFailure::new("cancelled", "任务已取消"));
                }
                check_task_control(control)?;
            }
        }
    }
}

async fn run_task(
    app: &tauri::AppHandle,
    db: &DatabaseConnection,
    task_id: i64,
    mut control: watch::Receiver<TaskControl>,
) -> Result<(), TaskFailure> {
    let task = find_task(db, task_id)
        .await
        .map_err(|message| TaskFailure::new("task_not_found", message))?;
    match task.task_type.as_str() {
        GAME_INSTALL_TASK_TYPE => run_game_install_task(app, db, task, &mut control).await,
        task_type => Err(TaskFailure::new(
            "unsupported_task_type",
            format!("不支持的任务类型: {task_type}"),
        )),
    }
}

async fn run_game_install_task(
    app: &tauri::AppHandle,
    db: &DatabaseConnection,
    task: tasks::Model,
    control: &mut watch::Receiver<TaskControl>,
) -> Result<(), TaskFailure> {
    let payload = parse_game_install_payload(&task)?;
    let request = &payload.request;
    check_task_control(control)?;

    if let Some(result) = parse_game_install_result(&task)?
        && Path::new(&result.install_path).is_dir()
    {
        prepare_game_import(app, db, &task, request, result, control).await?;
        cleanup_task_artifacts(&payload, task.id).await;
        return Ok(());
    }

    let install_root = payload.install_root()?;
    tokio::fs::create_dir_all(&install_root)
        .await
        .map_err(|error| TaskFailure::new("install_root_failed", error.to_string()))?;
    let download_path = payload.download_path(task.id)?;

    {
        let _download_permit = acquire_stage_permit(download_semaphore(), control).await?;
        set_task_stage(db, task.id, "downloading").await?;
        emit_progress(
            app,
            task.id,
            "running",
            Some("downloading"),
            task.progress_current,
            Some(request.size as i64),
            Some("bytes"),
        );
        download_file(app, db, &task, request, &download_path, control).await?;
    }
    check_task_control(control)?;
    set_task_stage(db, task.id, "verifying").await?;
    emit_progress(
        app,
        task.id,
        "running",
        Some("verifying"),
        request.size as i64,
        Some(request.size as i64),
        Some("bytes"),
    );
    verify_file(download_path.clone(), request.clone()).await?;

    let staging = payload.staging_directory(task.id)?;
    {
        let _extract_permit = acquire_stage_permit(extract_semaphore(), control).await?;
        check_task_control(control)?;
        set_task_stage(db, task.id, "extracting").await?;
        emit_progress(
            app,
            task.id,
            "running",
            Some("extracting"),
            request.size as i64,
            Some(request.size as i64),
            Some("bytes"),
        );
        tokio::task::spawn_blocking({
            let app = app.clone();
            let download_path = download_path.clone();
            let archive_format = request.archive_format.clone();
            let archive_password = request.archive_password.clone();
            let staging = staging.clone();
            move || {
                extract_archive(
                    &app,
                    &download_path,
                    &archive_format,
                    archive_password.as_deref(),
                    &staging,
                )
            }
        })
        .await
        .map_err(|error| TaskFailure::new("extract_task_failed", error.to_string()))?
        .map_err(|error| match error {
            ArchiveError::PasswordRequired => TaskFailure::new(
                "archive_password_required",
                "压缩包需要密码，请在任务管理器输入密码后重试",
            ),
            ArchiveError::InvalidPassword => TaskFailure::new(
                "archive_password_invalid",
                "解压密码错误，请在任务管理器修改密码后重试",
            ),
            ArchiveError::Other(message) => TaskFailure::new("extract_failed", message),
        })?;
    }

    check_task_control(control)?;
    set_task_stage(db, task.id, "organizing").await?;
    emit_progress(
        app,
        task.id,
        "running",
        Some("organizing"),
        request.size as i64,
        Some(request.size as i64),
        Some("bytes"),
    );
    let game_root = tokio::task::spawn_blocking({
        let staging = staging.clone();
        move || collapse_single_directory_layers(&staging)
    })
    .await
    .map_err(|error| TaskFailure::new("organize_task_failed", error.to_string()))?
    .map_err(|message| TaskFailure::new("organize_failed", message))?;
    let directory_name = game_directory_name(&game_root, &staging, request, task.id);
    let final_root = tokio::task::spawn_blocking({
        let install_root = install_root.clone();
        move || move_game_root(&game_root, &install_root, &directory_name, task.id)
    })
    .await
    .map_err(|error| TaskFailure::new("organize_task_failed", error.to_string()))?
    .map_err(|message| TaskFailure::new("organize_failed", message))?;
    let result = GameInstallResultV1::partial(&final_root, None);
    // 先保存正式目录 checkpoint；应用崩溃后可跳过下载和解压，从扫描阶段恢复。
    save_game_install_result(db, task.id, &result).await?;
    prepare_game_import(app, db, &task, request, result, control).await?;
    cleanup_task_artifacts(&payload, task.id).await;
    Ok(())
}
