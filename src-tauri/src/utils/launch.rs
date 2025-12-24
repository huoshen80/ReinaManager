use crate::database::dto::GameLaunchOptions;
use crate::utils::game_monitor::{monitor_game, stop_game_session};
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use tauri::{command, AppHandle, Runtime};
#[cfg(target_os = "windows")]
use {
    crate::utils::fs::PathManager,
    log::{error, info},
    sysinfo::{ProcessRefreshKind, RefreshKind, System},
    tauri::Manager,
    tokio::time,
};

// ================= Windows键盘模拟支持 =================
#[cfg(target_os = "windows")]
mod keyboard_simulator {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS,
        KEYEVENTF_EXTENDEDKEY, KEYEVENTF_KEYUP, VIRTUAL_KEY,
    };

    /// 创建键盘输入事件
    fn create_keyboard_input(vk: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS) -> INPUT {
        INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: vk,
                    wScan: 0,
                    dwFlags: flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        }
    }

    /// 模拟Win+Shift+A快捷键
    pub fn simulate_win_shift_a() -> Result<(), String> {
        unsafe {
            // 定义按键序列：Win按下, Shift按下, A按下, A释放, Shift释放, Win释放
            let inputs = [
                create_keyboard_input(VIRTUAL_KEY(0x5B), KEYEVENTF_EXTENDEDKEY), // Win按下
                create_keyboard_input(VIRTUAL_KEY(0xA0), KEYEVENTF_EXTENDEDKEY), // Shift按下
                create_keyboard_input(VIRTUAL_KEY(0x41), KEYBD_EVENT_FLAGS(0)),  // A按下
                create_keyboard_input(VIRTUAL_KEY(0x41), KEYEVENTF_KEYUP),       // A释放
                create_keyboard_input(VIRTUAL_KEY(0xA0), KEYEVENTF_KEYUP | KEYEVENTF_EXTENDEDKEY), // Shift释放
                create_keyboard_input(VIRTUAL_KEY(0x5B), KEYEVENTF_KEYUP | KEYEVENTF_EXTENDEDKEY), // Win释放
            ];

            // 发送所有输入事件
            let result = SendInput(&inputs, std::mem::size_of::<INPUT>() as i32);
            if result == inputs.len() as u32 {
                Ok(())
            } else {
                Err(format!(
                    "键盘模拟失败，只发送了{}个事件中的{}个",
                    result,
                    inputs.len()
                ))
            }
        }
    }
}

// ================= Windows 提权启动（ShellExecuteExW with "runas"）支持 =================
// 仅在 Windows 下编译，其他平台不包含该实现
#[cfg(target_os = "windows")]
mod win_elevated_launch {
    use std::ffi::OsStr;
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;

    use windows::core::PCWSTR;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::System::Threading::GetProcessId;
    use windows::Win32::UI::Shell::{
        ShellExecuteExW, SEE_MASK_FLAG_NO_UI, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW,
    };
    use windows::Win32::UI::WindowsAndMessaging::SW_SHOWNORMAL;

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

/// 启动游戏
///
/// # Arguments
///
/// * `app_handle` - Tauri应用句柄
/// * `game_path` - 游戏可执行文件的路径
/// * `game_id` - 游戏ID (数据库记录ID)
/// * `args` - 可选的游戏启动参数
/// * `launch_options` - 启动选项（LE转区、Magpie放大等）
///
/// # Returns
///
/// 启动结果，包含成功标志、消息和进程ID
#[command]
pub async fn launch_game<R: Runtime>(
    app_handle: AppHandle<R>,
    game_path: String,
    game_id: u32,
    args: Option<Vec<String>>,
    launch_options: Option<GameLaunchOptions>,
) -> Result<LaunchResult, String> {
    // 处理启动选项
    let use_le = launch_options
        .as_ref()
        .map(|opt| opt.le_launch.unwrap_or(false))
        .unwrap_or(false);
    #[cfg(target_os = "windows")]
    let use_magpie = launch_options
        .as_ref()
        .map(|opt| opt.magpie.unwrap_or(false))
        .unwrap_or(false);

    // 获取游戏可执行文件的目录
    let game_dir = match Path::new(&game_path).parent() {
        Some(dir) => dir,
        None => return Err("无法获取游戏目录路径".to_string()),
    };

    // 获取游戏可执行文件名
    let exe_name = match Path::new(&game_path).file_name() {
        Some(name) => name,
        None => return Err("无法获取游戏可执行文件名".to_string()),
    };

    // 根据启动选项决定启动方式
    #[cfg(target_os = "windows")]
    let mut command = if use_le {
        // LE转区启动
        let path_manager = app_handle.state::<PathManager>().inner();

        let le_path = path_manager
            .get_le_path()
            .map_err(|e| format!("获取LE路径失败: {}", e))?;

        if le_path.is_empty() {
            return Err("LE转区软件路径未设置".to_string());
        }

        let mut cmd = Command::new(&le_path);
        cmd.current_dir(game_dir);
        cmd.arg(&game_path);
        cmd
    } else {
        // 普通启动
        let mut cmd = Command::new(&game_path);
        cmd.current_dir(game_dir);
        cmd
    };
    #[cfg(target_os = "linux")]
    let systemd_unit_name = format!("reina_game_{}.scope", game_id);
    #[cfg(target_os = "linux")]
    {
        // 检查 systemd scope 是否存在且状态正常
        let _ = check_scope_or_reset_failed(&systemd_unit_name).await;
    }
    #[cfg(target_os = "linux")]
    let mut command = {
        // 从 store 中读取 Linux 启动命令配置

        use log::debug;
        use tauri_plugin_store::StoreExt;
        let linux_launch_command = app_handle
            .store("settings.json")
            .ok()
            .and_then(|store| store.get("linux_launch_command"))
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "wine".to_string());
        let linux_launch_command = expand_path(&linux_launch_command);
        debug!("使用的 Linux 启动命令: {:?}", linux_launch_command);
        let mut command = Command::new("systemd-run"); // 使用 systemd-run 启动游戏进程
        command.arg("--scope"); // 使用 scope 模式
        command.arg("--user"); // 以用户身份运行
        command.arg("-p");
        command.arg("Delegate=yes"); // 允许子进程
        command.arg("--unit");

        command.arg(&systemd_unit_name); // 设置 systemd unit 名称
        if exe_name.to_string_lossy().ends_with(".exe") {
            command.arg(&linux_launch_command); // 使用配置的启动命令（如 wine）
        }
        command.arg(&game_path); // 添加游戏可执行文件路径
        command.current_dir(game_dir);
        command
    };
    // 克隆一份参数用于普通启动与可能的提权回退
    let args_clone = args.clone();
    if let Some(arguments) = &args_clone {
        command.args(arguments);
    }

