//! 游戏监控模块
//!
//! 使用事件驱动架构监控游戏进程的运行状态，追踪游戏时间。
//! 包含前台窗口检测、进程切换处理、逃逸进程检测等功能。
//
// ============================================================================
// 外部依赖导入
// ============================================================================
use super::{MonitoredSession, TimeTrackingMode, finalize_monitored_session};
use log::{debug, error, info, warn};
use nix::errno::Errno;
use nix::sys::signal::{Signal, kill};
use nix::unistd::Pid;
use sea_orm::DatabaseConnection;
use serde_json::json;
use std::collections::HashSet;
use std::env::home_dir;
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::sync::OnceCell;
use tokio::time::{MissedTickBehavior, interval};

// ============================================================================
// 常量定义
// ============================================================================

/// 连续失败次数阈值，超过此值认为进程已结束
const MAX_CONSECUTIVE_FAILURES: u32 = 3;

/// 时间更新事件发送间隔（秒）
const TIME_UPDATE_INTERVAL_SECS: u64 = 1;

/// 监控循环检查间隔（秒）
const MONITOR_CHECK_INTERVAL_SECS: u64 = 1;

/// 等待 Steam 拉起游戏进程的最长时间（秒）
///
/// Steam 收到启动请求后可能先做运行时准备或更新检查，因此给出足够的宽限。
const STEAM_START_TIMEOUT_SECS: u64 = 60;

/// 等待 Steam 拉起游戏进程时的轮询间隔（秒）
const STEAM_START_POLL_INTERVAL_SECS: u64 = 1;

/// steam.sh 约定的 PID 文件位置（相对 $HOME）
///
/// 第二项是 Flatpak 沙箱内的 HOME 布局。
const STEAM_PID_FILE_CANDIDATES: &[&str] = &[
    ".steam/steam.pid",
    ".var/app/com.valvesoftware.Steam/.steam/steam.pid",
];

// ============================================================================
// systemd 会话连接缓存
// ============================================================================

static SESSION_CONN: OnceCell<zbus::Connection> = OnceCell::const_new();

static MANAGER_PROXY: OnceCell<zbus_systemd::systemd1::ManagerProxy<'static>> =
    OnceCell::const_new();

// ============================================================================
// 数据结构定义
// ============================================================================

/// 游戏进程的来源
///
/// 两类启动方式在监控流程上的差异只在于「如何找到游戏进程」：
/// - `SystemdUnit`：ReinaManager 自己通过 systemd transient unit 拉起，可直接向 systemd 索取进程列表
/// - `SteamAppId`：交由 Steam 启动（Proton / 原生 / 非 Steam 快捷方式），只能靠 Steam 的 reaper 进程识别
#[derive(Clone, Debug)]
pub enum MonitorTarget {
    SystemdUnit(String),
    SteamAppId(u32),
}

impl MonitorTarget {
    /// 日志与错误信息中使用的可读描述
    fn describe(&self) -> String {
        match self {
            Self::SystemdUnit(unit_name) => format!("unit={unit_name}"),
            Self::SteamAppId(app_id) => format!("steam_app_id={app_id}"),
        }
    }
}

/// 启动监控任务
pub async fn monitor_game<R: Runtime>(
    app_handle: AppHandle<R>,
    db: DatabaseConnection,
    time_tracking_mode: TimeTrackingMode,
    game_id: u32,
    process_id: u32,
    target: MonitorTarget,
) {
    let app_handle_clone = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        use tauri::Manager;
        if let Err(e) = run_game_monitor(
            app_handle_clone.app_handle(),
            &db,
            time_tracking_mode,
            game_id,
            &target,
        )
        .await
        {
            error!("游戏监控任务 (game_id: {}) 出错: {}", game_id, e);
            let timestamp = get_timestamp();
            finalize_monitored_session(
                &app_handle,
                &db,
                MonitoredSession {
                    time_tracking_mode,
                    game_id,
                    process_id,
                    start_time: timestamp,
                    end_time: timestamp,
                    accumulated_seconds: 0,
                    confirmed_started: false,
                },
            )
            .await;
        }
    });
}

// ============================================================================
// 公共 API
// ============================================================================

