use super::{
    LaunchResult, StopResult, load_game, magpie, validate_and_open_steam, validate_local_launch,
};
use crate::database::dto::UpdateSettingsData;
use crate::database::repository::settings_repository::{DbSettingsExt, SettingsRepository};
use crate::game::monitor::{
    TimeTrackingMode, is_game_foreground, monitor_game, stop_game_session, wait_for_game_foreground,
};
use crate::utils::command_ext::CommandGuiExt;
use sea_orm::DatabaseConnection;
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Runtime, State, command};
use {
    log::{debug, info, warn},
    tokio::time,
};

#[derive(Clone, Copy)]
enum ToolPathKind {
    Le,
    Magpie,
}

impl ToolPathKind {
    fn label(self) -> &'static str {
        match self {
            Self::Le => "LE转区软件",
            Self::Magpie => "Magpie软件",
        }
    }

    fn clear_update(self) -> UpdateSettingsData {
        match self {
            Self::Le => UpdateSettingsData {
                le_path: Some(None),
                ..Default::default()
            },
            Self::Magpie => UpdateSettingsData {
                magpie_path: Some(None),
                ..Default::default()
            },
        }
    }
}

// ================= Windows 提权启动（ShellExecuteExW with "runas"）支持 =================
// 仅在 Windows 下编译，其他平台不包含该实现
mod win_elevated_launch {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;

    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::GetProcessId;
    use windows::Win32::UI::Shell::{
        SEE_MASK_FLAG_NO_UI, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW, ShellExecuteExW,
    };
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;
    use windows::core::PCWSTR;

    fn to_wide_null(s: &str) -> Vec<u16> {
        OsStr::new(s).encode_wide().chain(Some(0)).collect()
    }

    fn needs_quotes(s: &str) -> bool {
        s.chars().any(|c| c.is_whitespace()) || s.contains('"')
    }

    fn quote_arg(arg: &str) -> String {
        if !needs_quotes(arg) {
            return arg.to_string();
        }
        // 简单转义内部引号
        let escaped = arg.replace('"', "\\\"");
        format!("\"{}\"", escaped)
    }

    /// 使用 ShellExecuteExW("runas") 启动进程，并返回进程 PID
    pub fn shell_execute_runas(
        path: &str,
        args: Option<&[String]>,
        work_dir: &Path,
    ) -> Result<u32, String> {
        let params_str = if let Some(a) = args {
            a.iter().map(|s| quote_arg(s)).collect::<Vec<_>>().join(" ")
        } else {
            String::new()
        };

        let w_verb = to_wide_null("runas");
        let w_path = to_wide_null(path);
        let w_params = to_wide_null(&params_str);
        let w_dir = to_wide_null(&work_dir.to_string_lossy());

        let mut sei = SHELLEXECUTEINFOW {
            cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
            fMask: SEE_MASK_NOCLOSEPROCESS | SEE_MASK_FLAG_NO_UI,
            hwnd: Default::default(),
            lpVerb: PCWSTR(w_verb.as_ptr()),
            lpFile: PCWSTR(w_path.as_ptr()),
            lpParameters: PCWSTR(w_params.as_ptr()),
            lpDirectory: PCWSTR(w_dir.as_ptr()),
            nShow: SW_SHOWNORMAL.0,
            ..Default::default()
        };

        unsafe { ShellExecuteExW(&mut sei) }
            .map_err(|e| format!("ShellExecuteExW(runAs) failed: {}", e))?;

        // 获取 PID 并关闭句柄以避免句柄泄漏
        let pid = unsafe { GetProcessId(sei.hProcess) };
        unsafe {
            let _ = CloseHandle(sei.hProcess);
        } // 忽略关闭错误

        if pid == 0 {
            return Err("Failed to obtain elevated process id".to_string());
        }
        Ok(pid)
    }
}

async fn clear_tool_path_setting(
    db: &DatabaseConnection,
    tool_kind: ToolPathKind,
) -> Result<(), String> {
    SettingsRepository::update_settings(db, tool_kind.clear_update())
        .await
        .map_err(|e| format!("清空{}路径失败: {}", tool_kind.label(), e))
}

async fn resolve_tool_path(
    db: &DatabaseConnection,
    path: Option<&str>,
    tool_kind: ToolPathKind,
) -> Result<String, String> {
    let Some(path) = path.filter(|value| !value.trim().is_empty()) else {
        return Err(format!("{}路径未设置，请先配置路径", tool_kind.label()));
    };

    let tool_path = Path::new(path);
    let invalid_reason = if !tool_path.exists() {
        Some("不存在")
    } else if !tool_path.is_file() {
        Some("不是文件")
    } else {
        None
    };

    if let Some(reason) = invalid_reason {
        clear_tool_path_setting(db, tool_kind).await?;
        return Err(format!(
            "{}路径{}，已清空配置，请重新设置: {}",
            tool_kind.label(),
            reason,
            path
        ));
    }

    Ok(path.to_string())
}

