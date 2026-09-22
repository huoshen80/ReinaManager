use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Debug)]
#[serde(rename_all = "lowercase")]
pub enum LogLevel {
    Error,
    Warn,
    Info,
    Debug,
    Trace,
    Off,
}

/// 动态设置日志输出级别（不持久化）
#[tauri::command]
pub fn set_reina_log_level(level: String) -> Result<(), String> {
    let lf = match level.to_lowercase().as_str() {
        "error" => log::LevelFilter::Error,
        "warn" => log::LevelFilter::Warn,
        "info" => log::LevelFilter::Info,
        "debug" => log::LevelFilter::Debug,
        other => return Err(format!("无效的日志级别: {}", other)),
    };
    log::set_max_level(lf);
    Ok(())
}

/// 获取当前日志级别
#[tauri::command]
pub fn get_reina_log_level() -> LogLevel {
    let level = log::max_level();
    match level {
        log::LevelFilter::Error => LogLevel::Error,
        log::LevelFilter::Warn => LogLevel::Warn,
        log::LevelFilter::Info => LogLevel::Info,
        log::LevelFilter::Debug => LogLevel::Debug,
        log::LevelFilter::Trace => LogLevel::Trace,
        log::LevelFilter::Off => LogLevel::Off,
    }
}
