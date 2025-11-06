use log::{debug, error, info, warn};
use serde_json::json;
use std::{
    path::Path,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
// 导入 sysinfo 相关类型和 trait
use sysinfo::{ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, Runtime};

// 监控配置常量
/// 连续失败次数阈值，超过此值认为进程已结束
const MAX_CONSECUTIVE_FAILURES: u32 = 3;
/// 时间更新事件发送间隔（秒）
const TIME_UPDATE_INTERVAL_SECS: u64 = 30;
/// 监控循环检查间隔（秒）
const MONITOR_CHECK_INTERVAL_SECS: u64 = 1;

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
///
/// # Returns
/// 返回当前时间的 Unix 时间戳（秒）。
///
/// # Panics
/// 如果系统时间早于 UNIX_EPOCH（1970-01-01 00:00:00 UTC），会 panic。
fn get_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("系统时间错误: 时间回溯")
        .as_secs()
}

/// 尝试切换到新的游戏进程。
///
/// 当检测到当前监控的进程已结束时，尝试根据游戏路径查找新的进程实例。
/// 会自动过滤掉管理器自身的进程。
///
/// # Arguments
/// * `current_pid` - 当前正在监控的进程 PID
/// * `executable_path` - 游戏可执行文件路径
/// * `sys` - System 实例的可变引用
/// * `switched_process` - 是否已经发生过进程切换
///
/// # Returns
/// 返回 `Some(new_pid)` 如果找到新的可用进程，否则返回 `None`
fn try_switch_to_new_process(
    current_pid: u32,
    executable_path: &str,
    sys: &mut System,
    switched_process: bool,
) -> Option<u32> {
    let manager_pid = std::process::id();

    // 尝试根据可执行文件路径查找是否有新的进程实例在运行
    let available_pids: Vec<u32> = get_process_id_by_path(executable_path, sys)
        .into_iter()
        .filter(|&pid| pid != manager_pid) // 过滤掉管理器自身
        .collect();

    if available_pids.is_empty() {
        debug!(
            "未通过路径 '{}' 找到匹配的进程（已排除管理器）",
            executable_path
        );
        return None;
    }

    // 从可用进程中选择最佳的 PID
    let matched_pid = select_best_pid(current_pid, executable_path, sys);

    // 再次确认不是管理器自身（双重保险）
    if matched_pid == manager_pid {
        warn!(
            "路径匹配找到的 PID {} 与管理器程序相同，已被过滤",
            matched_pid
        );
        return None;
    }

    // 检查找到的 PID 是否与当前认为已结束的 PID 不同，
    // 或者虽然 PID 相同但我们之前从未切换过进程 (说明可能是原始进程重启)
    if current_pid != matched_pid || !switched_process {
        info!(
            "通过路径 '{}' 找到潜在的新进程实例 PID: {}",
            executable_path, matched_pid
        );

        // 再次确认这个找到的 PID 当前是否真的在运行
        if is_process_running(matched_pid) {
            info!("确认 PID {} 正在运行，准备切换监控目标", matched_pid);
            return Some(matched_pid);
        } else {
            warn!("路径匹配找到的 PID {} 当前并未运行，无法切换", matched_pid);
        }
    } else {
        debug!(
            "路径匹配找到的 PID {} 与当前已结束的 PID 相同，且已切换过，不再切换",
            matched_pid
        );
    }

    None
}

