use super::{
    persistence::{check_task_control, emit_progress, update_task_progress},
    types::{DOWNLOAD_IDLE_TIMEOUT, TaskControl, TaskFailure},
};
use crate::entity::tasks;
use crate::install::protocol::InstallRequest;
use crate::utils::http::get_download_client;
use sea_orm::DatabaseConnection;
use sha2::{Digest, Sha256};
use std::fs::File as StdFile;
use std::io::{BufReader, Read};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;
use tokio::sync::watch;

const TRUSTED_DOWNLOAD_HOST: &str = "dl.hikarifallback.uk";

pub(crate) async fn download_file(
    app: &tauri::AppHandle,
    db: &DatabaseConnection,
    task: &tasks::Model,
    request: &InstallRequest,
    partial_path: &Path,
    control: &mut watch::Receiver<TaskControl>,
) -> Result<(), TaskFailure> {
    check_task_control(control)?;
    let mut downloaded = match tokio::fs::metadata(partial_path).await {
        Ok(metadata) => metadata.len(),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => 0,
        Err(error) => return Err(TaskFailure::new("task_file_failed", error.to_string())),
    };
    if downloaded > request.size {
        tokio::fs::remove_file(partial_path)
            .await
            .map_err(|error| TaskFailure::new("task_file_failed", error.to_string()))?;
        downloaded = 0;
    }
    if downloaded == request.size {
        update_task_progress(db, task.id, downloaded as i64, Some(request.size as i64)).await?;
        emit_progress(
            app,
            task.id,
            "running",
            Some("downloading"),
            downloaded as i64,
            Some(request.size as i64),
            Some("bytes"),
        );
        return Ok(());
    }
    if chrono::Utc::now().timestamp() >= request.expires_at {
        return Err(TaskFailure::new(
            "url_expired",
            format!(
                "下载直链已过期，请重新从资源提供方（{}）获取直链；已下载的临时文件会保留",
                request.provider
            ),
        ));
    }

    let mut response = send_download_request(&request.url, downloaded).await?;
    let status = response.status();
    if matches!(status.as_u16(), 401 | 403) {
        return Err(TaskFailure::new(
            "url_expired",
            format!(
                "下载直链已失效，请重新从资源提供方（{}）获取直链；已下载的临时文件会保留",
                request.provider
            ),
        ));
    }
    let is_partial = status == tauri_plugin_http::reqwest::StatusCode::PARTIAL_CONTENT;
    if downloaded > 0 && status == tauri_plugin_http::reqwest::StatusCode::OK {
        // 服务端忽略 Range 时从头下载，避免把完整响应追加到已有临时文件。
        downloaded = 0;
    } else if is_partial {
        let content_range = response
            .headers()
            .get(tauri_plugin_http::reqwest::header::CONTENT_RANGE)
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| {
                TaskFailure::new("invalid_content_range", "下载服务器缺少 Content-Range")
            })?;
        validate_content_range(content_range, downloaded, request.size)?;
    } else if status != tauri_plugin_http::reqwest::StatusCode::OK {
        return Err(TaskFailure::new(
            "http_status",
            format!("下载服务器返回 HTTP {}", status.as_u16()),
        ));
    }
    let expected_response_size = request.size.saturating_sub(downloaded);
    if let Some(content_length) = response.content_length()
        && content_length != expected_response_size
    {
        return Err(TaskFailure::new(
            "size_mismatch",
            format!(
                "服务器文件大小与请求不一致：期望 {}，实际 {}",
                expected_response_size, content_length
            ),
        ));
    }

    let mut file = if downloaded > 0 && is_partial {
        tokio::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(partial_path)
            .await
    } else {
        tokio::fs::File::create(partial_path).await
    }
    .map_err(|error| TaskFailure::new("task_file_failed", error.to_string()))?;
    update_task_progress(db, task.id, downloaded as i64, Some(request.size as i64)).await?;
    emit_progress(
        app,
        task.id,
        "running",
        Some("downloading"),
        downloaded as i64,
        Some(request.size as i64),
        Some("bytes"),
    );
    let mut last_report = Instant::now();
    let mut last_reported_bytes = downloaded;
    loop {
        check_task_control(control)?;
        let chunk = tokio::select! {
            changed = control.changed() => {
                if changed.is_err() {
                    return Err(TaskFailure::new("cancelled", "任务运行控制已关闭"));
                }
                check_task_control(control)?;
                continue;
            }
            result = tokio::time::timeout(DOWNLOAD_IDLE_TIMEOUT, response.chunk()) => {
                result
                    .map_err(|_| TaskFailure::new("download_timeout", "下载连接长时间未返回数据"))?
                    .map_err(|_| TaskFailure::new("download_failed", "下载连接中断"))?
            }
        };
        let Some(chunk) = chunk else {
            break;
        };
        check_task_control(control)?;
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        if downloaded > request.size {
            return Err(TaskFailure::new(
                "size_mismatch",
                "下载数据超过协议声明的文件大小",
            ));
        }
        file.write_all(&chunk)
            .await
            .map_err(|error| TaskFailure::new("task_file_failed", error.to_string()))?;

        if last_report.elapsed() >= Duration::from_millis(500)
            || downloaded.saturating_sub(last_reported_bytes) >= 4 * 1024 * 1024
        {
            update_task_progress(db, task.id, downloaded as i64, Some(request.size as i64)).await?;
            emit_progress(
                app,
                task.id,
                "running",
                Some("downloading"),
                downloaded as i64,
                Some(request.size as i64),
                Some("bytes"),
            );
            last_report = Instant::now();
            last_reported_bytes = downloaded;
        }
    }
    file.flush()
        .await
        .map_err(|error| TaskFailure::new("task_file_failed", error.to_string()))?;
    if downloaded != request.size {
        return Err(TaskFailure::new(
            "size_mismatch",
            format!(
                "下载文件大小不一致：期望 {}，实际 {}",
                request.size, downloaded
            ),
        ));
    }
    update_task_progress(db, task.id, downloaded as i64, Some(request.size as i64)).await?;
    emit_progress(
        app,
        task.id,
        "running",
        Some("downloading"),
        downloaded as i64,
        Some(request.size as i64),
        Some("bytes"),
    );
    Ok(())
}