    match command.spawn() {
        Ok(child) => {
            let process_id = child.id();

            // 启动游戏监控
            monitor_game(
                app_handle.clone(),
                game_id,
                process_id,
                #[cfg(target_os = "windows")]
                game_path.clone(),
                #[cfg(target_os = "linux")]
                systemd_unit_name.clone(),
            )
            .await;

            // 如果需要Magpie放大，在后台启动
            #[cfg(target_os = "windows")]
            if use_magpie {
                let game_path_clone = game_path.clone();
                let app_handle_clone = app_handle.clone();

                tokio::spawn(async move {
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                    if let Err(e) = start_magpie_for_game(&game_path_clone, &app_handle_clone).await
                    {
                        error!("启动Magpie失败: {}", e);
                    }
                });
            }

            Ok(LaunchResult {
                success: true,
                message: format!(
                    "成功启动游戏: {}，工作目录: {:?}{}",
                    exe_name.to_string_lossy(),
                    game_dir,
                    if use_le { " (LE转区)" } else { "" }
                ),
                process_id: Some(process_id),
                #[cfg(target_os = "linux")]
                systemd_scope: Some(systemd_unit_name),
            })
        }
        Err(e) => {
            // 如果为 Windows 的 740 错误（需要提升权限），尝试使用 ShellExecuteExW("runas") 再启动
            #[cfg(target_os = "windows")]
            {
                let needs_elevation = e.raw_os_error() == Some(740);
                if needs_elevation {
                    // 对于LE启动，需要用LE路径作为执行文件，游戏路径作为参数
                    let (exec_path, exec_args) = if use_le {
                        let path_manager = app_handle.state::<PathManager>().inner();

                        let le_path = path_manager
                            .get_le_path()
                            .map_err(|_| "获取LE路径失败".to_string())?;

                        if le_path.is_empty() {
                            return Err("LE转区软件路径未设置，无法提权启动".to_string());
                        }

                        let mut args = vec![game_path.clone()];
                        if let Some(additional_args) = &args_clone {
                            args.extend(additional_args.clone());
                        }

                        (le_path.to_string(), Some(args))
                    } else {
                        (game_path.clone(), args_clone)
                    };
                    match win_elevated_launch::shell_execute_runas(
                        &exec_path,
                        exec_args.as_deref(),
                        game_dir,
                    ) {
                        Ok(pid) => {
                            // 提权启动成功，继续进入监控
                            monitor_game(app_handle.clone(), game_id, pid, game_path.clone()).await;

                            // 如果需要Magpie放大，在后台启动
                            if use_magpie {
                                let game_path_clone = game_path.clone();
                                let app_handle_clone = app_handle.clone();

                                tokio::spawn(async move {
                                    time::sleep(time::Duration::from_secs(1)).await;
                                    if let Err(e) =
                                        start_magpie_for_game(&game_path_clone, &app_handle_clone)
                                            .await
                                    {
                                        error!("启动Magpie失败: {}", e);
                                    }
                                });
                            }

                            Ok(LaunchResult {
                                success: true,
                                message: format!(
                                    "已使用管理员权限启动游戏: {}{}，工作目录: {:?}",
                                    exe_name.to_string_lossy(),
                                    if use_le { " (LE转区)" } else { "" },
                                    game_dir
                                ),
                                process_id: Some(pid),
                            })
                        }
                        Err(err2) => Err(format!("普通启动失败且提权启动失败: {} | {}", e, err2)),
                    }
                    #[cfg(not(target_os = "windows"))]
                    Err(format!("启动游戏失败: {}，目录: {:?}", e, game_dir))
                } else {
                    Err(format!("启动游戏失败: {}，目录: {:?}", e, game_dir))
                }
            }

            #[cfg(not(target_os = "windows"))]
            Err(format!("启动游戏失败: {}，目录: {:?}", e, game_dir))
        }
    }
}

