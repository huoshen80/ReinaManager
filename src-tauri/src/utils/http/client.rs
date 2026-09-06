use serde::Deserialize;
use std::sync::{OnceLock, RwLock};
use std::time::Duration;
use tauri_plugin_http::reqwest::{Client, NoProxy, Proxy};

const GLOBAL_USER_AGENT: &str = concat!(
    "huoshen80/ReinaManager/",
    env!("CARGO_PKG_VERSION"),
    " (https://github.com/huoshen80/ReinaManager)"
);

const DEFAULT_CONNECT_TIMEOUT_SECS: u64 = 10;
const DEFAULT_TIMEOUT_SECS: u64 = 60;
const LOCAL_PROXY_BYPASS: &str = "localhost,127.0.0.0/8,::1,0.0.0.0,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16,fc00::/7,fe80::/10,.local";

#[derive(Debug, Clone, Deserialize)]
pub struct ProxyConfig {
    pub url: String,
}

struct HttpClientState {
    client: Client,
    transfer_client: Client,
    proxy_url: String,
}

static GLOBAL_HTTP_CLIENT: OnceLock<RwLock<HttpClientState>> = OnceLock::new();

#[tauri::command]
pub fn update_proxy_config(config: ProxyConfig) -> Result<(), String> {
    let proxy_url = config.url.trim();
    let client = build_client(proxy_url, true, true)?;
    let transfer_client = build_transfer_client(proxy_url)?;
    let mut guard = http_client()
        .write()
        .map_err(|_| "更新 HTTP 客户端失败".to_string())?;
    *guard = HttpClientState {
        client,
        transfer_client,
        proxy_url: proxy_url.to_string(),
    };
    Ok(())
}

/// 系统代理变化后重建默认 HTTP 客户端。
///
/// 显式代理始终优先。构建完成后会在写锁内再次检查代理模式，避免系统代理
/// 刷新覆盖用户并发保存的新配置。
#[cfg(target_os = "windows")]
pub(super) fn refresh_system_proxy_clients() -> Result<bool, String> {
    let Some(client_state) = GLOBAL_HTTP_CLIENT.get() else {
        // 客户端尚未初始化时无需提前构建；首次使用会读取最新系统代理。
        return Ok(false);
    };

    {
        let guard = client_state
            .read()
            .unwrap_or_else(|error| error.into_inner());
        if !guard.proxy_url.is_empty() {
            return Ok(false);
        }
    }

    let client = build_client("", true, true)?;
    let transfer_client = build_transfer_client("")?;
    let mut guard = client_state
        .write()
        .map_err(|_| "刷新系统代理 HTTP 客户端失败".to_string())?;

    if !guard.proxy_url.is_empty() {
        return Ok(false);
    }

    *guard = HttpClientState {
        client,
        transfer_client,
        proxy_url: String::new(),
    };
    Ok(true)
}

/// 大文件传输专用客户端：不设总超时（由下载引擎的停滞检测负责），并强制
/// HTTP/1.1 —— HTTP/2 会把多个 Range 请求复用到一条 TCP 连接上，使多连接
/// 下载在按连接限速的 CDN 上失去意义。
fn build_transfer_client(proxy_url: &str) -> Result<Client, String> {
    let mut builder = Client::builder()
        .http1_only()
        .connect_timeout(Duration::from_secs(DEFAULT_CONNECT_TIMEOUT_SECS))
        .read_timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
        .user_agent(GLOBAL_USER_AGENT);

    if !proxy_url.is_empty() {
        let proxy = Proxy::all(proxy_url)
            .map_err(|error| format!("代理地址无效: {error}"))?
            .no_proxy(NoProxy::from_string(LOCAL_PROXY_BYPASS));
        builder = builder.proxy(proxy);
    }

    builder
        .build()
        .map_err(|error| format!("创建下载客户端失败: {error}"))
}

fn build_client(
    proxy_url: &str,
    request_timeout: bool,
    follow_redirects: bool,
) -> Result<Client, String> {
    let mut builder = Client::builder()
        .connect_timeout(Duration::from_secs(DEFAULT_CONNECT_TIMEOUT_SECS))
        .user_agent(GLOBAL_USER_AGENT);

    if request_timeout {
        builder = builder.timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS));
    }
    if !follow_redirects {
        builder = builder.redirect(tauri_plugin_http::reqwest::redirect::Policy::none());
    }
    if !proxy_url.is_empty() {
        let proxy = Proxy::all(proxy_url)
            .map_err(|e| format!("代理地址无效: {e}"))?
            .no_proxy(NoProxy::from_string(LOCAL_PROXY_BYPASS));
        builder = builder.proxy(proxy);
    }

    builder
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))
}

fn http_client() -> &'static RwLock<HttpClientState> {
    GLOBAL_HTTP_CLIENT.get_or_init(|| {
        RwLock::new(HttpClientState {
            client: build_client("", true, true).expect("failed to build default http client"),
            transfer_client: build_transfer_client("")
                .expect("failed to build default transfer client"),
            proxy_url: String::new(),
        })
    })
}

pub fn get_client() -> Client {
    http_client()
        .read()
        .unwrap_or_else(|e| e.into_inner())
        .client
        .clone()
}

pub fn get_transfer_client() -> Client {
    http_client()
        .read()
        .unwrap_or_else(|error| error.into_inner())
        .transfer_client
        .clone()
}

/// 检查当前是否存在生效的代理配置（显式代理或系统代理）。
pub fn has_effective_proxy() -> bool {
    let guard = http_client().read().unwrap_or_else(|e| e.into_inner());
    if !guard.proxy_url.is_empty() {
        return true;
    }
    #[cfg(target_os = "windows")]
    {
        super::windows::is_system_proxy_enabled()
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}

/// 获取 Windows 系统代理启用状态（供前端查询）。
#[tauri::command]
pub fn get_system_proxy_status() -> bool {
    #[cfg(target_os = "windows")]
    {
        super::windows::is_system_proxy_enabled()
    }
    #[cfg(not(target_os = "windows"))]
    {
        false
    }
}