async fn send_download_request(
    initial_url: &str,
    range_start: u64,
) -> Result<tauri_plugin_http::reqwest::Response, TaskFailure> {
    let mut url = url::Url::parse(initial_url)
        .map_err(|_| TaskFailure::new("invalid_url", "下载 URL 无效"))?;
    for redirect_count in 0..=5 {
        validate_download_url(&url)?;
        let client = get_download_client()
            .map_err(|message| TaskFailure::new("download_client_failed", message))?;
        let mut request = client.get(url.clone());
        if range_start > 0 {
            request = request.header(
                tauri_plugin_http::reqwest::header::RANGE,
                format!("bytes={range_start}-"),
            );
        }
        let response = tokio::time::timeout(DOWNLOAD_IDLE_TIMEOUT, request.send())
            .await
            .map_err(|_| TaskFailure::new("download_timeout", "下载服务器响应超时"))?
            .map_err(|_| TaskFailure::new("download_failed", "无法连接下载服务器"))?;
        if !response.status().is_redirection() {
            return Ok(response);
        }
        if redirect_count == 5 {
            return Err(TaskFailure::new(
                "too_many_redirects",
                "下载地址重定向次数过多",
            ));
        }
        let location = response
            .headers()
            .get(tauri_plugin_http::reqwest::header::LOCATION)
            .and_then(|value| value.to_str().ok())
            .ok_or_else(|| TaskFailure::new("invalid_redirect", "下载服务器返回了无效重定向"))?;
        url = url
            .join(location)
            .map_err(|_| TaskFailure::new("invalid_redirect", "下载服务器返回了无效重定向"))?;
    }
    Err(TaskFailure::new(
        "too_many_redirects",
        "下载地址重定向次数过多",
    ))
}

fn validate_content_range(
    value: &str,
    expected_start: u64,
    expected_total: u64,
) -> Result<(), TaskFailure> {
    let value = value.strip_prefix("bytes ").ok_or_else(|| {
        TaskFailure::new(
            "invalid_content_range",
            "下载服务器返回了无效 Content-Range",
        )
    })?;
    let (range, total) = value.split_once('/').ok_or_else(|| {
        TaskFailure::new(
            "invalid_content_range",
            "下载服务器返回了无效 Content-Range",
        )
    })?;
    let (start, end) = range.split_once('-').ok_or_else(|| {
        TaskFailure::new(
            "invalid_content_range",
            "下载服务器返回了无效 Content-Range",
        )
    })?;
    let start = start.parse::<u64>().map_err(|_| {
        TaskFailure::new(
            "invalid_content_range",
            "下载服务器返回了无效 Content-Range",
        )
    })?;
    let end = end.parse::<u64>().map_err(|_| {
        TaskFailure::new(
            "invalid_content_range",
            "下载服务器返回了无效 Content-Range",
        )
    })?;
    let total = total.parse::<u64>().map_err(|_| {
        TaskFailure::new(
            "invalid_content_range",
            "下载服务器返回了无效 Content-Range",
        )
    })?;
    if start != expected_start || total != expected_total || end < start || end >= total {
        return Err(TaskFailure::new(
            "invalid_content_range",
            "下载服务器返回的续传范围与本地临时文件不一致",
        ));
    }
    Ok(())
}

fn validate_download_url(url: &url::Url) -> Result<(), TaskFailure> {
    if url.scheme() != "https" {
        return Err(TaskFailure::new("unsafe_url", "下载地址仅支持 HTTPS"));
    }
    let host = url
        .host_str()
        .ok_or_else(|| TaskFailure::new("unsafe_url", "下载地址缺少主机名"))?;
    if !host.eq_ignore_ascii_case(TRUSTED_DOWNLOAD_HOST) {
        return Err(TaskFailure::new(
            "unsafe_url",
            "下载地址不属于受信任的下载服务器",
        ));
    }
    if let Some(port) = url.port()
        && port != 443
    {
        return Err(TaskFailure::new("unsafe_url", "下载地址使用了不允许的端口"));
    }
    Ok(())
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
    use super::validate_download_url;

    #[test]
    fn download_url_only_allows_trusted_https_host_and_port() {
        let allowed = [
            "https://dl.hikarifallback.uk/file.zip",
            "https://dl.hikarifallback.uk:443/file.zip",
            "https://DL.HIKARIFALLBACK.UK/file.zip",
        ];
        for value in allowed {
            let url = url::Url::parse(value).unwrap();
            assert!(validate_download_url(&url).is_ok(), "应允许 {value}");
        }

        let rejected = [
            "http://dl.hikarifallback.uk/file.zip",
            "https://dl.hikarifallback.uk:8080/file.zip",
            "https://evil.example.com/file.zip",
            "https://127.0.0.1/file.zip",
            "https://dl.hikarifallback.uk.evil.example.com/file.zip",
        ];
        for value in rejected {
            let url = url::Url::parse(value).unwrap();
            let failure = validate_download_url(&url).expect_err(value);
            assert_eq!(failure.code, "unsafe_url", "应拒绝 {value}");
        }
    }
}
