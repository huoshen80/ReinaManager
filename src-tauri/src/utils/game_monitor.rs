//! 游戏监控模块
//!
//! 使用事件驱动架构监控游戏进程的运行状态，追踪游戏时间。
//! 包含前台窗口检测、进程切换处理、逃逸进程检测等功能。

// ============================================================================
// 外部依赖导入
// ============================================================================

use log::{debug, error, info, warn};
use parking_lot::RwLock;
use serde_json::json;
use std::{
    collections::HashSet,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, OnceLock,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use sysinfo::{ProcessesToUpdate, System};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::time::{interval, MissedTickBehavior};

#[cfg(target_os = "windows")]
use windows::Win32::{
    Foundation::CloseHandle,
    System::Threading::{
        GetExitCodeProcess, OpenProcess, QueryFullProcessImageNameW, TerminateProcess,
        PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
    },
    UI::WindowsAndMessaging::GetWindowThreadProcessId,
};

// ============================================================================
// 常量定义
// ============================================================================

/// 连续失败次数阈值，超过此值认为进程已结束
const MAX_CONSECUTIVE_FAILURES: u32 = 3;

/// 时间更新事件发送间隔（秒）
const TIME_UPDATE_INTERVAL_SECS: u64 = 1;

/// 监控循环检查间隔（秒）
const MONITOR_CHECK_INTERVAL_SECS: u64 = 1;

// ============================================================================
// 数据结构定义
// ============================================================================

/// 活跃的监控会话信息
pub struct ActiveSession {
    /// 停止信号，用于通知监控线程停止
    pub stop_signal: Arc<AtomicBool>,
    /// 候选进程 PID 列表
    pub candidate_pids: Arc<RwLock<HashSet<u32>>>,
}

/// 监控状态（线程安全的共享状态）
///
/// 用于在 Hook 线程和主监控循环之间共享信息
/// 使用 parking_lot::RwLock 替代 std::sync::Mutex 以避免死锁
#[derive(Debug)]
struct MonitorState {
    /// 当前是否有游戏窗口在前台
    is_foreground: bool,
    /// 当前活跃的游戏进程 PID
    best_pid: u32,
}

impl MonitorState {
    /// 创建新的监控状态实例
    fn new(initial_pid: u32) -> Self {
        Self {
            is_foreground: false,
            best_pid: initial_pid,
        }
    }
}

/// Hook 线程守卫，确保线程在任何退出情况下都能正确停止
///
/// 使用 RAII 模式，在析构时自动发送停止信号
struct HookGuard {
    stop_signal: Arc<AtomicBool>,
}

impl HookGuard {
    fn new(stop_signal: Arc<AtomicBool>) -> Self {
        Self { stop_signal }
    }
}

impl Drop for HookGuard {
    fn drop(&mut self) {
        // 无论函数如何退出（正常返回、?, panic 等），都会触发停止信号
        self.stop_signal.store(true, Ordering::Release);
        info!("HookGuard 析构：已发送停止信号");
    }
}

// ============================================================================
// 全局会话管理
// ============================================================================

/// 全局会话存储（使用 parking_lot::RwLock 保护 HashMap）
static ACTIVE_SESSIONS: OnceLock<RwLock<std::collections::HashMap<u32, ActiveSession>>> =
    OnceLock::new();

/// 获取全局会话存储的引用
fn get_sessions() -> &'static RwLock<std::collections::HashMap<u32, ActiveSession>> {
    ACTIVE_SESSIONS.get_or_init(|| RwLock::new(std::collections::HashMap::new()))
}

/// 注册新的监控会话
fn register_session(game_id: u32, session: ActiveSession) {
    get_sessions().write().insert(game_id, session);
}

/// 移除监控会话
fn unregister_session(game_id: u32) {
    get_sessions().write().remove(&game_id);
}

// ============================================================================
// 公共 API
// ============================================================================

