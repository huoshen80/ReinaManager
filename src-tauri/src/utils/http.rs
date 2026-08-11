use serde::Deserialize;
use std::sync::{OnceLock, RwLock};
use std::time::Duration;
use takanawa_reqwest::{
    Client as TransferClient, NoProxy as TransferNoProxy, Proxy as TransferProxy,
};
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
    transfer_client: TransferClient,
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
    };
    Ok(())
}

fn build_transfer_client(proxy_url: &str) -> Result<TransferClient, String> {
    let mut builder = TransferClient::builder()
        .connect_timeout(Duration::from_secs(DEFAULT_CONNECT_TIMEOUT_SECS))
        .read_timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
        .user_agent(GLOBAL_USER_AGENT);

    if !proxy_url.is_empty() {
        let proxy = TransferProxy::all(proxy_url)
            .map_err(|error| format!("代理地址无效: {error}"))?
            .no_proxy(TransferNoProxy::from_string(LOCAL_PROXY_BYPASS));
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

pub fn get_transfer_client() -> TransferClient {
    http_client()
        .read()
        .unwrap_or_else(|error| error.into_inner())
        .transfer_client
        .clone()
}
