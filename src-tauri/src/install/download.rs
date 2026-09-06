use super::{
    persistence::{
        check_task_control, emit_download_progress, emit_progress, update_task_progress,
    },
    types::{TaskControl, TaskFailure},
};
use crate::entity::tasks;
use crate::install::protocol::InstallRequest;
use crate::utils::http::get_transfer_client;
use reina_download::{
    CancellationToken, DownloadError, DownloadOptions, DownloadRequest, Outcome, Phase, Progress,
    SharedBudget,
};
use sea_orm::DatabaseConnection;
use sha2::{Digest, Sha256};
use std::fs::File as StdFile;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::pin::pin;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::sync::watch;

/// 全局连接预算：所有并行下载任务加起来的在飞连接上限。
/// 单任务上限由 `DownloadOptions::max_connections` 决定。
const GLOBAL_CONNECTION_BUDGET: usize = 16;
const PROGRESS_REPORT_INTERVAL: Duration = Duration::from_millis(500);

fn download_budget() -> &'static SharedBudget {
    static BUDGET: OnceLock<SharedBudget> = OnceLock::new();
    BUDGET.get_or_init(|| SharedBudget::new(GLOBAL_CONNECTION_BUDGET))
}

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
    remove_legacy_artifacts(partial_path).await;

    let download_request = DownloadRequest {
        url: request.url.clone(),
        target: partial_path.to_path_buf(),
        expected_size: request.size,
        identity: match (
            request.checksum_algo.as_deref(),
            request.checksum.as_deref(),
        ) {
            (Some(algo), Some(checksum)) => Some(format!("{algo}:{checksum}")),
            _ => None,
        },
    };
    let options = DownloadOptions {
        budget: Some(download_budget().clone()),
        ..DownloadOptions::default()
    };
    let (progress_sender, progress_receiver) = watch::channel(Progress::initial());
    let cancel_token = CancellationToken::new();
    let mut engine = pin!(reina_download::download(
        download_request,
        options,
        get_transfer_client(),
        progress_sender,
        cancel_token.clone(),
    ));

    let mut interval = tokio::time::interval(PROGRESS_REPORT_INTERVAL);
    interval.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
    let mut last_persisted = u64::try_from(task.progress_current).unwrap_or(0);
    // 引擎收到取消信号前最后一次收到的控制请求；watch 通道关闭视为取消。
    let mut requested = TaskControl::Running;
    let outcome = loop {
        tokio::select! {
            result = &mut engine => break result,
            changed = control.changed() => {
                let next = if changed.is_err() {
                    TaskControl::Cancel
                } else {
                    *control.borrow()
                };
                if !matches!(next, TaskControl::Running) {
                    requested = next;
                    cancel_token.cancel();
                }
            }
            _ = interval.tick() => {
                let progress = *progress_receiver.borrow();
                persist_and_emit(app, db, task.id, request, &progress, &mut last_persisted)
                    .await?;
            }
        }
    };

    let progress = *progress_receiver.borrow();
    match outcome {
        Ok(Outcome::Completed) => {
            update_task_progress(db, task.id, request.size as i64, Some(request.size as i64))
                .await?;
            emit_progress(
                app,
                task.id,
                "running",
                Some("downloading"),
                request.size as i64,
                Some(request.size as i64),
                Some("bytes"),
            );
            Ok(())
        }
        Ok(Outcome::Cancelled) => {
            // 引擎已完成最后一次落盘提交；把提交水位写库后再转为暂停/取消。
            let committed = progress.committed.min(request.size);
            update_task_progress(db, task.id, committed as i64, Some(request.size as i64)).await?;
            emit_download_progress(
                app,
                task.id,
                committed as i64,
                request.size as i64,
                0.0,
                i64::try_from(progress.written).unwrap_or(i64::MAX),
            );
            match requested {
                TaskControl::Pause => Err(TaskFailure::new("paused", "任务已暂停")),
                _ => Err(TaskFailure::new("cancelled", "任务已取消")),
            }
        }
        Err(error) => {
            // 映射成用户文案前先记录原始错误类别，保留排查线索。
            log::error!(
                "下载失败 task_id={} kind={} status={:?}: {error}",
                task.id,
                error.kind(),
                error.http_status(),
            );
            Err(map_download_error(&error, &request.provider))
        }
    }
}