/// 获取指定游戏的候选 PID 列表
#[allow(dead_code)]
pub fn get_game_candidate_pids(game_id: u32) -> Option<HashSet<u32>> {
    let sessions = get_sessions().read();
    sessions
        .get(&game_id)
        .map(|s| s.candidate_pids.read().clone())
}

/// 停止指定游戏的监控并终止所有相关进程
///
/// # Arguments
/// * `game_id` - 游戏 ID
///
/// # Returns
/// 成功返回终止的进程数量，失败返回错误信息
pub fn stop_game_session(game_id: u32) -> Result<u32, String> {
    // 获取会话信息
    let sessions = get_sessions().read();
    let session = sessions
        .get(&game_id)
        .ok_or_else(|| format!("未找到游戏 {} 的监控会话", game_id))?;

    // 发送停止信号
    session.stop_signal.store(true, Ordering::Release);

    // 复制候选 PID 列表
    let pids: Vec<u32> = session.candidate_pids.read().iter().copied().collect();

    // 释放读锁
    drop(sessions);

    // 终止所有候选进程
    let mut terminated_count = 0u32;
    for pid in pids {
        if is_process_running(pid) {
            match terminate_process(pid) {
                Ok(_) => {
                    info!("成功终止进程 PID: {}", pid);
                    terminated_count += 1;
                }
                Err(e) => {
                    warn!("终止进程 {} 失败: {}", pid, e);
                }
            }
        }
    }

    info!(
        "游戏 {} 停止完成，共终止 {} 个进程",
        game_id, terminated_count
    );
    Ok(terminated_count)
}

