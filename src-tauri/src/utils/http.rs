use std::sync::OnceLock;
use std::time::Duration;
use tauri_plugin_http::reqwest::Client;

const GLOBAL_USER_AGENT: &str = concat!(
    "huoshen80/ReinaManager/",
    env!("CARGO_PKG_VERSION"),
    " (https://github.com/huoshen80/ReinaManager)"
);

const DEFAULT_CONNECT_TIMEOUT_SECS: u64 = 10;
const DEFAULT_TIMEOUT_SECS: u64 = 60;

static GLOBAL_HTTP_CLIENT: OnceLock<Client> = OnceLock::new();

pub fn get_client() -> &'static Client {
    GLOBAL_HTTP_CLIENT.get_or_init(|| {
        Client::builder()
            .connect_timeout(Duration::from_secs(DEFAULT_CONNECT_TIMEOUT_SECS))
            .timeout(Duration::from_secs(DEFAULT_TIMEOUT_SECS))
            .user_agent(GLOBAL_USER_AGENT)
            .build()
            .expect("failed to build global http client")
    })
}
