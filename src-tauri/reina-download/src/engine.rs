//! 下载编排：探测、分片调度、提交器、收尾。

use std::collections::VecDeque;
use std::fs::File;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::{Duration, Instant, SystemTime};

use reqwest::header::{ETAG, LAST_MODIFIED, RANGE};
use reqwest::{Client, StatusCode};
use tokio::sync::watch;
use tokio::task::JoinSet;
use tokio_util::sync::CancellationToken;

use crate::control::{ControlFile, control_path, piece_len};
use crate::error::{DownloadError, map_reqwest};
use crate::fsx;
use crate::http;
use crate::limiter::{Adaptive, Gate};
use crate::progress::{Phase, Progress, Shared};
use crate::types::{DownloadOptions, DownloadRequest, Outcome};

const BASE_BACKOFF: Duration = Duration::from_millis(500);
const MAX_BACKOFF: Duration = Duration::from_secs(30);

/// 把 `request.url` 下载到 `request.target`，存在控制文件时自动续传。
///
/// 取消以 `Ok(Outcome::Cancelled)` 返回，不算错误；契约详见 crate 文档。
pub async fn download(
    request: DownloadRequest,
    options: DownloadOptions,
    client: Client,
    progress: watch::Sender<Progress>,
    cancel: CancellationToken,
) -> Result<Outcome, DownloadError> {
    options.validate()?;
    let control_file_path = control_path(&request.target);

    // 无控制文件的目标要么是已完成的下载，要么是不能动的外来文件；
    // 控制文件损坏仍算"下载进行过"，直接重新开始。
    let control_file_exists = control_file_path.exists();
    let existing_control = match ControlFile::load(&control_file_path) {
        Ok(existing) => existing,
        Err(error) => {
            log::warn!("discarding unreadable control file: {error}");
            None
        }
    };
    if !control_file_exists {
        if let Ok(metadata) = std::fs::metadata(&request.target) {
            if metadata.len() == request.expected_size {
                return Ok(Outcome::Completed);
            }
            return Err(DownloadError::TargetConflict(request.target.clone()));
        }
    }

    let shared = Arc::new(Shared::new());
    shared.set_total(request.expected_size);
    let emitter = spawn_emitter(
        Arc::clone(&shared),
        progress.clone(),
        options.progress_interval,
    );
    let result = run(
        &request,
        &options,
        &client,
        Arc::clone(&shared),
        existing_control,
        &control_file_path,
        &cancel,
    )
    .await;

    match &result {
        Ok(Outcome::Completed) => shared.set_phase(Phase::Done),
        Ok(Outcome::Cancelled) => shared.set_phase(Phase::Cancelled),
        Err(_) => {}
    }
    emitter.abort();
    let _ = progress.send(shared.snapshot(0.0));
    result
}