/// 停止指定游戏的监控并终止所有相关进程
///
/// # Arguments
/// * `game_id` - 游戏 ID
///
/// # Returns
/// 成功返回终止的进程数量，失败返回错误信息
pub async fn stop_game_session(game_id: u32) -> Result<u32, String> {
    stop_game_unit(game_id).await.map(|_| 1)
}

async fn stop_game_unit(game_id: u32) -> Result<(), String> {
    // 1. 连接到 Session Bus (对应 --user)
    //    scope 停止时 systemd 会终止其 cgroup 内的全部进程
    let proxy = get_manager_proxy().await.map_err(|e| {
        format!(
            "无法连接到 D-Bus Session Bus 以停止游戏 {} 的 systemd unit: {}",
            game_id, e
        )
    })?;

    // 2. 构造单元名称
    let unit_name = format!("reina_game_{}.scope", game_id);

    // 3. 调用停止方法
    match proxy
        .stop_unit(unit_name.clone(), "replace".to_string())
        .await
    {
        Ok(job_path) => {
            debug!("停止请求已发送: {}, Job: {:?}", unit_name, job_path);
        }
        Err(e) => {
            error!("停止单元失败: {:?}", e);
            return Err(e)
                .map_err(|e| format!("停止游戏 {} 的 systemd service 失败: {}", game_id, e));
        }
    }

    Ok(())
}

pub async fn get_connection() -> Result<&'static zbus::Connection, zbus::Error> {
    SESSION_CONN
        .get_or_try_init(|| async { zbus::Connection::session().await })
        .await
}

pub async fn get_manager_proxy()
-> Result<&'static zbus_systemd::systemd1::ManagerProxy<'static>, zbus::Error> {
    MANAGER_PROXY
        .get_or_try_init(|| async {
            let connection = get_connection().await?;
            zbus_systemd::systemd1::ManagerProxy::new(connection).await
        })
        .await
}

/// 根据 systemd user unit 名称查找所有正在运行的进程 PID 列表 (仅 Linux)。
async fn get_process_id_by_unit(unit_name: &str) -> Option<Vec<u32>> {
    let manager = match get_manager_proxy().await {
        Ok(m) => m,
        Err(e) => {
            debug!("无法连接到 systemd 管理器: {}", e);
            return None;
        }
    };
    let ps = match manager.get_unit_processes(unit_name.to_owned()).await {
        Ok(p) => p,
        Err(e) => {
            debug!("无法获取 systemd unit '{}' 的进程列表: {}", unit_name, e);
            return None;
        }
    };
    #[cfg(debug_assertions)]
    {
        debug!(
            "找到 systemd unit '{}' 下的进程 PID 列表: {:?}",
            unit_name, ps
        );
    }

    ps.into_iter().map(|p| p.1).collect::<Vec<u32>>().into()
}

/// 获取监控目标当前对应的全部候选进程
///
/// Steam 场景需要把整棵进程树纳入候选：游戏窗口由 reaper 的后代
/// （Proton 下是 wine 侧进程）持有，只看 reaper 自身会漏掉前台判定。
async fn get_all_candidate_pids(target: &MonitorTarget) -> Vec<u32> {
    let manager_pid = std::process::id();

    let available_pids: Vec<u32> = match target {
        // systemd unit 的 cgroup 已覆盖全部后代进程，无需再展开进程树
        MonitorTarget::SystemdUnit(unit_name) => {
            get_process_id_by_unit(unit_name).await.unwrap_or_default()
        }
        MonitorTarget::SteamAppId(app_id) => find_steam_game_pids(*app_id),
    }
    .into_iter()
    .filter(|&pid| pid != manager_pid) // 过滤掉管理器自身
    .collect();

    if available_pids.is_empty() {
        debug!("未找到 {} 的匹配进程", target.describe());
    } else {
        debug!(
            "{} 找到 {} 个候选进程: {:?}",
            target.describe(),
            available_pids.len(),
            available_pids
        );
    }

    available_pids
}

#[allow(unused)]
fn is_process_running(pid: u32) -> bool {
    use std::fs::exists;
    // 在 Linux 上，可以通过检查 /proc/<pid> 目录是否存在来判断进程是否运行
    let proc_path = format!("/proc/{}", pid);
    exists(&proc_path).unwrap_or(false)
}

