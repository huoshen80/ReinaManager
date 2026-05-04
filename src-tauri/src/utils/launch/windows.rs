use crate::database::repository::games_repository::GamesRepository;
use crate::database::repository::settings_repository::DbSettingsExt;
use crate::utils::command_ext::CommandGuiExt;
use crate::utils::game_monitor::{monitor_game, stop_game_session};
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use tauri::{AppHandle, Runtime, State, command};
use {
    log::{error, info},
    tokio::time,
};

#[derive(Debug, Serialize, Deserialize)]
pub struct LaunchResult {
    success: bool,
    message: String,

    process_id: Option<u32>, // 添加进程ID字段
}

/// 停止游戏结果
#[derive(Debug, Serialize, Deserialize)]
pub struct StopResult {
    success: bool,
    message: String,
    terminated_count: u32,
}

// ================= Windows键盘模拟支持 =================
mod keyboard_simulator {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        INPUT, INPUT_0, INPUT_KEYBOARD, KEYBD_EVENT_FLAGS, KEYBDINPUT, KEYEVENTF_EXTENDEDKEY,
        KEYEVENTF_KEYUP, SendInput, VIRTUAL_KEY,
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
/// 启动结果，包含成功标志、消息和进程ID
#[command]
pub async fn launch_game<R: Runtime>(
    app_handle: AppHandle<R>,
    db: State<'_, DatabaseConnection>,
    game_id: u32,
    args: Option<Vec<String>>,
) -> Result<LaunchResult, String> {
    let game = GamesRepository::find_by_id(db.inner(), game_id as i32)
        .await
        .map_err(|e| format!("查询游戏失败: {}", e))?
        .ok_or_else(|| format!("游戏不存在: {}", game_id))?;
    let game_path = game.localpath.ok_or_else(|| "游戏路径未设置".to_string())?;

    if !Path::new(&game_path).exists() {
        return Err(format!("游戏可执行文件不存在: {}", game_path));
    }

    let use_le = game.le_launch.unwrap_or(0) == 1;
    let use_magpie = game.magpie.unwrap_or(0) == 1;

    let settings = if use_le || use_magpie {
        Some(db.inner().get_settings().await?)
    } else {
        None
    };

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
    let mut command = if use_le {
        let le_path = settings
            .as_ref()
            .and_then(|s| s.le_path_value())
            .ok_or_else(|| "LE转区软件路径未设置".to_string())?;

        let mut cmd = Command::new(le_path);
        cmd.current_dir(game_dir);
        cmd.arg(&game_path);
        cmd
    } else {
        // 普通启动
        let mut cmd = Command::new(&game_path);
        cmd.current_dir(game_dir);
        cmd
    };

    // 克隆一份参数用于普通启动与可能的提权回退
    let args_clone = args.clone();
    if let Some(arguments) = &args_clone {
        command.args(arguments);
    }

    let spawn_result = command.gui_safe().spawn();
    match spawn_result {
        Ok(child) => {
            let process_id = child.id();

            // 启动游戏监控
            monitor_game(app_handle.clone(), game_id, process_id, game_path.clone()).await;

            // 如果需要Magpie放大，在后台启动
            if use_magpie {
                let magpie_path = settings
                    .as_ref()
                    .and_then(|s| s.magpie_path_value())
                    .ok_or_else(|| "Magpie放大软件路径未设置".to_string())?
                    .to_string();

                tokio::spawn(async move {
                    tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                    if let Err(e) = start_magpie_for_game(&magpie_path).await {
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
            })
        }
        Err(e) => {
            // 如果为 Windows 的 740 错误（需要提升权限），尝试使用 ShellExecuteExW("runas") 再启动
            let needs_elevation = e.raw_os_error() == Some(740);
            if needs_elevation {
                // 对于LE启动，需要用LE路径作为执行文件，游戏路径作为参数
                let (exec_path, exec_args) = if use_le {
                    let le_path = settings
                        .as_ref()
                        .and_then(|s| s.le_path_value())
                        .ok_or_else(|| "LE转区软件路径未设置，无法提权启动".to_string())?;

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
                            let magpie_path = settings
                                .as_ref()
                                .and_then(|s| s.magpie_path_value())
                                .ok_or_else(|| "Magpie放大软件路径未设置".to_string())?
                                .to_string();

                            tokio::spawn(async move {
                                time::sleep(time::Duration::from_secs(1)).await;
                                if let Err(e) = start_magpie_for_game(&magpie_path).await {
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
async fn start_magpie_for_game(magpie_path: &str) -> Result<(), String> {
    // 检查Magpie是否已经在运行
    let magpie_was_running = is_process_running("Magpie.exe");

    if !magpie_was_running {
        // Magpie没有运行，启动它
        let mut command = Command::new(magpie_path);
        command.arg("-t"); // tray mode

        let spawn_result = command.gui_safe().spawn();
        match spawn_result {
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

/// 检查指定名称的进程是否在运行（使用 Windows ToolHelp API）
fn is_process_running(process_name: &str) -> bool {
    use std::mem;
    use windows::Win32::{
        Foundation::CloseHandle,
        System::Diagnostics::ToolHelp::{
            CREATE_TOOLHELP_SNAPSHOT_FLAGS, CreateToolhelp32Snapshot, PROCESSENTRY32W,
            Process32FirstW, Process32NextW,
        },
    };

    unsafe {
        let snapshot = match CreateToolhelp32Snapshot(
            CREATE_TOOLHELP_SNAPSHOT_FLAGS(0x00000002), // TH32CS_SNAPPROCESS
            0,
        ) {
            Ok(h) if !h.is_invalid() => h,
            _ => return false,
        };

        let mut entry = PROCESSENTRY32W {
            dwSize: mem::size_of::<PROCESSENTRY32W>() as u32,
            ..Default::default()
        };

        let mut found = false;
        if Process32FirstW(snapshot, &mut entry).is_ok() {
            loop {
                // th32ExeFile 是以 null 结尾的 UTF-16 进程名（不含路径）
                let name_end = entry
                    .szExeFile
                    .iter()
                    .position(|&c| c == 0)
                    .unwrap_or(entry.szExeFile.len());
                let name = String::from_utf16_lossy(&entry.szExeFile[..name_end]);
                if name.eq_ignore_ascii_case(process_name) {
                    found = true;
                    break;
                }
                if Process32NextW(snapshot, &mut entry).is_err() {
                    break;
                }
            }
        }

        let _ = CloseHandle(snapshot);
        found
    }
}
