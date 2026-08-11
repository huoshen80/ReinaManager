use super::{
    persistence::{
        check_task_control, emit_download_progress, emit_progress, update_task_progress,
    },
    types::{TaskControl, TaskFailure},
};
use crate::entity::tasks;
use crate::install::protocol::InstallRequest;
use crate::utils::http::get_transfer_client;
use sea_orm::DatabaseConnection;
use sha2::{Digest, Sha256};
use std::fs::File as StdFile;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::Duration;
use takanawa_core::HashConfig;
use takanawa_http::{
    DownloadConfig, DownloadEngine, DownloadHandle, DownloadPhase, DownloadSnapshot, RetryConfig,
    TimeoutConfig,
};
use tokio::runtime::{Builder as RuntimeBuilder, Runtime};
use tokio::sync::watch;

const TAKANAWA_CHUNK_SIZE: u64 = 64 * 1024 * 1024;
const TAKANAWA_PARALLELISM: usize = 8;
const TAKANAWA_MAX_IO: usize = 24;
const PROGRESS_REPORT_INTERVAL: Duration = Duration::from_millis(500);
const CONTROL_POLL_INTERVAL: Duration = Duration::from_millis(50);

static TAKANAWA_RUNTIME: OnceLock<Result<Runtime, String>> = OnceLock::new();

pub(crate) async fn download_file(
    app: &tauri::AppHandle,
    db: &DatabaseConnection,
    task: &tasks::Model,
    request: &InstallRequest,
    partial_path: &Path,
    control: &mut watch::Receiver<TaskControl>,
) -> Result<(), TaskFailure> {
    check_task_control(control)?;
    validate_request(request)?;

    if let Some(existing_size) = existing_file_size(partial_path).await? {
        if existing_size == request.size {
            report_progress(app, db, task.id, existing_size, request.size).await?;
            return Ok(());
        }
        return Err(TaskFailure::new(
            "takanawa_target_conflict",
            "检测到旧下载器生成的不完整临时文件；请取消并重新创建任务后测试 Takanawa 下载器",
        ));
    }

    let runtime = takanawa_runtime()?;
    let engine = DownloadEngine::with_client(get_transfer_client(), TAKANAWA_MAX_IO);
    let handle = DownloadHandle::new(
        engine,
        DownloadConfig {
            url: request.url.clone(),
            target_path: partial_path.to_path_buf(),
            chunk_size: TAKANAWA_CHUNK_SIZE,
            parallelism: TAKANAWA_PARALLELISM,
            max_parallel_chunks: 0,
            retry: RetryConfig::default(),
            timeout: TimeoutConfig {
                connect: Duration::from_secs(10),
                read: Duration::from_secs(60),
                total: Duration::ZERO,
            },
            bytes_per_second_limit: 0,
            hash: HashConfig::None,
        },
    );
    handle
        .start_on(runtime)
        .map_err(|error| TaskFailure::new("takanawa_start_failed", error.to_string()))?;

    let mut interval = tokio::time::interval(PROGRESS_REPORT_INTERVAL);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut committed = u64::try_from(task.progress_current)
        .unwrap_or(0)
        .min(request.size);
    let mut last_persisted = committed;
    loop {
        tokio::select! {
            changed = control.changed() => {
                if changed.is_err() {
                    handle.cancel().map_err(takanawa_control_failure)?;
                    return wait_for_control_completion(app, db, task.id, request, committed, &handle, TaskControl::Cancel).await;
                }
                let requested = *control.borrow();
                match requested {
                    TaskControl::Running => {}
                    TaskControl::Pause => {
                        handle.pause().map_err(takanawa_control_failure)?;
                        return wait_for_control_completion(app, db, task.id, request, committed, &handle, TaskControl::Pause).await;
                    }
                    TaskControl::Cancel => {
                        handle.cancel().map_err(takanawa_control_failure)?;
                        return wait_for_control_completion(app, db, task.id, request, committed, &handle, TaskControl::Cancel).await;
                    }
                }
            }
            _ = interval.tick() => {
                let snapshot = handle.snapshot();
                committed = committed.max(snapshot.downloaded_bytes.min(request.size));
                let speed = handle.speed_snapshot().bytes_per_second;
                let persist = committed != last_persisted;
                if persist {
                    update_task_progress(
                        db,
                        task.id,
                        committed as i64,
                        Some(request.size as i64),
                    )
                    .await?;
                }
                report_snapshot(app, task.id, request.size, &snapshot, committed, speed)?;
                last_persisted = committed;
                match snapshot.phase {
                    DownloadPhase::Completed => return finish_download(app, db, task.id, request.size, partial_path).await,
                    DownloadPhase::Failed => return Err(takanawa_snapshot_failure(&snapshot, handle.last_http_status(), &request.provider)),
                    DownloadPhase::Paused => return Err(TaskFailure::new("paused", "任务已暂停")),
                    DownloadPhase::Cancelled => return Err(TaskFailure::new("cancelled", "任务已取消")),
                    DownloadPhase::Created
                    | DownloadPhase::Running
                    | DownloadPhase::Pausing
                    | DownloadPhase::Cancelling
                    | DownloadPhase::Starting
                    | DownloadPhase::Allocating
                    | DownloadPhase::Verifying => {}
                }
            }
        }
    }
}

