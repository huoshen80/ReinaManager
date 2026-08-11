use crate::database::dto::FullGameData;
use crate::database::repository::games_repository::GamesRepository;
use log::{info, warn};
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Runtime};
use tauri_plugin_opener::OpenerExt;

#[derive(Debug, Serialize, Deserialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum LaunchResult {
    Tracking {
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        process_id: Option<u32>,
    },
    Delegated {
        message: String,
    },
    Failed {
        message: String,
    },
}

impl LaunchResult {
    pub fn tracking(message: String, process_id: Option<u32>) -> Self {
        Self::Tracking {
            message,
            process_id,
        }
    }

    #[cfg(target_os = "linux")]
    pub fn delegated(message: impl Into<String>) -> Self {
        Self::Delegated {
            message: message.into(),
        }
    }

    pub fn failed(message: impl Into<String>) -> Self {
        Self::Failed {
            message: message.into(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StopResult {
    success: bool,
    message: String,
    terminated_count: u32,
}

impl StopResult {
    pub fn success(message: String, terminated_count: u32) -> Self {
        Self {
            success: true,
            message,
            terminated_count,
        }
    }
}

pub struct ValidatedSteamLaunch {
    pub steam_launch_id: String,
    pub game_dir: String,
}

pub struct ValidatedLocalLaunch {
    pub game_dir: PathBuf,
    pub executable_path: PathBuf,
}

pub async fn load_game(db: &DatabaseConnection, game_id: u32) -> Result<FullGameData, String> {
    GamesRepository::find_by_id(db, game_id as i32)
        .await
        .map_err(|error| format!("查询游戏失败: {error}"))?
        .ok_or_else(|| format!("游戏不存在: {game_id}"))
}

pub fn validate_local_launch(game: &FullGameData) -> Result<ValidatedLocalLaunch, String> {
    if game.launch_type != "local" {
        return Err(format!("不支持的游戏启动方式: {}", game.launch_type));
    }

    let game_dir = PathBuf::from(
        game.localpath
            .as_deref()
            .ok_or_else(|| "游戏目录未设置".to_string())?,
    );
    let executable_path = game_dir.join(
        game.executable
            .as_deref()
            .ok_or_else(|| "游戏启动文件未设置".to_string())?,
    );

    Ok(ValidatedLocalLaunch {
        game_dir,
        executable_path,
    })
}

pub fn validate_and_open_steam<R: Runtime>(
    app_handle: &AppHandle<R>,
    game_id: u32,
    steam_launch_id: Option<&str>,
    game_dir: Option<&str>,
    args: Option<&[String]>,
) -> Result<ValidatedSteamLaunch, String> {
    let steam_launch_id = steam_launch_id
        .map(str::trim)
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .map(|value| value.to_string())
        .ok_or_else(|| "Steam 启动 ID 无效，请重新关联 Steam 启动项".to_string())?;
    let game_dir = game_dir
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Steam 游戏监控目录未设置，请重新关联 Steam 启动项".to_string())?;
    if !Path::new(game_dir).is_dir() {
        return Err(format!(
            "Steam 游戏监控目录不存在，请重新关联 Steam 启动项: {game_dir}"
        ));
    }

    if args.is_some_and(|values| !values.is_empty()) {
        warn!("Steam URI 启动暂不支持附加启动参数 game_id={game_id}");
    }

    let steam_uri = format!("steam://rungameid/{steam_launch_id}");
    app_handle
        .opener()
        .open_url(&steam_uri, None::<&str>)
        .map_err(|error| format!("打开 Steam 启动项失败: {error}"))?;

    info!(
        "已请求 Steam 启动游戏 game_id={} steam_launch_id={} detection_dir={}",
        game_id, steam_launch_id, game_dir
    );

    Ok(ValidatedSteamLaunch {
        steam_launch_id,
        game_dir: game_dir.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::LaunchResult;
    use serde_json::json;

    #[test]
    fn launch_result_serializes_as_discriminated_union() {
        assert_eq!(
            serde_json::to_value(LaunchResult::tracking("已监控".to_string(), Some(42))).unwrap(),
            json!({ "status": "tracking", "message": "已监控", "process_id": 42 })
        );
        assert_eq!(
            serde_json::to_value(LaunchResult::Tracking {
                message: "无进程号".to_string(),
                process_id: None,
            })
            .unwrap(),
            json!({ "status": "tracking", "message": "无进程号" })
        );
        assert_eq!(
            serde_json::to_value(LaunchResult::Delegated {
                message: "已委托".to_string(),
            })
            .unwrap(),
            json!({ "status": "delegated", "message": "已委托" })
        );
        assert_eq!(
            serde_json::to_value(LaunchResult::failed("失败")).unwrap(),
            json!({ "status": "failed", "message": "失败" })
        );
    }
}