#[allow(clippy::too_many_lines)]
async fn run(
    request: &DownloadRequest,
    options: &DownloadOptions,
    client: &Client,
    shared: Arc<Shared>,
    existing_control: Option<ControlFile>,
    control_file_path: &std::path::Path,
    cancel: &CancellationToken,
) -> Result<Outcome, DownloadError> {
    // 探测。
    shared.set_phase(Phase::Probing);
    let probe = tokio::select! {
        biased;
        () = cancel.cancelled() => return Ok(Outcome::Cancelled),
        probe = probe_with_retry(client, &request.url, options, &shared) => probe?,
    };
    // 部分源站只在首个请求上忽略 Range；短暂等待后复测一次，尽量避免进入单流。
    let probe = if probe.range_supported {
        probe
    } else {
        tokio::select! {
            biased;
            () = cancel.cancelled() => return Ok(Outcome::Cancelled),
            () = tokio::time::sleep(options.range_confirm_delay) => {}
        }
        match self::probe(client, &request.url).await.ok() {
            Some(second)
                if second.range_supported
                    && (probe.total.is_none() || second.total == probe.total) =>
            {
                second
            }
            _ => probe,
        }
    };
    if let Some(total) = probe.total {
        if total != request.expected_size {
            return Err(DownloadError::SizeMismatch {
                expected: request.expected_size,
                actual: total,
            });
        }
    }
    let size = request.expected_size;

    // 用服务器当前报告的信息核对既有状态。
    let mut control = reconcile(existing_control, request, &probe, options.piece_size, size);
    if !probe.range_supported {
        // 忽略 Range 的服务器无法续传半成品。
        control.pieces.iter_mut().for_each(|written| *written = 0);
    }

    // 先建目标文件并落控制文件再收字节，保证"有目标无控制文件"恒等于下载完成。
    let target_path = request.target.clone();
    let file = tokio::task::spawn_blocking(move || fsx::open_target(&target_path, size, true))
        .await
        .map_err(join_error)??;
    let file = Arc::new(file);
    control.save(control_file_path)?;

    let pieces: Arc<Vec<AtomicU64>> = Arc::new(
        control
            .pieces
            .iter()
            .map(|written| AtomicU64::new(*written))
            .collect(),
    );
    let already = control.written_total();
    shared.written.store(already, Ordering::Relaxed);
    shared.committed.store(already, Ordering::Relaxed);

    if size == 0 || control.is_complete() {
        return finalize(&shared, &file, control_file_path)
            .await
            .map(|()| Outcome::Completed);
    }

    let committer = Committer {
        file: Arc::clone(&file),
        pieces: Arc::clone(&pieces),
        template: control,
        path: control_file_path.to_path_buf(),
        shared: Arc::clone(&shared),
    };
    // 提交器不能被 abort：进入阻塞线程池的 fsync/写控制文件无法取消，会与
    // 最终提交并发写同一个临时文件。用独立信号让它在两次提交之间自行退出。
    let committer_shutdown = CancellationToken::new();
    let committer_task = spawn_committer(
        committer.clone(),
        options.commit_interval,
        committer_shutdown.clone(),
    );

    let outcome = if probe.range_supported {
        shared.set_phase(Phase::Downloading);
        run_segmented(
            request, options, client, &shared, &pieces, &file, size, cancel,
        )
        .await
    } else {
        shared.set_phase(Phase::SingleStream);
        match run_single_stream(
            request, options, client, &shared, &pieces, &file, size, cancel,
        )
        .await
        {
            Ok(StreamEnd::Upgraded) => {
                shared.set_phase(Phase::Downloading);
                run_segmented(
                    request, options, client, &shared, &pieces, &file, size, cancel,
                )
                .await
            }
            Ok(StreamEnd::Completed) => Ok(Outcome::Completed),
            Ok(StreamEnd::Cancelled) => Ok(Outcome::Cancelled),
            Err(error) => Err(error),
        }
    };

    // 停掉周期提交器后必做一次最终落盘提交，暂停/取消/出错最多损失页缓存。
    committer_shutdown.cancel();
    let _ = committer_task.await;
    let commit_result = committer.commit().await;

    match outcome {
        Ok(Outcome::Completed) => {
            commit_result?;
            finalize(&shared, &file, control_file_path).await?;
            Ok(Outcome::Completed)
        }
        Ok(Outcome::Cancelled) => {
            commit_result?;
            Ok(Outcome::Cancelled)
        }
        Err(error) => Err(error),
    }
}

// ---------------------------------------------------------------------------
// 探测

#[derive(Debug, Clone)]
struct ProbeResult {
    total: Option<u64>,
    range_supported: bool,
    etag: Option<String>,
    last_modified: Option<String>,
}