/// 启动指定游戏进程的监控
///
/// 这是模块的主入口函数，由外部调用以开始监控一个游戏进程。
///
/// # Arguments
/// * `app_handle` - Tauri 应用句柄，用于发送事件到前端
/// * `game_id` - 游戏的唯一标识符
/// * `process_id` - 要开始监控的游戏进程的初始 PID
/// * `executable_path` - 游戏主可执行文件的完整路径，用于在进程重启或切换后重新查找
///
/// # 工作流程
/// 1. 创建 System 实例用于进程查询
/// 2. 在异步任务中启动实际的监控循环
/// 3. 监控循环会持续运行直到游戏进程结束
pub async fn monitor_game<R: Runtime>(
    app_handle: AppHandle<R>,
    game_id: u32,
    process_id: u32,
    executable_path: String,
    #[cfg(target_os = "linux")] systemd_unit_name: String,
) {
    let app_handle_clone = app_handle.clone();
    let mut sys = System::new();

    tauri::async_runtime::spawn(async move {
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

// ============================================================================
// 核心监控逻辑
// ============================================================================

/// 实际执行游戏监控的核心循环
///
/// 使用事件驱动架构：
/// - Hook 线程：实时监听前台窗口变化，更新共享状态
/// - 主循环：每秒读取共享状态，累计游戏时间，无重量级 API 调用
///
/// # Arguments
/// * `app_handle` - Tauri 应用句柄
/// * `game_id` - 游戏 ID
/// * `initial_pid` - 初始监控的进程 PID
/// * `executable_path` - 游戏主可执行文件路径
/// * `sys` - System 实例的可变引用，用于进程信息查询
///
/// # 返回值
/// 成功返回 `Ok(())`，失败返回包含错误信息的 `Err(String)`
///
/// # 工作流程
/// 1. 等待 3 秒让游戏充分启动
/// 2. 扫描游戏目录获取所有候选进程
/// 3. 创建共享状态和停止信号
/// 4. 启动 Hook 线程监听前台窗口变化
/// 5. 主循环每秒检查状态并累计时间
/// 6. 进程失活时触发重新扫描
/// 7. 会话结束时发送结束事件
async fn run_game_monitor<R: Runtime>(
    app_handle: AppHandle<R>,
    game_id: u32,
    initial_pid: u32,
    executable_path: String,
    sys: &mut System,
) -> Result<(), String> {
    let mut accumulated_seconds = 0u64;
    let start_time = get_timestamp();

    // 等待游戏进程充分启动（例如 Launcher -> Game 的切换）
    info!("等待 3 秒以便游戏进程充分启动...");
    tokio::time::sleep(Duration::from_secs(3)).await;

    // 初始扫描：获取所有候选 PID
    let candidate_pids_vec = get_all_candidate_pids(&executable_path, sys);
    let mut candidate_pids_set: HashSet<u32> = candidate_pids_vec.into_iter().collect();

    // 如果初始 PID 不在候选列表中，手动添加（容错）
    if !candidate_pids_set.contains(&initial_pid) && is_process_running(initial_pid) {
        candidate_pids_set.insert(initial_pid);
    }

    // 创建共享的候选 PID 列表（用于 Hook 线程和停止功能）
    let shared_candidate_pids = Arc::new(RwLock::new(candidate_pids_set.clone()));

    // 创建共享状态（仅包含 is_foreground 和 best_pid）
    let monitor_state = Arc::new(RwLock::new(MonitorState::new(initial_pid)));

    // 获取游戏目录路径（用于逃逸检测）
    let game_directory = Path::new(&executable_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| executable_path.clone());

    info!(
        "开始监控游戏: ID={}, 初始 PID={}, 候选进程组={:?}, 游戏目录={}",
        game_id, initial_pid, candidate_pids_set, game_directory
    );

    // 创建停止信号
    let stop_signal = Arc::new(AtomicBool::new(false));

    // 注册会话到全局管理器
    register_session(
        game_id,
        ActiveSession {
            stop_signal: stop_signal.clone(),
            candidate_pids: shared_candidate_pids.clone(),
        },
    );

    // 创建守卫，确保退出时清理
    let _hook_guard = HookGuard::new(stop_signal.clone());

    // 启动 Hook 线程（使用 tokio::task::spawn_blocking 统一运行时）
    start_foreground_hook(
        monitor_state.clone(),
        shared_candidate_pids.clone(),
        game_directory,
        app_handle.clone(),
        game_id,
        stop_signal.clone(),
    );

    // 获取当前最佳 PID
    let best_pid = monitor_state.read().best_pid;

    // 通知前端会话开始
    app_handle
        .emit(
            "game-session-started",
            json!({ "gameId": game_id, "processId": best_pid, "startTime": start_time }),
        )
        .map_err(|e| format!("无法发送 game-session-started 事件: {}", e))?;

    let mut consecutive_failures = 0u32;
    let mut last_best_pid = best_pid;

    // 创建精确的 1 秒间隔定时器
    let mut tick_interval = interval(Duration::from_secs(MONITOR_CHECK_INTERVAL_SECS));
    tick_interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

    // 主监控循环
    loop {
        tick_interval.tick().await;

        // 检查停止信号（支持外部停止）
        if stop_signal.load(Ordering::Acquire) {
            info!("收到停止信号，结束监控游戏 {}", game_id);
            break;
        }

        // 读取共享状态（使用 RwLock 读锁，不会阻塞 Hook 线程的写操作太久）
        let (is_foreground, current_best_pid) = {
            let state = monitor_state.read();
            (state.is_foreground, state.best_pid)
        };

        // 检查当前最佳 PID 是否还在运行
        let best_pid_running = is_process_running(current_best_pid);

        if !best_pid_running {
            consecutive_failures += 1;
            debug!(
                "最佳进程 {} 检查失败次数: {}/{}",
                current_best_pid, consecutive_failures, MAX_CONSECUTIVE_FAILURES
            );

            if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                warn!("最佳进程 {} 已失活，触发重新扫描", current_best_pid);

                // 触发目录扫描，获取最新的候选 PID 列表
                let new_candidate_pids_vec = get_all_candidate_pids(&executable_path, sys);

                if new_candidate_pids_vec.is_empty() {
                    info!("未找到可切换的活动进程，结束监控会话");
                    break;
                }

                // 更新共享的候选列表
                let new_candidate_pids_set: HashSet<u32> =
                    new_candidate_pids_vec.into_iter().collect();
                let new_best_pid = *new_candidate_pids_set.iter().next().unwrap();

                // 更新候选 PID 列表
                {
                    let mut pids = shared_candidate_pids.write();
                    *pids = new_candidate_pids_set;
                }

                // 更新监控状态
                {
                    let mut state = monitor_state.write();
                    state.best_pid = new_best_pid;
                    state.is_foreground = false;
                }

                info!("成功切换到新的最佳进程 PID: {}", new_best_pid);
                consecutive_failures = 0;
                last_best_pid = new_best_pid;

                app_handle
                    .emit(
                        "game-process-switched",
                        json!({ "gameId": game_id, "newProcessId": new_best_pid }),
                    )
                    .ok();
                continue;
            }
        } else {
            // 最佳 PID 仍在运行，重置失败计数
            consecutive_failures = 0;

            // 如果 best_pid 变化了，记录日志
            if current_best_pid != last_best_pid {
                info!("检测到进程切换: {} -> {}", last_best_pid, current_best_pid);
                last_best_pid = current_best_pid;
            }

            // 前台判定：仅检查共享状态（性能优化的关键）
            if is_foreground {
                accumulated_seconds += 1;

                // 发送时间更新
                if accumulated_seconds > 0
                    && accumulated_seconds.is_multiple_of(TIME_UPDATE_INTERVAL_SECS)
                {
                    let minutes = accumulated_seconds / 60;
                    app_handle
                        .emit(
                            "game-time-update",
                            json!({
                                "gameId": game_id,
                                "totalMinutes": minutes,
                                "totalSeconds": accumulated_seconds,
                                "startTime": start_time,
                                "currentTime": get_timestamp(),
                                "processId": current_best_pid
                            }),
                        )
                        .map_err(|e| format!("无法发送 game-time-update 事件: {}", e))?;
                }
            }
        }
    }

    // 清理会话注册
    unregister_session(game_id);

    finalize_session(
        &app_handle,
        game_id,
        last_best_pid,
        start_time,
        accumulated_seconds,
    )
}

/// 完成游戏监控会话并发送结束事件
///
/// # Arguments
/// * `app_handle` - Tauri 应用句柄
/// * `game_id` - 游戏 ID
/// * `process_id` - 最终的进程 PID
/// * `start_time` - 会话开始时间戳
/// * `accumulated_seconds` - 累计的活动时间（秒）
///
/// # 返回值
/// 成功返回 `Ok(())`，失败返回包含错误信息的 `Err(String)`
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

// ============================================================================
// Hook 线程 - 前台窗口监听
// ============================================================================

/// 启动前台窗口变化的 Hook 线程（Windows 平台）
///
/// 使用 tokio::task::spawn_blocking 在阻塞线程池中运行，与 Tokio 运行时统一管理。
///
/// # Arguments
/// * `state` - 线程安全的共享监控状态
/// * `candidate_pids` - 共享的候选 PID 列表
/// * `game_directory` - 游戏目录路径，用于检测逃逸进程（Steam 启动等场景）
/// * `app_handle` - Tauri 应用句柄，用于发送进程切换事件
/// * `game_id` - 游戏 ID
/// * `stop_signal` - 停止信号，用于通知线程停止运行
///
/// # Hook 逻辑
/// 1. 每 200ms 检查一次前台窗口
/// 2. 获取前台窗口的 PID
/// 3. 检查 PID 是否在已知的候选列表中
/// 4. 如果不在，检查其可执行文件路径是否在游戏目录下（逃逸检测）
/// 5. 更新共享状态：is_foreground、best_pid，并将新进程加入候选列表
#[cfg(target_os = "windows")]
fn start_foreground_hook<R: Runtime + 'static>(
    state: Arc<RwLock<MonitorState>>,
    candidate_pids: Arc<RwLock<HashSet<u32>>>,
    game_directory: String,
    app_handle: AppHandle<R>,
    game_id: u32,
    process_id: u32,
    executable_path: String,
    #[cfg(target_os = "linux")] systemd_unit_name: String,
) {
    // 使用 tokio::task::spawn_blocking 统一运行时管理
    tokio::task::spawn_blocking(move || {
        info!("前台窗口 Hook 线程已启动");

        use windows::Win32::UI::WindowsAndMessaging::GetForegroundWindow;

        let mut last_pid: u32 = 0;

        // 预处理游戏目录路径：转换为小写用于不区分大小写的比较（Windows 特性）
        let game_directory_lower = game_directory.to_lowercase();

        // 主循环：检查停止信号
        while !stop_signal.load(Ordering::Acquire) {
            // 200ms 检查一次，平衡响应速度和性能
            std::thread::sleep(Duration::from_millis(200));

            unsafe {
                let hwnd = GetForegroundWindow();
                if hwnd.0.is_null() {
                    // 没有前台窗口，更新状态后继续
                    state.write().is_foreground = false;
                    continue;
                }

                let mut new_pid: u32 = 0;
                GetWindowThreadProcessId(hwnd, Some(&mut new_pid));

                if new_pid == 0 {
                    continue;
                }

                // 只有当 PID 变化时才处理
                if new_pid == last_pid {
                    continue;
                }

                last_pid = new_pid;

                // 检查 1：新 PID 是否在候选列表中
                let is_in_candidates = candidate_pids.read().contains(&new_pid);

                if is_in_candidates {
                    // 更新状态（缩小锁的持有范围）
                    let should_emit = {
                        let mut s = state.write();
                        s.is_foreground = true;
                        let changed = s.best_pid != new_pid;
                        if changed {
                            s.best_pid = new_pid;
                        }
                        changed
                    };

                    // 锁已释放，安全发送事件
                    if should_emit {
                        info!("前台窗口切换到已知游戏进程: PID {}", new_pid);
                        if let Err(e) = app_handle.emit(
                            "game-process-switched", //暂时无用
                            json!({ "gameId": game_id, "newProcessId": new_pid }),
                        ) {
                            warn!("无法发送进程切换事件: {}", e);
                        }
                    }
                    continue;
                }

                // 检查 2：新 PID 的可执行文件是否在游戏目录下（逃逸检测）
                if let Some(exe_path) = get_process_executable_path(new_pid) {
                    let exe_path_str = exe_path.to_string_lossy();
                    // Windows 文件系统不区分大小写，统一转小写比较
                    if exe_path_str
                        .to_lowercase()
                        .starts_with(&game_directory_lower)
                    {
                        // 发现新的游戏进程！
                        info!(
                            "检测到新的游戏进程（逃逸）: PID {}, 路径: {}",
                            new_pid, exe_path_str
                        );

                        // 添加到候选列表
                        candidate_pids.write().insert(new_pid);

                        // 更新状态
                        {
                            let mut s = state.write();
                            s.is_foreground = true;
                            s.best_pid = new_pid;
                        }

                        // 发送进程切换事件
                        if let Err(e) = app_handle.emit(
                            "game-process-switched", //暂时无用
                            json!({ "gameId": game_id, "newProcessId": new_pid }),
                        ) {
                            warn!("无法发送进程切换事件: {}", e);
                        }
                        continue;
                    }
                }

                // 否则，前台窗口不属于游戏
                state.write().is_foreground = false;
            }
        }

        info!("前台窗口 Hook 线程已停止");
    });
}

#[cfg(not(target_os = "windows"))]
fn start_foreground_hook<R: Runtime + 'static>(
    _state: Arc<RwLock<MonitorState>>,
    _candidate_pids: Arc<RwLock<HashSet<u32>>>,
    _game_directory: String,
    _app_handle: AppHandle<R>,
    _game_id: u32,
    _stop_signal: Arc<AtomicBool>,
) {
    warn!("start_foreground_hook 在非 Windows 平台被调用，将被忽略");
}

