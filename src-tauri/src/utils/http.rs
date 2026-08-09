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
    proxy_url: String,
}

static GLOBAL_HTTP_CLIENT: OnceLock<RwLock<HttpClientState>> = OnceLock::new();

#[tauri::command]
pub fn update_proxy_config(config: ProxyConfig) -> Result<(), String> {
    let proxy_url = config.url.trim();
    let client = build_client(proxy_url, true, true)?;
    let mut guard = http_client()
        .write()
        .map_err(|_| "更新 HTTP 客户端失败".to_string())?;
    *guard = HttpClientState {
        client,
        proxy_url: proxy_url.to_string(),
    };
    Ok(())
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

/// 下载大型文件时不设置总请求超时，并禁用自动重定向以便调用方逐跳校验地址。
pub fn get_download_client() -> Result<Client, String> {
    let proxy_url = http_client()
        .read()
        .unwrap_or_else(|error| error.into_inner())
        .proxy_url
        .clone();
    build_client(&proxy_url, false, false)
}
