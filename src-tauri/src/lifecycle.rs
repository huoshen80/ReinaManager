use tauri::{App, AppHandle, Manager, RunEvent};
use tauri_plugin_dialog::MessageDialogKind;
use tauri_plugin_store::StoreExt;

use crate::database::db;
use crate::install::{
    protocol::setup_install_protocol, recover_interrupted_tasks, resume_pending_tasks,
};
use crate::utils::{
    dialog::NativeDialog, legacy_migration::run_startup_migrations, logs::setup_logging,
};

#[cfg(target_os = "windows")]
use crate::utils::{
    http::{SystemProxyMonitor, start_system_proxy_monitor},
    zoom::listen_to_webview_zoom,
};

const SETTINGS_STORE_PATH: &str = "settings.json";
const SILENT_STARTUP_STORE_KEY: &str = "silent_startup";

#[derive(Default)]
struct StartupDialogs {
    dialogs: Vec<NativeDialog>,
    exit_after: bool,
}

/// 启动阶段只收集提示，待事件循环就绪后统一展示。
pub fn setup(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let silent_startup = read_silent_startup(app);
    setup_logging(app)?;

    // 日志插件初始化后再注册协议，确保注册失败信息能够写入日志。
    setup_install_protocol(app);
    #[cfg(target_os = "windows")]
    match start_system_proxy_monitor(Some(app.handle().clone())) {
        Ok(monitor) => {
            app.manage(monitor);
            log::debug!("Windows 系统代理监听已启动");
        }
        Err(error) => log::warn!("Windows 系统代理监听启动失败: {error}"),
    }

    let mut startup_dialogs = StartupDialogs::default();
    let file_migration_summary = migrate_legacy_files(&mut startup_dialogs);
    let startup_context = format!(
        "version={} os={} arch={} mode={} silent_startup={} {}",
        app.package_info().version,
        std::env::consts::OS,
        std::env::consts::ARCH,
        if reina_path::is_portable_mode() {
            "portable"
        } else {
            "standard"
        },
        silent_startup,
        file_migration_summary,
    );

    let result =
        tauri::async_runtime::block_on(initialize_database(app.handle(), &startup_context))
            .and_then(|()| {
                create_main_window(app, silent_startup).map_err(|error| {
                    log::error!("创建主窗口失败: {error}");
                    NativeDialog::new(
                        "Reina 启动失败",
                        "无法创建主窗口，Reina 无法继续启动。\n错误已记录到日志。",
                        MessageDialogKind::Error,
                    )
                    .details(error)
                    .button_label("退出")
                })
            });

    if let Err(dialog) = result {
        startup_dialogs.dialogs.push(dialog);
        startup_dialogs.exit_after = true;
    }
    app.manage(startup_dialogs);
    // 启动失败也保留事件循环，用户关闭提示后再退出。
    Ok(())
}

pub fn on_event(app: &AppHandle, event: RunEvent) {
    match event {
        RunEvent::Ready => show_startup_dialogs(app),
        RunEvent::Exit => shutdown(app),
        _ => {}
    }
}

fn read_silent_startup(app: &App) -> bool {
    match app.store(SETTINGS_STORE_PATH) {
        Ok(store) => store
            .get(SILENT_STARTUP_STORE_KEY)
            .and_then(|value| value.as_bool())
            .unwrap_or(false),
        Err(error) => {
            eprintln!("读取静默启动设置失败: {error}");
            false
        }
    }
}

fn migrate_legacy_files(startup_dialogs: &mut StartupDialogs) -> String {
    match run_startup_migrations() {
        Ok(result) if result.executed == 0 => "file_migration=skipped".to_string(),
        Ok(result) => format!(
            "file_migration=completed executed={} skipped={} moved={} replaced={} removed_legacy={}",
            result.executed,
            result.skipped,
            result.migrated_files,
            result.replaced_files,
            result.removed_legacy_files,
        ),
        Err(error) => {
            log::error!("旧版文件迁移失败: {error}");
            startup_dialogs.dialogs.push(
                NativeDialog::new(
                    "Reina 文件迁移提醒",
                    "旧版文件迁移未完成，部分封面可能无法显示。\n错误已记录到日志。",
                    MessageDialogKind::Warning,
                )
                .details(error)
                .button_label("知道了"),
            );
            "file_migration=failed".to_string()
        }
    }
}