// ============================================================================
// 进程管理 - 进程查询与检测
// ============================================================================

/// 获取当前所有候选的游戏进程 PID 列表
///
/// 从游戏目录下扫描所有进程，自动过滤掉管理器自身。
///
/// # Arguments
/// * `executable_path` - 游戏可执行文件路径
/// * `sys` - System 实例的可变引用
///
/// # Returns
/// 返回所有候选 PID 的列表，如果没有找到则返回空列表
fn get_all_candidate_pids(executable_path: &str, sys: &mut System) -> Vec<u32> {
    let manager_pid = std::process::id();

    let candidate_pids: Vec<u32> = get_process_id_by_path(executable_path, sys)
        .into_iter()
        .filter(|&pid| pid != manager_pid)
        .collect();

    if candidate_pids.is_empty() {
        debug!(
            "未通过路径 '{}' 找到匹配的进程（已排除管理器）",
            executable_path
        );
    } else {
        debug!(
            "找到 {} 个候选进程: {:?}",
            candidate_pids.len(),
            candidate_pids
        );
    }

    candidate_pids
}

/// 根据可执行文件的完整路径查找所有正在运行的进程 PID 列表
///
/// # Arguments
/// * `executable_path` - 要查找的可执行文件的完整路径
/// * `sys` - System 实例的可变引用
///
/// # Returns
/// 返回目录下所有正在运行的进程 PID 列表
fn get_process_id_by_path(executable_path: &str, sys: &mut System) -> Vec<u32> {
    let pids = get_processes_in_directory(executable_path, sys);
    debug!("找到进程目录下的进程 PID 列表: {:?}", pids);
    pids
}