/// 完成游戏监控会话并发送结束事件。
///
/// # Arguments
/// * `app_handle` - Tauri 应用句柄
/// * `game_id` - 游戏 ID
/// * `process_id` - 最终的进程 PID
/// * `start_time` - 会话开始时间戳
/// * `accumulated_seconds` - 累计的活动时间（秒）
///
/// # Returns
/// 返回 `Ok(())` 如果成功发送事件，否则返回错误信息
fn finalize_session<R: Runtime>(
    app_handle: &AppHandle<R>,
    game_id: u32,
    process_id: u32,
    start_time: u64,
    accumulated_seconds: u64,
) -> Result<(), String> {
    let end_time = get_timestamp();
    let total_minutes = accumulated_seconds / 60;
    let remainder_seconds = accumulated_seconds % 60;

    // 将秒数四舍五入到最接近的分钟数
    let final_minutes = if remainder_seconds >= 30 {
        total_minutes + 1
    } else {
        total_minutes
    };

    info!(
        "游戏会话结束: ID={}, 最终 PID={}, 总活动时间={}秒 (计为 {} 分钟)",
        game_id, process_id, accumulated_seconds, final_minutes
    );

    // 发送会话结束事件到前端
    app_handle
        .emit(
            "game-session-ended",
            json!({
                "gameId": game_id,
                "startTime": start_time,
                "endTime": end_time,
                "totalMinutes": final_minutes,
                "totalSeconds": accumulated_seconds,
                "processId": process_id
            }),
        )
        .map_err(|e| format!("无法发送 game-session-ended 事件: {}", e))
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
        // 将 System 实例的可变引用传递给实际的监控循环
        if let Err(e) = run_game_monitor(
            app_handle_clone,
            game_id,
            process_id,
            executable_path,
            &mut sys,
        )
        .await
        {
            error!("游戏监控任务 (game_id: {}) 出错: {}", game_id, e);
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
    tokio::time::sleep(Duration::from_secs(MONITOR_CHECK_INTERVAL_SECS)).await;

    // 使用智能选择函数获取最佳的 PID
    let mut process_id = select_best_pid(process_id, &executable_path, sys);

    info!(
        "开始监控游戏: ID={}, 最终 PID={}, Path={}",
        game_id, process_id, executable_path
    );

    // 通知前端会话开始
    app_handle
        .emit(
            "game-session-started",
            json!({ "gameId": game_id, "processId": process_id, "startTime": start_time }),
        )
        .map_err(|e| format!("无法发送 game-session-started 事件: {}", e))?;

    let mut consecutive_failures = 0u32;
    let original_process_id = process_id; // 保存最初启动时传入的 PID
    let mut switched_process = false; // 标记是否已经从 original_process_id 切换到了按路径找到的新进程

    loop {
        let process_running = is_process_running(process_id);

        if !process_running {
            consecutive_failures += 1;
            debug!(
                "进程 {} 运行检查失败次数: {}",
                process_id, consecutive_failures
            );

            if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                warn!(
                    "进程 {} (原始 PID: {}) 被认为已结束或连续 {} 次检查失败",
                    process_id, original_process_id, MAX_CONSECUTIVE_FAILURES
                );

                // 尝试切换到新的进程实例
                if let Some(new_pid) =
                    try_switch_to_new_process(process_id, &executable_path, sys, switched_process)
                {
                    info!("成功切换到新的进程 PID: {}", new_pid);
                    process_id = new_pid;
                    switched_process = true;
                    consecutive_failures = 0;

                    // 通知前端 PID 发生变化
                    app_handle
                        .emit(
                            "game-process-switched",
                            json!({ "gameId": game_id, "newProcessId": new_pid }),
                        )
                        .ok(); // 忽略发送错误
                    continue; // 继续下一轮循环，监控新的 PID
                }

                // 如果执行到这里，说明没有找到可以切换到的新进程实例
                info!("未找到可切换的活动进程，结束监控会话");
                break; // 退出监控循环
            }
        } else {
            // 进程正在运行，重置连续失败计数器
            consecutive_failures = 0;

            // 检查游戏窗口是否在前台且未最小化，是则累加活动时间
            if is_window_foreground_for_pid(process_id) {
                accumulated_seconds += 1;

                // 每隔指定时间向前端发送一次累计时间更新
                if accumulated_seconds > 0
                    && accumulated_seconds.is_multiple_of(TIME_UPDATE_INTERVAL_SECS)
                {
                    let minutes = accumulated_seconds / 60;
                    debug!(
                        "发送时间更新事件: {} 分钟 ({} 秒)",
                        minutes, accumulated_seconds
                    );
                    app_handle
                        .emit(
                            "game-time-update",
                            json!({
                                "gameId": game_id,
                                "totalMinutes": minutes,
                                "totalSeconds": accumulated_seconds,
                                "startTime": start_time,
                                "currentTime": get_timestamp(),
                                "processId": process_id
                            }),
                        )
                        .map_err(|e| format!("无法发送 game-time-update 事件: {}", e))?;
                }
            }
        }

        // 每次循环等待指定时间，以降低 CPU 占用
        tokio::time::sleep(Duration::from_secs(MONITOR_CHECK_INTERVAL_SECS)).await;
    }

    // 监控循环结束后的处理逻辑
    finalize_session(
        &app_handle,
        game_id,
        process_id,
        start_time,
        accumulated_seconds,
    )
}