/// 探测失败可重试（429、5xx、传输错误）时按与分片一致的退避策略重试。
async fn probe_with_retry(
    client: &Client,
    url: &str,
    options: &DownloadOptions,
    shared: &Arc<Shared>,
) -> Result<ProbeResult, DownloadError> {
    const PROBE_ATTEMPTS: u32 = 5;
    let mut attempt = 0u32;
    loop {
        match probe(client, url).await {
            Ok(result) => return Ok(result),
            Err(error) if error.is_retryable() && attempt + 1 < PROBE_ATTEMPTS => {
                attempt += 1;
                shared.retries.fetch_add(1, Ordering::Relaxed);
                log::debug!("probe attempt {attempt} failed, retrying: {error}");
                tokio::time::sleep(backoff(attempt).min(options.stall_timeout)).await;
            }
            Err(error) => return Err(error),
        }
    }
}

async fn probe(client: &Client, url: &str) -> Result<ProbeResult, DownloadError> {
    let response = client
        .get(url)
        .header(RANGE, "bytes=0-0")
        .send()
        .await
        .map_err(|error| map_reqwest(&error))?;
    let status = response.status();
    let headers = response.headers().clone();
    let etag = http::header_string(&headers, ETAG);
    let last_modified = http::header_string(&headers, LAST_MODIFIED);

    if status == StatusCode::PARTIAL_CONTENT {
        http::ensure_identity(&headers)?;
        let range = http::content_range(&headers)?
            .ok_or_else(|| DownloadError::Protocol("206 without Content-Range".into()))?;
        return Ok(ProbeResult {
            total: range.total,
            range_supported: true,
            etag,
            last_modified,
        });
    }
    if status == StatusCode::OK {
        // 服务器忽略了 Range：回退单流。
        http::ensure_identity(&headers)?;
        let total = http::content_length(&headers)?;
        return Ok(ProbeResult {
            total,
            range_supported: false,
            etag,
            last_modified,
        });
    }
    if status == StatusCode::RANGE_NOT_SATISFIABLE {
        let value = headers
            .get(reqwest::header::CONTENT_RANGE)
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| DownloadError::Protocol("416 without Content-Range".into()))?;
        let total = http::parse_unsatisfied_total(value)?;
        return Ok(ProbeResult {
            total: Some(total),
            range_supported: true,
            etag,
            last_modified,
        });
    }
    Err(http::status_error(status))
}

fn reconcile(
    existing: Option<ControlFile>,
    request: &DownloadRequest,
    probe: &ProbeResult,
    piece_size: u64,
    size: u64,
) -> ControlFile {
    let fresh = || {
        ControlFile::new(
            size,
            piece_size,
            request.identity.clone(),
            probe.etag.clone(),
            probe.last_modified.clone(),
        )
    };
    let Some(control) = existing else {
        return fresh();
    };
    if control.size != size || control.piece_size != piece_size {
        log::info!("discarding control file: geometry changed");
        return fresh();
    }
    if let (Some(ours), Some(theirs)) = (&request.identity, &control.identity) {
        if ours == theirs {
            // 声明的内容一致：CDN 各节点 ETag 漂移可以容忍，最终哈希由调用方兜底。
            return control;
        }
        log::info!("discarding control file: content identity changed");
        return fresh();
    }
    // 没有校验和兜底，validators 是唯一防线。
    let etag_matches = match (&control.etag, &probe.etag) {
        (Some(stored), Some(current)) => stored == current,
        _ => true,
    };
    let modified_matches = match (&control.last_modified, &probe.last_modified) {
        (Some(stored), Some(current)) => stored == current,
        _ => true,
    };
    if etag_matches && modified_matches {
        control
    } else {
        log::info!("discarding control file: remote validators changed");
        fresh()
    }
}

// ---------------------------------------------------------------------------
// 分段模式

struct WorkerReport {
    index: u64,
    attempt: u32,
    result: Result<(), WorkerFail>,
}

struct WorkerFail {
    error: DownloadError,
    rate_limited: bool,
    retry_after: Option<Duration>,
    attempt_started: Instant,
}

