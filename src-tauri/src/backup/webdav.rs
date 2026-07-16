//! WebDAV 备份操作模块
//!
//! 通过标准 WebDAV 协议与远程服务器交互，实现数据库备份文件的上传、下载、列举和删除。

use quick_xml::events::Event;
use quick_xml::Reader;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

/// 远程备份文件信息
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebdavBackupInfo {
    pub name: String,
    pub size: u64,
    pub modified: String,
}

/// 构建远程文件完整 URL
pub(crate) fn build_remote_url(base_url: &str, root: &Option<String>, filename: &str) -> String {
    let base = base_url.trim_end_matches('/');
    let path = match root.as_ref().filter(|r| !r.trim().is_empty()) {
        Some(r) => format!("{}/{}", r.trim_end_matches('/'), filename),
        None => filename.to_string(),
    };
    format!("{}/{}", base, path)
}

/// 创建 HTTP 客户端（统一超时配置）
fn create_client() -> Result<Client, String> {
    Client::builder()
        .timeout(Duration::from_secs(60))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {}", e))
}

/// PROPFIND 请求用的 XML body
fn propfind_xml() -> &'static str {
    r#"<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:">
  <d:prop>
    <d:displayname/>
    <d:getcontentlength/>
    <d:getlastmodified/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>"#
}

/// 从 PROPFIND 的 XML 响应中提取文件列表，解析 size 和 modified 字段
fn parse_propfind_response(xml: &str) -> Vec<WebdavBackupInfo> {
    let mut reader = Reader::from_str(xml);
    let mut buf = Vec::new();

    let mut backups = Vec::new();
    let mut in_response = false;
    let mut in_propstat = false;
    let mut in_href = false;
    let mut in_content_length = false;
    let mut in_last_modified = false;
    let mut current_href = String::new();
    let mut current_size: u64 = 0;
    let mut current_modified = String::new();
    let mut current_text = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) => {
                let local = e.local_name().as_ref().to_ascii_lowercase();
                match local.as_slice() {
                    b"response" => {
                        in_response = true;
                        current_href.clear();
                        current_size = 0;
                        current_modified.clear();
                    }
                    b"propstat" if in_response => {
                        in_propstat = true;
                    }
                    b"href" => {
                        in_href = true;
                        current_text.clear();
                    }
                    b"getcontentlength" if in_propstat => {
                        in_content_length = true;
                        current_text.clear();
                    }
                    b"getlastmodified" if in_propstat => {
                        in_last_modified = true;
                        current_text.clear();
                    }
                    _ => {}
                }
            }
            Ok(Event::Text(ref e)) => {
                if in_href || in_content_length || in_last_modified {
                    if let Ok(text) = e.unescape() {
                        current_text.push_str(&text);
                    }
                }
            }
            Ok(Event::End(ref e)) => {
                let local = e.local_name().as_ref().to_ascii_lowercase();
                match local.as_slice() {
                    b"href" if in_response => {
                        current_href = current_text.clone();
                        in_href = false;
                    }
                    b"getcontentlength" => {
                        current_size = current_text.parse::<u64>().unwrap_or(0);
                        in_content_length = false;
                    }
                    b"getlastmodified" => {
                        current_modified = current_text.clone();
                        in_last_modified = false;
                    }
                    b"propstat" => {
                        in_propstat = false;
                    }
                    b"response" => {
                        in_response = false;
                        // 提取文件名
                        let filename = current_href
                            .rsplit('/')
                            .next()
                            .unwrap_or("")
                            .to_string();
                        if !filename.is_empty() && !current_href.ends_with('/') {
                            // 只匹配数据库备份文件
                            if filename.starts_with("reina_manager_") && filename.ends_with(".db")
                            {
                                backups.push(WebdavBackupInfo {
                                    name: filename,
                                    size: current_size,
                                    modified: current_modified.clone(),
                                });
                            }
                        }
                        current_href.clear();
                    }
                    _ => {}
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => {
                log::warn!("PROPFIND XML 解析失败: {}", e);
                break;
            }
            _ => {}
        }
        buf.clear();
    }

    backups
}

