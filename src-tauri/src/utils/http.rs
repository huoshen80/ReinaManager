use std::sync::{OnceLock, RwLock};
use std::time::Duration;
use serde::Deserialize;
use tauri_plugin_http::reqwest::Client;

const GLOBAL_USER_AGENT: &str = concat!(
    "huoshen80/ReinaManager/",
    env!("CARGO_PKG_VERSION"),
    " (https://github.com/huoshen80/ReinaManager)"
);

const DEFAULT_CONNECT_TIMEOUT_SECS: u64 = 10;
const DEFAULT_TIMEOUT_SECS: u64 = 60;

#[derive(Debug, Clone, Deserialize)]
pub struct ProxyConfig {
    pub enabled: bool,
    pub url: String,
    pub hosts: Vec<String>,
}

pub static GLOBAL_PROXY_CONFIG: RwLock<Option<ProxyConfig>> = RwLock::new(None);

#[tauri::command]
pub fn update_proxy_config(config: ProxyConfig) {
    if let Ok(mut guard) = GLOBAL_PROXY_CONFIG.write() {
        *guard = Some(config);
    }
}

static GLOBAL_HTTP_CLIENT: OnceLock<Client> = OnceLock::new();

pub fn get_client() -> &'static Client {
    GLOBAL_HTTP_CLIENT.get_or_init(|| {
        let custom_proxy = tauri_plugin_http::reqwest::Proxy::custom(|url| {
            if let Ok(guard) = GLOBAL_PROXY_CONFIG.read() {
                if let Some(config) = guard.as_ref() {
                    if config.enabled && !config.url.is_empty() {
                        if let Some(host) = url.host_str() {
                            let matched = config.hosts.iter().any(|h| {
                                host == h || host.ends_with(&format!(".{}", h))
                            });
                            if matched {
                                if let Ok(proxy_url) = url::Url::parse(&config.url) {
                                    return Some(proxy_url);
                                }
                            }
                        }
                    }
                }
            }
            None
        });

        Client::builder()
            .connect_timeout(Duration::from_secs(DEFAULT_CONNECT_TIMEOUT_SECS))
            .timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
            .user_agent(GLOBAL_USER_AGENT)
            .proxy(custom_proxy)
            .build()
            .expect("failed to build global http client")
    })
}
