//! 基于进程内故障注入 HTTP 服务器的集成测试。
//!
//! 每个场景都断言最终文件与源数据逐字节一致，调度或偏移错误无法蒙混过关。

use std::path::PathBuf;
use std::sync::Arc;
use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};
use std::time::Duration;

use reina_download::{
    DownloadError, DownloadOptions, DownloadRequest, Outcome, Phase, Progress, SharedBudget,
    control_path, download,
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::watch;
use tokio_util::sync::CancellationToken;

// ---------------------------------------------------------------------------
// 故障注入服务器

#[derive(Debug, Clone)]
enum Mode {
    /// 正常响应 Range（206）；无 Range 的 GET 返回 200。
    Normal,
    /// 无视 Range，始终 200 返回完整内容。
    IgnoreRange,
    /// 前 N 个请求无视 Range，之后正常响应 206——模拟 CDN 冷缓存。
    IgnoreRangeFirst(usize),
    /// 始终 403。
    Forbidden,
    /// 前 N 个请求返回 429 加 `Retry-After: 0`，之后正常。
    RateLimitFirst(usize),
    /// 前 N 个 Range 请求发出头部后只发 `bytes` 字节即断开。
    DropAfter { bytes: usize, times: usize },
    /// Content-Range 报告错误的总长。
    WrongTotal(u64),
    /// 前 N 个请求只发响应头，不发数据。
    StallFirst(usize),
    /// 前几个请求忽略 Range，随后指定序号的请求不发响应头。
    IgnoreRangeUntilStall { stall_request: usize },
    /// 指定数量的响应发出响应头后，等待测试释放响应体。
    HoldResponses { limit: usize, ignore_range: usize },
}

struct ServerState {
    data: Vec<u8>,
    mode: std::sync::Mutex<Mode>,
    requests: AtomicUsize,
    body_bytes_served: AtomicU64,
    /// 已服务的 206 分段响应数。
    ranged_responses: AtomicUsize,
    /// 被测试闸门明确保持在响应头之前的请求数及其峰值。
    held_responses: AtomicUsize,
    peak_held_responses: AtomicUsize,
    response_releases: std::sync::Mutex<Vec<watch::Sender<bool>>>,
    /// 每写 8 KiB 插入的延迟，让测试能观察到下载中途的状态。
    chunk_delay: Duration,
}

struct Server {
    state: Arc<ServerState>,
    addr: std::net::SocketAddr,
}

impl Server {
    async fn start(data: Vec<u8>, mode: Mode, chunk_delay: Duration) -> Self {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let state = Arc::new(ServerState {
            data,
            mode: std::sync::Mutex::new(mode),
            requests: AtomicUsize::new(0),
            body_bytes_served: AtomicU64::new(0),
            ranged_responses: AtomicUsize::new(0),
            held_responses: AtomicUsize::new(0),
            peak_held_responses: AtomicUsize::new(0),
            response_releases: std::sync::Mutex::new(
                (0..256).map(|_| watch::channel(false).0).collect(),
            ),
            chunk_delay,
        });
        let accept_state = Arc::clone(&state);
        tokio::spawn(async move {
            loop {
                let Ok((stream, _)) = listener.accept().await else {
                    break;
                };
                let state = Arc::clone(&accept_state);
                tokio::spawn(async move {
                    let _ = handle(stream, state).await;
                });
            }
        });
        Self { state, addr }
    }

    fn url(&self, path: &str) -> String {
        format!("http://{}{}", self.addr, path)
    }

    fn requests(&self) -> usize {
        self.state.requests.load(Ordering::Relaxed)
    }

    fn ranged_responses(&self) -> usize {
        self.state.ranged_responses.load(Ordering::Relaxed)
    }

    fn body_bytes_served(&self) -> u64 {
        self.state.body_bytes_served.load(Ordering::Relaxed)
    }

    fn peak_held_responses(&self) -> usize {
        self.state.peak_held_responses.load(Ordering::Relaxed)
    }

    fn held_responses(&self) -> usize {
        self.state.held_responses.load(Ordering::Relaxed)
    }

    fn release_response(&self, request_number: usize) {
        self.state.response_releases.lock().unwrap()[request_number - 1].send_replace(true);
    }
}

async fn handle(mut stream: TcpStream, state: Arc<ServerState>) -> std::io::Result<()> {
    // 读完一个请求的头部。
    let mut buf = Vec::new();
    let mut byte = [0u8; 1];
    while !buf.ends_with(b"\r\n\r\n") {
        if stream.read(&mut byte).await? == 0 {
            return Ok(());
        }
        buf.push(byte[0]);
        if buf.len() > 16 * 1024 {
            return Ok(());
        }
    }
    let text = String::from_utf8_lossy(&buf);
    let range = text
        .lines()
        .find_map(|line| {
            line.to_ascii_lowercase()
                .strip_prefix("range:")
                .map(str::to_owned)
        })
        .map(|value| value.trim().to_owned());
    let request_number = state.requests.fetch_add(1, Ordering::Relaxed) + 1;

    let total = state.data.len() as u64;
    let mode = state.mode.lock().unwrap().clone();
    match mode {
        Mode::Forbidden => return respond_status(&mut stream, "403 Forbidden").await,
        // 放行探测请求（bytes=0-0），让 429 落在分片请求上，
        // 以覆盖自适应并发路径。
        Mode::RateLimitFirst(remaining)
            if remaining > 0 && range.as_deref() != Some("bytes=0-0") =>
        {
            *state.mode.lock().unwrap() = Mode::RateLimitFirst(remaining - 1);
            let head = "HTTP/1.1 429 Too Many Requests\r\nRetry-After: 0\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            stream.write_all(head.as_bytes()).await?;
            return Ok(());
        }
        Mode::StallFirst(remaining) if remaining > 0 => {
            *state.mode.lock().unwrap() = Mode::StallFirst(remaining - 1);
            let (start, end) = parse_range(range.as_deref(), total);
            let head = format!(
                "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes {start}-{end}/{total}\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                end - start + 1
            );
            stream.write_all(head.as_bytes()).await?;
            // 之后什么都不发，保持连接直到客户端放弃，逼停滞检测生效。
            tokio::time::sleep(Duration::from_secs(120)).await;
            return Ok(());
        }
        Mode::IgnoreRangeUntilStall { stall_request } if request_number == stall_request => {
            // 连响应头也不发，专门覆盖取消 send().await 的路径。
            tokio::time::sleep(Duration::from_secs(120)).await;
            return Ok(());
        }
        _ => {}
    }

    let ignore_range = match mode {
        Mode::IgnoreRange => true,
        Mode::IgnoreRangeFirst(remaining) if remaining > 0 => {
            *state.mode.lock().unwrap() = Mode::IgnoreRangeFirst(remaining - 1);
            true
        }
        Mode::IgnoreRangeUntilStall { stall_request } if request_number < stall_request => true,
        Mode::HoldResponses { ignore_range, .. } if request_number <= ignore_range => true,
        _ => false,
    };
    let hold_response =
        matches!(mode, Mode::HoldResponses { limit, .. } if request_number <= limit);
    match (range, ignore_range) {
        (Some(range), false) => {
            let (start, end) = parse_range(Some(&range), total);
            let reported_total = match mode {
                Mode::WrongTotal(wrong) => wrong,
                _ => total,
            };
            let body = &state.data[start as usize..=end as usize];
            let head = format!(
                "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes {start}-{end}/{reported_total}\r\nContent-Length: {}\r\nETag: \"fixed-etag\"\r\nConnection: close\r\n\r\n",
                body.len()
            );
            state.ranged_responses.fetch_add(1, Ordering::Relaxed);
            if hold_response {
                wait_for_response_release(&state, request_number).await;
            }
            stream.write_all(head.as_bytes()).await?;
            let cap = match mode {
                Mode::DropAfter { bytes, times } if times > 0 => {
                    *state.mode.lock().unwrap() = Mode::DropAfter {
                        bytes,
                        times: times - 1,
                    };
                    Some(bytes)
                }
                _ => None,
            };
            write_body(&mut stream, body, cap, &state).await?;
        }
        _ => {
            let head = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {total}\r\nETag: \"fixed-etag\"\r\nConnection: close\r\n\r\n"
            );
            if hold_response {
                wait_for_response_release(&state, request_number).await;
            }
            stream.write_all(head.as_bytes()).await?;
            write_body(&mut stream, &state.data, None, &state).await?;
        }
    }
    Ok(())
}

