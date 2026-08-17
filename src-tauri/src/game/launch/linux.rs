use super::{LaunchResult, StopResult, load_game, validate_and_open_steam, validate_local_launch};
use crate::game::monitor::{TimeTrackingMode, monitor_game, stop_game_session};
use log::{debug, info};
use sea_orm::DatabaseConnection;
use std::process::Command;
use tauri::{AppHandle, Manager, Runtime, State, command};
use tauri_plugin_store::StoreExt;

#[command]
pub async fn launch_game<R: Runtime>(
    app_handle: AppHandle<R>,
    db: State<'_, DatabaseConnection>,
    game_id: u32,
    args: Option<Vec<String>>,
    time_tracking_mode: TimeTrackingMode,
) -> Result<LaunchResult, String> {
    Ok(
        match launch_game_inner(app_handle, db, game_id, args, time_tracking_mode).await {
            Ok(result) => result,
            Err(message) => LaunchResult::failed(message),
        },
    )
}

async fn launch_game_inner<R: Runtime>(
    app_handle: AppHandle<R>,
    db: State<'_, DatabaseConnection>,
    game_id: u32,
    args: Option<Vec<String>>,
    time_tracking_mode: TimeTrackingMode,
) -> Result<LaunchResult, String> {
    let game = load_game(db.inner(), game_id).await?;

    if game.launch_type == "steam" {
        let steam_launch = validate_and_open_steam(
            &app_handle,
            game_id,
            game.steam_launch_id.as_deref(),
            game.localpath.as_deref(),
            args.as_deref(),
        )?;

        return Ok(LaunchResult::delegated(format!(
            "已交由 Steam 启动游戏 ({})",
            steam_launch.steam_launch_id
        )));
    }

    let local_launch = validate_local_launch(&game)?;
    let game_dir = local_launch.game_dir;
    let executable_path = local_launch.executable_path;
    let game_path = executable_path.to_string_lossy().to_string();

    let exe_name = match executable_path.file_name() {
        Some(name) => name,
        None => return Err("无法获取游戏可执行文件名".to_string()),
    };

    let systemd_unit_name = format!("reina_game_{}.scope", game_id);
    let _ = check_scope_or_reset_failed(&systemd_unit_name).await;

    let mut command = {
        // proton-autogen 集成：游戏配置了 profile 时，以 proton-autogen 启动，
        // prefix/Proton 版本/MangoHud 等由 proton-autogen 的 profile 管理
        let linux_launch_command = if let Some(profile) = game.proton_profile.as_deref() {
            format!("proton-autogen --profile {profile}")
        } else {
            app_handle
                .store("settings.json")
                .ok()
                .and_then(|store| store.get("linux_launch_command"))
                .and_then(|v| v.as_str().map(|s| s.to_string()))
                .unwrap_or_else(|| "wine".to_string())
        };
        let linux_launch_command = expand_path(&app_handle, &linux_launch_command);
        debug!("使用的 Linux 启动命令: {:?}", linux_launch_command);

        let mut cmd = Command::new("systemd-run");
        cmd.arg("--scope");
        cmd.arg("--user");
        cmd.arg("-p");
        cmd.arg("Delegate=yes");
        cmd.arg("--unit");
        cmd.arg(&systemd_unit_name);

        if exe_name.to_string_lossy().ends_with(".exe") {
            // 按空白拆分为多个参数，支持 "proton-autogen --profile dx11" 这类多词命令
            // ponytail: 不处理带空格的 profile 名，proton-autogen 的 profile 是文件名，不含空格
            for part in linux_launch_command.split_whitespace() {
                cmd.arg(part);
            }
        }
        cmd.arg(&game_path);
        cmd.current_dir(&game_dir);
        cmd
    };

    let args_clone = args.clone();
    if let Some(arguments) = &args_clone {
        command.args(arguments);
    }

    debug!(
        "准备启动游戏 game_id={} scope={} command={} arg_count={} cwd={}",
        game_id,
        systemd_unit_name,
        if exe_name.to_string_lossy().ends_with(".exe") {
            "systemd-run+wine"
        } else {
            "systemd-run"
        },
        args_clone.as_ref().map_or(0, Vec::len),
        game_dir.display()
    );

    match command.spawn() {
        Ok(child) => {
            let process_id = child.id();
            info!(
                "游戏启动成功 game_id={} pid={} scope={}",
                game_id, process_id, systemd_unit_name
            );

            monitor_game(
                app_handle.clone(),
                db.inner().clone(),
                time_tracking_mode,
                game_id,
                process_id,
                systemd_unit_name.clone(),
            )
            .await;

            Ok(LaunchResult::tracking(
                format!(
                    "成功启动游戏: {}，工作目录: {:?}",
                    exe_name.to_string_lossy(),
                    game_dir
                ),
                Some(process_id),
            ))
        }
        Err(e) => Err(format!("启动游戏失败: {}，目录: {:?}", e, game_dir)),
    }
}

