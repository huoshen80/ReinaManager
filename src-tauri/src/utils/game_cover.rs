use std::collections::HashSet;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use tauri::command;
use tauri::http::{Response, StatusCode};
use tauri::Manager;
use tauri_plugin_http::reqwest::Client;
use tokio::sync::Semaphore;

use reina_path::get_base_data_dir;

const DEFAULT_COVER_EXTENSION: &str = "jpg";
const DEFAULT_CLOUD_COVER_FILE_NAME: &str = "cloud_cover";
const MAX_CONCURRENT_COVER_DOWNLOADS: usize = 10;
const COVER_DOWNLOAD_CONNECT_TIMEOUT_SECS: u64 = 10;
const COVER_DOWNLOAD_TIMEOUT_SECS: u64 = 30;
const COVER_USER_AGENT: &str = concat!(
    "huoshen80/ReinaManager/",
    env!("CARGO_PKG_VERSION"),
    " (https://github.com/huoshen80/ReinaManager)"
);

static COVER_HTTP_CLIENT: OnceLock<Client> = OnceLock::new();

#[derive(Clone, Debug, Eq, Hash, PartialEq)]
struct DownloadKey {
    game_id: u32,
    url: String,
}

struct InFlightDownloadGuard {
    in_flight_downloads: Arc<Mutex<HashSet<DownloadKey>>>,
    key: DownloadKey,
}

impl Drop for InFlightDownloadGuard {
    fn drop(&mut self) {
        let mut in_flight = self
            .in_flight_downloads
            .lock()
            .expect("封面下载去重锁已被污染");
        in_flight.remove(&self.key);
    }
}

