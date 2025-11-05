use serde_json::json;
use std::{
    path::Path,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
// 导入 sysinfo 相关类型和 trait
use sysinfo::{ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, Runtime};

#[cfg(target_os = "windows")]
use windows::Win32::{
    Foundation::CloseHandle,
    System::Threading::{
        GetExitCodeProcess,
        OpenProcess,
        // 使用 PROCESS_QUERY_LIMITED_INFORMATION 替代之前的权限组合，
        // 这是获取进程退出代码所需的最小权限，有助于提高在权限受限场景下的稳健性 (源自 deep research 报告建议)。
        PROCESS_QUERY_LIMITED_INFORMATION,
        // PROCESS_VM_READ 权限不再需要，已移除。
    },
};

/// 获取当前的 Unix 时间戳 (秒)。
fn get_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("系统时间错误: 时间回溯") // 使用 expect 替换 unwrap，提供更清晰的 panic 信息。
        .as_secs()
}

/// 启动指定游戏进程的监控。
///
/// # Arguments
/// * `app_handle` - Tauri 应用句柄，用于发送事件到前端。
/// * `game_id` - 游戏的唯一标识符。
/// * `process_id` - 要开始监控的游戏进程的初始 PID。
/// * `executable_path` - 游戏主可执行文件的完整路径，用于在进程重启或切换后重新查找。
pub async fn monitor_game<R: Runtime>(
    app_handle: AppHandle<R>,
    game_id: u32,
    process_id: u32,
    executable_path: String,
) {
    // 使用 Tauri 的异步运行时启动监控任务，与事件循环深度集成
    let app_handle_clone = app_handle.clone();
    // 优化：在监控任务启动前创建 System 实例，避免在循环中重复创建。
    // 使用 System::new() 可避免首次加载所有系统信息，按需刷新。
    let mut sys = System::new();

    tauri::async_runtime::spawn(async move {
        // 将 System 实例的可变引用传递给实际的监控循环。
        if let Err(e) = run_game_monitor(
            app_handle_clone,
            game_id,
            process_id,
            executable_path,
            &mut sys,
        )
        .await
        {
            eprintln!("游戏监控任务 (game_id: {}) 出错: {}", game_id, e);
        }
    });
}