async fn initialize_database(app: &AppHandle, startup_context: &str) -> Result<(), NativeDialog> {
    let conn = db::establish_connection().await.map_err(|error| {
        log::error!("无法建立数据库连接: {startup_context} error={error}");
        NativeDialog::new(
            "Reina 启动失败",
            "无法打开数据库，Reina 无法继续启动。\n请检查数据目录的访问权限和磁盘空间，错误已记录到日志。",
            MessageDialogKind::Error,
        )
        .details(error)
        .button_label("退出")
    })?;
    log::debug!("数据库连接建立成功");

    if let Err(error) = migration::migrate_database(&conn, env!("CARGO_PKG_VERSION")).await {
        log::error!("数据库迁移失败: {startup_context} error={error}");
        let dialog = NativeDialog::new(
            "Reina 启动失败",
            "数据库更新未能完成，Reina 无法继续启动。\n请查看下方错误信息，详细记录已写入日志。",
            MessageDialogKind::Error,
        )
        .details(error)
        .button_label("退出");
        if let Err(error) = db::close_connection(conn).await {
            log::error!("迁移失败后关闭数据库连接失败: {error}");
        }
        return Err(dialog);
    }
    log::info!("启动初始化完成: {startup_context} database_migration=completed");
    app.manage(conn.clone());

    match recover_interrupted_tasks(&conn).await {
        Ok(task_ids) => resume_pending_tasks(app, &conn, task_ids),
        Err(error) => log::error!("恢复中断任务失败: {error}"),
    }
    Ok(())
}

fn create_main_window(app: &App, silent_startup: bool) -> tauri::Result<()> {
    // 数据库就绪后才加载前端，避免启动失败时仍执行依赖数据库的请求。
    let builder = tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?;
    // CEF 隐藏创建后再显示可能丢失键盘焦点，普通启动直接创建可见窗口。
    #[cfg(target_os = "linux")]
    let builder = builder.visible(!silent_startup);
    let window = builder.build()?;
    log::debug!(
        "主窗口创建完成: label={} silent_startup={silent_startup}",
        window.label()
    );

    #[cfg(target_os = "windows")]
    if let Err(error) = listen_to_webview_zoom(&window) {
        log::warn!("监听 WebView 缩放失败: {error}");
    }
    #[cfg(not(target_os = "linux"))]
    if !silent_startup {
        let _ = window.show();
    }
    #[cfg(debug_assertions)]
    window.open_devtools();
    Ok(())
}

fn show_startup_dialogs(app: &AppHandle) {
    let startup = app.state::<StartupDialogs>();
    let dialogs = startup.dialogs.clone();
    let exit_after = startup.exit_after;
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        // 顺序等待确认，避免多个启动提示互相遮挡。
        for dialog in dialogs {
            dialog.with_log_folder_button().show(&handle).await;
        }
        if exit_after {
            handle.exit(1);
        }
    });
}

fn shutdown(app: &AppHandle) {
    #[cfg(target_os = "windows")]
    if let Some(monitor) = app.try_state::<SystemProxyMonitor>() {
        monitor.shutdown();
    }

    if let Some(conn_state) = app.try_state::<sea_orm::DatabaseConnection>() {
        let conn = conn_state.inner().clone();
        // 等待连接关闭后再结束进程，避免退出清理被中断。
        tauri::async_runtime::block_on(async {
            match db::close_connection(conn).await {
                Ok(_) => log::info!("数据库连接已成功关闭"),
                Err(error) => log::error!("关闭数据库连接时出错: {error}"),
            }
        });
    }
}