async fn persist_and_emit(
    app: &tauri::AppHandle,
    db: &DatabaseConnection,
    task_id: i64,
    request: &InstallRequest,
    progress: &Progress,
    last_persisted: &mut u64,
) -> Result<(), TaskFailure> {
    // 探测完成前引擎还没读取控制文件，此时的 0 不能覆盖续传任务的已有进度。
    if matches!(progress.phase, Phase::Probing) {
        return Ok(());
    }
    let committed = progress.committed.min(request.size);
    if committed != *last_persisted {
        update_task_progress(db, task_id, committed as i64, Some(request.size as i64)).await?;
        *last_persisted = committed;
    }
    emit_download_progress(
        app,
        task_id,
        committed as i64,
        request.size as i64,
        progress.speed_bps,
        i64::try_from(progress.written.min(request.size)).unwrap_or(i64::MAX),
    );
    Ok(())
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

/// 清理旧版 Takanawa 下载器遗留的临时文件；新引擎不认识这些文件。
async fn remove_legacy_artifacts(partial_path: &Path) {
    for suffix in [".part", ".part.lock"] {
        let mut value = partial_path.as_os_str().to_owned();
        value.push(suffix);
        let path = PathBuf::from(value);
        match tokio::fs::remove_file(&path).await {
            Ok(()) => log::info!("已清理旧下载器临时文件: {}", path.display()),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                log::warn!("清理旧下载器临时文件失败 {}: {error}", path.display());
            }
        }
    }
}

