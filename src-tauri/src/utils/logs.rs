use serde::{Deserialize, Serialize};
use tauri::Manager;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};

const LOG_MAX_FILE_SIZE: u64 = 1_000_000;
const LOG_KEEP_FILE_COUNT: usize = 7;

pub async fn open_log_directory(app: &tauri::AppHandle) -> Result<(), String> {
    let path = app
        .path()
        .app_log_dir()
        .map_err(|error| format!("获取日志目录失败: {error}"))?;
    super::fs::open_directory(path.to_string_lossy().into_owned()).await
}

pub fn setup_logging(app: &tauri::App) -> tauri::Result<()> {
    let builder = tauri_plugin_log::Builder::default()
        .timezone_strategy(TimezoneStrategy::UseLocal)
        .level(log::LevelFilter::Debug)
        .level_for("reqwest::connect", log::LevelFilter::Warn)
        .level_for("hyper", log::LevelFilter::Warn)
        .level_for("hyper_util", log::LevelFilter::Warn)
        .level_for("h2", log::LevelFilter::Warn)
        .max_file_size(LOG_MAX_FILE_SIZE)
        .rotation_strategy(RotationStrategy::KeepSome(LOG_KEEP_FILE_COUNT));
    let builder = if cfg!(debug_assertions) {
        builder.targets([
            Target::new(TargetKind::LogDir {
                file_name: Some("debug".into()),
            }),
            Target::new(TargetKind::Stdout),
        ])
    } else {
        builder
    };
    app.handle().plugin(builder.build())?;
    if !cfg!(debug_assertions) {
        // 保留 Debug 过滤能力，使发布版可在运行时临时提高日志级别。
        log::set_max_level(log::LevelFilter::Info);
    }
    Ok(())
}

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