/// 根据可执行文件所在目录获取该目录及子目录下所有正在运行的进程 PID 列表
///
/// # Arguments
/// * `executable_path` - 可执行文件的完整路径
/// * `sys` - System 实例的可变引用
///
/// # Returns
/// 返回该目录及子目录下所有正在运行进程的 PID 列表。如果无法获取目录信息，返回空列表
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

    // 只对目标目录进行一次规范化，避免在循环中重复 I/O
    let canonical_target = std::fs::canonicalize(target_dir).ok();

    // 预先准备字符串形式的路径用于回退比较
    let target_str = canonical_target
        .as_ref()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| target_dir.to_string_lossy().to_string());

    let mut pids = Vec::new();
    for (pid, process) in sys.processes() {
        if let Some(process_exe_path) = process.exe() {
            if let Some(process_dir) = process_exe_path.parent() {
                // 优先使用字符串比较，避免对每个进程都执行 canonicalize
                let process_str = process_dir.to_string_lossy();

                let matches = if let Some(canonical) = &canonical_target {
                    // 先尝试字符串前缀匹配（快速路径）
                    if process_str.starts_with(&target_str) {
                        true
                    } else {
                        // 字符串匹配失败，尝试规范化路径比较（慢速路径）
                        std::fs::canonicalize(process_dir)
                            .ok()
                            .map(|canonical_process_dir| {
                                canonical_process_dir == *canonical
                                    || canonical_process_dir.starts_with(canonical)
                            })
                            .unwrap_or(false)
                    }
                } else {
                    // target_dir 规范化失败，完全使用字符串比较
                    process_str == target_str || process_str.starts_with(target_str.as_str())
                };

                if matches {
                    pids.push(pid.as_u32());
                }
            }
        }
    }
    pids
}