/// 判断监控目标当前是否仍在运行
///
/// - systemd unit：以 unit 的 `active` 状态为准
/// - Steam：reaper 是 fork/exec/wait 的僵尸回收器，它退出即代表整条游戏进程链结束。
///   首次定位到 reaper 后把 PID 写入 `cached_reaper_pid`，之后每个检查周期只核对这一个进程，
///   避免每秒重新遍历一遍 Steam 进程树。
async fn is_game_running(target: &MonitorTarget, cached_reaper_pid: &mut Option<u32>) -> bool {
    match target {
        MonitorTarget::SystemdUnit(unit_name) => is_unit_active(unit_name).await,
        MonitorTarget::SteamAppId(app_id) => {
            if let Some(pid) = *cached_reaper_pid
                && is_steam_reaper_pid(pid, *app_id)
            {
                return true;
            }

            // 尚未缓存或缓存的 reaper 已退出（含 PID 被复用）：重扫进程树并更新缓存
            let previous = *cached_reaper_pid;
            let found = find_steam_reaper_pids(*app_id).into_iter().next();
            if found.is_some() && found != previous {
                debug!(
                    "{} 重新定位 Steam reaper PID: {previous:?} -> {found:?}",
                    target.describe()
                );
            }
            *cached_reaper_pid = found;
            found.is_some()
        }
    }
}

/// 检查指定的 systemd user unit 是否处于活动状态。
///
/// # Arguments
/// * `unit_name` - systemd user unit 的名称。
///
/// # Returns
/// 如果 unit 处于活动状态，返回 true；否则返回 false。
async fn is_unit_active(unit_name: &str) -> bool {
    match get_manager_proxy().await {
        Ok(manager) => match manager.get_unit(unit_name.to_owned()).await {
            Ok(u) => {
                if let Ok(connection) = get_connection().await {
                    match zbus_systemd::systemd1::UnitProxy::new(connection, u).await {
                        Ok(unit) => match unit.active_state().await {
                            Ok(state) => {
                                debug!("systemd unit '{}' 的 active_state: {}", unit_name, state);
                                state == "active"
                            }
                            Err(e) => {
                                debug!(
                                    "无法获取 systemd unit '{}' 的 active_state: {}",
                                    unit_name, e
                                );
                                false
                            }
                        },
                        Err(e) => {
                            debug!("无法创建 systemd Unit 代理: {}", e);
                            false
                        }
                    }
                } else {
                    debug!("无法连接到 systemd 管理器");
                    false
                }
            }
            Err(e) => {
                debug!("无法获取 systemd unit '{}': {}", unit_name, e);
                false
            }
        },
        Err(e) => {
            debug!("无法连接到 systemd 管理器: {}", e);
            false
        }
    }
}

fn select_best_from_candidates(candidate_pids: &[u32]) -> Option<u32> {
    if let Some(p) = check_any_foreground(candidate_pids) {
        debug!("从候选列表中找到聚焦进程 PID: {}", p);
        Some(p)
    } else if let Some(p) = check_any_has_window(candidate_pids) {
        debug!("从候选列表中找到有窗口的进程 PID: {}", p);
        Some(p)
    } else if !candidate_pids.is_empty() {
        let first_pid = candidate_pids[0];
        debug!("使用候选列表中的第一个进程 PID: {}", first_pid);
        Some(first_pid)
    } else {
        None
    }
}

/// TODO: 未来可考虑集成其他 wayland 合成器特定功能实现。
fn check_any_foreground(_candidate_pids: &[u32]) -> Option<u32> {
    check_any_foreground_x11(_candidate_pids)
}

/// TODO: 未来可考虑集成 x11 或 wayland 合成器特定功能实现。
fn check_any_has_window(_candidate_pids: &[u32]) -> Option<u32> {
    check_any_has_window_x11(_candidate_pids)
}