async fn wait_for_response_release(state: &ServerState, request_number: usize) {
    let mut release = state.response_releases.lock().unwrap()[request_number - 1].subscribe();
    let held = state.held_responses.fetch_add(1, Ordering::Relaxed) + 1;
    let mut peak = state.peak_held_responses.load(Ordering::Relaxed);
    while held > peak {
        match state.peak_held_responses.compare_exchange_weak(
            peak,
            held,
            Ordering::Relaxed,
            Ordering::Relaxed,
        ) {
            Ok(_) => break,
            Err(observed) => peak = observed,
        }
    }
    while !*release.borrow() {
        if release.changed().await.is_err() {
            break;
        }
    }
    state.held_responses.fetch_sub(1, Ordering::Relaxed);
}

async fn write_body(
    stream: &mut TcpStream,
    body: &[u8],
    cap: Option<usize>,
    state: &ServerState,
) -> std::io::Result<()> {
    let limit = cap.unwrap_or(body.len()).min(body.len());
    for chunk in body[..limit].chunks(8 * 1024) {
        stream.write_all(chunk).await?;
        state
            .body_bytes_served
            .fetch_add(chunk.len() as u64, Ordering::Relaxed);
        if !state.chunk_delay.is_zero() {
            tokio::time::sleep(state.chunk_delay).await;
        }
    }
    if cap.is_some() {
        // 模拟传输中途突然断开。
        let _ = stream.shutdown().await;
    }
    Ok(())
}

