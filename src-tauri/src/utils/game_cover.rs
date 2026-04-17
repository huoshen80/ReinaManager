use std::collections::{HashMap, HashSet};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use sea_orm::{DatabaseConnection, EntityTrait};
use tauri::Manager;
use tauri::command;
use tauri::http::{Response, StatusCode};
use tauri_plugin_http::reqwest::Client;
use tokio::sync::{RwLock, Semaphore, watch};

use crate::entity::prelude::Games;
use reina_path::get_base_data_dir;

const DEFAULT_COVER_EXTENSION: &str = "jpg";
const DEFAULT_CLOUD_COVER_FILE_NAME: &str = "cloud_cover";
const MAX_CONCURRENT_COVER_DOWNLOADS: usize = 100;
const COVER_DOWNLOAD_CONNECT_TIMEOUT_SECS: u64 = 10;
const COVER_DOWNLOAD_TIMEOUT_SECS: u64 = 60;
/// 最多重试次数（不含首次），退避延迟为 500ms * 2^attempt
const COVER_MAX_RETRIES: u32 = 2;
const COVER_RETRY_BASE_DELAY_MS: u64 = 500;
const COVER_USER_AGENT: &str = concat!(
    "huoshen80/ReinaManager/",
    env!("CARGO_PKG_VERSION"),
    " (https://github.com/huoshen80/ReinaManager)"
);

static COVER_HTTP_CLIENT: OnceLock<Client> = OnceLock::new();

/// 正在下载中的任务表：key=game_id，value=watch sender（false=进行中，true=已结束）
type DownloadingMap = Arc<Mutex<HashMap<u32, Arc<watch::Sender<bool>>>>>;

pub struct DownloadState {
    semaphore: Arc<Semaphore>,
    /// 内存中已确认缓存完毕的 game_id 集合，避免每次请求都扫描磁盘
    cached_ids: Arc<RwLock<HashSet<u32>>>,
    /// 删除墓碑：记录已删除游戏，阻止下载任务继续写入封面
    tombstoned_ids: Arc<RwLock<HashSet<u32>>>,
    /// 正在下载中的任务；同 game_id 的后续请求订阅 watch channel 等待其完成
    downloading: DownloadingMap,
}

impl DownloadState {
    pub async fn mark_game_deleted(&self, game_id: u32) {
        self.cached_ids.write().await.remove(&game_id);
        self.tombstoned_ids.write().await.insert(game_id);
    }

    async fn clear_game_deleted(&self, game_id: u32) {
        self.tombstoned_ids.write().await.remove(&game_id);
    }

    async fn is_game_deleted_marked(&self, game_id: u32) -> bool {
        self.tombstoned_ids.read().await.contains(&game_id)
    }
}

/// RAII guard：下载结束时（无论成功/失败/panic/取消）自动唤醒等待者，并清理 downloading 表
struct DownloadCleanupGuard {
    downloading: DownloadingMap,
    game_id: u32,
    sender: Arc<watch::Sender<bool>>,
}

impl Drop for DownloadCleanupGuard {
    fn drop(&mut self) {
        // 发送"完成"信号；等待者收到后自行检查磁盘缓存是否成功
        let _ = self.sender.send(true);
        self.downloading
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .remove(&self.game_id);
    }
}

fn cover_http_client() -> &'static Client {
    COVER_HTTP_CLIENT.get_or_init(|| {
        Client::builder()
            .connect_timeout(Duration::from_secs(COVER_DOWNLOAD_CONNECT_TIMEOUT_SECS))
            .timeout(Duration::from_secs(COVER_DOWNLOAD_TIMEOUT_SECS))
            .user_agent(COVER_USER_AGENT)
            .build()
            .expect("failed to build game cover http client")
    })
}

fn infer_cache_extension(cloud_url: &str) -> String {
    let url_without_suffix = cloud_url.split(['?', '#']).next().unwrap_or(cloud_url);
    let file_name = url_without_suffix
        .rsplit('/')
        .next()
        .unwrap_or(url_without_suffix);

    file_name
        .rsplit_once('.')
        .map(|(_, ext)| ext.trim().to_ascii_lowercase())
        .filter(|ext| !ext.is_empty())
        .unwrap_or_else(|| DEFAULT_COVER_EXTENSION.to_string())
}