fn check_any_foreground_x11(candidate_pids: &[u32]) -> Option<u32> {
    // 1. 连接到 X Server
    let (conn, screen_num) = xcb::Connection::connect(None).ok()?;
    let setup = conn.get_setup();
    // 获取当前屏幕的根窗口 (Root Window)
    let screen = setup.roots().nth(screen_num as usize)?;
    let root_window = screen.root();

    // 2. 获取 Atom 标识符
    // 我们需要 "_NET_ACTIVE_WINDOW" 来找当前活动窗口
    // 我们需要 "_NET_WM_PID" 来找窗口对应的 PID
    let cookie_active = conn.send_request(&xcb::x::InternAtom {
        only_if_exists: true,
        name: b"_NET_ACTIVE_WINDOW",
    });
    let cookie_pid = conn.send_request(&xcb::x::InternAtom {
        only_if_exists: true,
        name: b"_NET_WM_PID",
    });

    let atom_active_window = conn.wait_for_reply(cookie_active).ok()?.atom();
    let atom_net_wm_pid = conn.wait_for_reply(cookie_pid).ok()?.atom();

    // 3. 获取当前活动窗口的 ID
    // 向 Root Window 请求 _NET_ACTIVE_WINDOW 属性
    let active_win_cookie = conn.send_request(&xcb::x::GetProperty {
        delete: false,
        window: root_window,
        property: atom_active_window,
        long_offset: 0,
        long_length: 1, // 我们只需要读 1 个值
        r#type: xcb::x::ATOM_WINDOW,
    });

    let active_win_reply = conn.wait_for_reply(active_win_cookie).ok()?;

    // 如果没有值，说明没有活动窗口或不支持 EWMH
    if active_win_reply.value::<xcb::x::Window>().is_empty() {
        return None;
    }

    // 提取 Window ID
    let active_window = active_win_reply
        .value::<xcb::x::Window>()
        .first()
        .copied()?;

    // 4. 获取该窗口的 PID
    // 向活动窗口请求 _NET_WM_PID 属性
    let pid_cookie = conn.send_request(&xcb::x::GetProperty {
        delete: false,
        window: active_window,
        property: atom_net_wm_pid,
        r#type: xcb::x::ATOM_CARDINAL, // PID 通常是 Cardinal 类型
        long_offset: 0,
        long_length: 1,
    });

    let pid_reply = conn.wait_for_reply(pid_cookie).ok()?;

    if pid_reply.value::<xcb::x::Window>().is_empty() {
        return None;
    }

    // 提取 PID
    let active_pid = pid_reply.value::<u32>().first().copied()?;

    // 5. 检查是否匹配
    if candidate_pids.contains(&active_pid) {
        Some(active_pid)
    } else {
        None
    }
}

fn check_any_has_window_x11(candidate_pids: &[u32]) -> Option<u32> {
    // 1. 连接到 X Server
    let (conn, screen_num) = xcb::Connection::connect(None).ok()?;
    let setup = conn.get_setup();
    let screen = setup.roots().nth(screen_num as usize)?;
    let root_window = screen.root();

    // 2. 获取需要的 Atom 标识符
    let cookie_client_list = conn.send_request(&xcb::x::InternAtom {
        only_if_exists: true,
        name: b"_NET_CLIENT_LIST",
    });
    let cookie_pid = conn.send_request(&xcb::x::InternAtom {
        only_if_exists: true,
        name: b"_NET_WM_PID",
    });

    let atom_client_list = conn.wait_for_reply(cookie_client_list).ok()?.atom();
    let atom_net_wm_pid = conn.wait_for_reply(cookie_pid).ok()?.atom();

    // 检查 atom 是否有效
    if atom_client_list == xcb::x::ATOM_NONE || atom_net_wm_pid == xcb::x::ATOM_NONE {
        return None;
    }

    // 3. 获取所有客户端窗口列表
    let client_list_cookie = conn.send_request(&xcb::x::GetProperty {
        delete: false,
        window: root_window,
        property: atom_client_list,
        r#type: xcb::x::ATOM_WINDOW,
        long_offset: 0,
        long_length: 1024, // 足够容纳大量窗口
    });

    let client_list_reply = conn.wait_for_reply(client_list_cookie).ok()?;
    let windows = client_list_reply.value::<xcb::x::Window>();

    if windows.is_empty() {
        return None;
    }

    // 4. 遍历所有窗口，检查其 PID 是否在候选列表中
    for &window in windows {
        let pid_cookie = conn.send_request(&xcb::x::GetProperty {
            delete: false,
            window,
            property: atom_net_wm_pid,
            r#type: xcb::x::ATOM_CARDINAL,
            long_offset: 0,
            long_length: 1,
        });

        if let Ok(pid_reply) = conn.wait_for_reply(pid_cookie)
            && let Some(&pid) = pid_reply.value::<u32>().first()
            && candidate_pids.contains(&pid)
        {
            return Some(pid);
        }
    }

    None
}