/// 检查指定 PID 的进程是否仍在运行（Windows 平台）
///
/// 使用 Windows API 的 `OpenProcess` 和 `GetExitCodeProcess` 来检查进程状态。
/// 使用最小权限 `PROCESS_QUERY_LIMITED_INFORMATION` 以提高兼容性。
///
/// # Arguments
/// * `pid` - 要检查的进程 PID
///
/// # Returns
/// 如果进程仍在运行（退出码为 STILL_ACTIVE = 259），返回 `true`，否则返回 `false`
#[cfg(target_os = "windows")]
pub fn is_process_running(pid: u32) -> bool {
    unsafe {
        let handle_result = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid);

        if let Ok(handle) = handle_result {
            if handle.is_invalid() {
                return false;
            }
            let mut exit_code: u32 = 0;
            let success = GetExitCodeProcess(handle, &mut exit_code).is_ok();
            CloseHandle(handle).ok();
            // STILL_ACTIVE = 259
            success && exit_code == 259
        } else {
            false
        }
    }
}

#[cfg(not(target_os = "windows"))]
pub fn is_process_running(_pid: u32) -> bool {
    warn!("is_process_running 在非 Windows 平台被调用");
    false
}

/// 强制终止指定 PID 的进程（Windows 平台）
///
/// # Arguments
/// * `pid` - 要终止的进程 PID
///
/// # Returns
/// 成功返回 `Ok(())`，失败返回错误信息
#[cfg(target_os = "windows")]
pub fn terminate_process(pid: u32) -> Result<(), String> {
    unsafe {
        let handle = OpenProcess(PROCESS_TERMINATE, false, pid)
            .map_err(|e| format!("无法打开进程 {}: {}", pid, e))?;

        if handle.is_invalid() {
            return Err(format!("进程 {} 句柄无效", pid));
        }

        let result = TerminateProcess(handle, 1);
        CloseHandle(handle).ok();

        result.map_err(|e| format!("终止进程 {} 失败: {}", pid, e))
    }
}