pub async fn test_connection(
    url: &str,
    username: &str,
    password: &str,
) -> Result<bool, String> {
    if url.trim().is_empty() {
        return Err("WebDAV URL 不能为空".to_string());
    }
    if username.trim().is_empty() {
        return Err("用户名不能为空".to_string());
    }

    let client = create_client()?;
    let method = reqwest::Method::from_bytes(b"PROPFIND")
        .map_err(|e| format!("无效 HTTP 方法: {}", e))?;

    let resp = client
        .request(method, url.trim_end_matches('/'))
        .header("Depth", "0")
        .header("Content-Type", "application/xml; charset=utf-8")
        .basic_auth(username.trim(), Some(password.trim()))
        .body(propfind_xml().as_bytes().to_vec())
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "WebDAV 连接超时，请检查地址和网络".to_string()
            } else if e.is_connect() {
                format!("无法连接到 WebDAV 服务器: {}", e)
            } else {
                format!("WebDAV 请求失败: {}", e)
            }
        })?;

    match resp.status().as_u16() {
        200 | 207 => Ok(true),
        401 => Err("WebDAV 认证失败，请检查用户名和密码".to_string()),
        404 => Err("WebDAV 路径不存在，请检查 URL".to_string()),
        code => Err(format!("WebDAV 返回错误状态码: {}", code)),
    }
}

/// 列出远程目录下的备份文件
pub async fn list_backups(
    url: &str,
    username: &str,
    password: &str,
    root: &Option<String>,
) -> Result<Vec<WebdavBackupInfo>, String> {
    let base_url = url.trim_end_matches('/');
    let target_url = match root.as_ref().filter(|r| !r.trim().is_empty()) {
        Some(r) => format!("{}/{}", base_url, r.trim_end_matches('/')),
        None => base_url.to_string(),
    };

    let client = create_client()?;
    let method = reqwest::Method::from_bytes(b"PROPFIND")
        .map_err(|e| format!("无效 HTTP 方法: {}", e))?;

    let resp = client
        .request(method, &target_url)
        .header("Depth", "1")
        .header("Content-Type", "application/xml; charset=utf-8")
        .basic_auth(username.trim(), Some(password.trim()))
        .body(propfind_xml().as_bytes().to_vec())
        .send()
        .await
        .map_err(|e| format!("列举远程文件失败: {}", e))?;

    if !resp.status().is_success() && resp.status().as_u16() != 207 {
        return Err(format!("列举远程文件失败: HTTP {}", resp.status()));
    }

    let status = resp.status();
    let body = resp.text().await.map_err(|e| format!("读取响应失败: {}", e))?;
    let backups = parse_propfind_response(&body);

    log::info!("WebDAV list_backups target={} status={} body_len={} found={}", target_url, status, body.len(), backups.len());

    if backups.is_empty() {
        // 打印前 300 字符方便调试
        let preview: String = body.chars().take(300).collect();
        log::debug!("WebDAV PROPFIND response preview: {}", preview);
    }

    Ok(backups)
}

/// 确保远程目录存在（MKCOL），如果已存在则忽略错误
async fn ensure_remote_dir(
    url: &str,
    username: &str,
    password: &str,
    root: &Option<String>,
) -> Result<(), String> {
    let dir_url = build_remote_url(url, root, "_mkdir_check_");
    // 去掉文件名部分得到目录 URL
    let dir_url = match dir_url.rfind('/') {
        Some(pos) => dir_url[..pos + 1].to_string(),
        None => return Ok(()),
    };

    let client = create_client()?;
    let method = reqwest::Method::from_bytes(b"MKCOL")
        .map_err(|e| format!("无效 HTTP 方法: {}", e))?;

    let resp = client
        .request(method, &dir_url)
        .basic_auth(username.trim(), Some(password.trim()))
        .send()
        .await;

    match resp {
        Ok(r) => {
            match r.status().as_u16() {
                201 | 200 => {
                    log::info!("WebDAV 目录创建成功: {}", dir_url);
                    Ok(())
                }
                405 => {
                    // 目录已存在
                    Ok(())
                }
                code => {
                    log::warn!("WebDAV MKCOL 返回意外状态 {}，继续上传", code);
                    Ok(())
                }
            }
        }
        Err(e) => {
            log::warn!("WebDAV MKCOL 请求失败（目录可能已存在）: {}，继续上传", e);
            Ok(())
        }
    }
}

