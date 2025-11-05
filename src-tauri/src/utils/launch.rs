use crate::utils::game_monitor::monitor_game;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;
use tauri::{command, AppHandle, Runtime};

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

#[cfg(not(target_os = "windows"))]
mod win_elevated_launch {
    use std::path::Path;
    pub fn shell_execute_runas(
        _path: &str,
        _args: Option<&[String]>,
        _work_dir: &Path,
    ) -> Result<u32, String> {
        Err("Elevated launch is only supported on Windows".to_string())
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LaunchResult {
    success: bool,
    message: String,
    process_id: Option<u32>, // 添加进程ID字段
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

    // 检查文件后缀是否为 xp3
    let is_xp3 = game_path.to_lowercase().ends_with(".xp3");
    let (executable, working_dir, launch_args) = if is_xp3 {
        // 对于 xp3 文件，使用 TVP/krkr2.exe 启动
        let current_dir = std::env::current_dir()
            .map_err(|e| format!("无法获取当前工作目录: {}", e))?;
        
        let krkr2_path = current_dir.join("TVP").join("krkr2.exe");
        if !krkr2_path.exists() {
            return Err(format!("找不到启动器: {}", krkr2_path.display()));
        }

        let tvp_dir = current_dir.join("TVP");
        if !tvp_dir.exists() {
            return Err(format!("找不到工作目录: {}", tvp_dir.display()));
        }

        // 构建参数：game_path 作为第一个参数
        let mut xp3_args = vec![game_path.clone()];
        if let Some(mut additional_args) = args {
            xp3_args.append(&mut additional_args);
        }

        (krkr2_path.to_string_lossy().into_owned(), tvp_dir, Some(xp3_args))
    } else {
        // 对于其他文件，使用原有逻辑
        (game_path.clone(), game_dir.to_path_buf(), args)
    };

    // 创建命令，设置工作目录为游戏所在目录
    let mut command = Command::new(&executable);
    command.current_dir(working_dir);

    // 克隆一份参数用于普通启动与可能的提权回退
    let args_clone = launch_args.clone();
    if let Some(arguments) = &args_clone {
        command.args(arguments);
    }

    match command.spawn() {
        Ok(child) => {
            let process_id = child.id();

            // 启动游戏监控
            monitor_game(app_handle, game_id, process_id, game_path.clone()).await;

            Ok(LaunchResult {
                success: true,
                message: format!(
                    "成功启动游戏: {}，工作目录: {:?}",
                    exe_name.to_string_lossy(),
                    game_dir
                ),
                process_id: Some(process_id),
            })
        }
        Err(e) => {
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