/// 检查指定 PID 的进程是否仍在运行 (Windows 平台)。
///
/// 使用 Windows API 的 `OpenProcess` 和 `GetExitCodeProcess` 来检查进程状态。
/// 使用最小权限 `PROCESS_QUERY_LIMITED_INFORMATION` 以提高兼容性。
///
/// # Arguments
/// * `pid` - 要检查的进程 PID。
///
/// # Returns
/// 如果进程仍在运行（退出码为 STILL_ACTIVE = 259），返回 `true`，否则返回 `false`。
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
fn is_process_running(_pid: u32) -> bool {
    // 非 Windows 平台的占位实现
    // 注意：本项目主要面向 Windows 用户，此函数不会被使用
    warn!("is_process_running 在非 Windows 平台被调用");
    false
}

/// 检查指定进程是否拥有前台窗口且窗口未最小化 (仅 Windows)。
///
/// # Arguments
/// * `pid` - 要检查的进程 PID。
///
/// # Returns
/// 如果进程拥有前台窗口且窗口可见且未最小化，返回 `true`，否则返回 `false`。
#[cfg(target_os = "windows")]
fn is_window_foreground_for_pid(pid: u32) -> bool {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId, IsIconic, IsWindowVisible,
    };

    unsafe {
        let foreground_window: HWND = GetForegroundWindow();
        if foreground_window.0.is_null() {
            return false;
        }
        let mut foreground_pid: u32 = 0;
        GetWindowThreadProcessId(foreground_window, Some(&mut foreground_pid));

        // 检查 PID 是否匹配
        if foreground_pid != pid {
            return false;
        }

        // 检查窗口是否可见且未最小化（防御性检查，防止特殊情况）
        IsWindowVisible(foreground_window).as_bool() && !IsIconic(foreground_window).as_bool()
    }
}
#[cfg(not(target_os = "windows"))]
fn is_window_foreground_for_pid(_pid: u32) -> bool {
    // 非 Windows 平台的占位实现
    // 注意：本项目主要面向 Windows 用户，此函数不会被使用
    warn!("is_window_foreground_for_pid 在非 Windows 平台被调用");
    false
}

/// 检查指定 PID 的进程是否拥有可见窗口 (Windows 平台)。
///
/// 使用 Windows API 的 `EnumWindows` 枚举所有顶层窗口，
/// 检查是否有属于该进程且可见的窗口。
///
/// # Arguments
/// * `pid` - 要检查的进程 PID。
///
/// # Returns
/// 如果找到至少一个属于该进程的可见窗口，返回 `true`，否则返回 `false`。
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
    // 非 Windows 平台的占位实现
    // 注意：本项目主要面向 Windows 用户，此函数不会被使用
    warn!("has_window_for_pid 在非 Windows 平台被调用");
    false
}