pub struct DownloadState {
    semaphore: Arc<Semaphore>,
    in_flight_downloads: Arc<Mutex<HashSet<DownloadKey>>>,
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

fn get_cached_cloud_cover(game_cover_dir: &Path, game_id: u32) -> Option<PathBuf> {
    let entries = std::fs::read_dir(game_cover_dir).ok()?;
    let expected_prefix = format!("{}.", cloud_cover_file_stem(game_id));

    for entry in entries.flatten() {
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

fn content_type_for_file(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_ascii_lowercase())
        .as_deref()
    {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("png") => "image/png",
        Some("gif") => "image/gif",
        Some("bmp") => "image/bmp",
        Some("webp") => "image/webp",
        Some("avif") => "image/avif",
        _ => "application/octet-stream",
    }
}

fn parse_game_id_from_uri(parsed: &url::Url) -> Option<u32> {
    if let Some(host) = parsed.host_str() {
        if host != "localhost" {
            if let Ok(id) = host.parse::<u32>() {
                return Some(id);
            }
        }
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

#[command]
pub async fn delete_cloud_cache(game_id: u32) -> Result<(), String> {
    let game_cover_dir = get_game_cover_dir(game_id)?;
    let expected_prefix = format!("{}.", cloud_cover_file_stem(game_id));

    if !game_cover_dir.exists() {
        return Ok(());
    }

    let entries =
        std::fs::read_dir(&game_cover_dir).map_err(|e| format!("无法读取封面目录: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let file_name = entry.file_name();
        let file_name_str = file_name.to_string_lossy();
        if !file_name_str.starts_with(&expected_prefix) {
            continue;
        }

        std::fs::remove_file(&path).map_err(|e| format!("删除云端缓存失败: {}", e))?;
    }

    Ok(())
}

fn try_start_download(
    state: &DownloadState,
    game_id: u32,
    url: &str,
) -> Option<InFlightDownloadGuard> {
    let key = DownloadKey {
        game_id,
        url: url.to_string(),
    };
    let mut in_flight = state
        .in_flight_downloads
        .lock()
        .unwrap_or_else(|e| e.into_inner());

    if !in_flight.insert(key.clone()) {
        return None;
    }

    Some(InFlightDownloadGuard {
        in_flight_downloads: state.in_flight_downloads.clone(),
        key,
    })
}

async fn cache_cloud_cover(
    game_id: u32,
    url: String,
    game_cover_dir: PathBuf,
    semaphore: Arc<Semaphore>,
    _download_guard: InFlightDownloadGuard,
) {
    let _permit = match semaphore.acquire_owned().await {
        Ok(permit) => permit,
        Err(err) => {
            log::warn!("获取封面下载许可失败 game_id={}: {}", game_id, err);
            return;
        }
    };

    if get_cached_cloud_cover(&game_cover_dir, game_id).is_some() {
        return;
    }

    let extension = infer_cache_extension(&url);
    let cache_path = build_cache_path(&game_cover_dir, game_id, &extension);
    let temp_path = build_temp_cache_path(&game_cover_dir, game_id, &extension);

    if let Err(err) = tokio::fs::create_dir_all(&game_cover_dir).await {
        log::warn!(
            "创建封面缓存目录失败 game_id={} dir={}: {}",
            game_id,
            game_cover_dir.display(),
            err
        );
        return;
    }

    if tokio::fs::metadata(&cache_path).await.is_ok() {
        return;
    }

    let response = match cover_http_client().get(&url).send().await {
        Ok(response) => response,
        Err(err) => {
            log::warn!("下载封面失败 game_id={} url={}: {}", game_id, url, err);
            return;
        }
    };

    if !response.status().is_success() {
        log::warn!(
            "下载封面返回非成功状态 game_id={} url={} status={}",
            game_id,
            url,
            response.status()
        );
        return;
    }

    let bytes = match response.bytes().await {
        Ok(bytes) => bytes,
        Err(err) => {
            log::warn!(
                "读取封面响应体失败 game_id={} url={}: {}",
                game_id,
                url,
                err
            );
            return;
        }
    };

    if let Err(err) = tokio::fs::write(&temp_path, &bytes).await {
        log::warn!(
            "写入封面临时缓存失败 game_id={} path={}: {}",
            game_id,
            temp_path.display(),
            err
        );
        remove_file_if_exists(&temp_path).await;
        return;
    }

    if tokio::fs::metadata(&cache_path).await.is_ok() {
        remove_file_if_exists(&temp_path).await;
        return;
    }

    if let Err(err) = tokio::fs::rename(&temp_path, &cache_path).await {
        log::warn!(
            "提交封面缓存失败 game_id={} from={} to={}: {}",
            game_id,
            temp_path.display(),
            cache_path.display(),
            err
        );
        remove_file_if_exists(&temp_path).await;
        return;
    }

    log::debug!(
        "封面缓存完成 game_id={} path={} ua={}",
        game_id,
        cache_path.display(),
        COVER_USER_AGENT
    );
}

pub fn register_game_cover_protocol<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    builder
        .manage(DownloadState {
            semaphore: Arc::new(Semaphore::new(MAX_CONCURRENT_COVER_DOWNLOADS)),
            in_flight_downloads: Arc::new(Mutex::new(HashSet::new())),
        })
        .register_asynchronous_uri_scheme_protocol("reina-cover", |app, request, responder| {
            let app_handle = app.app_handle().clone();
            let request_uri = request.uri().to_string();

            tauri::async_runtime::spawn(async move {
                let parsed = match url::Url::parse(&request_uri) {
                    Ok(url) => url,
                    Err(_) => {
                        responder.respond(
                            Response::builder()
                                .status(StatusCode::BAD_REQUEST)
                                .body(Vec::new())
                                .expect("failed to build bad request response"),
                        );
                        return;
                    }
                };

                let game_id = match parse_game_id_from_uri(&parsed) {
                    Some(id) => id,
                    None => {
                        responder.respond(
                            Response::builder()
                                .status(StatusCode::BAD_REQUEST)
                                .body(Vec::new())
                                .expect("failed to build bad request response"),
                        );
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
                        responder.respond(
                            Response::builder()
                                .status(StatusCode::INTERNAL_SERVER_ERROR)
                                .body(Vec::new())
                                .expect("failed to build server error response"),
                        );
                        return;
                    }
                };

                if let Some(cache_path) = get_cached_cloud_cover(&game_cover_dir, game_id) {
                    if let Ok(bytes) = tokio::fs::read(&cache_path).await {
                        responder.respond(
                            Response::builder()
                                .status(StatusCode::OK)
                                .header("Content-Type", content_type_for_file(&cache_path))
                                .header("Access-Control-Allow-Origin", "*")
                                .body(bytes)
                                .expect("failed to build cache hit response"),
                        );
                        return;
                    }
                }

                if let Some(url) = cloud_url {
                    let state = app_handle.state::<DownloadState>();
                    let Some(download_guard) = try_start_download(&state, game_id, &url) else {
                        log::debug!("跳过重复封面下载 game_id={} url={}", game_id, url);

                        responder.respond(
                            Response::builder()
                                .status(StatusCode::FOUND)
                                .header("Location", url)
                                .body(Vec::new())
                                .expect("failed to build redirect response"),
                        );
                        return;
                    };
                    let semaphore = state.semaphore.clone();
                    let game_cover_dir_for_task = game_cover_dir.clone();
                    let url_for_task = url.clone();

                    tauri::async_runtime::spawn(async move {
                        cache_cloud_cover(
                            game_id,
                            url_for_task,
                            game_cover_dir_for_task,
                            semaphore,
                            download_guard,
                        )
                        .await;
                    });

                    responder.respond(
                        Response::builder()
                            .status(StatusCode::FOUND)
                            .header("Location", url)
                            .body(Vec::new())
                            .expect("failed to build redirect response"),
                    );
                    return;
                }

                responder.respond(
                    Response::builder()
                        .status(StatusCode::NOT_FOUND)
                        .body(Vec::new())
                        .expect("failed to build not found response"),
                );
            });
        })
}