/// 启动游戏
///
/// # Arguments
///
/// * `app_handle` - Tauri应用句柄
/// * `game_id` - 游戏ID (数据库记录ID)
/// * `args` - 可选的游戏启动参数
///
/// # Returns
///
/// 启动结果，区分已监控、已委托和失败三种状态
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
        let magpie_path = if game.magpie.unwrap_or(0) == 1 {
            match db.inner().get_settings().await {
                Ok(settings) => match resolve_tool_path(
                    db.inner(),
                    settings.magpie_path_value(),
                    ToolPathKind::Magpie,
                )
                .await
                {
                    Ok(path) => Some(path),
                    Err(error) => {
                        warn!(
                            "Steam 已启动，但 Magpie 配置不可用 game_id={}: {}",
                            game_id, error
                        );
                        None
                    }
                },
                Err(error) => {
                    warn!(
                        "Steam 已启动，但读取 Magpie 配置失败 game_id={}: {}",
                        game_id, error
                    );
                    None
                }
            }
        } else {
            None
        };

        monitor_game(
            app_handle.clone(),
            db.inner().clone(),
            time_tracking_mode,
            game_id,
            0,
            steam_launch.game_dir,
        )
        .await;

        if let Some(magpie_path) = magpie_path {
            tokio::spawn(async move {
                if let Err(error) = start_magpie_for_game(game_id, &magpie_path).await {
                    warn!("启动 Magpie 全屏缩放失败 game_id={}: {}", game_id, error);
                }
            });
        }

        return Ok(LaunchResult::tracking(
            format!("已交由 Steam 启动游戏 ({})", steam_launch.steam_launch_id),
            None,
        ));
    }

    let local_launch = validate_local_launch(&game)?;
    let game_dir = local_launch.game_dir;
    let executable_path = local_launch.executable_path;
    let game_path = executable_path.to_string_lossy().to_string();

    let use_le = game.le_launch.unwrap_or(0) == 1;
    let use_magpie = game.magpie.unwrap_or(0) == 1;

    let settings = if use_le || use_magpie {
        Some(db.inner().get_settings().await?)
    } else {
        None
    };
    let le_path = if use_le {
        Some(
            resolve_tool_path(
                db.inner(),
                settings.as_ref().and_then(|s| s.le_path_value()),
                ToolPathKind::Le,
            )
            .await?,
        )
    } else {
        None
    };

    let magpie_path = if use_magpie {
        Some(
            resolve_tool_path(
                db.inner(),
                settings.as_ref().and_then(|s| s.magpie_path_value()),
                ToolPathKind::Magpie,
            )
            .await?,
        )
    } else {
        None
    };

    // 获取游戏可执行文件名
    let exe_name = match executable_path.file_name() {
        Some(name) => name,
        None => return Err("无法获取游戏可执行文件名".to_string()),
    };

    // 根据启动选项决定启动方式
    let mut command = if use_le {
        let le_path = le_path
            .as_deref()
            .ok_or_else(|| "LE转区软件路径未设置，请先配置路径".to_string())?;
        let mut cmd = Command::new(le_path);
        cmd.current_dir(&game_dir);
        cmd.arg(&game_path);
        cmd
    } else {
        // 普通启动
        let mut cmd = Command::new(&game_path);
        cmd.current_dir(&game_dir);
        cmd
    };

    // 克隆一份参数用于普通启动与可能的提权回退
    let args_clone = args.clone();
    if let Some(arguments) = &args_clone {
        command.args(arguments);
    }

    debug!(
        "准备启动游戏 game_id={} mode={} magpie={} arg_count={} cwd={}",
        game_id,
        if use_le { "le" } else { "normal" },
        use_magpie,
        args_clone.as_ref().map_or(0, Vec::len),
        game_dir.display()
    );

    match command.gui_safe().spawn() {
        Ok(child) => {
            let detection_dir_str = game_dir.to_string_lossy().to_string();
            let process_id = child.id();
            info!(
                "游戏启动成功 game_id={} pid={} mode={} magpie={}",
                game_id,
                process_id,
                if use_le { "le" } else { "normal" },
                use_magpie
            );

            // 启动游戏监控
            monitor_game(
                app_handle.clone(),
                db.inner().clone(),
                time_tracking_mode,
                game_id,
                process_id,
                detection_dir_str.clone(),
            )
            .await;

            // 如果需要Magpie放大，在后台启动
            if let Some(magpie_path) = magpie_path.clone() {
                tokio::spawn(async move {
                    if let Err(e) = start_magpie_for_game(game_id, &magpie_path).await {
                        warn!("启动 Magpie 全屏缩放失败 game_id={}: {}", game_id, e);
                    }
                });
            }

            Ok(LaunchResult::tracking(
                format!(
                    "成功启动游戏: {}，工作目录: {:?}{}",
                    exe_name.to_string_lossy(),
                    game_dir,
                    if use_le { " (LE转区)" } else { "" }
                ),
                Some(process_id),
            ))
        }
        Err(e) => {
            // 如果为 Windows 的 740 错误（需要提升权限），尝试使用 ShellExecuteExW("runas") 再启动
            let needs_elevation = e.raw_os_error() == Some(740);
            if needs_elevation {
                warn!(
                    "普通启动需要提权，准备回退到管理员启动 game_id={}: {}",
                    game_id, e
                );
                // 对于LE启动，需要用LE路径作为执行文件，游戏路径作为参数
                let (exec_path, exec_args) = if use_le {
                    let mut args = vec![game_path.clone()];
                    if let Some(additional_args) = &args_clone {
                        args.extend(additional_args.clone());
                    }

                    (
                        le_path
                            .clone()
                            .ok_or_else(|| "LE转区软件路径未设置，请先配置路径".to_string())?,
                        Some(args),
                    )
                } else {
                    (game_path.clone(), args_clone)
                };
                match win_elevated_launch::shell_execute_runas(
                    &exec_path,
                    exec_args.as_deref(),
                    &game_dir,
                ) {
                    Ok(pid) => {
                        let detection_dir_str = game_dir.to_string_lossy().to_string();
                        info!(
                            "游戏提权启动成功 game_id={} pid={} mode={} magpie={}",
                            game_id,
                            pid,
                            if use_le { "le" } else { "normal" },
                            use_magpie
                        );
                        // 提权启动成功，继续进入监控
                        monitor_game(
                            app_handle.clone(),
                            db.inner().clone(),
                            time_tracking_mode,
                            game_id,
                            pid,
                            detection_dir_str,
                        )
                        .await;

                        // 如果需要Magpie放大，在后台启动
                        if let Some(magpie_path) = magpie_path.clone() {
                            tokio::spawn(async move {
                                if let Err(e) = start_magpie_for_game(game_id, &magpie_path).await {
                                    warn!("启动 Magpie 全屏缩放失败 game_id={}: {}", game_id, e);
                                }
                            });
                        }

                        Ok(LaunchResult::tracking(
                            format!(
                                "已使用管理员权限启动游戏: {}{}，工作目录: {:?}",
                                exe_name.to_string_lossy(),
                                if use_le { " (LE转区)" } else { "" },
                                game_dir
                            ),
                            Some(pid),
                        ))
                    }
                    Err(err2) => Err(format!("普通启动失败且提权启动失败: {} | {}", e, err2)),
                }
            } else {
                Err(format!("启动游戏失败: {}，目录: {:?}", e, game_dir))
            }
        }
    }
}