fn cloud_cover_file_stem(game_id: u32) -> String {
    format!("{DEFAULT_CLOUD_COVER_FILE_NAME}_{game_id}")
}

fn get_game_cover_dir(game_id: u32) -> Result<PathBuf, String> {
    Ok(get_base_data_dir()?
        .join("covers")
        .join(format!("game_{}", game_id)))
}

fn build_cache_path(game_cover_dir: &Path, game_id: u32, extension: &str) -> PathBuf {
    game_cover_dir.join(format!("{}.{}", cloud_cover_file_stem(game_id), extension))
}

fn build_temp_cache_path(game_cover_dir: &Path, game_id: u32, extension: &str) -> PathBuf {
    let unique_suffix = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();

    game_cover_dir.join(format!(
        "{}.{extension}.part.{unique_suffix}",
        cloud_cover_file_stem(game_id)
    ))
}

async fn get_cached_cloud_cover(game_cover_dir: &Path, game_id: u32) -> Option<PathBuf> {
    let file_stem = cloud_cover_file_stem(game_id);

    // O(1) 快速路径：直接探测最常见的图片扩展名（stat 系统调用，无需遍历目录）
    // 按实际出现频率排序，命中率覆盖 99%+ 的场景
    const COMMON_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "avif", "bmp"];
    for ext in COMMON_EXTENSIONS {
        let path = game_cover_dir.join(format!("{file_stem}.{ext}"));
        if tokio::fs::try_exists(&path).await.unwrap_or(false) {
            return Some(path);
        }
    }

    // O(N) 兜底路径：遇到罕见扩展名时退化为目录扫描
    let mut entries = tokio::fs::read_dir(game_cover_dir).await.ok()?;
    let expected_prefix = format!("{file_stem}.");

    while let Some(entry) = entries.next_entry().await.ok()? {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name.starts_with(&expected_prefix) && !name.contains(".part.") {
            return Some(path);
        }
    }

    None
}

fn content_type_for_extension(ext: &str) -> &'static str {
    match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "webp" => "image/webp",
        "avif" => "image/avif",
        _ => "application/octet-stream",
    }
}

fn content_type_for_file(path: &Path) -> &'static str {
    content_type_for_extension(
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase())
            .as_deref()
            .unwrap_or(""),
    )
}

fn parse_game_id_from_uri(parsed: &url::Url) -> Option<u32> {
    if let Some(host) = parsed.host_str()
        && host != "localhost"
        && let Ok(id) = host.parse::<u32>()
    {
        return Some(id);
    }
    parsed.path().trim_start_matches('/').parse::<u32>().ok()
}

async fn remove_file_if_exists(path: &Path) {
    match tokio::fs::remove_file(path).await {
        Ok(_) => {}
        Err(err) if err.kind() == ErrorKind::NotFound => {}
        Err(err) => log::warn!("删除失败的封面缓存文件失败 {:?}: {}", path, err),
    }
}

#[derive(Debug)]
enum CoverDownloadError {
    Retryable(String),
    GameDeleted(String),
    NonRetryable(String),
}

async fn game_exists_in_db(
    db: &DatabaseConnection,
    game_id: u32,
) -> Result<bool, CoverDownloadError> {
    let game_id = i32::try_from(game_id)
        .map_err(|_| CoverDownloadError::NonRetryable(format!("game_id 超出范围: {}", game_id)))?;

    Games::find_by_id(game_id)
        .one(db)
        .await
        .map(|game| game.is_some())
        .map_err(|e| CoverDownloadError::NonRetryable(format!("检查游戏状态失败: {}", e)))
}

async fn ensure_game_cover_writable(
    state: &DownloadState,
    db: &DatabaseConnection,
    game_id: u32,
) -> Result<(), CoverDownloadError> {
    let exists = game_exists_in_db(db, game_id).await?;

    if !exists {
        state.mark_game_deleted(game_id).await;
        Err(CoverDownloadError::GameDeleted(format!(
            "游戏已删除 game_id={}",
            game_id
        )))
    } else {
        if state.is_game_deleted_marked(game_id).await {
            state.clear_game_deleted(game_id).await;
        }
        Ok(())
    }
}

fn make_ok_response(bytes: Vec<u8>, content_type: &'static str) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", content_type)
        .header("Cache-Control", "max-age=31536000, immutable")
        .header("Access-Control-Allow-Origin", "*")
        .body(bytes)
        .expect("failed to build ok response")
}