#[allow(clippy::too_many_arguments)]
async fn run_segmented(
    request: &DownloadRequest,
    options: &DownloadOptions,
    client: &Client,
    shared: &Arc<Shared>,
    pieces: &Arc<Vec<AtomicU64>>,
    file: &Arc<File>,
    size: u64,
    cancel: &CancellationToken,
) -> Result<Outcome, DownloadError> {
    let adaptive = Arc::new(Adaptive::new(
        options.min_connections,
        options.clamped_initial(),
        options.max_connections,
        options.grow_after_successes,
    ));
    let budget: Option<Gate> = options.budget.as_ref().map(|budget| budget.0.clone());
    let mut pending: VecDeque<(u64, u32)> = (0..pieces.len() as u64)
        .filter(|index| {
            pieces[usize::try_from(*index).expect("piece index fits usize")].load(Ordering::Relaxed)
                < piece_len(size, options.piece_size, *index)
        })
        .map(|index| (index, 0))
        .collect();
    let mut tasks: JoinSet<WorkerReport> = JoinSet::new();
    let mut consecutive_failures = 0u32;

    let outcome = loop {
        if cancel.is_cancelled() {
            break Ok(Outcome::Cancelled);
        }
        while tasks.len() < adaptive.current() {
            let Some((index, attempt)) = pending.pop_front() else {
                break;
            };
            tasks.spawn(piece_worker(
                client.clone(),
                request.url.clone(),
                Arc::clone(file),
                Arc::clone(pieces),
                Arc::clone(shared),
                Arc::clone(&adaptive),
                budget.clone(),
                cancel.clone(),
                options.piece_size,
                size,
                index,
                attempt,
                options.stall_timeout,
            ));
        }
        shared.connections.store(tasks.len(), Ordering::Relaxed);
        if tasks.is_empty() {
            if pending.is_empty() {
                break Ok(Outcome::Completed);
            }
            // 目标在两次循环间缩小到低于排队量，稍等再看。
            tokio::time::sleep(Duration::from_millis(10)).await;
            continue;
        }

        let joined = tokio::select! {
            biased;
            () = cancel.cancelled() => break Ok(Outcome::Cancelled),
            joined = tasks.join_next() => joined,
        };
        let Some(joined) = joined else { continue };
        let report = joined.map_err(join_error)?;
        match report.result {
            Ok(()) => {
                adaptive.on_success();
                consecutive_failures = 0;
            }
            Err(fail) => {
                if !fail.error.is_retryable() {
                    break Err(fail.error);
                }
                shared.retries.fetch_add(1, Ordering::Relaxed);
                consecutive_failures += 1;
                if consecutive_failures > options.max_consecutive_failures {
                    break Err(DownloadError::RetriesExhausted {
                        attempts: consecutive_failures,
                        last: Box::new(fail.error),
                    });
                }
                if fail.rate_limited {
                    adaptive.on_rate_limited(
                        fail.attempt_started,
                        fail.retry_after.unwrap_or(BASE_BACKOFF),
                    );
                } else {
                    log::debug!(
                        "piece {} attempt {} failed, requeueing: {}",
                        report.index,
                        report.attempt + 1,
                        fail.error
                    );
                }
                pending.push_back((report.index, report.attempt + 1));
            }
        }
    };

    tasks.shutdown().await;
    outcome
}

#[allow(clippy::too_many_arguments)]
async fn piece_worker(
    client: Client,
    url: String,
    file: Arc<File>,
    pieces: Arc<Vec<AtomicU64>>,
    shared: Arc<Shared>,
    adaptive: Arc<Adaptive>,
    budget: Option<Gate>,
    cancel: CancellationToken,
    piece_size: u64,
    size: u64,
    index: u64,
    attempt: u32,
    stall_timeout: Duration,
) -> WorkerReport {
    let report = |result| WorkerReport {
        index,
        attempt,
        result,
    };
    let cancelled = || {
        report(Err(WorkerFail {
            error: DownloadError::Network("cancelled".into()),
            rate_limited: false,
            retry_after: None,
            attempt_started: Instant::now(),
        }))
    };

    // 依次等待：重试退避、全局限流暂停、连接预算。
    let delay = backoff(attempt).max(adaptive.remaining_pause());
    if !delay.is_zero() {
        tokio::select! {
            biased;
            () = cancel.cancelled() => return cancelled(),
            () = tokio::time::sleep(delay) => {}
        }
    }
    let _permit = match &budget {
        Some(gate) => match gate.acquire(&cancel).await {
            Some(permit) => Some(permit),
            None => return cancelled(),
        },
        None => None,
    };

    let attempt_started = Instant::now();
    let result = fetch_piece(
        &client,
        &url,
        &file,
        &pieces,
        &shared,
        &cancel,
        piece_size,
        size,
        index,
        stall_timeout,
        attempt_started,
    )
    .await;
    report(result)
}