/// 递归创建多级远程目录。
///
/// 对 subdir_path 按 '/' 分割，逐级 MKCOL，忽略已存在（405）错误。
pub(crate) async fn ensure_nested_remote_dir(
    url: &str,
    username: &str,
    password: &str,
    subdir_path: &str,
) -> Result<(), String> {
    if subdir_path.is_empty() {
        return Ok(());
    }

    let client = create_client()?;
    let base_url = url.trim_end_matches('/');

    // 逐级创建目录
    let segments: Vec<&str> = subdir_path.split('/').filter(|s| !s.is_empty()).collect();
    let mut current_path = base_url.to_string();

    for segment in segments {
        current_path = format!("{}/{}", current_path, segment);

        let method = reqwest::Method::from_bytes(b"MKCOL")
            .map_err(|e| format!("无效 HTTP 方法: {}", e))?;

        let resp = client
            .request(method, &current_path)
            .basic_auth(username.trim(), Some(password.trim()))
            .send()
            .await;

        match resp {
            Ok(r) => {
                match r.status().as_u16() {
                    201 | 200 => {
                        log::info!("WebDAV 目录创建成功: {}", current_path);
                    }
                    405 => {
                        // 目录已存在，正常
                    }
                    code => {
                        log::warn!("WebDAV MKCOL {} 返回意外状态 {}，继续", current_path, code);
                    }
                }
            }
            Err(e) => {
                log::warn!("WebDAV MKCOL 请求失败（目录可能已存在）: {}，继续", e);
            }
        }
    }

    Ok(())
}

/// 上传备份文件到 WebDAV
pub async fn upload_backup(
    url: &str,
    username: &str,
    password: &str,
    root: &Option<String>,
    filename: &str,
    local_path: &str,
) -> Result<(), String> {
    // 确保远程目录存在
    ensure_remote_dir(url, username, password, root).await?;

    let remote_url = build_remote_url(url, root, filename);
    let data = tokio::fs::read(local_path)
        .await
        .map_err(|e| format!("读取本地备份文件失败: {}", e))?;

    let client = create_client()?;
    let resp = client
        .put(&remote_url)
        .basic_auth(username.trim(), Some(password.trim()))
        .body(data)
        .send()
        .await
        .map_err(|e| format!("上传到 WebDAV 失败: {}", e))?;

    if resp.status().is_success() {
        log::info!("WebDAV 上传成功: {}", remote_url);
        Ok(())
    } else {
        Err(format!("WebDAV 上传失败: HTTP {}", resp.status()))
    }
}

/// 从 WebDAV 下载备份文件到本地临时路径
pub async fn download_backup(
    url: &str,
    username: &str,
    password: &str,
    root: &Option<String>,
    filename: &str,
    local_path: &str,
) -> Result<(), String> {
    let remote_url = build_remote_url(url, root, filename);
    let client = create_client()?;

    let resp = client
        .get(&remote_url)
        .basic_auth(username.trim(), Some(password.trim()))
        .send()
        .await
        .map_err(|e| format!("从 WebDAV 下载失败: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("WebDAV 下载失败: HTTP {}", resp.status()));
    }

    let data = resp.bytes().await.map_err(|e| format!("读取下载数据失败: {}", e))?;
    tokio::fs::write(local_path, &data)
        .await
        .map_err(|e| format!("写入本地文件失败: {}", e))?;

    log::info!("WebDAV 下载成功: {} -> {}", remote_url, local_path);
    Ok(())
}

/// 删除远程备份文件
pub async fn delete_backup(
    url: &str,
    username: &str,
    password: &str,
    root: &Option<String>,
    filename: &str,
) -> Result<(), String> {
    let remote_url = build_remote_url(url, root, filename);
    let client = create_client()?;

    let resp = client
        .delete(&remote_url)
        .basic_auth(username.trim(), Some(password.trim()))
        .send()
        .await
        .map_err(|e| format!("删除远程备份文件失败: {}", e))?;

    if resp.status().is_success() {
        log::info!("WebDAV 删除成功: {}", remote_url);
        Ok(())
    } else {
        Err(format!("WebDAV 删除失败: HTTP {}", resp.status()))
    }
}