fn make_status_response(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .body(Vec::new())
        .expect("failed to build status response")
}

#[command]
pub async fn delete_cloud_cache(
    game_id: u32,
    state: tauri::State<'_, DownloadState>,
) -> Result<(), String> {
    let game_cover_dir = get_game_cover_dir(game_id)?;
    let expected_prefix = format!("{}.", cloud_cover_file_stem(game_id));

    // 同步清理内存缓存标记
    state.cached_ids.write().await.remove(&game_id);

    if !game_cover_dir.exists() {
        return Ok(());
    }

    let mut entries = tokio::fs::read_dir(&game_cover_dir)
        .await
        .map_err(|e| format!("无法读取封面目录: {}", e))?;

    while let Some(entry) = entries
        .next_entry()
        .await
        .map_err(|e| format!("读取目录项失败: {}", e))?
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let file_name = entry.file_name();
        let file_name_str = file_name.to_string_lossy();
        if !file_name_str.starts_with(&expected_prefix) {
            continue;
        }
        tokio::fs::remove_file(&path)
            .await
            .map_err(|e| format!("删除云端缓存失败: {}", e))?;
    }

    Ok(())
}

/// 单次下载尝试：发起请求 → 写 .part 临时文件 → rename 为正式缓存
/// 成功时返回图片字节（内存中已有，无需再次读盘）
async fn try_download_once(
    url: &str,
    game_cover_dir: &Path,
    game_id: u32,
    db: &DatabaseConnection,
    state: &DownloadState,
) -> Result<Vec<u8>, CoverDownloadError> {
    let extension = infer_cache_extension(url);
    let cache_path = build_cache_path(game_cover_dir, game_id, &extension);
    let temp_path = build_temp_cache_path(game_cover_dir, game_id, &extension);

    let response = cover_http_client()
        .get(url)
        .send()
        .await
        .map_err(|e| CoverDownloadError::Retryable(format!("发起请求失败: {}", e)))?;

    if !response.status().is_success() {
        return Err(CoverDownloadError::NonRetryable(format!(
            "HTTP 状态码异常: {}",
            response.status()
        )));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|e| CoverDownloadError::Retryable(format!("读取响应体失败: {}", e)))?
        .to_vec();

    ensure_game_cover_writable(state, db, game_id).await?;

    if let Err(e) = tokio::fs::write(&temp_path, &bytes).await {
        remove_file_if_exists(&temp_path).await;
        return Err(CoverDownloadError::NonRetryable(format!(
            "写入临时文件失败: {}",
            e
        )));
    }

    if let Err(e) = tokio::fs::rename(&temp_path, &cache_path).await {
        remove_file_if_exists(&temp_path).await;
        // rename 失败（如跨盘符）不阻止本次返回，bytes 仍有效
        log::warn!(
            "封面 rename 失败 game_id={}: {}，本次直接返回内存字节",
            game_id,
            e
        );
    }

    Ok(bytes)
}

/// 带指数退避重试的封面下载（总尝试次数 = 1 + COVER_MAX_RETRIES）
/// 成功时返回图片字节，并已写入磁盘缓存
async fn fetch_and_cache_cover(
    game_id: u32,
    url: &str,
    game_cover_dir: &Path,
    db: &DatabaseConnection,
    state: &DownloadState,
) -> Result<Vec<u8>, CoverDownloadError> {
    let mut last_retryable_err = String::new();

    // 目录只在进入下载流程时创建一次，避免重试阶段重复创建
    ensure_game_cover_writable(state, db, game_id).await?;
    tokio::fs::create_dir_all(game_cover_dir)
        .await
        .map_err(|e| CoverDownloadError::NonRetryable(format!("创建缓存目录失败: {}", e)))?;

    for attempt in 0..=COVER_MAX_RETRIES {
        if attempt > 0 {
            let delay_ms = COVER_RETRY_BASE_DELAY_MS * (1u64 << (attempt - 1));
            log::debug!(
                "封面下载重试 game_id={} attempt={}/{} delay={}ms",
                game_id,
                attempt,
                COVER_MAX_RETRIES,
                delay_ms
            );
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
        }

        match try_download_once(url, game_cover_dir, game_id, db, state).await {
            Ok(bytes) => {
                log::debug!("封面缓存完成 game_id={} attempt={}", game_id, attempt);
                return Ok(bytes);
            }
            Err(CoverDownloadError::Retryable(e)) => {
                log::warn!(
                    "封面下载失败 game_id={} attempt={}/{}: {}",
                    game_id,
                    attempt,
                    COVER_MAX_RETRIES,
                    e
                );
                last_retryable_err = e;
            }
            Err(CoverDownloadError::GameDeleted(e)) => {
                log::debug!(
                    "封面下载终止（游戏已删除） game_id={} attempt={}/{}: {}",
                    game_id,
                    attempt,
                    COVER_MAX_RETRIES,
                    e
                );
                return Err(CoverDownloadError::GameDeleted(e));
            }
            Err(CoverDownloadError::NonRetryable(e)) => {
                log::warn!(
                    "封面下载终止（不可重试） game_id={} attempt={}/{}: {}",
                    game_id,
                    attempt,
                    COVER_MAX_RETRIES,
                    e
                );
                return Err(CoverDownloadError::NonRetryable(e));
            }
        }
    }

    Err(CoverDownloadError::Retryable(format!(
        "下载最终失败（已重试 {} 次）: {}",
        COVER_MAX_RETRIES, last_retryable_err
    )))
}