/// 停止游戏结果
#[derive(Debug, Serialize, Deserialize)]
pub struct StopResult {
    success: bool,
    message: String,
    terminated_count: u32,
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
        Ok(terminated_count) => Ok(StopResult {
            success: true,
            message: format!(
                "已成功停止游戏 {}, 终止了 {} 个进程",
                game_id, terminated_count
            ),
            terminated_count,
        }),
        Err(e) => Err(format!("停止游戏失败: {}", e)),
    }
}

/// 为游戏启动Magpie放大
#[cfg(target_os = "windows")]
async fn start_magpie_for_game(
    _game_path: &str,
    app_handle: &AppHandle<impl Runtime>,
) -> Result<(), String> {
    // 获取Magpie路径
    let path_manager = app_handle.state::<PathManager>().inner();

    let magpie_path = path_manager
        .get_magpie_path()
        .map_err(|e| format!("获取Magpie路径失败: {}", e))?;

    if magpie_path.is_empty() {
        return Err("Magpie放大软件路径未设置".to_string());
    }

    // 检查Magpie是否已经在运行
    let magpie_was_running = is_process_running("Magpie.exe");

    if !magpie_was_running {
        // Magpie没有运行，启动它
        let mut command = Command::new(&magpie_path);
        command.arg("-t"); // tray mode

        match command.spawn() {
            Ok(_child) => {
                info!("Magpie启动成功，等待游戏窗口加载...");
            }
            Err(e) => {
                return Err(format!("启动Magpie失败: {}", e));
            }
        }
    } else {
        info!("Magpie已经在运行中，准备激活放大...");
    }

    // 等待游戏窗口加载（无论Magpie是否新启动）
    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;

    // 模拟Win+Shift+A快捷键激活放大
    match keyboard_simulator::simulate_win_shift_a() {
        Ok(_) => {
            info!("Magpie放大激活成功");
            Ok(())
        }
        Err(e) => {
            let error_msg = format!("Magpie放大激活失败: {}", e);
            if magpie_was_running {
                info!("{}（Magpie进程已在运行）", error_msg);
                // 如果Magpie本来就在运行，键盘模拟失败也不算严重错误
                Ok(())
            } else {
                info!("{}，但Magpie进程已启动", error_msg);
                // 如果Magpie是刚启动的，键盘模拟失败也不算严重错误
                Ok(())
            }
        }
    }
}

/// 检查进程是否在运行（使用sysinfo，性能优于tasklist命令）
#[cfg(target_os = "windows")]
fn is_process_running(process_name: &str) -> bool {
    let mut system = System::new_with_specifics(
        RefreshKind::nothing().with_processes(ProcessRefreshKind::everything()),
    );

    // 刷新进程信息
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    // 检查是否有匹配的进程
    system
        .processes()
        .values()
        .any(|process| process.name().eq_ignore_ascii_case(process_name))
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LaunchResult {
    success: bool,
    message: String,

    process_id: Option<u32>, // 添加进程ID字段
    #[cfg(target_os = "linux")]
    systemd_scope: Option<String>, // 添加 systemd scope 字段
}
#[cfg(target_os = "linux")]
fn expand_path(path: &str) -> String {
    if path.starts_with("~") {
        if let Some(home_dir) = dirs::home_dir() {
            path.replacen("~", &home_dir.to_string_lossy(), 1)
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
#[cfg(target_os = "linux")]
async fn check_scope_or_reset_failed(systemd_unit_name: &str) -> Result<bool, String> {
    use crate::utils::game_monitor::{get_connection, get_manager_proxy};
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
                        // 重置失败状态
                        proxy
                            .reset_failed_unit(systemd_unit_name.to_string())
                            .await
                            .map_err(|e| {
                                format!("重置单元 {} 失败状态失败: {}", systemd_unit_name, e)
                            })?;
                    }
                    Ok(true)
                }
                Err(e) => Err(format!(
                    "创建单元代理失败，无法检查或重置单元 {}: {}",
                    systemd_unit_name, e
                )),
            }
        }
        Err(e) => {
            if let zbus::Error::MethodError(name, _, _) = &e {
                if name.as_str() == "org.freedesktop.systemd1.NoSuchUnit" {
                    // 单元不存在
                    Ok(false)
                } else {
                    Err(format!(
                        "检查单元 {} 是否存在时出错: {}",
                        systemd_unit_name, e
                    ))
                }
            } else {
                Err(format!(
                    "检查单元 {} 是否存在时出错: {}",
                    systemd_unit_name, e
                ))
            }
        }
    }
}