fn takanawa_runtime() -> Result<&'static Runtime, TaskFailure> {
    match TAKANAWA_RUNTIME.get_or_init(|| {
        RuntimeBuilder::new_multi_thread()
            .enable_all()
            .thread_name("reina-takanawa")
            .build()
            .map_err(|error| format!("创建 Takanawa runtime 失败: {error}"))
    }) {
        Ok(runtime) => Ok(runtime),
        Err(message) => Err(TaskFailure::new("takanawa_init_failed", message.clone())),
    }
}

fn validate_request(request: &InstallRequest) -> Result<(), TaskFailure> {
    if request
        .expires_at
        .is_some_and(|expires_at| chrono::Utc::now().timestamp() >= expires_at)
    {
        return Err(TaskFailure::new(
            "url_expired",
            format!(
                "下载直链已过期，请重新从资源提供方（{}）推送任务",
                request.provider
            ),
        ));
    }
    let url = url::Url::parse(&request.url)
        .map_err(|_| TaskFailure::new("invalid_url", "下载 URL 无效"))?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err(TaskFailure::new(
            "invalid_url",
            "下载地址仅支持具有主机名的 HTTP/HTTPS URL",
        ));
    }
    Ok(())
}

async fn existing_file_size(path: &Path) -> Result<Option<u64>, TaskFailure> {
    match tokio::fs::metadata(path).await {
        Ok(metadata) => Ok(Some(metadata.len())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(TaskFailure::new("task_file_failed", error.to_string())),
    }
}

async fn wait_for_control_completion(
    app: &tauri::AppHandle,
    db: &DatabaseConnection,
    task_id: i64,
    request: &InstallRequest,
    minimum_committed: u64,
    handle: &DownloadHandle,
    requested: TaskControl,
) -> Result<(), TaskFailure> {
    loop {
        let snapshot = handle.snapshot();
        let committed = minimum_committed.max(snapshot.downloaded_bytes.min(request.size));
        match snapshot.phase {
            DownloadPhase::Completed => {
                report_progress(app, db, task_id, request.size, request.size).await?;
                return Ok(());
            }
            DownloadPhase::Paused => {
                update_task_progress(db, task_id, committed as i64, Some(request.size as i64))
                    .await?;
                report_snapshot(app, task_id, request.size, &snapshot, committed, 0.0)?;
                return Err(TaskFailure::new("paused", "任务已暂停"));
            }
            DownloadPhase::Cancelled => {
                return Err(TaskFailure::new("cancelled", "任务已取消"));
            }
            DownloadPhase::Failed => {
                return Err(takanawa_snapshot_failure(
                    &snapshot,
                    handle.last_http_status(),
                    &request.provider,
                ));
            }
            DownloadPhase::Created
            | DownloadPhase::Running
            | DownloadPhase::Pausing
            | DownloadPhase::Cancelling
            | DownloadPhase::Starting
            | DownloadPhase::Allocating
            | DownloadPhase::Verifying => {}
        }
        if matches!(requested, TaskControl::Cancel)
            && !matches!(snapshot.phase, DownloadPhase::Cancelling)
        {
            handle.cancel().map_err(takanawa_control_failure)?;
        }
        tokio::time::sleep(CONTROL_POLL_INTERVAL).await;
    }
}

fn report_snapshot(
    app: &tauri::AppHandle,
    task_id: i64,
    expected_size: u64,
    snapshot: &DownloadSnapshot,
    committed: u64,
    bytes_per_second: f64,
) -> Result<(), TaskFailure> {
    if snapshot.content_len != 0 && snapshot.content_len != expected_size {
        return Err(TaskFailure::new(
            "size_mismatch",
            format!(
                "服务器文件大小与请求不一致：期望 {expected_size}，实际 {}",
                snapshot.content_len
            ),
        ));
    }
    let committed = committed.min(expected_size);
    emit_download_progress(
        app,
        task_id,
        committed as i64,
        expected_size as i64,
        bytes_per_second,
    );
    Ok(())
}

async fn finish_download(
    app: &tauri::AppHandle,
    db: &DatabaseConnection,
    task_id: i64,
    expected_size: u64,
    path: &Path,
) -> Result<(), TaskFailure> {
    let actual_size = existing_file_size(path)
        .await?
        .ok_or_else(|| TaskFailure::new("task_file_failed", "Takanawa 未生成下载文件"))?;
    if actual_size != expected_size {
        return Err(TaskFailure::new(
            "size_mismatch",
            format!("下载文件大小不一致：期望 {expected_size}，实际 {actual_size}"),
        ));
    }
    report_progress(app, db, task_id, actual_size, expected_size).await
}

async fn report_progress(
    app: &tauri::AppHandle,
    db: &DatabaseConnection,
    task_id: i64,
    current: u64,
    total: u64,
) -> Result<(), TaskFailure> {
    update_task_progress(db, task_id, current as i64, Some(total as i64)).await?;
    emit_progress(
        app,
        task_id,
        "running",
        Some("downloading"),
        current as i64,
        Some(total as i64),
        Some("bytes"),
    );
    Ok(())
}

fn takanawa_control_failure(error: takanawa_core::TakanawaError) -> TaskFailure {
    TaskFailure::new("takanawa_control_failed", error.to_string())
}

fn takanawa_snapshot_failure(
    snapshot: &DownloadSnapshot,
    http_status: Option<u16>,
    provider: &str,
) -> TaskFailure {
    if is_expired_http_status(http_status) {
        return TaskFailure::new(
            "url_expired",
            format!("下载直链已过期，请重新从资源提供方（{provider}）推送任务"),
        );
    }
    TaskFailure::new(
        "takanawa_download_failed",
        snapshot
            .last_error
            .clone()
            .unwrap_or_else(|| "Takanawa 下载失败".to_string()),
    )
}

fn is_expired_http_status(status: Option<u16>) -> bool {
    matches!(status, Some(401 | 403))
}

pub(crate) async fn verify_file(path: PathBuf, request: InstallRequest) -> Result<(), TaskFailure> {
    tokio::task::spawn_blocking(move || {
        let metadata = std::fs::metadata(&path)
            .map_err(|error| TaskFailure::new("verify_failed", error.to_string()))?;
        if metadata.len() != request.size {
            return Err(TaskFailure::new(
                "size_mismatch",
                format!(
                    "文件大小校验失败：期望 {}，实际 {}",
                    request.size,
                    metadata.len()
                ),
            ));
        }

        let file = StdFile::open(&path)
            .map_err(|error| TaskFailure::new("verify_failed", error.to_string()))?;
        let mut reader = BufReader::with_capacity(1024 * 1024, file);
        let mut buffer = vec![0_u8; 1024 * 1024];
        let actual = match request.checksum_algo.as_str() {
            "sha256" => {
                let mut hasher = Sha256::new();
                loop {
                    let read = reader
                        .read(&mut buffer)
                        .map_err(|error| TaskFailure::new("verify_failed", error.to_string()))?;
                    if read == 0 {
                        break;
                    }
                    hasher.update(&buffer[..read]);
                }
                format!("{:x}", hasher.finalize())
            }
            "blake3" => {
                let mut hasher = blake3::Hasher::new();
                loop {
                    let read = reader
                        .read(&mut buffer)
                        .map_err(|error| TaskFailure::new("verify_failed", error.to_string()))?;
                    if read == 0 {
                        break;
                    }
                    hasher.update(&buffer[..read]);
                }
                hasher.finalize().to_hex().to_string()
            }
            _ => {
                return Err(TaskFailure::new("unsupported_checksum", "不支持的校验算法"));
            }
        };
        if actual != request.checksum {
            return Err(TaskFailure::new(
                "checksum_mismatch",
                "下载文件哈希校验失败",
            ));
        }
        Ok(())
    })
    .await
    .map_err(|error| TaskFailure::new("verify_task_failed", error.to_string()))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recognizes_expired_download_responses() {
        assert!(is_expired_http_status(Some(401)));
        assert!(is_expired_http_status(Some(403)));
        assert!(!is_expired_http_status(Some(200)));
        assert!(!is_expired_http_status(None));
    }
}