/// 停止游戏
///
/// # Arguments
///
/// * `game_id` - 游戏ID (bgm_id 或 vndb_id)
///
/// # Returns
///
/// 停止结果，包含成功标志、消息和终止的进程数量
#[command]
pub async fn stop_game(game_id: u32) -> Result<StopResult, String> {
    match stop_game_session(game_id).await {
        Ok(terminated_count) => Ok(StopResult::success(
            format!(
                "已成功停止游戏 {}, 终止了 {} 个进程",
                game_id, terminated_count
            ),
            terminated_count,
        )),
        Err(e) => Err(format!("停止游戏失败: {}", e)),
    }
}

/// 为游戏启动Magpie放大
async fn start_magpie_for_game(game_id: u32, magpie_path: &str) -> Result<(), String> {
    let was_running = magpie::ensure_running(magpie_path)?;
    debug!(
        "Magpie 状态 game_id={} was_running={}",
        game_id, was_running
    );

    magpie::wait_until_ready(time::Duration::from_secs(5)).await?;

    if !wait_for_game_foreground(game_id).await {
        info!("游戏 {} 未进入前台，取消 Magpie 全屏缩放", game_id);
        return Ok(());
    }

    debug!("游戏 {} 已进入前台", game_id);
    debug!("游戏 {} 将在固定 2 秒后触发 Magpie 全屏缩放", game_id);
    time::sleep(time::Duration::from_secs(2)).await;

    let game_is_foreground = is_game_foreground(game_id);
    debug!(
        "Magpie 延迟结束 game_id={} game_foreground={}",
        game_id, game_is_foreground
    );
    if !game_is_foreground {
        info!("游戏 {} 在 Magpie 延迟期间离开前台，取消全屏缩放", game_id);
        return Ok(());
    }

    magpie::trigger_fullscreen_scaling()?;

    info!("已触发 Magpie 全屏缩放 game_id={}", game_id);
    Ok(())
}
