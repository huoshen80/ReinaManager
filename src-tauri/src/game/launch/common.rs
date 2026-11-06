use crate::database::dto::FullGameData;
use crate::database::repository::games_repository::GamesRepository;
#[cfg(target_os = "linux")]
use crate::game::steam::steam_app_id_from_launch_id;
#[cfg(any(target_os = "windows", target_os = "linux"))]
use log::info;
use log::warn;
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
    Failed {
        message: String,
        #[serde(skip_serializing_if = "Option::is_none")]
        path_issue: Option<LaunchPathIssue>,
    },
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LaunchPathIssueKind {
    DirectoryMissing,
    DirectoryNotDirectory,
    ExecutableMissing,
    ExecutableNotFile,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LaunchPathIssue {
    kind: LaunchPathIssueKind,
    path: String,
}

impl LaunchResult {
    pub fn tracking(message: String, process_id: Option<u32>) -> Self {
        Self::Tracking {
            message,
            process_id,
        }
    }

    pub fn failed(message: impl Into<String>) -> Self {
        Self::Failed {
            message: message.into(),
            path_issue: None,
        }
    }

    fn path_invalid(kind: LaunchPathIssueKind, path: &Path) -> Self {
        let message = match kind {
            LaunchPathIssueKind::DirectoryMissing => "找不到游戏目录",
            LaunchPathIssueKind::DirectoryNotDirectory => {
                "游戏目录路径指向了文件，请重新选择游戏启动文件"
            }
            LaunchPathIssueKind::ExecutableMissing => "找不到游戏启动文件",
            LaunchPathIssueKind::ExecutableNotFile => {
                "启动路径指向了文件夹或其他非普通文件，请重新选择启动文件"
            }
        };
        Self::Failed {
            message: format!("{message}: {}", path.display()),
            path_issue: Some(LaunchPathIssue {
                kind,
                path: path.to_string_lossy().into_owned(),
            }),
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
    #[cfg(target_os = "linux")]
    /// Steam 进程实际使用的 32 位 AppId
    ///
    /// 非 Steam 快捷方式的启动 ID 与 AppId 并不相同，Linux 侧靠它识别 reaper 进程。
    pub steam_app_id: u32,
    #[cfg(target_os = "windows")]
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

fn launch_path_metadata(
    path: &Path,
    missing_kind: LaunchPathIssueKind,
) -> Result<std::fs::Metadata, LaunchResult> {
    path.metadata().map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            LaunchResult::path_invalid(missing_kind, path)
        } else {
            LaunchResult::failed(format!("无法读取游戏启动路径: {}: {error}", path.display()))
        }
    })
}

pub fn validate_local_launch(game: &FullGameData) -> Result<ValidatedLocalLaunch, LaunchResult> {
    if game.launch_type != "local" {
        return Err(LaunchResult::failed(format!(
            "不支持的游戏启动方式: {}",
            game.launch_type
        )));
    }

    let configured_game_dir = game
        .localpath
        .as_deref()
        .ok_or_else(|| LaunchResult::failed("游戏目录未设置"))?;
    let game_dir = reina_path::resolve_user_path(configured_game_dir)
        .map_err(|error| LaunchResult::failed(format!("游戏目录解析失败: {error}")))?;
    if !launch_path_metadata(&game_dir, LaunchPathIssueKind::DirectoryMissing)?.is_dir() {
        return Err(LaunchResult::path_invalid(
            LaunchPathIssueKind::DirectoryNotDirectory,
            &game_dir,
        ));
    }
    let executable_path = game_dir.join(
        game.executable
            .as_deref()
            .ok_or_else(|| LaunchResult::failed("游戏启动文件未设置"))?,
    );

    if !launch_path_metadata(&executable_path, LaunchPathIssueKind::ExecutableMissing)?.is_file() {
        return Err(LaunchResult::path_invalid(
            LaunchPathIssueKind::ExecutableNotFile,
            &executable_path,
        ));
    }

    Ok(ValidatedLocalLaunch {
        game_dir,
        executable_path,
    })
}

pub fn validate_and_open_steam<R: Runtime>(
    app_handle: &AppHandle<R>,
    game_id: u32,
    steam_launch_id: Option<&str>,
    #[cfg(target_os = "windows")] game_dir: Option<&str>,
    args: Option<&[String]>,
) -> Result<ValidatedSteamLaunch, String> {
    let steam_launch_id_value = steam_launch_id
        .map(str::trim)
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .ok_or_else(|| "Steam 启动 ID 无效，请重新关联 Steam 启动项".to_string())?;
    #[cfg(target_os = "linux")]
    let steam_app_id = steam_app_id_from_launch_id(steam_launch_id_value)
        .map_err(|_| "Steam 启动 ID 无效，请重新关联 Steam 启动项".to_string())?;
    let steam_launch_id = steam_launch_id_value.to_string();

    #[cfg(target_os = "windows")]
    let configured_game_dir = game_dir
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Steam 游戏监控目录未设置，请重新关联 Steam 启动项".to_string())?;
    #[cfg(target_os = "windows")]
    let game_dir = reina_path::resolve_user_path(configured_game_dir)
        .map_err(|error| format!("Steam 游戏监控目录解析失败: {error}"))?;
    #[cfg(target_os = "windows")]
    if !game_dir.is_dir() {
        return Err(format!(
            "Steam 游戏监控目录不存在，请重新关联 Steam 启动项: {}",
            game_dir.display()
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

    #[cfg(target_os = "windows")]
    info!(
        "已请求 Steam 启动游戏 game_id={} steam_launch_id={} detection_dir={}",
        game_id,
        steam_launch_id,
        game_dir.display()
    );
    #[cfg(target_os = "linux")]
    info!(
        "已请求 Steam 启动游戏 game_id={} steam_launch_id={} steam_app_id={}",
        game_id, steam_launch_id, steam_app_id
    );

    Ok(ValidatedSteamLaunch {
        steam_launch_id,
        #[cfg(target_os = "linux")]
        steam_app_id,
        #[cfg(target_os = "windows")]
        game_dir: game_dir.to_string_lossy().into_owned(),
    })
}

#[cfg(test)]
mod tests {
    use super::{LaunchResult, validate_local_launch};
    use crate::database::dto::FullGameData;
    use serde_json::json;
    use std::path::Path;

    #[test]
    fn local_launch_distinguishes_missing_paths_and_wrong_types() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"));
        let mut game: FullGameData = serde_json::from_value(json!({
            "id": 1,
            "id_type": "custom",
            "launch_type": "local",
            "localpath": root,
            "executable": "Cargo.toml",
            "sources": []
        }))
        .unwrap();
        assert!(validate_local_launch(&game).is_ok());

        let missing = format!("missing-launch-file-{}", std::process::id());
        assert!(!root.join(&missing).exists());
        for (directory, executable, expected_kind, expected_path) in [
            (
                root.join(&missing),
                "Cargo.toml",
                "directory_missing",
                root.join(&missing),
            ),
            (
                root.join("Cargo.toml"),
                "game.exe",
                "directory_not_directory",
                root.join("Cargo.toml"),
            ),
            (
                root.to_path_buf(),
                missing.as_str(),
                "executable_missing",
                root.join(&missing),
            ),
            (
                root.to_path_buf(),
                "src",
                "executable_not_file",
                root.join("src"),
            ),
        ] {
            game.localpath = Some(directory.to_string_lossy().into_owned());
            game.executable = Some(executable.to_string());
            let Err(failure) = validate_local_launch(&game) else {
                panic!("无效的启动路径不应通过校验");
            };
            let value = serde_json::to_value(failure).unwrap();
            assert_eq!(value["status"], "failed");
            assert_eq!(
                value["path_issue"],
                json!({"kind": expected_kind, "path": expected_path})
            );
        }

        game.localpath = Some("relative-game-directory".to_string());
        let Err(failure) = validate_local_launch(&game) else {
            panic!("相对路径不应通过校验");
        };
        assert!(
            serde_json::to_value(failure)
                .unwrap()
                .get("path_issue")
                .is_none()
        );
    }

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
            serde_json::to_value(LaunchResult::failed("失败")).unwrap(),
            json!({ "status": "failed", "message": "失败" })
        );
    }
}
