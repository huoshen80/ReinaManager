mod session;

#[cfg(target_os = "windows")]
mod windows;

#[cfg(target_os = "linux")]
mod linux;

pub use session::TimeTrackingMode;
pub(crate) use session::{MonitoredSession, finalize_monitored_session};

#[cfg(target_os = "windows")]
pub use windows::*;

#[cfg(target_os = "linux")]
pub use linux::*;