/// Linux 版本的监控逻辑实现
async fn run_game_monitor(
    app_handle: &AppHandle<impl Runtime>,
    db: &DatabaseConnection,
    time_tracking_mode: TimeTrackingMode,
    game_id: u32,
    target: &MonitorTarget,
) -> Result<(), String> {
    let target_label = target.describe();
    // {
    let mut accumulated_seconds = 0u64;
    let start_time = get_timestamp();
    tokio::time::sleep(Duration::from_secs(MONITOR_CHECK_INTERVAL_SECS * 3)).await;

    // 初始扫描：获取所有候选 PID
    let candidate_pids = get_all_candidate_pids(target).await;

    // 从候选中选择最佳 PID 作为主监控对象
    let mut best_pid = match select_best_from_candidates(&candidate_pids) {
        Some(p) => p,
        None => {
            return Err("未找到任何候选进程进行监控".to_string());
        }
    };

    info!(
        "开始监控游戏: ID={}, 最佳 PID={}, 候选进程组={:?}",
        game_id, best_pid, candidate_pids
    );

    // 通知前端会话开始
    if let Err(error) = app_handle.emit(
        "game-session-started",
        json!({ "gameId": game_id, "processId": best_pid, "startTime": start_time }),
    ) {
        warn!("无法发送 game-session-started 事件: {error}");
    }
    let mut consecutive_failures = 0u32;
    // Steam 场景下首次定位到的 reaper PID，供后续存活判定复用
    let mut cached_reaper_pid: Option<u32> = None;

    // 等待 9 秒让游戏进程充分启动（例如 Launcher -> Game 的切换）
    debug!(
        "等待 {} 秒以便游戏进程充分启动...",
        MONITOR_CHECK_INTERVAL_SECS * 9
    );
    tokio::time::sleep(Duration::from_secs(MONITOR_CHECK_INTERVAL_SECS * 9)).await;

    // 等待后重新扫描，获取最新的进程状态
    let mut candidate_pids = get_all_candidate_pids(target).await;
    if let Some(new_best) = select_best_from_candidates(&candidate_pids)
        && new_best != best_pid
    {
        info!(
            "等待期间发现更优进程，切换 PID: {} -> {}",
            best_pid, new_best
        );
        best_pid = new_best;
    }

    // 创建精确的 1 秒间隔定时器
    let mut tick_interval = interval(Duration::from_secs(MONITOR_CHECK_INTERVAL_SECS));
    tick_interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

    loop {
        tick_interval.tick().await;

        let game_running = is_game_running(target, &mut cached_reaper_pid).await;
        if !game_running {
            consecutive_failures += 1;
            debug!(
                "最佳进程 {} 检查失败次数: {}/{}",
                best_pid, consecutive_failures, MAX_CONSECUTIVE_FAILURES
            );

            if consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
                warn!(
                    "{} 连续 {} 次不可访问或非 active，结束监控会话 best_pid={}",
                    target_label, consecutive_failures, best_pid
                );
                break;
            }
        } else {
            // 最佳 PID 仍在运行，重置失败计数
            consecutive_failures = 0;

            // 2. 清理候选列表中已失活的 PID（轻量级维护）

            // 3. 前台判定：检查候选列表中是否有任何进程在前台
            //    这是关键优化点 - 即使最佳 PID 不在前台，其他候选 PID 在前台也算数
            if let Some(foreground_pid) = check_any_foreground(&candidate_pids) {
                accumulated_seconds += 1;

                // 如果前台进程不是当前的最佳 PID，考虑切换
                if foreground_pid != best_pid {
                    debug!(
                        "前台进程 {} 不是最佳 PID {}，考虑调整",
                        foreground_pid, best_pid
                    );
                    best_pid = foreground_pid;
                }

                // 发送时间更新
                if accumulated_seconds > 0
                    && accumulated_seconds.is_multiple_of(TIME_UPDATE_INTERVAL_SECS)
                {
                    let minutes = accumulated_seconds / 60;
                    // debug!(
                    //     "发送时间更新事件: {} 分钟 ({} 秒)",
                    //     minutes, accumulated_seconds
                    // );
                    if let Err(error) = app_handle.emit(
                        "game-time-update",
                        json!({
                            "gameId": game_id,
                            "totalMinutes": minutes,
                            "totalSeconds": accumulated_seconds,
                            "startTime": start_time,
                            "currentTime": get_timestamp(),
                            "processId": best_pid
                        }),
                    ) {
                        warn!("无法发送 game-time-update 事件: {error}");
                    }
                }
            } else {
                candidate_pids = get_all_candidate_pids(target).await;
            }
        }
    }

    finalize_monitored_session(
        app_handle,
        db,
        MonitoredSession {
            time_tracking_mode,
            game_id,
            process_id: best_pid,
            start_time,
            end_time: get_timestamp(),
            accumulated_seconds,
            confirmed_started: true,
        },
    )
    .await;

    Ok(())
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

