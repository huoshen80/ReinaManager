use crate::utils::game_monitor::{monitor_game, stop_game_session};
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::{env::home_dir, path::Path};
use tauri::{command, AppHandle, Runtime};
use tauri_plugin_store::StoreExt;

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

    fn wide_null(s: &str) -> Vec<u16> {
        OsStr::new(s)
            .encode_wide()
            .chain(std::iter::once(0))
            .collect()
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

        let w_verb = wide_null("runas");
        let w_path = wide_null(path);
        let w_params = wide_null(&params_str);
        let dir_str = work_dir.to_string_lossy();
        let w_dir = wide_null(&dir_str);

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

#[derive(Debug, Serialize, Deserialize)]
pub struct LaunchResult {
    success: bool,
    message: String,
    process_id: Option<u32>, // 添加进程ID字段
    #[cfg(target_os = "linux")]
    systemd_scope: Option<String>, // 添加 systemd scope 字段
}

/// 启动游戏
///
/// # Arguments
///
/// * `app_handle` - Tauri应用句柄
/// * `game_path` - 游戏可执行文件的路径
/// * `game_id` - 游戏ID (bgm_id 或 vndb_id)
/// * `args` - 可选的游戏启动参数
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
) -> Result<LaunchResult, String> {
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
    let mut command;
    let systemd_unit_name = format!("reina_game_{}.scope", game_id);
    // 创建命令，设置工作目录为游戏所在目录
    #[cfg(target_os = "windows")]
    {
        command = Command::new(&game_path);
        command.current_dir(game_dir);
    }
    #[cfg(target_os = "linux")]
    {
        // 从 store 中读取 Linux 启动命令配置

        use log::debug;
        let linux_launch_command = app_handle
            .store("settings.json")
            .ok()
            .and_then(|store| store.get("linux_launch_command"))
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "wine".to_string());
        let linux_launch_command = expand_path(&linux_launch_command);
        debug!("使用的 Linux 启动命令: {:?}", linux_launch_command);
        //TODO: 使用dbus接口交互systemd
        command = Command::new("systemd-run"); // 使用 systemd-run 启动游戏进程
        command.arg("--scope"); // 使用 scope 模式
        command.arg("--user"); // 以用户身份运行
        command.arg("-p");
        command.arg("Delegate=yes"); // 允许子进程
        command.arg("--unit");

        command.arg(&systemd_unit_name); // 设置 systemd unit 名称
        if exe_name.to_string_lossy().ends_with(".exe") {
            // Windows 可执行文件需要使用配置的启动命令
            command.arg(&linux_launch_command);

            command.stdout(std::process::Stdio::null()); // 避免输出干扰
            command.stderr(std::process::Stdio::null());
        }
        command.arg(&game_path); // 添加游戏可执行文件路径
        command.current_dir(game_dir);
    }

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
                app_handle,
                game_id,
                process_id,
                #[cfg(target_os = "windows")]
                game_path.clone(),
                #[cfg(target_os = "linux")]
                systemd_unit_name.clone(),
            )
            .await;

            Ok(LaunchResult {
                success: true,
                message: format!(
                    "成功启动游戏: {}，工作目录: {:?}",
                    exe_name.to_string_lossy(),
                    game_dir
                ),
                #[cfg(target_os = "linux")]
                systemd_scope: Some(systemd_unit_name),
                process_id: Some(process_id),
            })
        }
        #[allow(unused_variables)]
        Err(e) => {
            #[cfg(target_os = "windows")]
            {
                // 如果为 Windows 的 740 错误（需要提升权限），尝试使用 ShellExecuteExW("runas") 再启动

                let needs_elevation = e.raw_os_error() == Some(740);
                if needs_elevation {
                    match win_elevated_launch::shell_execute_runas(
                        &game_path,
                        args_clone.as_deref(),
                        game_dir,
                    ) {
                        Ok(pid) => {
                            // 提权启动成功，继续进入监控
                            monitor_game(app_handle, game_id, pid, game_path.clone()).await;
                            Ok(LaunchResult {
                                success: true,
                                message: format!(
                                    "已使用管理员权限启动游戏: {}，工作目录: {:?}",
                                    exe_name.to_string_lossy(),
                                    game_dir
                                ),
                                #[cfg(target_os = "linux")]
                                systemd_scope: None, // 提权启动不使用 systemd scope
                                #[cfg(target_os = "windows")]
                                process_id: Some(pid),
                            })
                        }
                        Err(err2) => Err(format!("普通启动失败且提权启动失败: {} | {}", e, err2)),
                    }
                } else {
                    Err(format!("启动游戏失败: {}，目录: {:?}", e, game_dir))
                }
            }
            #[cfg(not(target_os = "windows"))]
            {
                // 非 Windows 平台不应该到这里
                unreachable!()
            }
        }
    }
}

fn expand_path(path: &str) -> String {
    if path.starts_with("~") {
        if let Some(home_dir) = home_dir() {
            path.replacen("~", &home_dir.to_string_lossy(), 1)
        } else {
            path.to_string()
        }
    } else {
        path.to_string()
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
pub fn stop_game(game_id: u32) -> Result<StopResult, String> {
    match stop_game_session(game_id) {
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
