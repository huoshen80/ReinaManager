use super::{LaunchResult, StopResult, load_game, validate_and_open_steam, validate_local_launch};
use crate::game::monitor::TimeTrackingMode;
use crate::game::monitor::{get_connection, get_manager_proxy, monitor_game, stop_game_session};
use log::{debug, info};
use sea_orm::DatabaseConnection;
use std::future::poll_fn;
use std::io::{Read, Write};
use std::mem::size_of;
use std::os::fd::{AsRawFd, FromRawFd, OwnedFd};
use std::os::unix::net::UnixStream;
use std::path::Path;
use std::pin::Pin;
use std::time::Duration;
use tauri::{AppHandle, Manager, Runtime, State, command};
use tauri_plugin_store::StoreExt;
use zbus::export::futures_core::Stream;
use zbus::zvariant::{OwnedValue, Value};
use zbus_systemd::systemd1::{JobRemoved, JobRemovedStream};
/// 等待 systemd job 完成的最长时间（秒）
///
/// JobRemoved 由用户管理器异步发出，正常情况下毫秒级即可到达；
/// 超时意味着管理器异常，此时不应继续放行游戏进程。
const JOB_WAIT_TIMEOUT_SECS: u64 = 10;

/// 放行子进程 exec 的 gate 字节
///
/// gate 用一个字节传递结果：写入该值表示放行，其他字节表示父进程已放弃。
/// 必须显式写入而不是靠关闭写端：其他 fork 出来的进程会继承 gate 写端的副本，
/// 只要副本还活着子进程就读不到 EOF，会永远卡在 exec 前。
const GATE_RELEASE_BYTE: u8 = 1;

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
            "已交由 Steam 启动游戏 ({})，工作目录: {})",
            steam_launch.steam_launch_id, steam_launch.game_dir
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
    let _ = check_unit_or_reset_failed(&systemd_unit_name).await;

    let linux_launch_command = {
        let cmd = app_handle
            .store("settings.json")
            .ok()
            .and_then(|store| store.get("linux_launch_command"))
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "wine".to_string());

        expand_path(&app_handle, &cmd)
    };

    // 确定执行命令和参数
    // 对于 .exe 文件: 用 linux_launch_command 作为命令，游戏文件作为参数
    // 对于其他文件: 直接用文件本身作为命令
    // 参数列表不含 argv[0]，由 spawn 时自动补上
    let (exec_path, exec_args) = if exe_name.to_string_lossy().ends_with(".exe") {
        // .exe 文件: wine game.exe [user_args...]
        let mut cmd_args = vec![game_path.clone()];
        if let Some(arguments) = &args {
            cmd_args.extend(arguments.iter().cloned());
        }
        (linux_launch_command, cmd_args)
    } else {
        // 其他文件: ./game [user_args...]
        let mut cmd_args = Vec::new();
        if let Some(arguments) = &args {
            cmd_args.extend(arguments.iter().cloned());
        }
        (game_path, cmd_args)
    };
    debug!(
        "准备启动游戏 game_id={} unit={} exec_path={:?} exec_args={:?} cwd={:?}",
        game_id, systemd_unit_name, exec_path, exec_args, game_dir
    );

    // scope 与 service 不同，它只能接管已存在的进程，因此这里自己拉起子进程
    let process_id = spawn_in_scope(
        game_id,
        &systemd_unit_name,
        &exec_path,
        &exec_args,
        &game_dir,
    )
    .await?;

    info!(
        "游戏进程已加入 scope: unit={} pid={}",
        systemd_unit_name, process_id
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

/// 拉起游戏子进程，并把它交给 systemd 的 transient scope 托管。
///
/// scope 只能接管「已经存在」的进程，所以进程必须由 ReinaManager 自己 fork。
/// 但进程一旦 exec 就可能立刻 fork 出后代（wine 会拉起 wineserver），
/// 这些后代不会被事后补进 scope 的 cgroup。
///
/// 因此这里的时序是：fork 子进程 → 子进程阻塞在 exec 前 → 把它的 PID 挂进 scope
/// → 等 JobRemoved 确认 scope 就绪 → 放行 exec。
/// 这样游戏整棵进程树从第一个进程开始就落在 scope 内，停止游戏时不会漏杀。
///
/// # Arguments
/// * `exec_args` - 传给游戏的参数，不含 argv[0]（由 spawn 自动补上）
///
/// # Returns
/// 子进程 PID，同时作为监控目标 `MonitorTarget::SystemdUnit` 的起点
async fn spawn_in_scope(
    game_id: u32,
    unit_name: &str,
    exec_path: &str,
    exec_args: &[String],
    game_dir: &Path,
) -> Result<u32, String> {
    // gate: 父进程放行子进程 exec；report: 子进程回报自己的 PID
    let (mut gate_parent, gate_child) =
        UnixStream::pair().map_err(|error| format!("创建进程放行通道失败: {error}"))?;
    let (report_child, report_parent) =
        UnixStream::pair().map_err(|error| format!("创建进程 PID 回报通道失败: {error}"))?;

    // fork 出的子进程会同时持有这两个通道父进程侧的副本，需要在 exec 前关掉
    let gate_parent_fd = gate_parent.as_raw_fd();
    let report_parent_fd = report_parent.as_raw_fd();

    let mut command = tokio::process::Command::new(exec_path);
    command.args(exec_args).current_dir(game_dir);

    // 两个通道都由闭包以可变引用使用，exec 后 fd 会被 CLOEXEC 自动关闭
    let mut gate_child = gate_child;
    let mut report_child = report_child;

    // SAFETY: 闭包在 fork 之后、exec 之前运行，只调用 async-signal-safe 的
    // read/write/close 与 getpid，不分配内存、不获取锁
    unsafe {
        command.pre_exec(move || {
            // 子进程只需通道的另一端，父进程侧的副本留在手里会让对端读不到 EOF
            drop(OwnedFd::from_raw_fd(gate_parent_fd));
            drop(OwnedFd::from_raw_fd(report_parent_fd));

            // 先回报 PID，父进程据此把本进程加入 scope
            report_child.write_all(&std::process::id().to_le_bytes())?;

            // 阻塞等待放行：scope 就绪后收到放行字节，父进程放弃时会收到其他值
            let mut byte = [0u8; 1];
            gate_child.read_exact(&mut byte)?;
            if byte[0] != GATE_RELEASE_BYTE {
                return Err(std::io::Error::other("父进程已放弃启动 scope"));
            }
            Ok(())
        });
    }

    // spawn 会一直阻塞到子进程 exec 完成，而 exec 正被 gate 挡住，
    // 因此挪到阻塞线程上执行，等 scope 就绪后再放行
    let spawn_task = tokio::task::spawn_blocking(move || command.spawn());

    let process_id = match read_reported_pid(report_parent).await {
        Ok(process_id) => process_id,
        Err(error) => {
            // 子进程没能起来，gate 已无意义，顺手取回 spawn 的真实错误
            drop(gate_parent);
            let spawn_error = match spawn_task.await {
                Ok(Ok(_child)) => "子进程未能回报 PID".to_string(),
                Ok(Err(error)) => error.to_string(),
                Err(error) => error.to_string(),
            };
            return Err(format!("拉起游戏进程失败: {spawn_error}（{error}）"));
        }
    };

    if let Err(error) = create_scope(game_id, unit_name, process_id).await {
        // 通知子进程放弃 exec，等它自行退出，避免留下无主进程
        let _ = gate_parent.write_all(&[0]);
        drop(gate_parent);
        let _ = spawn_task.await;
        return Err(error);
    }

    // 放行 exec
    if let Err(error) = gate_parent.write_all(&[GATE_RELEASE_BYTE]) {
        debug!("放行游戏进程失败（子进程可能已退出）: {error}");
    }
    drop(gate_parent);

    match spawn_task.await {
        Ok(Ok(child)) => {
            // 交还 tokio 回收：进程退出时由它处理 SIGCHLD，避免留下僵尸进程
            drop(child);
        }
        Ok(Err(error)) => {
            // exec 失败意味着 scope 里其实没有进程，顺手清掉这个空 unit
            if let Ok(manager) = get_manager_proxy().await {
                let _ = manager
                    .stop_unit(unit_name.to_owned(), "replace".to_string())
                    .await;
            }
            return Err(format!("启动游戏进程失败: {error}"));
        }
        Err(error) => return Err(format!("启动游戏进程失败: {error}")),
    }

    Ok(process_id)
}

/// 读取子进程在阻塞 exec 前回报的 PID
async fn read_reported_pid(mut report_parent: UnixStream) -> Result<u32, String> {
    let reported = tokio::task::spawn_blocking(move || {
        let mut buffer = [0u8; size_of::<u32>()];
        report_parent.read_exact(&mut buffer)?;
        Ok::<u32, std::io::Error>(u32::from_le_bytes(buffer))
    })
    .await
    .map_err(|error| format!("读取子进程 PID 的任务失败: {error}"))?;

    reported.map_err(|error| format!("读取子进程 PID 失败: {error}"))
}

/// 通过 D-Bus 创建 transient scope，并把游戏进程挂进去
async fn create_scope(game_id: u32, unit_name: &str, process_id: u32) -> Result<(), String> {
    let manager = get_manager_proxy()
        .await
        .map_err(|error| format!("连接到 systemd 失败，无法启动游戏 {game_id}: {error}"))?;

    // 必须先订阅 JobRemoved 再发起请求：job 可能在方法返回前就已完成，
    // 先订阅才不会漏掉完成通知而一直等待
    let mut job_removed = manager
        .receive_job_removed()
        .await
        .map_err(|error| format!("订阅 systemd JobRemoved 信号失败: {error}"))?;

    let properties = vec![
        value_property(
            "Description",
            Value::from(format!("ReinaManager 游戏进程 (game_id={game_id})")),
        )?,
        value_property("PIDs", Value::from(vec![process_id]))?,
        value_property("Delegate", Value::from(true))?,
    ];

    let job_path = manager
        .start_transient_unit(
            unit_name.to_owned(),
            "replace".to_string(),
            properties,
            Vec::new(),
        )
        .await
        .map_err(|error| format!("创建 systemd scope {unit_name} 失败: {error}"))?;

    info!(
        "创建 scope 的请求已发送: unit={} pid={} job={:?}",
        unit_name, process_id, job_path
    );

    wait_for_job_removed(&mut job_removed, job_path.as_str())
        .await
        .map_err(|error| format!("创建 systemd scope {unit_name} 失败: {error}"))
}

/// 构造 transient unit 属性，属性值统一转换为 `OwnedValue`
fn value_property(name: &str, value: Value<'_>) -> Result<(String, OwnedValue), String> {
    OwnedValue::try_from(value)
        .map(|owned| (name.to_owned(), owned))
        .map_err(|error| format!("构建 {name} 属性失败: {error}"))
}

/// 等待指定 job 的 JobRemoved 信号，并确认执行结果为 done
async fn wait_for_job_removed(stream: &mut JobRemovedStream, job_path: &str) -> Result<(), String> {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(JOB_WAIT_TIMEOUT_SECS);

    loop {
        let signal = tokio::time::timeout_at(deadline, next_job_removed(stream))
            .await
            .map_err(|_| format!("等待 systemd job {job_path} 超时"))?
            .ok_or_else(|| "systemd JobRemoved 信号流已结束".to_string())?;

        let args = signal
            .args()
            .map_err(|error| format!("解析 JobRemoved 信号失败: {error}"))?;

        // manager 会广播所有 job 的完成事件，这里只关心自己发起的那一个
        if args.job().as_str() != job_path {
            continue;
        }

        return match args.result().as_str() {
            "done" => Ok(()),
            result => Err(format!("systemd job 的执行结果为 {result}")),
        };
    }
}

/// 从信号流中取出下一个 JobRemoved 信号
async fn next_job_removed(stream: &mut JobRemovedStream) -> Option<JobRemoved> {
    poll_fn(|context| Pin::new(&mut *stream).poll_next(context)).await
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

fn expand_path<R: Runtime>(app_handle: &AppHandle<R>, path: &str) -> String {
    if path.starts_with('~') {
        if let Ok(home_dir) = app_handle.path().home_dir() {
            path.replacen('~', &home_dir.to_string_lossy(), 1)
        } else {
            path.to_string()
        }
    } else {
        path.to_string()
    }
}

/// 检查 systemd unit 的状态，如果是 failed 则重置它
/// 返回 bool 值表示 unit 是否已经存在
/// # Arguments
/// * `systemd_unit_name` - systemd 单元名称
///
/// # Returns
/// bool - 如果 unit 已存在则返回 true，否则返回 false
async fn check_unit_or_reset_failed(systemd_unit_name: &str) -> Result<bool, String> {
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