/// 根据可执行文件所在目录获取该目录及子目录下所有正在运行的进程 PID 列表。
///
/// 此函数会刷新进程信息，然后扫描所有进程，找出可执行文件路径在目标目录或其子目录中的进程。
///
/// # Arguments
/// * `executable_path` - 可执行文件的完整路径。
/// * `sys` - 对 `sysinfo::System` 的可变引用。
///
/// # Returns
/// 返回该目录及子目录下所有正在运行进程的 PID 列表。如果无法获取目录信息，返回空列表。
fn get_processes_in_directory(executable_path: &str, sys: &mut System) -> Vec<u32> {
    // 只更新进程列表，不更新磁盘、网络等其他信息，提高性能
    sys.refresh_processes(ProcessesToUpdate::All, true);

    let target_dir = match Path::new(executable_path).parent() {
        Some(dir) => dir,
        None => {
            warn!("无法获取可执行文件 '{}' 的父目录", executable_path);
            return Vec::new();
        }
    };

    // 尝试规范化目标路径，用于更准确的路径比较
    // 规范化可以处理符号链接、大小写不一致、冗余斜杠等情况
    let canonical_target = std::fs::canonicalize(target_dir).ok();

    let mut pids = Vec::new();
    for (pid, process) in sys.processes() {
        if let Some(process_exe_path) = process.exe() {
            if let Some(process_dir) = process_exe_path.parent() {
                let matches = match &canonical_target {
                    Some(canonical) => {
                        // 优先使用规范化路径比较（更准确）
                        match std::fs::canonicalize(process_dir) {
                            Ok(canonical_process_dir) => {
                                canonical_process_dir == *canonical
                                    || canonical_process_dir.starts_with(canonical)
                            }
                            Err(_) => {
                                // process_dir 规范化失败，回退到字符串比较
                                // 但仍使用规范化的 target 进行比较
                                let target_str = canonical.to_string_lossy();
                                let process_str = process_dir.to_string_lossy();
                                process_str == target_str
                                    || process_str.starts_with(target_str.as_ref())
                            }
                        }
                    }
                    None => {
                        // target_dir 规范化失败，完全使用字符串比较
                        process_dir == target_dir || process_dir.starts_with(target_dir)
                    }
                };

                if matches {
                    pids.push(pid.as_u32());
                }
            }
        }
    }
    pids
}

/// 选择最佳的进程 PID，优先级：聚焦进程 > 有窗口进程 > 第一个找到的进程 > 原始PID
///
/// 自动过滤掉管理器自身的进程，避免监控自己。
///
/// # Arguments
/// * `original_pid` - 原始传入的 PID
/// * `executable_path` - 可执行文件路径
/// * `sys` - System 实例的可变引用
///
/// # Returns
/// 返回最佳的 PID，如果没有找到合适的进程则返回原始 PID
fn select_best_pid(original_pid: u32, executable_path: &str, sys: &mut System) -> u32 {
    let manager_pid = std::process::id();

    // 先检查原始 PID 是否是管理器自身
    if original_pid == manager_pid {
        debug!("原始 PID {} 是管理器自身，需要查找其他进程", original_pid);
    } else if is_window_foreground_for_pid(original_pid) {
        debug!("原始 PID {} 拥有聚焦，直接使用", original_pid);
        return original_pid;
    }

    // 获取目录下所有进程，并过滤掉管理器自身
    let pids: Vec<u32> = get_process_id_by_path(executable_path, sys)
        .into_iter()
        .filter(|&pid| pid != manager_pid)
        .collect();

    if pids.is_empty() {
        debug!("未找到目录下的其他进程，使用原始 PID: {}", original_pid);
        return original_pid;
    }

    debug!("找到 {} 个候选进程（已排除管理器）: {:?}", pids.len(), pids);

    // 优先查找聚焦的进程
    for &pid in &pids {
        if is_window_foreground_for_pid(pid) {
            info!("找到聚焦的进程 PID: {}", pid);
            return pid;
        }
    }

    // 查找有窗口的进程
    for &pid in &pids {
        if has_window_for_pid(pid) {
            info!("找到有窗口的进程 PID: {}", pid);
            return pid;
        }
    }

    // 如果没有找到更好的，返回第一个找到的进程
    if let Some(&first_pid) = pids.first() {
        info!("使用第一个找到的进程 PID: {}", first_pid);
        return first_pid;
    }

    debug!("回退到原始 PID: {}", original_pid);
    original_pid
}

/// 根据可执行文件的完整路径查找所有正在运行的进程 PID 列表。
///
/// 此函数是 `get_processes_in_directory` 的包装，用于查找指定游戏目录下的所有进程。
///
/// # Arguments
/// * `executable_path` - 要查找的可执行文件的完整路径。
/// * `sys` - 对 `sysinfo::System` 的可变引用。
///
/// # Returns
/// 返回目录下所有正在运行的进程 PID 列表。
fn get_process_id_by_path(executable_path: &str, sys: &mut System) -> Vec<u32> {
    let pids = get_processes_in_directory(executable_path, sys);
    debug!("找到进程目录下的进程 PID 列表: {:?}", pids);
    pids
}