#[allow(clippy::too_many_arguments)]
async fn fetch_piece(
    client: &Client,
    url: &str,
    file: &Arc<File>,
    pieces: &Arc<Vec<AtomicU64>>,
    shared: &Arc<Shared>,
    cancel: &CancellationToken,
    piece_size: u64,
    size: u64,
    index: u64,
    stall_timeout: Duration,
    attempt_started: Instant,
) -> Result<(), WorkerFail> {
    let fail = |error: DownloadError, rate_limited, retry_after| WorkerFail {
        error,
        rate_limited,
        retry_after,
        attempt_started,
    };
    let plain = |error: DownloadError| fail(error, false, None);

    let slot = &pieces[usize::try_from(index).expect("piece index fits usize")];
    let piece_start = index * piece_size;
    let len = piece_len(size, piece_size, index);
    let already = slot.load(Ordering::Relaxed);
    if already >= len {
        return Ok(());
    }
    let range_start = piece_start + already;
    let range_end = piece_start + len - 1;

    let response = client
        .get(url)
        .header(RANGE, format!("bytes={range_start}-{range_end}"))
        .send()
        .await
        .map_err(|error| plain(map_reqwest(&error)))?;
    let status = response.status();
    if status != StatusCode::PARTIAL_CONTENT {
        let retry_after = http::retry_after(response.headers(), SystemTime::now());
        let error = if status == StatusCode::OK {
            DownloadError::Protocol("server stopped honoring range requests".into())
        } else {
            http::status_error(status)
        };
        let rate_limited = status == StatusCode::TOO_MANY_REQUESTS;
        return Err(fail(error, rate_limited, retry_after));
    }
    http::ensure_identity(response.headers()).map_err(&plain)?;
    let range = http::content_range(response.headers())
        .map_err(&plain)?
        .ok_or_else(|| plain(DownloadError::Protocol("206 without Content-Range".into())))?;
    if range.start != range_start || range.end != range_end {
        return Err(plain(DownloadError::Protocol(format!(
            "Content-Range mismatch: asked {range_start}-{range_end}, got {}-{}",
            range.start, range.end
        ))));
    }
    if let Some(length) = http::content_length(response.headers()).map_err(&plain)? {
        if length != len - already {
            return Err(plain(DownloadError::Protocol(format!(
                "Content-Length mismatch for piece {index}: expected {}, got {length}",
                len - already
            ))));
        }
    }

    let mut response = response;
    let mut written = already;
    loop {
        if cancel.is_cancelled() {
            // 报告为可重试的网络中断；外层循环看到取消令牌，不会真正重排。
            return Err(plain(DownloadError::Network("cancelled".into())));
        }
        let chunk = tokio::select! {
            biased;
            () = cancel.cancelled() => return Err(plain(DownloadError::Network("cancelled".into()))),
            chunk = tokio::time::timeout(stall_timeout, response.chunk()) => match chunk {
                Err(_) => {
                    return Err(plain(DownloadError::Network(format!(
                        "no data for {} s on piece {index}",
                        stall_timeout.as_secs()
                    ))));
                }
                Ok(result) => result.map_err(|error| plain(map_reqwest(&error)))?,
            },
        };
        let Some(chunk) = chunk else { break };
        if chunk.is_empty() {
            continue;
        }
        let chunk_len = chunk.len() as u64;
        if written + chunk_len > len {
            return Err(plain(DownloadError::Protocol(format!(
                "piece {index} body exceeded {len} bytes"
            ))));
        }
        let offset = piece_start + written;
        let write_file = Arc::clone(file);
        tokio::task::spawn_blocking(move || fsx::write_all_at(&write_file, offset, &chunk))
            .await
            .map_err(|error| plain(join_error(error)))?
            .map_err(|error| plain(DownloadError::Disk(error)))?;
        written += chunk_len;
        slot.store(written, Ordering::Relaxed);
        shared.written.fetch_add(chunk_len, Ordering::Relaxed);
    }
    if written != len {
        return Err(plain(DownloadError::Network(format!(
            "piece {index} ended early: {written} of {len} bytes"
        ))));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// 单流回退

enum StreamEnd {
    Completed,
    Cancelled,
    /// 探测到服务器已支持 Range，应切换到分段模式继续。
    Upgraded,
}

#[allow(clippy::too_many_arguments)]
async fn run_single_stream(
    request: &DownloadRequest,
    options: &DownloadOptions,
    client: &Client,
    shared: &Arc<Shared>,
    pieces: &Arc<Vec<AtomicU64>>,
    file: &Arc<File>,
    size: u64,
    cancel: &CancellationToken,
) -> Result<StreamEnd, DownloadError> {
    shared.connections.store(1, Ordering::Relaxed);
    // 后台定期重探 Range 支持；单流进度按分片记录，升级时可无损衔接。
    let upgrade = Arc::new(AtomicBool::new(false));
    let prober = spawn_upgrade_prober(
        client.clone(),
        request.url.clone(),
        options.upgrade_probe_interval,
        cancel.clone(),
        Arc::clone(&upgrade),
    );
    let end = run_single_stream_inner(
        request, options, client, shared, pieces, file, size, cancel, &upgrade,
    )
    .await;
    prober.abort();
    end
}

#[allow(clippy::too_many_arguments)]
async fn run_single_stream_inner(
    request: &DownloadRequest,
    options: &DownloadOptions,
    client: &Client,
    shared: &Arc<Shared>,
    pieces: &Arc<Vec<AtomicU64>>,
    file: &Arc<File>,
    size: u64,
    cancel: &CancellationToken,
    upgrade: &Arc<AtomicBool>,
) -> Result<StreamEnd, DownloadError> {
    let mut attempt = 0u32;
    loop {
        if cancel.is_cancelled() {
            return Ok(StreamEnd::Cancelled);
        }
        if upgrade.load(Ordering::Relaxed) {
            return Ok(StreamEnd::Upgraded);
        }
        if attempt > 0 {
            let delay = backoff(attempt);
            tokio::select! {
                biased;
                () = cancel.cancelled() => return Ok(StreamEnd::Cancelled),
                () = tokio::time::sleep(delay) => {}
            }
        }
        match stream_once(
            request, options, client, shared, pieces, file, size, cancel, upgrade,
        )
        .await
        {
            Ok(StreamPass::Complete) => return Ok(StreamEnd::Completed),
            Ok(StreamPass::Cancelled) => return Ok(StreamEnd::Cancelled),
            Ok(StreamPass::Upgrade) => return Ok(StreamEnd::Upgraded),
            Err(error) if error.is_retryable() => {
                shared.retries.fetch_add(1, Ordering::Relaxed);
                attempt += 1;
                if attempt > options.max_consecutive_failures {
                    return Err(DownloadError::RetriesExhausted {
                        attempts: attempt,
                        last: Box::new(error),
                    });
                }
                // 已支持 Range 就不必从零重来，直接升级续传。
                if upgrade.load(Ordering::Relaxed) {
                    return Ok(StreamEnd::Upgraded);
                }
                // 从零重来：服务器不认 Range。
                for slot in pieces.iter() {
                    slot.store(0, Ordering::Relaxed);
                }
                shared.written.store(0, Ordering::Relaxed);
                log::warn!("single-stream download restarting (attempt {attempt}): {error}");
            }
            Err(error) => return Err(error),
        }
    }
}

enum StreamPass {
    Complete,
    Cancelled,
    Upgrade,
}

/// 完整跑一遍单流下载。
#[allow(clippy::too_many_arguments)]
async fn stream_once(
    request: &DownloadRequest,
    options: &DownloadOptions,
    client: &Client,
    shared: &Arc<Shared>,
    pieces: &Arc<Vec<AtomicU64>>,
    file: &Arc<File>,
    size: u64,
    cancel: &CancellationToken,
    upgrade: &Arc<AtomicBool>,
) -> Result<StreamPass, DownloadError> {
    let response = client
        .get(&request.url)
        .send()
        .await
        .map_err(|error| map_reqwest(&error))?;
    let status = response.status();
    if status != StatusCode::OK {
        return Err(http::status_error(status));
    }
    http::ensure_identity(response.headers())?;
    if let Some(length) = http::content_length(response.headers())? {
        if length != size {
            return Err(DownloadError::SizeMismatch {
                expected: size,
                actual: length,
            });
        }
    }

    let mut response = response;
    let mut absolute = 0u64;
    loop {
        let chunk = tokio::select! {
            biased;
            () = cancel.cancelled() => return Ok(StreamPass::Cancelled),
            chunk = tokio::time::timeout(options.stall_timeout, response.chunk()) => match chunk {
                Err(_) => return Err(DownloadError::Network("single stream stalled".into())),
                Ok(result) => result.map_err(|error| map_reqwest(&error))?,
            },
        };
        let Some(chunk) = chunk else { break };
        if chunk.is_empty() {
            continue;
        }
        let chunk_len = chunk.len() as u64;
        if absolute + chunk_len > size {
            return Err(DownloadError::Protocol(
                "body exceeded expected size".into(),
            ));
        }
        let offset = absolute;
        let write_file = Arc::clone(file);
        tokio::task::spawn_blocking(move || fsx::write_all_at(&write_file, offset, &chunk))
            .await
            .map_err(join_error)?
            .map_err(DownloadError::Disk)?;
        absolute += chunk_len;
        shared.written.store(absolute, Ordering::Relaxed);
        // 连续进度：填充所有被覆盖的分片计数。
        let mut cursor = absolute;
        for (index, slot) in pieces.iter().enumerate() {
            let len = piece_len(size, options.piece_size, index as u64);
            let value = cursor.min(len);
            slot.store(value, Ordering::Relaxed);
            cursor -= value;
            if cursor == 0 {
                break;
            }
        }
        // 写入之后再检查升级信号，保证已收字节都计入进度。
        if upgrade.load(Ordering::Relaxed) {
            return Ok(StreamPass::Upgrade);
        }
    }
    if absolute != size {
        return Err(DownloadError::Network(format!(
            "single stream ended early: {absolute} of {size} bytes"
        )));
    }
    Ok(StreamPass::Complete)
}

/// 单流期间的后台探测：服务器一旦返回 206 就置位升级标志。
fn spawn_upgrade_prober(
    client: Client,
    url: String,
    interval: Duration,
    cancel: CancellationToken,
    upgrade: Arc<AtomicBool>,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let interval = interval.max(Duration::from_millis(100));
        // 源站往往很快恢复 206，首次探测提前到 2 秒内。
        let mut delay = interval.min(Duration::from_secs(2));
        loop {
            tokio::select! {
                biased;
                () = cancel.cancelled() => break,
                () = tokio::time::sleep(delay) => {}
            }
            delay = interval;
            if let Ok(result) = probe(&client, &url).await {
                if result.range_supported {
                    upgrade.store(true, Ordering::Relaxed);
                    break;
                }
            }
        }
    })
}