// ============================================================================
// Steam 进程检测
// ============================================================================

/// 等待 Steam 为目标 AppId 拉起游戏，返回 reaper 的 PID
///
/// Steam 收到 `steam://rungameid` 请求后可能先做运行时准备或更新检查，
/// 因此需要轮询等待进程出现；找到后即可交给监控循环，
/// 后续存活判定完全依赖该 reaper 进程。
pub async fn wait_for_steam_game(app_id: u32) -> Result<u32, String> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(STEAM_START_TIMEOUT_SECS);

    loop {
        if let Some(pid) = find_steam_reaper_pids(app_id).into_iter().next() {
            info!(
                "检测到 Steam 游戏进程: AppId={}, reaper_pid={}",
                app_id, pid
            );
            return Ok(pid);
        }

        if tokio::time::Instant::now() >= deadline {
            return Err(format!(
                "已请求 Steam 启动游戏，但 {} 秒内未检测到游戏进程 (AppId={})",
                STEAM_START_TIMEOUT_SECS, app_id
            ));
        }

        tokio::time::sleep(Duration::from_secs(STEAM_START_POLL_INTERVAL_SECS)).await;
    }
}

/// 查找 Steam 为指定 AppId 拉起的全部进程
///
/// Steam 在 Linux 上以 `reaper SteamLaunch AppId=<appid> -- <真实命令>` 的形式启动游戏，
/// 这里的 AppId 是 32 位应用 ID（非 Steam 快捷方式为 shortcut appid）。
fn find_steam_game_pids(app_id: u32) -> Vec<u32> {
    match home_dir() {
        Some(home) => find_steam_game_pids_in(app_id, &home),
        None => Vec::new(),
    }
}

/// `find_steam_game_pids` 的可注入版本，便于测试使用隔离的 HOME
fn find_steam_game_pids_in(app_id: u32, home: &Path) -> Vec<u32> {
    let roots = find_steam_reaper_pids_in(app_id, home);
    if roots.is_empty() {
        return roots;
    }

    collect_process_tree(&roots)
}

/// 停止 Steam 启动的游戏
///
/// Steam 不用 systemd 托管游戏进程，只能通过 reaper 定位：
/// 向 reaper 及其后代发送 SIGTERM，前者让 Steam 客户端认为游戏已结束并触发清理，
/// 后者保证游戏进程本身也会收到终止信号。
///
/// # Returns
/// 成功发送信号的进程数量；进程已在扫描后自行退出时返回 0
pub fn stop_steam_game(app_id: u32) -> Result<u32, String> {
    let pids = find_steam_game_pids(app_id);
    if pids.is_empty() {
        return Err(format!("未找到 Steam 游戏进程 (AppId={app_id})"));
    }

    let signaled = terminate_pids(&pids)?;

    info!("已向 {signaled} 个进程发送 SIGTERM 以终止游戏 (AppId={app_id})");
    Ok(signaled)
}

/// 向给定进程发送 SIGTERM，返回成功送达的数量
fn terminate_pids(pids: &[u32]) -> Result<u32, String> {
    let mut signaled = 0u32;
    let mut last_error = None;
    for &pid in pids {
        match kill(Pid::from_raw(pid as i32), Signal::SIGTERM) {
            Ok(()) => signaled += 1,
            // 进程可能在扫描与发送之间退出，这种情况无需报错
            Err(Errno::ESRCH) => {}
            Err(error) => last_error = Some(error),
        }
    }

    if signaled == 0
        && let Some(error) = last_error
    {
        return Err(format!("终止进程失败: {error}"));
    }

    Ok(signaled)
}