#[cfg(not(target_os = "windows"))]
pub fn terminate_process(_pid: u32) -> Result<(), String> {
    Err("terminate_process 仅支持 Windows 平台".to_string())
}

/// 获取进程的可执行文件路径（Windows 平台）
///
/// # Arguments
/// * `pid` - 进程 PID
///
/// # Returns
/// 如果成功，返回进程的可执行文件完整路径
#[cfg(target_os = "windows")]
fn get_process_executable_path(pid: u32) -> Option<std::path::PathBuf> {
    use windows::core::PWSTR;

    unsafe {
        let handle = match OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) {
            Ok(h) => h,
            Err(e) => {
                // 区分错误类型：ACCESS_DENIED 通常是权限不足，其他可能是进程不存在
                let error_code = e.code().0;
                if error_code == 0x80070005u32 as i32 {
                    // ERROR_ACCESS_DENIED
                    debug!("无权访问进程 {} 的路径（可能是系统/保护进程）", pid);
                } else {
                    debug!("无法打开进程 {} (错误码: 0x{:X})", pid, error_code);
                }
                return None;
            }
        };

        if handle.is_invalid() {
            return None;
        }

        let mut buffer = vec![0u16; 1024];
        let mut size = buffer.len() as u32;

        let result = QueryFullProcessImageNameW(
            handle,
            PROCESS_NAME_WIN32,
            PWSTR(buffer.as_mut_ptr()),
            &mut size,
        );
        let _ = CloseHandle(handle);

        if result.is_ok() && size > 0 {
            let path = String::from_utf16_lossy(&buffer[..size as usize]);
            Some(std::path::PathBuf::from(path))
        } else {
            debug!("获取进程 {} 的路径失败", pid);
            None
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn get_process_executable_path(_pid: u32) -> Option<std::path::PathBuf> {
    None
}

// ============================================================================
// 工具函数
// ============================================================================

/// 获取当前的 Unix 时间戳（秒）
///
/// # Returns
/// 返回当前时间的 Unix 时间戳（秒）
///
/// # Panics
/// 如果系统时间早于 UNIX_EPOCH（1970-01-01 00:00:00 UTC），会 panic
fn get_timestamp() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("系统时间错误: 时间回溯")
        .as_secs()
}