// ---------------------------------------------------------------------------
// 提交器、收尾、进度推送

#[derive(Clone)]
struct Committer {
    file: Arc<File>,
    pieces: Arc<Vec<AtomicU64>>,
    template: ControlFile,
    path: std::path::PathBuf,
    shared: Arc<Shared>,
}

impl Committer {
    /// 先快照分片计数、再落盘、最后写控制文件——顺序保证控制文件永不高估。
    async fn commit(&self) -> Result<(), DownloadError> {
        let snapshot: Vec<u64> = self
            .pieces
            .iter()
            .map(|slot| slot.load(Ordering::Relaxed))
            .collect();
        let total: u64 = snapshot.iter().sum();
        let mut control = self.template.clone();
        control.pieces = snapshot;
        let file = Arc::clone(&self.file);
        let path = self.path.clone();
        tokio::task::spawn_blocking(move || -> std::io::Result<()> {
            file.sync_data()?;
            control.save(&path)
        })
        .await
        .map_err(join_error)?
        .map_err(DownloadError::Disk)?;
        self.shared.committed.store(total, Ordering::Relaxed);
        Ok(())
    }
}

fn spawn_committer(
    committer: Committer,
    interval: Duration,
    shutdown: CancellationToken,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(interval.max(Duration::from_millis(100)));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        ticker.tick().await; // first tick is immediate; skip it
        loop {
            tokio::select! {
                biased;
                () = shutdown.cancelled() => break,
                _ = ticker.tick() => {}
            }
            // 提交放在 select 之外：一旦开始就完整跑完，停止信号只在间隙生效。
            if let Err(error) = committer.commit().await {
                log::warn!("periodic commit failed: {error}");
            }
        }
    })
}