/// 查找 Steam 的 reaper 进程 PID
///
/// Steam 启动游戏时会形成 `sh -c … steam-launch-wrapper … reaper` 的 exec 链，
/// 因此从 Steam 主进程出发逐层遍历子进程树即可：既不必扫描整个 /proc，
/// 也不会误匹配其它用户或容器中的同名进程。
fn find_steam_reaper_pids(app_id: u32) -> Vec<u32> {
    match home_dir() {
        Some(home) => find_steam_reaper_pids_in(app_id, &home),
        None => Vec::new(),
    }
}

/// `find_steam_reaper_pids` 的可注入版本，便于测试使用隔离的 HOME
fn find_steam_reaper_pids_in(app_id: u32, home: &Path) -> Vec<u32> {
    let Some(steam_pid) = find_steam_client_pid(home) else {
        debug!("未找到运行中的 Steam 客户端，跳过 AppId={app_id} 的进程检测");
        return Vec::new();
    };

    let mut pids = Vec::new();
    let mut visited = HashSet::new();
    let mut pending = vec![steam_pid];

    while let Some(pid) = pending.pop() {
        if !visited.insert(pid) {
            continue;
        }

        // 进程可能在遍历期间退出，读取失败即视为不匹配
        if is_steam_reaper_pid(pid, app_id) {
            pids.push(pid);
        }

        pending.extend(read_children(pid));
    }

    pids.sort_unstable();
    pids
}

/// 判断给定 PID 当前是否仍是该 AppId 对应的 Steam reaper
///
/// 只读取一次 `/proc/<pid>/cmdline`：既能确认进程仍然存在，也能在 PID 被复用时正确判定失效。
fn is_steam_reaper_pid(pid: u32, app_id: u32) -> bool {
    let Ok(cmdline) = std::fs::read(format!("/proc/{pid}/cmdline")) else {
        // 进程可能恰好在此期间退出
        return false;
    };

    let expected_arg = format!("AppId={app_id}");
    is_steam_reaper_cmdline(&cmdline, expected_arg.as_bytes())
}

/// 判断命令行是否为 Steam 为该 AppId 启动的 reaper
///
/// 命令行形如 `.../ubuntu12_32/reaper\0SteamLaunch\0AppId=413150\0--\0...`，
/// 需要逐参数比对，避免 `AppId=41` 误匹配 `AppId=413150`。
fn is_steam_reaper_cmdline(cmdline: &[u8], expected_app_id: &[u8]) -> bool {
    let mut args = cmdline
        .split(|byte| *byte == 0)
        .filter(|arg| !arg.is_empty());

    let Some(executable) = args.next() else {
        return false;
    };
    if executable.rsplit(|byte| *byte == b'/').next() != Some(b"reaper".as_slice()) {
        return false;
    }

    args.next() == Some(b"SteamLaunch".as_slice()) && args.next() == Some(expected_app_id)
}

/// 收集给定 PID 及其全部后代进程 PID
///
/// 多个根节点互为祖先/后代时只保留一次（例如 Steam 重启过的同一 AppId 进程），
/// 避免候选列表出现重复项。
fn collect_process_tree(roots: &[u32]) -> Vec<u32> {
    let mut pids = Vec::new();
    let mut visited = HashSet::new();
    let mut pending: Vec<u32> = roots.to_vec();

    while let Some(pid) = pending.pop() {
        if !visited.insert(pid) {
            continue;
        }
        pids.push(pid);
        pending.extend(read_children(pid));
    }

    pids
}

/// 读取进程所有线程的直接子进程 PID
///
/// Steam 主进程是多线程的，启动游戏的工作线程不一定是主线程，
/// 因此必须遍历 /proc/<pid>/task/*/children，而不能只看主线程。
fn read_children(pid: u32) -> Vec<u32> {
    let Ok(tasks) = std::fs::read_dir(format!("/proc/{pid}/task")) else {
        return Vec::new();
    };

    tasks
        .flatten()
        .filter_map(|task| std::fs::read_to_string(task.path().join("children")).ok())
        .flat_map(|children| {
            children
                .split_whitespace()
                .filter_map(|value| value.parse::<u32>().ok())
                .collect::<Vec<_>>()
        })
        .collect()
}