pub fn register_game_cover_protocol<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    builder
        .manage(DownloadState {
            semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT_COVER_DOWNLOADS)),
            cached_ids: Arc::new(RwLock::new(HashSet::new())),
            tombstoned_ids: Arc::new(RwLock::new(HashSet::new())),
            downloading: Arc::new(Mutex::new(HashMap::new())),
        })
        .register_asynchronous_uri_scheme_protocol("reina-cover", |app, request, responder| {
            let app_handle = app.app_handle().clone();
            let request_uri = request.uri().to_string();

            tauri::async_runtime::spawn(async move {
                // ── 解析请求 URI ──────────────────────────────────────
                let parsed = match url::Url::parse(&request_uri) {
                    Ok(u) => u,
                    Err(_) => {
                        responder.respond(make_status_response(StatusCode::BAD_REQUEST));
                        return;
                    }
                };

                let game_id = match parse_game_id_from_uri(&parsed) {
                    Some(id) => id,
                    None => {
                        responder.respond(make_status_response(StatusCode::BAD_REQUEST));
                        return;
                    }
                };

                let cloud_url = parsed
                    .query_pairs()
                    .find(|(k, _)| k == "url")
                    .map(|(_, v)| v.into_owned());

                let game_cover_dir = match get_game_cover_dir(game_id) {
                    Ok(dir) => dir,
                    Err(_) => {
                        responder.respond(make_status_response(StatusCode::INTERNAL_SERVER_ERROR));
                        return;
                    }
                };

                let state = app_handle.state::<DownloadState>();
                let db = app_handle.state::<DatabaseConnection>();

                if state.is_game_deleted_marked(game_id).await {
                    match ensure_game_cover_writable(&state, db.inner(), game_id).await {
                        Ok(_) => {}
                        Err(CoverDownloadError::GameDeleted(_)) => {
                            responder.respond(make_status_response(StatusCode::NOT_FOUND));
                            return;
                        }
                        Err(CoverDownloadError::NonRetryable(e)) => {
                            log::warn!("检查游戏状态失败 game_id={}: {}", game_id, e);
                            responder
                                .respond(make_status_response(StatusCode::INTERNAL_SERVER_ERROR));
                            return;
                        }
                        Err(CoverDownloadError::Retryable(_)) => unreachable!(),
                    }
                }

                // ── 步骤 1：内存集合短路（最快路径，无磁盘 I/O）──────────
                {
                    let cached = state.cached_ids.read().await;
                    if cached.contains(&game_id) {
                        drop(cached);
                        if let Some(cache_path) =
                            get_cached_cloud_cover(&game_cover_dir, game_id).await
                            && let Ok(bytes) = tokio::fs::read(&cache_path).await
                        {
                            responder.respond(make_ok_response(
                                bytes,
                                content_type_for_file(&cache_path),
                            ));
                            return;
                        }
                        // 内存标记存在但文件已被外部删除，清除过期记录
                        state.cached_ids.write().await.remove(&game_id);
                    }
                }

                // ── 步骤 2：磁盘缓存检查（冷启动或内存集合未命中）─────────
                if let Some(cache_path) = get_cached_cloud_cover(&game_cover_dir, game_id).await
                    && let Ok(bytes) = tokio::fs::read(&cache_path).await
                {
                    // 回填内存集合，下次请求走步骤 1
                    state.cached_ids.write().await.insert(game_id);
                    responder.respond(make_ok_response(bytes, content_type_for_file(&cache_path)));
                    return;
                }

                // ── 步骤 3：无缓存，需要下载 ─────────────────────────────
                let Some(url) = cloud_url else {
                    responder.respond(make_status_response(StatusCode::NOT_FOUND));
                    return;
                };

                // 检查是否已有相同 game_id 的下载正在进行
                // 在持有锁期间订阅 watch channel，避免"通知已发但还未订阅"的竞态
                let existing_rx = {
                    let downloading = state.downloading.lock().unwrap_or_else(|e| e.into_inner());
                    downloading.get(&game_id).map(|tx| tx.subscribe())
                };

                if let Some(mut rx) = existing_rx {
                    // 有下载在进行，等待其完成（watch channel 当前值已是 true 时立即返回）
                    log::debug!("等待已有下载任务完成 game_id={}", game_id);
                    let _ = rx.wait_for(|done| *done).await;

                    // 下载结束后尝试读取磁盘缓存
                    if let Some(cache_path) = get_cached_cloud_cover(&game_cover_dir, game_id).await
                        && let Ok(bytes) = tokio::fs::read(&cache_path).await
                    {
                        state.cached_ids.write().await.insert(game_id);
                        responder
                            .respond(make_ok_response(bytes, content_type_for_file(&cache_path)));
                        return;
                    }
                    if state.is_game_deleted_marked(game_id).await {
                        responder.respond(make_status_response(StatusCode::NOT_FOUND));
                        return;
                    }
                    // 前序下载失败（超时/网络错误），返回 502
                    responder.respond(make_status_response(StatusCode::BAD_GATEWAY));
                    return;
                }

                // ── 步骤 4：成为本次下载的执行者 ────────────────────────
                let (tx, _) = watch::channel(false);
                let tx = Arc::new(tx);
                {
                    let mut downloading =
                        state.downloading.lock().unwrap_or_else(|e| e.into_inner());
                    downloading.insert(game_id, tx.clone());
                }

                // RAII guard：超出作用域时自动通知等待者并清理 downloading 表
                let _cleanup = DownloadCleanupGuard {
                    downloading: state.downloading.clone(),
                    game_id,
                    sender: tx,
                };

                // 等待信号量许可（最多 MAX_CONCURRENT_COVER_DOWNLOADS 个并发下载）
                let _permit = match state.semaphore.clone().acquire_owned().await {
                    Ok(p) => p,
                    Err(e) => {
                        log::warn!("获取封面下载许可失败 game_id={}: {}", game_id, e);
                        responder.respond(make_status_response(StatusCode::INTERNAL_SERVER_ERROR));
                        return; // _cleanup drop 在此触发，通知等待者
                    }
                };

                // 执行下载（含指数退避重试）
                let fetch_result =
                    fetch_and_cache_cover(game_id, &url, &game_cover_dir, db.inner(), &state).await;
                match fetch_result {
                    Ok(bytes) => {
                        // 回填内存缓存集合
                        state.cached_ids.write().await.insert(game_id);
                        let content_type = content_type_for_extension(&infer_cache_extension(&url));
                        responder.respond(make_ok_response(bytes, content_type));
                    }
                    Err(CoverDownloadError::GameDeleted(e)) => {
                        log::debug!("封面下载终止 game_id={}: {}", game_id, e);
                        responder.respond(make_status_response(StatusCode::NOT_FOUND));
                    }
                    Err(CoverDownloadError::NonRetryable(e)) => {
                        log::warn!("封面下载终止 game_id={}: {}", game_id, e);
                        responder.respond(make_status_response(StatusCode::INTERNAL_SERVER_ERROR));
                    }
                    Err(CoverDownloadError::Retryable(e)) => {
                        log::warn!("封面下载最终失败 game_id={}: {}", game_id, e);
                        responder.respond(make_status_response(StatusCode::BAD_GATEWAY));
                    }
                }
                // _cleanup 在此 drop：通知所有等待步骤 3 的请求
            });
        })
}