fn parse_range(range: Option<&str>, total: u64) -> (u64, u64) {
    let Some(range) = range else {
        return (0, total - 1);
    };
    let spec = range.trim().strip_prefix("bytes=").unwrap();
    let (start, end) = spec.split_once('-').unwrap();
    let start: u64 = start.parse().unwrap();
    let end: u64 = if end.is_empty() {
        total - 1
    } else {
        end.parse().unwrap()
    };
    (start, end.min(total - 1))
}

async fn respond_status(stream: &mut TcpStream, status: &str) -> std::io::Result<()> {
    let head = format!("HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
    stream.write_all(head.as_bytes()).await
}

// ---------------------------------------------------------------------------
// 辅助

fn test_data(len: usize) -> Vec<u8> {
    // 字节值与位置相关，任何写错位置都会改变比较结果。
    (0..len).map(|i| ((i * 31 + i / 251) % 251) as u8).collect()
}

fn fast_options() -> DownloadOptions {
    DownloadOptions {
        piece_size: 64 * 1024,
        min_connections: 1,
        initial_connections: 4,
        max_connections: 8,
        stall_timeout: Duration::from_millis(600),
        commit_interval: Duration::from_millis(150),
        progress_interval: Duration::from_millis(50),
        grow_after_successes: 4,
        max_consecutive_failures: 20,
        range_confirm_delay: Duration::from_millis(100),
        upgrade_probe_interval: Duration::from_millis(150),
        budget: None,
    }
}

struct Run {
    target: PathBuf,
    _dir: tempfile::TempDir,
}

fn run_paths() -> Run {
    let dir = tempfile::tempdir().unwrap();
    let target = dir.path().join("game.7z");
    Run { target, _dir: dir }
}

fn request(url: String, target: &std::path::Path, size: u64) -> DownloadRequest {
    DownloadRequest {
        url,
        target: target.to_path_buf(),
        expected_size: size,
        identity: Some("sha256:test-identity".to_owned()),
    }
}

fn control_temp_path(target: &std::path::Path) -> PathBuf {
    let mut value = control_path(target).into_os_string();
    value.push(".tmp");
    PathBuf::from(value)
}

fn write_control(target: &std::path::Path, size: usize, piece_size: usize, pieces: &[u64]) {
    let control = serde_json::json!({
        "version": 1,
        "size": size,
        "piece_size": piece_size,
        "identity": "sha256:test-identity",
        "etag": "\"fixed-etag\"",
        "pieces": pieces,
    });
    std::fs::write(
        control_path(target),
        serde_json::to_vec(&control).expect("control JSON must serialize"),
    )
    .unwrap();
}

async fn run_download(
    request_value: DownloadRequest,
    options: DownloadOptions,
) -> (Result<Outcome, DownloadError>, Progress) {
    let (sender, receiver) = watch::channel(Progress::initial());
    let result = download(
        request_value,
        options,
        reqwest::Client::new(),
        sender,
        CancellationToken::new(),
    )
    .await;
    let progress = *receiver.borrow();
    (result, progress)
}

// ---------------------------------------------------------------------------
// 场景

#[tokio::test]
async fn downloads_with_multiple_connections() {
    let data = test_data(1_000_003); // deliberately not piece-aligned
    let server = Server::start(data.clone(), Mode::Normal, Duration::ZERO).await;
    let paths = run_paths();

    let (result, progress) = run_download(
        request(server.url("/game.7z"), &paths.target, data.len() as u64),
        fast_options(),
    )
    .await;

    assert!(matches!(result, Ok(Outcome::Completed)), "{result:?}");
    assert_eq!(std::fs::read(&paths.target).unwrap(), data);
    assert!(
        !control_path(&paths.target).exists(),
        "control file must be removed"
    );
    assert_eq!(progress.phase, Phase::Done);
    assert_eq!(progress.written, data.len() as u64);
}

#[tokio::test]
async fn resumes_after_cancel_and_url_change() {
    let data = test_data(2 * 1024 * 1024);
    let server = Server::start(data.clone(), Mode::Normal, Duration::from_millis(2)).await;
    let paths = run_paths();

    let (sender, mut receiver) = watch::channel(Progress::initial());
    let cancel = CancellationToken::new();
    let handle = tokio::spawn(download(
        request(server.url("/signed-v1"), &paths.target, data.len() as u64),
        fast_options(),
        reqwest::Client::new(),
        sender,
        cancel.clone(),
    ));
    // 等到写入量有意义后再取消。
    loop {
        receiver.changed().await.unwrap();
        if receiver.borrow().written > 512 * 1024 {
            break;
        }
    }
    cancel.cancel();
    let first = handle.await.unwrap();
    assert!(matches!(first, Ok(Outcome::Cancelled)), "{first:?}");
    assert!(
        control_path(&paths.target).exists(),
        "control must persist after cancel"
    );

    // 控制文件绝不能声称文件里没有的字节。
    let control: serde_json::Value =
        serde_json::from_slice(&std::fs::read(control_path(&paths.target)).unwrap()).unwrap();
    let piece_size = control["piece_size"].as_u64().unwrap();
    let file_now = std::fs::read(&paths.target).unwrap();
    let mut claimed_total = 0u64;
    for (index, claimed) in control["pieces"].as_array().unwrap().iter().enumerate() {
        let claimed = claimed.as_u64().unwrap();
        claimed_total += claimed;
        let start = index as u64 * piece_size;
        let have = &file_now[start as usize..(start + claimed) as usize];
        let want = &data[start as usize..(start + claimed) as usize];
        assert_eq!(have, want, "piece {index} claims unwritten bytes");
    }
    assert!(
        claimed_total > 0,
        "cancel happened after progress; control should show it"
    );

    // 换一个 URL 续传，模拟签名直链刷新。
    let served_before_resume = server.body_bytes_served();
    let (result, progress) = run_download(
        request(
            server.url("/signed-v2-refreshed"),
            &paths.target,
            data.len() as u64,
        ),
        fast_options(),
    )
    .await;
    assert!(matches!(result, Ok(Outcome::Completed)), "{result:?}");
    assert_eq!(std::fs::read(&paths.target).unwrap(), data);
    assert!(!control_path(&paths.target).exists());
    assert_eq!(progress.total, data.len() as u64);
    let served_during_resume = server.body_bytes_served() - served_before_resume;
    assert!(
        served_during_resume < data.len() as u64,
        "resume re-downloaded everything: {served_during_resume} of {}",
        data.len()
    );
}

#[tokio::test]
async fn falls_back_to_single_stream_when_ranges_ignored() {
    let data = test_data(300_000);
    let server = Server::start(data.clone(), Mode::IgnoreRange, Duration::ZERO).await;
    let paths = run_paths();

    let (result, _) = run_download(
        request(server.url("/no-ranges"), &paths.target, data.len() as u64),
        fast_options(),
    )
    .await;

    assert!(matches!(result, Ok(Outcome::Completed)), "{result:?}");
    assert_eq!(std::fs::read(&paths.target).unwrap(), data);
}

#[tokio::test]
async fn confirm_probe_avoids_single_stream_when_first_request_ignores_range() {
    let data = test_data(600_000);
    // 只有第一个请求无视 Range：复测探测应直接进入分段模式。
    let server = Server::start(data.clone(), Mode::IgnoreRangeFirst(1), Duration::ZERO).await;
    let paths = run_paths();

    let (result, _) = run_download(
        request(server.url("/first-only"), &paths.target, data.len() as u64),
        fast_options(),
    )
    .await;

    assert!(matches!(result, Ok(Outcome::Completed)), "{result:?}");
    assert_eq!(std::fs::read(&paths.target).unwrap(), data);
    assert!(
        server.ranged_responses() >= 2,
        "复测后应直接分段下载，实际 206 响应数: {}",
        server.ranged_responses()
    );
}

#[tokio::test]
async fn upgrades_to_segmented_when_ranges_become_available() {
    let data = test_data(2 * 1024 * 1024);
    // 首测与复测都拿到 200，逼下载进入单流，再由后台探测触发升级。
    let server = Server::start(
        data.clone(),
        Mode::IgnoreRangeFirst(2),
        Duration::from_millis(2),
    )
    .await;
    let paths = run_paths();

    let (result, progress) = run_download(
        request(server.url("/cold-cache"), &paths.target, data.len() as u64),
        fast_options(),
    )
    .await;

    assert!(matches!(result, Ok(Outcome::Completed)), "{result:?}");
    assert_eq!(std::fs::read(&paths.target).unwrap(), data);
    assert!(
        server.ranged_responses() >= 2,
        "下载应升级到分段模式，实际 206 响应数: {}",
        server.ranged_responses()
    );
    assert_eq!(progress.phase, Phase::Done);
}

#[tokio::test]
async fn recovers_from_rate_limiting() {
    let data = test_data(600_000);
    let server = Server::start(data.clone(), Mode::RateLimitFirst(3), Duration::ZERO).await;
    let paths = run_paths();

    let (result, progress) = run_download(
        request(server.url("/limited"), &paths.target, data.len() as u64),
        fast_options(),
    )
    .await;

    assert!(matches!(result, Ok(Outcome::Completed)), "{result:?}");
    assert_eq!(std::fs::read(&paths.target).unwrap(), data);
    assert!(
        progress.retries >= 1,
        "rate-limited attempts must count as retries"
    );
}

#[tokio::test]
async fn forbidden_fails_without_retry_storm() {
    let data = test_data(100_000);
    let server = Server::start(data, Mode::Forbidden, Duration::ZERO).await;
    let paths = run_paths();

    let (result, _) = run_download(
        request(server.url("/forbidden"), &paths.target, 100_000),
        fast_options(),
    )
    .await;

    match result {
        Err(error) => {
            assert_eq!(error.http_status(), Some(403), "{error:?}");
            assert!(!error.is_retryable());
        }
        other => panic!("expected 403 failure, got {other:?}"),
    }
    assert!(
        server.requests() <= 2,
        "403 must not be retried; saw {}",
        server.requests()
    );
}

#[tokio::test]
async fn retries_pieces_after_mid_stream_disconnects() {
    let data = test_data(500_000);
    let server = Server::start(
        data.clone(),
        Mode::DropAfter {
            bytes: 10_000,
            times: 6,
        },
        Duration::ZERO,
    )
    .await;
    let paths = run_paths();

    let (result, progress) = run_download(
        request(server.url("/flaky"), &paths.target, data.len() as u64),
        fast_options(),
    )
    .await;

    assert!(matches!(result, Ok(Outcome::Completed)), "{result:?}");
    assert_eq!(std::fs::read(&paths.target).unwrap(), data);
    assert!(progress.retries >= 1);
}

#[tokio::test]
async fn stall_detection_recovers_dead_connections() {
    let data = test_data(400_000);
    let server = Server::start(data.clone(), Mode::StallFirst(2), Duration::ZERO).await;
    let paths = run_paths();

    let started = std::time::Instant::now();
    let (result, _) = run_download(
        request(server.url("/stalls"), &paths.target, data.len() as u64),
        fast_options(),
    )
    .await;

    assert!(matches!(result, Ok(Outcome::Completed)), "{result:?}");
    assert_eq!(std::fs::read(&paths.target).unwrap(), data);
    assert!(
        started.elapsed() < Duration::from_secs(30),
        "stall recovery took {:?}",
        started.elapsed()
    );
}

#[tokio::test]
async fn cancellation_interrupts_a_stalled_second_probe() {
    let data = test_data(100_000);
    let server = Server::start(
        data.clone(),
        Mode::IgnoreRangeUntilStall { stall_request: 2 },
        Duration::ZERO,
    )
    .await;
    let paths = run_paths();
    let (sender, receiver) = watch::channel(Progress::initial());
    let cancel = CancellationToken::new();
    let handle = tokio::spawn(download(
        request(
            server.url("/cancel-second-probe"),
            &paths.target,
            data.len() as u64,
        ),
        fast_options(),
        reqwest::Client::new(),
        sender,
        cancel.clone(),
    ));

    tokio::time::timeout(Duration::from_secs(2), async {
        while server.requests() < 2 {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .expect("second probe did not reach the fault-injection server");
    let cancelled_at = std::time::Instant::now();
    cancel.cancel();
    let result = tokio::time::timeout(Duration::from_secs(2), handle)
        .await
        .expect("cancelling a stalled second probe waited for the HTTP client timeout")
        .expect("download task panicked");
    assert!(matches!(result, Ok(Outcome::Cancelled)), "{result:?}");
    assert!(
        !receiver.borrow().initialized,
        "探测阶段取消时目标尚未初始化"
    );
    assert!(
        cancelled_at.elapsed() < Duration::from_secs(2),
        "second probe cancellation took {:?}",
        cancelled_at.elapsed()
    );
}

#[tokio::test]
async fn cancellation_interrupts_single_stream_waiting_for_response_headers() {
    let data = test_data(100_000);
    let server = Server::start(
        data.clone(),
        Mode::IgnoreRangeUntilStall { stall_request: 3 },
        Duration::ZERO,
    )
    .await;
    let paths = run_paths();
    let (sender, receiver) = watch::channel(Progress::initial());
    let cancel = CancellationToken::new();
    let handle = tokio::spawn(download(
        request(
            server.url("/cancel-single-headers"),
            &paths.target,
            data.len() as u64,
        ),
        fast_options(),
        reqwest::Client::new(),
        sender,
        cancel.clone(),
    ));

    tokio::time::timeout(Duration::from_secs(2), async {
        while server.requests() < 3 {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .expect("single-stream request did not reach the fault-injection server");
    let cancelled_at = std::time::Instant::now();
    cancel.cancel();
    let result = tokio::time::timeout(Duration::from_secs(2), handle)
        .await
        .expect("cancelling a single stream waited for the HTTP client timeout")
        .expect("download task panicked");
    assert!(matches!(result, Ok(Outcome::Cancelled)), "{result:?}");
    assert!(
        receiver.borrow().initialized,
        "目标初始化完成后取消必须保留 initialized 标志"
    );
    assert!(
        cancelled_at.elapsed() < Duration::from_secs(2),
        "single-stream header cancellation took {:?}",
        cancelled_at.elapsed()
    );
}

#[tokio::test]
async fn rejects_wrong_reported_size() {
    let data = test_data(100_000);
    let server = Server::start(data, Mode::WrongTotal(999), Duration::ZERO).await;
    let paths = run_paths();

    let (result, _) = run_download(
        request(server.url("/wrong-size"), &paths.target, 100_000),
        fast_options(),
    )
    .await;

    assert!(
        matches!(result, Err(DownloadError::SizeMismatch { .. })),
        "{result:?}"
    );
}

#[tokio::test]
async fn short_circuits_when_target_already_complete() {
    let data = test_data(50_000);
    let server = Server::start(data.clone(), Mode::Normal, Duration::ZERO).await;
    let paths = run_paths();
    std::fs::write(&paths.target, &data).unwrap();

    let (result, _) = run_download(
        request(server.url("/done"), &paths.target, data.len() as u64),
        fast_options(),
    )
    .await;

    assert!(matches!(result, Ok(Outcome::Completed)), "{result:?}");
    assert_eq!(
        server.requests(),
        0,
        "a finished download must not touch the network"
    );
}

#[tokio::test]
async fn refuses_foreign_file_at_target_path() {
    let server = Server::start(test_data(50_000), Mode::Normal, Duration::ZERO).await;
    let paths = run_paths();
    std::fs::write(&paths.target, b"something else entirely").unwrap();

    let (result, _) = run_download(
        request(server.url("/conflict"), &paths.target, 50_000),
        fast_options(),
    )
    .await;

    assert!(
        matches!(result, Err(DownloadError::TargetConflict(_))),
        "{result:?}"
    );
}

#[tokio::test]
async fn control_save_failure_does_not_leave_a_false_complete_target() {
    let data = test_data(100_003);
    let server = Server::start(data.clone(), Mode::Normal, Duration::ZERO).await;
    let paths = run_paths();
    std::fs::create_dir(control_temp_path(&paths.target)).unwrap();

    let (first, _) = run_download(
        request(
            server.url("/save-failure"),
            &paths.target,
            data.len() as u64,
        ),
        fast_options(),
    )
    .await;
    assert!(
        first.is_err(),
        "control save failure must be surfaced: {first:?}"
    );
    assert_ne!(
        std::fs::metadata(&paths.target)
            .ok()
            .map(|metadata| metadata.len()),
        Some(data.len() as u64),
        "failed control save must not leave a target that looks complete"
    );

    // 第二次调用不能把第一次失败留下的目标误判成已完成。
    let (second, _) = run_download(
        request(
            server.url("/save-failure-retry"),
            &paths.target,
            data.len() as u64,
        ),
        fast_options(),
    )
    .await;
    assert!(
        !matches!(second, Ok(Outcome::Completed)),
        "a failed control save must not turn into a false Completed: {second:?}"
    );
}

#[tokio::test]
async fn repairs_missing_target_even_when_control_claims_a_piece() {
    let data = test_data(180_003);
    let server = Server::start(data.clone(), Mode::Normal, Duration::ZERO).await;
    let paths = run_paths();
    let piece_size = fast_options().piece_size as usize;
    write_control(
        &paths.target,
        data.len(),
        piece_size,
        &[piece_size as u64, 0, (data.len() - 2 * piece_size) as u64],
    );

    let (result, _) = run_download(
        request(
            server.url("/missing-target"),
            &paths.target,
            data.len() as u64,
        ),
        fast_options(),
    )
    .await;

    assert!(matches!(result, Ok(Outcome::Completed)), "{result:?}");
    assert_eq!(std::fs::read(&paths.target).unwrap(), data);
}

#[tokio::test]
async fn repairs_truncated_target_even_when_control_claims_bytes_beyond_eof() {
    let data = test_data(180_003);
    let server = Server::start(data.clone(), Mode::Normal, Duration::ZERO).await;
    let paths = run_paths();
    let piece_size = fast_options().piece_size as usize;
    write_control(
        &paths.target,
        data.len(),
        piece_size,
        &[piece_size as u64, 0, (data.len() - 2 * piece_size) as u64],
    );
    // 目标实际只保留了声明完整分片的一小段，不能信任控制文件的进度声明。
    std::fs::write(&paths.target, &data[..1024]).unwrap();

    let (result, _) = run_download(
        request(
            server.url("/truncated-target"),
            &paths.target,
            data.len() as u64,
        ),
        fast_options(),
    )
    .await;

    assert!(matches!(result, Ok(Outcome::Completed)), "{result:?}");
    assert_eq!(std::fs::read(&paths.target).unwrap(), data);
}

#[tokio::test]
async fn shared_budget_caps_total_connections() {
    let data = test_data(800_000);
    let server = Server::start(
        data.clone(),
        Mode::HoldResponses {
            limit: 4,
            ignore_range: 0,
        },
        Duration::from_millis(1),
    )
    .await;
    let paths_a = run_paths();
    let paths_b = run_paths();
    let budget = SharedBudget::new(2);
    let mut options = fast_options();
    options.budget = Some(budget);

    let (sender_a, _keep_a) = watch::channel(Progress::initial());
    let (sender_b, _keep_b) = watch::channel(Progress::initial());
    let handle_a = tokio::spawn(download(
        request(server.url("/a"), &paths_a.target, data.len() as u64),
        options.clone(),
        reqwest::Client::new(),
        sender_a,
        CancellationToken::new(),
    ));
    let handle_b = tokio::spawn(download(
        request(server.url("/b"), &paths_b.target, data.len() as u64),
        options,
        reqwest::Client::new(),
        sender_b,
        CancellationToken::new(),
    ));

    tokio::time::timeout(Duration::from_secs(2), async {
        while server.held_responses() < 2 {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .expect("initial probes did not reach the response gate");
    assert_eq!(server.requests(), 2, "probe responses exceeded budget=2");
    server.release_response(1);
    server.release_response(2);

    tokio::time::timeout(Duration::from_secs(2), async {
        while server.held_responses() < 2 || server.requests() < 4 {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .expect("segmented requests did not reach the response gate");
    tokio::time::sleep(Duration::from_millis(50)).await;
    assert_eq!(server.requests(), 4, "segmented requests exceeded budget=2");
    assert_eq!(server.held_responses(), 2);
    server.release_response(3);
    server.release_response(4);

    let first = handle_a.await.unwrap();
    let second = handle_b.await.unwrap();

    assert!(matches!(first, Ok(Outcome::Completed)), "{first:?}");
    assert!(matches!(second, Ok(Outcome::Completed)), "{second:?}");
    assert_eq!(std::fs::read(&paths_a.target).unwrap(), data);
    assert_eq!(std::fs::read(&paths_b.target).unwrap(), data);
    assert!(
        server.peak_held_responses() <= 2,
        "shared budget exceeded: observed {} held responses",
        server.peak_held_responses()
    );
}

#[tokio::test]
async fn shared_budget_one_does_not_deadlock_single_stream_upgrade_probe() {
    let data = test_data(2 * 1024 * 1024);
    let server = Server::start(
        data.clone(),
        // 首测和复测先返回 200，随后单流期间的升级探测才有机会请求 206。
        Mode::HoldResponses {
            limit: 3,
            ignore_range: 2,
        },
        Duration::from_millis(2),
    )
    .await;
    let paths = run_paths();
    let budget = SharedBudget::new(1);
    let mut options = fast_options();
    options.budget = Some(budget);

    let (sender, _keep) = watch::channel(Progress::initial());
    let handle = tokio::spawn(download(
        request(
            server.url("/budget-one-upgrade"),
            &paths.target,
            data.len() as u64,
        ),
        options,
        reqwest::Client::new(),
        sender,
        CancellationToken::new(),
    ));

    for request_number in 1..=2 {
        tokio::time::timeout(Duration::from_secs(2), async {
            while server.requests() < request_number {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .expect("probe did not reach the response gate");
        assert_eq!(server.requests(), request_number);
        server.release_response(request_number);
    }
    tokio::time::timeout(Duration::from_secs(2), async {
        while server.requests() < 3 || server.held_responses() < 1 {
            tokio::time::sleep(Duration::from_millis(5)).await;
        }
    })
    .await
    .expect("single-stream response did not reach the response gate");
    tokio::time::sleep(Duration::from_millis(100)).await;
    assert_eq!(server.requests(), 3, "upgrade probe bypassed budget=1");
    server.release_response(3);
    let result = tokio::time::timeout(Duration::from_secs(5), handle)
        .await
        .expect("budget=1 single-stream completion deadlocked")
        .expect("download task panicked");

    assert!(matches!(result, Ok(Outcome::Completed)), "{result:?}");
    assert_eq!(std::fs::read(&paths.target).unwrap(), data);
    assert!(
        server.requests() >= 3,
        "expected probes and single-stream request"
    );
    assert!(
        server.peak_held_responses() <= 1,
        "budget=1 exceeded: observed {} held responses",
        server.peak_held_responses()
    );
}