async fn finalize(
    shared: &Arc<Shared>,
    file: &Arc<File>,
    control_file_path: &std::path::Path,
) -> Result<(), DownloadError> {
    shared.set_phase(Phase::Finalizing);
    let file = Arc::clone(file);
    tokio::task::spawn_blocking(move || file.sync_all())
        .await
        .map_err(join_error)?
        .map_err(DownloadError::Disk)?;
    fsx::remove_if_exists(control_file_path)?;
    Ok(())
}

fn spawn_emitter(
    shared: Arc<Shared>,
    sender: watch::Sender<Progress>,
    interval: Duration,
) -> tokio::task::JoinHandle<()> {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(interval.max(Duration::from_millis(50)));
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        let mut previous_written = shared.written.load(Ordering::Relaxed);
        let mut previous_at = Instant::now();
        let mut smoothed = 0.0f64;
        loop {
            ticker.tick().await;
            let written = shared.written.load(Ordering::Relaxed);
            let now = Instant::now();
            let elapsed = now.saturating_duration_since(previous_at).as_secs_f64();
            if elapsed > 0.0 {
                let instant_speed = written.saturating_sub(previous_written) as f64 / elapsed;
                smoothed = if smoothed == 0.0 {
                    instant_speed
                } else {
                    0.3 * instant_speed + 0.7 * smoothed
                };
            }
            previous_written = written;
            previous_at = now;
            let _ = sender.send(shared.snapshot(smoothed));
        }
    })
}

// ---------------------------------------------------------------------------
// 辅助

fn backoff(attempt: u32) -> Duration {
    if attempt == 0 {
        return Duration::ZERO;
    }
    let exponent = attempt.saturating_sub(1).min(6);
    let base = BASE_BACKOFF.saturating_mul(1 << exponent).min(MAX_BACKOFF);
    // 用亚毫秒时钟噪声做抖动，省掉 rand 依赖。
    let jitter_ms = u64::from(
        (std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|value| value.subsec_nanos())
            .unwrap_or(0))
            % 250,
    );
    base + Duration::from_millis(jitter_ms)
}

fn join_error(error: tokio::task::JoinError) -> DownloadError {
    DownloadError::Disk(std::io::Error::other(format!(
        "worker task failed: {error}"
    )))
}