/// 实际执行游戏监控的核心循环。
///
/// # Arguments
/// * `app_handle` - Tauri 应用句柄。
/// * `game_id` - 游戏 ID。
/// * `process_id` - 初始监控的进程 PID。
/// * `executable_path` - 游戏主可执行文件路径。
/// * `sys` - 对 `sysinfo::System` 的可变引用，用于进程信息查询。
async fn run_game_monitor<R: Runtime>(
    app_handle: AppHandle<R>,
    game_id: u32,
    process_id: u32, // 初始监控的进程 PID，可能会在检测后改变。
    executable_path: String,
    sys: &mut System,
) -> Result<(), String> {
    let mut accumulated_seconds = 0u64; // 使用 u64 避免溢出
    let start_time = get_timestamp();
    tokio::time::sleep(Duration::from_secs(1)).await;

    // 使用智能选择函数获取最佳的 PID
    let mut process_id = select_best_pid(process_id, &executable_path, sys);

    println!(
        "开始监控游戏: ID={}, 最终 PID={}, Path={}",
        game_id, process_id, executable_path
    );

    // 通知前端会话开始。
    app_handle
        .emit(
            "game-session-started",
            json!({ "gameId": game_id, "processId": process_id, "startTime": start_time }),
        )
        .map_err(|e| format!("无法发送 game-session-started 事件: {}", e))?;

    let mut consecutive_failures = 0u32;
    // 连续 N 次检查进程失败后，才认为进程已结束或需要切换。
    // 注意：这个值可能需要根据实际情况调整，原版为2，这里是3。
    let max_failures = 3u32;
    let original_process_id = process_id; // 保存最初启动时传入的 PID。
    let mut switched_process = false; // 标记是否已经从 original_process_id 切换到了按路径找到的新进程。

    loop {
        let process_running = is_process_running(process_id);

        if !process_running {
            consecutive_failures += 1;
            // println!("进程 {} 运行检查失败次数: {}", process_id, consecutive_failures); // Debug 日志

            if consecutive_failures >= max_failures {
                println!(
                    "进程 {} (原始 PID: {}) 被认为已结束或连续 {} 次检查失败。",
                    process_id, original_process_id, max_failures
                );

                // 尝试根据可执行文件路径查找是否有新的进程实例在运行。
                let available_pids = get_process_id_by_path(&executable_path, sys);
                if !available_pids.is_empty() {
                    // 从可用进程中选择最佳的 PID
                    let matched_pid = select_best_pid(process_id, &executable_path, sys);
                    // 排除管理器程序
                    if matched_pid == std::process::id() {
                        println!(
                            "路径匹配找到的 PID {} 与管理器程序相同。",
                            matched_pid
                        );
                    } else {
                        // 检查找到的 PID 是否与当前认为已结束的 PID 不同，
                        // 或者虽然 PID 相同但我们之前从未切换过进程 (说明可能是原始进程重启)。
                        if process_id != matched_pid || !switched_process {
                            println!(
                                "通过路径 '{}' 找到潜在的新进程实例 PID: {}",
                                executable_path, matched_pid
                            );
                            // 再次确认这个找到的 PID 当前是否真的在运行。
                            if is_process_running(matched_pid) {
                                println!("确认 PID {} 正在运行。切换监控目标。", matched_pid);
                                process_id = matched_pid; // 更新当前监控的 PID。
                                switched_process = true; // 标记已经发生过切换。
                                consecutive_failures = 0; // 重置失败计数器。
                                                        // (可选) 通知前端 PID 发生变化。
                                app_handle
                                    .emit(
                                        "game-process-switched",
                                        json!({ "gameId": game_id, "newProcessId": matched_pid }),
                                    )
                                    .ok(); // .ok() 忽略发送错误
                                continue; // 继续下一轮循环，监控新的 PID。
                            } else {
                                println!(
                                    "路径匹配找到的 PID {} 当前并未运行，无法切换。",
                                    matched_pid
                                );
                            }
                        } else {
                            println!(
                                "路径匹配找到的 PID {} 与当前已结束的 PID 相同，且已切换过，不再切换。",
                                matched_pid
                            );
                        }
                    }
                } else {
                    println!("未通过路径 '{}' 找到匹配的进程。", executable_path);
                }

                // 如果执行到这里，说明没有找到可以切换到的新进程实例。
                println!("未找到可切换的活动进程，结束监控会话。");
                break; // 退出监控循环。
            }
        } else {
            // 进程正在运行，重置连续失败计数器。
            consecutive_failures = 0;

            // 检查游戏窗口是否在前台，是则累加活动时间。
            if is_window_foreground_for_pid(process_id) {
                accumulated_seconds += 1;
                // 大约每 30 秒向前端发送一次累计时间更新。
                if accumulated_seconds > 0 && accumulated_seconds.is_multiple_of(30) {
                    let minutes = accumulated_seconds / 60;
                    app_handle
                        .emit(
                            "game-time-update",
                            json!({
                                "gameId": game_id, "totalMinutes": minutes, "totalSeconds": accumulated_seconds,
                                "startTime": start_time, "currentTime": get_timestamp(), "processId": process_id
                            }),
                        )
                        .map_err(|e| format!("无法发送 game-time-update 事件: {}", e))?;
                }
            }
        }

        // 每次循环等待 1 秒，以降低 CPU 占用。使用异步等待避免阻塞事件循环。
        tokio::time::sleep(Duration::from_secs(1)).await;
    }

    // 监控循环结束后的处理逻辑。
    let end_time = get_timestamp();
    let total_minutes = accumulated_seconds / 60;
    let remainder_seconds = accumulated_seconds % 60;
    // 将秒数四舍五入到最接近的分钟数。
    let final_minutes = if remainder_seconds >= 30 {
        total_minutes + 1
    } else {
        total_minutes
    };

    println!(
        "游戏会话结束: ID={}, 最终 PID={}, 总活动时间={}秒 (计为 {} 分钟)",
        game_id, process_id, accumulated_seconds, final_minutes
    );

    // 发送会话结束事件到前端。
    app_handle
        .emit(
            "game-session-ended",
            json!({
                "gameId": game_id, "startTime": start_time, "endTime": end_time,
                "totalMinutes": final_minutes, "totalSeconds": accumulated_seconds, "processId": process_id
            }),
        )
        .map_err(|e| format!("无法发送 game-session-ended 事件: {}", e))?;

    Ok(())
}

