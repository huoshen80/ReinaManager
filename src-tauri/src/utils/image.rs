use std::error::Error as StdError;
use std::path::Path;
use std::time::Duration;

use tauri::http::{Response, StatusCode};

use crate::utils::http::get_client;

const RETRY_DELAYS_MS: &[u64] = &[100, 300];

pub fn infer_image_extension(url: &str) -> Option<String> {
    let url_without_suffix = url.split(['?', '#']).next().unwrap_or(url);
    let file_name = url_without_suffix
        .rsplit('/')
        .next()
        .unwrap_or(url_without_suffix);

    file_name
        .rsplit_once('.')
        .map(|(_, ext)| ext.trim().to_ascii_lowercase())
        .filter(|ext| !ext.is_empty())
}

pub fn content_type_for_extension(ext: &str) -> &'static str {
    match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "png" => "image/png",
        "gif" => "image/gif",
        "bmp" => "image/bmp",
        "webp" => "image/webp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        _ => "application/octet-stream",
    }
}

pub fn content_type_for_file(path: &Path) -> &'static str {
    content_type_for_extension(
        path.extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.to_ascii_lowercase())
            .as_deref()
            .unwrap_or(""),
    )
}

pub fn make_image_response(
    bytes: Vec<u8>,
    content_type: &str,
    cache_control: &str,
) -> Response<Vec<u8>> {
    Response::builder()
        .status(StatusCode::OK)
        .header("Content-Type", content_type)
        .header("Cache-Control", cache_control)
        .header("Access-Control-Allow-Origin", "*")
        .body(bytes)
        .expect("failed to build image response")
}

pub fn make_status_response(status: StatusCode) -> Response<Vec<u8>> {
    Response::builder()
        .status(status)
        .body(Vec::new())
        .expect("failed to build status response")
}

// ==================== 图片代理协议 ====================

fn format_error_chain(error: &reqwest::Error) -> String {
    let mut causes = Vec::new();
    let mut source = error.source();
    while let Some(cause) = source {
        causes.push(cause.to_string());
        source = cause.source();
    }
    causes.join(" -> ")
}

async fn send_image_request(url: &str) -> Result<reqwest::Response, StatusCode> {
    let mut attempt = 0;

    loop {
        match get_client().get(url).send().await {
            Ok(response) => return Ok(response),
            Err(error) => {
                let retryable = error.is_connect() || error.is_timeout();
                let Some(delay_ms) = RETRY_DELAYS_MS.get(attempt).copied() else {
                    log::warn!(
                        "代理图片请求失败 url={} attempts={} connect={} timeout={} request={} error={} causes={}",
                        url,
                        attempt + 1,
                        error.is_connect(),
                        error.is_timeout(),
                        error.is_request(),
                        error,
                        format_error_chain(&error)
                    );
                    return Err(StatusCode::BAD_GATEWAY);
                };

                if !retryable {
                    log::warn!(
                        "代理图片请求失败 url={} attempts={} connect={} timeout={} request={} error={} causes={}",
                        url,
                        attempt + 1,
                        error.is_connect(),
                        error.is_timeout(),
                        error.is_request(),
                        error,
                        format_error_chain(&error)
                    );
                    return Err(StatusCode::BAD_GATEWAY);
                }

                attempt += 1;
                log::debug!(
                    "代理图片请求重试 url={} attempt={} delay={}ms",
                    url,
                    attempt + 1,
                    delay_ms
                );
                tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            }
        }
    }
}

async fn fetch_image(url: &str) -> Result<(Vec<u8>, String), StatusCode> {
    let parsed = url::Url::parse(url).map_err(|_| StatusCode::BAD_REQUEST)?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(StatusCode::BAD_REQUEST);
    }

    let response = send_image_request(url).await?;

    if !response.status().is_success() {
        log::warn!(
            "代理图片响应状态异常 url={} status={}",
            url,
            response.status()
        );
        return Err(StatusCode::BAD_GATEWAY);
    }

    let content_type = response
        .headers()
        .get("content-type")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(';').next())
        .map(str::trim)
        .filter(|value| value.starts_with("image/"))
        .map(str::to_owned)
        .or_else(|| {
            infer_image_extension(url)
                .map(|ext| content_type_for_extension(&ext))
                .filter(|value| value.starts_with("image/"))
                .map(str::to_owned)
        })
        .ok_or(StatusCode::UNSUPPORTED_MEDIA_TYPE)?;

    let bytes = response.bytes().await.map_err(|e| {
        log::warn!("读取代理图片响应失败 url={}: {}", url, e);
        StatusCode::BAD_GATEWAY
    })?;

    Ok((bytes.to_vec(), content_type))
}

pub fn register_image_proxy_protocol<R: tauri::Runtime>(
    builder: tauri::Builder<R>,
) -> tauri::Builder<R> {
    builder.register_asynchronous_uri_scheme_protocol("reina-image", |_app, request, responder| {
        let request_uri = request.uri().to_string();

        tauri::async_runtime::spawn(async move {
            let parsed = match url::Url::parse(&request_uri) {
                Ok(url) => url,
                Err(_) => {
                    responder.respond(make_status_response(StatusCode::BAD_REQUEST));
                    return;
                }
            };

            let image_url = parsed
                .query_pairs()
                .find(|(key, _)| key == "url")
                .map(|(_, value)| value.into_owned());
            let Some(image_url) = image_url else {
                responder.respond(make_status_response(StatusCode::BAD_REQUEST));
                return;
            };

            match fetch_image(&image_url).await {
                Ok((bytes, content_type)) => responder.respond(make_image_response(
                    bytes,
                    &content_type,
                    "private, max-age=3600",
                )),
                Err(status) => responder.respond(make_status_response(status)),
            }
        });
    })
}
