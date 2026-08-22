mod client;

#[cfg(target_os = "windows")]
mod windows;

pub use client::{
    get_client, get_system_proxy_status, get_transfer_client, has_effective_proxy,
    update_proxy_config,
};

#[cfg(target_os = "windows")]
pub use windows::{SystemProxyMonitor, start_system_proxy_monitor};
