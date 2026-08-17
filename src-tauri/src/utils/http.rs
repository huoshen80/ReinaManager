mod client;

#[cfg(target_os = "windows")]
mod windows;

pub use client::{get_client, get_transfer_client, update_proxy_config};

#[cfg(target_os = "windows")]
pub use windows::{SystemProxyMonitor, start_system_proxy_monitor};