fn map_download_error(error: &DownloadError, provider: &str) -> TaskFailure {
    match error.http_status() {
        Some(401) => {
            return TaskFailure::new(
                "download_authorization_failed",
                format!("下载授权已失效，请重新从资源提供方（{provider}）推送任务"),
            );
        }
        Some(403) => {
            return TaskFailure::new("download_request_forbidden", "下载请求被服务器拒绝");
        }
        Some(429) => {
            return TaskFailure::new(
                "download_rate_limited",
                "下载请求受到服务器限流，请稍后重试",
            );
        }
        Some(502..=504) => {
            return TaskFailure::new(
                "download_server_unavailable",
                "下载服务器暂时不可用，请稍后重试",
            );
        }
        Some(_) | None => {}
    }
    match error {
        DownloadError::SizeMismatch { expected, actual } => TaskFailure::new(
            "size_mismatch",
            format!("服务器文件大小与请求不一致：期望 {expected}，实际 {actual}"),
        ),
        DownloadError::TargetConflict(path) => TaskFailure::new(
            "download_target_conflict",
            format!(
                "下载目标位置已有无法识别的文件，请清理后重试: {}",
                path.display()
            ),
        ),
        DownloadError::Disk(disk_error) => {
            TaskFailure::new("task_file_failed", disk_error.to_string())
        }
        DownloadError::InvalidConfig(detail) => TaskFailure::new("invalid_payload", detail.clone()),
        other => TaskFailure::new("download_failed", other.to_string()),
    }
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

        let (checksum_algo, expected_checksum) = match (
            request.checksum_algo.as_deref(),
            request.checksum.as_deref(),
        ) {
            (Some(checksum_algo), Some(checksum)) => (checksum_algo, checksum),
            (None, None) => return Ok(()),
            _ => {
                return Err(TaskFailure::new(
                    "invalid_checksum",
                    "校验算法与校验值必须同时提供",
                ));
            }
        };

        let file = StdFile::open(&path)
            .map_err(|error| TaskFailure::new("verify_failed", error.to_string()))?;
        let mut reader = BufReader::with_capacity(1024 * 1024, file);
        let mut buffer = vec![0_u8; 1024 * 1024];
        let actual = match checksum_algo {
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
                hasher
                    .finalize()
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect::<String>()
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
        if actual != expected_checksum {
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

    fn request_for_size(size: u64) -> InstallRequest {
        InstallRequest {
            v: 1,
            provider: "self-hosted".to_string(),
            resource_id: "test-resource".to_string(),
            url: "https://example.com/game.zip".to_string(),
            file_name: "game.zip".to_string(),
            archive_format: "zip".to_string(),
            archive_password: None,
            size,
            checksum_algo: None,
            checksum: None,
            expires_at: None,
            bgm_id: None,
            vndb_id: None,
            hikarinagi_id: None,
            title: "Test Game".to_string(),
        }
    }

    #[test]
    fn classifies_terminal_download_http_statuses() {
        let http = |status: u16, retryable: bool| DownloadError::Http { status, retryable };
        assert_eq!(
            map_download_error(&http(401, false), "sena-repo").code,
            "download_authorization_failed"
        );
        assert_eq!(
            map_download_error(&http(403, false), "sena-repo").code,
            "download_request_forbidden"
        );
        assert_eq!(
            map_download_error(&http(429, true), "sena-repo").code,
            "download_rate_limited"
        );
        for status in [502, 503, 504] {
            assert_eq!(
                map_download_error(&http(status, true), "sena-repo").code,
                "download_server_unavailable"
            );
        }
        // 状态透过重试耗尽错误也要被识别。
        let exhausted = DownloadError::RetriesExhausted {
            attempts: 21,
            last: Box::new(http(429, true)),
        };
        assert_eq!(
            map_download_error(&exhausted, "sena-repo").code,
            "download_rate_limited"
        );
        assert_eq!(
            map_download_error(&http(500, true), "sena-repo").code,
            "download_failed"
        );
    }

    #[test]
    fn maps_non_http_errors() {
        assert_eq!(
            map_download_error(
                &DownloadError::SizeMismatch {
                    expected: 10,
                    actual: 9
                },
                "p"
            )
            .code,
            "size_mismatch"
        );
        assert_eq!(
            map_download_error(&DownloadError::TargetConflict(PathBuf::from("/tmp/x")), "p").code,
            "download_target_conflict"
        );
        assert_eq!(
            map_download_error(&DownloadError::Disk(std::io::Error::other("boom")), "p").code,
            "task_file_failed"
        );
    }

    #[tokio::test]
    async fn verifies_size_when_checksum_is_absent() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
        let size = std::fs::metadata(&path).unwrap().len();

        verify_file(path, request_for_size(size)).await.unwrap();
    }

    #[tokio::test]
    async fn rejects_size_mismatch_when_checksum_is_absent() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
        let size = std::fs::metadata(&path).unwrap().len();

        let failure = verify_file(path, request_for_size(size + 1))
            .await
            .unwrap_err();
        assert_eq!(failure.code, "size_mismatch");
    }

    #[tokio::test]
    async fn verifies_sha256_when_checksum_is_present() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
        let contents = std::fs::read(&path).unwrap();
        let checksum = Sha256::digest(&contents)
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        let mut request = request_for_size(contents.len() as u64);
        request.checksum_algo = Some("sha256".to_string());
        request.checksum = Some(checksum);

        verify_file(path, request).await.unwrap();
    }

    #[tokio::test]
    async fn rejects_checksum_mismatch() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
        let size = std::fs::metadata(&path).unwrap().len();
        let mut request = request_for_size(size);
        request.checksum_algo = Some("sha256".to_string());
        request.checksum = Some("0".repeat(64));

        let failure = verify_file(path, request).await.unwrap_err();
        assert_eq!(failure.code, "checksum_mismatch");
    }
}