/// 检查指定 PID 的进程是否仍在运行。
#[cfg(target_os = "windows")]
fn is_process_running(pid: u32) -> bool {
    unsafe {
        // 使用 PROCESS_QUERY_LIMITED_INFORMATION 作为请求权限，
        // 这是调用 GetExitCodeProcess 所需的最小权限集，减少因权限不足导致失败的可能性。
        let handle_result = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);

        if let Ok(handle) = handle_result {
            // 理论上 OpenProcess 成功后句柄应有效，但仍检查 is_invalid 以防万一。
            if handle.is_invalid() {
                return false;
            }
            let mut exit_code: u32 = 0;
            // 尝试获取进程的退出码。
            let success = GetExitCodeProcess(handle, &mut exit_code).is_ok();
            // 无论如何都要确保关闭句柄。
            CloseHandle(handle).ok();
            // 如果成功获取了退出码，并且退出码是 STILL_ACTIVE (值为 259)，则表示进程仍在运行。
            success && exit_code == 259
        } else {
            // OpenProcess 调用失败，通常意味着进程不存在或无权访问。
            false
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn is_process_running(pid: u32) -> bool {
    // 临时的非 Windows 实现。
    // 注意：这个实现效率不高，因为它每次都创建新的 System 对象。
    // 理想情况下，如果需要跨平台支持，应该也将共享的 `sys` 实例传递到这里。
    let mut s = System::new();
    s.refresh_processes(ProcessesToUpdate::All, true);
    s.process(Pid::from_u32(pid)).is_some()
}

/// 检查目标目录下的任意进程是否拥有前台窗口 (仅 Windows)。
#[cfg(target_os = "windows")]
fn is_window_foreground_for_pid(pid: u32) -> bool {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId};

    unsafe {
        let foreground_window: HWND = GetForegroundWindow();
        if foreground_window.0.is_null() {
            return false;
        }
        let mut foreground_pid: u32 = 0;
        GetWindowThreadProcessId(foreground_window, Some(&mut foreground_pid));
        foreground_pid == pid
    }
}
#[cfg(not(target_os = "windows"))]
fn is_window_foreground_for_pid(_pid: u32) -> bool {
    // 对于非 Windows 平台，暂时假设窗口总是在前台。
    // 这是一个占位符，需要特定平台的实现 (如 X11, Wayland, AppKit) 才能准确判断。
    true
}

/// 检查指定 PID 的进程是否拥有可见窗口 (仅 Windows)。
#[cfg(target_os = "windows")]
fn has_window_for_pid(pid: u32) -> bool {
    use std::sync::atomic::{AtomicBool, Ordering};
    use windows::core::BOOL;
    use windows::Win32::Foundation::{HWND, LPARAM};
    use windows::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowThreadProcessId, IsWindowVisible,
    };

    static FOUND_WINDOW: AtomicBool = AtomicBool::new(false);

    unsafe extern "system" fn enum_windows_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
        unsafe {
            let mut window_pid: u32 = 0;
            GetWindowThreadProcessId(hwnd, Some(&mut window_pid));
            // lparam 是目标 PID 的指针
            let target_pid = *(lparam.0 as *const u32);
            // 检查窗口属于目标 PID 且窗口可见
            if window_pid == target_pid && IsWindowVisible(hwnd).as_bool() {
                // 找到窗口，设置标志并停止枚举
                FOUND_WINDOW.store(true, Ordering::Relaxed);
                return BOOL::from(false);
            }
        }
        BOOL::from(true) // 继续枚举
    }

    // 重置标志
    FOUND_WINDOW.store(false, Ordering::Relaxed);

    let lparam = LPARAM(&pid as *const u32 as isize);
    unsafe { EnumWindows(Some(enum_windows_proc), lparam) }.ok();

    // 返回是否找到窗口
    FOUND_WINDOW.load(Ordering::Relaxed)
}