#[command]
pub async fn stop_game(game_id: u32) -> Result<StopResult, String> {
    match stop_game_session(game_id).await {
        Ok(terminated_count) => Ok(StopResult::success(
            format!("成功停止游戏 {}，终止进程数: {}", game_id, terminated_count),
            terminated_count,
        )),
        Err(e) => Err(format!("停止游戏 {} 失败: {}", game_id, e)),
    }
}

/// 列出 proton-autogen 的可用 profile（~/.config/proton-autogen/profiles/*.json 的文件名）
#[command]
pub fn list_proton_profiles<R: Runtime>(app_handle: AppHandle<R>) -> Result<Vec<String>, String> {
    let profiles_dir = app_handle
        .path()
        .home_dir()
        .map_err(|e| format!("无法获取用户主目录: {e}"))?
        .join(".config/proton-autogen/profiles");
    let entries = std::fs::read_dir(&profiles_dir)
        .map_err(|e| format!("无法读取 proton-autogen profiles 目录: {e}"))?;
    let mut profiles: Vec<String> = entries
        .flatten()
        .filter_map(|e| {
            let path = e.path();
            let name = path.file_stem()?.to_string_lossy().to_string();
            (path.extension()?.to_string_lossy() == "json").then_some(name)
        })
        .collect();
    profiles.sort();
    Ok(profiles)
}

fn expand_path<R: Runtime>(app_handle: &AppHandle<R>, path: &str) -> String {
    if path.starts_with('~') {
        // 使用 Tauri 提供的内置路径解析
        if let Ok(home_dir) = app_handle.path().home_dir() {
            path.replacen('~', &home_dir.to_string_lossy(), 1)
        } else {
            path.to_string()
        }
    } else {
        path.to_string()
    }
}

/// 在 Linux 上检查 systemd scope 的状态，如果是 failed 则重置它
/// 返回bool值表示scope是否已经存在
/// # Arguments
/// * `systemd_unit_name` - systemd 单元名称
///
/// # Returns
/// bool - 如果 scope 已存在则返回 true，否则返回 false
async fn check_scope_or_reset_failed(systemd_unit_name: &str) -> Result<bool, String> {
    use crate::game::monitor::{get_connection, get_manager_proxy};
    let proxy = get_manager_proxy().await.map_err(|e| {
        format!(
            "连接到 systemd 失败，无法检查或重置单元 {}: {}",
            systemd_unit_name, e
        )
    })?;
    match proxy.get_unit(systemd_unit_name.to_string()).await {
        Ok(u) => {
            let conn = get_connection().await.map_err(|e| {
                format!(
                    "连接到 systemd 失败，无法检查或重置单元 {}: {}",
                    systemd_unit_name, e
                )
            })?;
            match zbus_systemd::systemd1::UnitProxy::new(conn, u).await {
                Ok(unit_proxy) => {
                    let active_state = unit_proxy
                        .active_state()
                        .await
                        .map_err(|e| format!("获取单元 {} 状态失败: {}", systemd_unit_name, e))?;
                    if active_state == "failed" {
                        proxy
                            .reset_failed_unit(systemd_unit_name.to_string())
                            .await
                            .map_err(|e| {
                                format!("重置单元 {} 状态失败: {}", systemd_unit_name, e)
                            })?;
                        info!("单元 {} 已被重置", systemd_unit_name);
                    }
                    Ok(true)
                }
                Err(_) => Ok(false),
            }
        }
        Err(_) => Ok(false),
    }
}