/// 查找运行中的 Steam 客户端 PID
///
/// steam.sh 把主进程 PID 写入 `$HOME/.steam/steam.pid`（Flatpak 沙箱内 HOME 被重映射，
/// 因此也要探测沙箱路径），并以「该进程是否持有 steam.pipe」作为排除 PID 重用的依据，
/// 这里沿用同一判据。
fn find_steam_client_pid(home: &Path) -> Option<u32> {
    for relative in STEAM_PID_FILE_CANDIDATES {
        let pid_file = home.join(relative);
        let Ok(raw) = std::fs::read_to_string(&pid_file) else {
            continue;
        };
        let Ok(pid) = raw.trim().parse::<u32>() else {
            continue;
        };

        if holds_steam_pipe(pid) {
            return Some(pid);
        }

        debug!(
            "{} 中的 PID {} 未持有 steam.pipe，判定为过期文件",
            pid_file.display(),
            pid
        );
    }

    None
}

/// 判断进程是否持有 Steam 的 IPC 管道
///
/// 仅确认 PID 存在无法排除 PID 被重用，持有 steam.pipe 才是 Steam 主进程。
fn holds_steam_pipe(pid: u32) -> bool {
    let Ok(entries) = std::fs::read_dir(format!("/proc/{pid}/fd")) else {
        return false;
    };

    entries.flatten().any(|entry| {
        std::fs::read_link(entry.path()).is_ok_and(|target| target.ends_with(".steam/steam.pipe"))
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 按 /proc/<pid>/cmdline 的形式拼接参数
    fn cmdline(args: &[&str]) -> Vec<u8> {
        let mut buffer = Vec::new();
        for arg in args {
            buffer.extend_from_slice(arg.as_bytes());
            buffer.push(0);
        }
        buffer
    }

    #[test]
    fn matches_proton_launch_command() {
        let line = cmdline(&[
            "/home/user/.local/share/Steam/ubuntu12_32/reaper",
            "SteamLaunch",
            "AppId=4513880",
            "--",
            "/usr/share/steam/compatibilitytools.d/proton/proton",
            "waitforexitandrun",
        ]);

        assert!(is_steam_reaper_cmdline(&line, b"AppId=4513880"));
    }

    #[test]
    fn matches_shortcut_launch_command_without_runtime() {
        let line = cmdline(&[
            "/home/user/.local/share/Steam/ubuntu12_32/reaper",
            "SteamLaunch",
            "AppId=3624799010",
            "--",
            "/home/user/Gal/gal.exe",
        ]);

        assert!(is_steam_reaper_cmdline(&line, b"AppId=3624799010"));
    }

    #[test]
    fn requires_exact_app_id_argument() {
        let line = cmdline(&[
            "/home/user/.local/share/Steam/ubuntu12_32/reaper",
            "SteamLaunch",
            "AppId=413150",
            "--",
            "true",
        ]);

        assert!(!is_steam_reaper_cmdline(&line, b"AppId=41315"));
        assert!(!is_steam_reaper_cmdline(&line, b"AppId=4131500"));
    }

    #[test]
    fn rejects_processes_that_are_not_steam_reaper() {
        let wrapper = cmdline(&[
            "/home/user/.local/share/Steam/ubuntu12_32/steam-launch-wrapper",
            "--",
            "/home/user/.local/share/Steam/ubuntu12_32/reaper",
            "SteamLaunch",
            "AppId=413150",
        ]);
        assert!(!is_steam_reaper_cmdline(&wrapper, b"AppId=413150"));

        let similar_name = cmdline(&[
            "/home/user/.local/share/Steam/ubuntu12_32/reaper-wrapper",
            "SteamLaunch",
            "AppId=413150",
        ]);
        assert!(!is_steam_reaper_cmdline(&similar_name, b"AppId=413150"));

        let other_subcommand = cmdline(&[
            "/home/user/.local/share/Steam/ubuntu12_32/reaper",
            "AppId=413150",
        ]);
        assert!(!is_steam_reaper_cmdline(&other_subcommand, b"AppId=413150"));
    }

    #[test]
    fn cached_reaper_pid_is_rejected_for_non_reaper_processes() {
        // 测试进程自身不是 reaper；不存在的 PID 也应判定为失效
        assert!(!is_steam_reaper_pid(std::process::id(), 413150));
        assert!(!is_steam_reaper_pid(u32::MAX, 413150));
    }

    #[test]
    fn collects_own_process_tree_without_duplicates() {
        let current = std::process::id();
        let pids = collect_process_tree(&[current, current]);

        assert!(pids.contains(&current));
        assert_eq!(pids.iter().filter(|pid| **pid == current).count(), 1);
    }
}