#[cfg(not(target_os = "windows"))]
fn has_window_for_pid(_pid: u32) -> bool {
    // 对于非 Windows 平台，暂时假设进程总是有窗口。
    // 这是一个占位符，需要特定平台的实现。
    true
}

// get_child_processes 函数已根据您提供的代码移除。

/// 根据可执行文件所在目录获取该目录及子目录下所有正在运行的进程 PID 列表。
///
/// # Arguments
/// * `executable_path` - 可执行文件的完整路径。
/// * `sys` - 对 `sysinfo::System` 的可变引用。
///
/// # Returns
/// 返回该目录及子目录下所有正在运行进程的 PID 列表。
fn get_processes_in_directory(executable_path: &str, sys: &mut System) -> Vec<u32> {
    sys.refresh_processes(ProcessesToUpdate::All, true);
    let target_dir = Path::new(executable_path).parent();
    if target_dir.is_none() {
        return Vec::new();
    }
    let target_dir = target_dir.unwrap();

    let mut pids = Vec::new();
    for (pid, process) in sys.processes() {
        if let Some(process_exe_path) = process.exe() {
            if let Some(process_dir) = process_exe_path.parent() {
                // 检查进程是否在目标目录或其子目录中
                if process_dir == target_dir || process_dir.starts_with(target_dir) {
                    pids.push(pid.as_u32());
                }
            }
        }
    }
    pids
}

/// 选择最佳的进程 PID，简单优先级：聚焦进程 > 有窗口进程 > 第一个找到的进程 > 原始PID
///
/// # Arguments
/// * `original_pid` - 原始传入的 PID
/// * `executable_path` - 可执行文件路径
/// * `sys` - System 实例
///
/// # Returns
/// 返回最佳的 PID
fn select_best_pid(original_pid: u32, executable_path: &str, sys: &mut System) -> u32 {
    // 先检查原始 PID 是否有聚焦
    if is_window_foreground_for_pid(original_pid) {
        println!("原始 PID {} 拥有聚焦，直接使用", original_pid);
        return original_pid;
    }

    // 获取目录下所有进程
    let pids = get_process_id_by_path(executable_path, sys);
    if pids.is_empty() {
        println!("未找到目录下的进程，使用原始 PID: {}", original_pid);
        return original_pid;
    }

    // 优先查找聚焦的进程
    for &pid in &pids {
        if is_window_foreground_for_pid(pid) {
            println!("找到聚焦的进程 PID: {}", pid);
            return pid;
        }
    }

    // 查找有窗口的进程
    for &pid in &pids {
        if has_window_for_pid(pid) {
            println!("找到有窗口的进程 PID: {}", pid);
            return pid;
        }
    }

    // 如果没有找到更好的，返回第一个找到的进程
    if let Some(&first_pid) = pids.first() {
        println!("使用第一个找到的进程 PID: {}", first_pid);
        return first_pid;
    }

    println!("回退到原始 PID: {}", original_pid);
    original_pid
}

/// 根据可执行文件的完整路径查找所有正在运行的进程 PID 列表 (已优化 sysinfo 使用)。
///
/// # Arguments
/// * `executable_path` - 要查找的可执行文件的完整路径。
/// * `sys` - 对 `sysinfo::System` 的可变引用。
///
/// # Returns
/// 返回目录下所有正在运行的进程 PID 列表。
fn get_process_id_by_path(executable_path: &str, sys: &mut System) -> Vec<u32> {
    let pids = get_processes_in_directory(executable_path, sys);
    println!("找到进程目录下的进程 PID 列表: {:?}", pids);
    pids
}
