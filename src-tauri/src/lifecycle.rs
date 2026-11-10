use tauri::{App, AppHandle, Manager, RunEvent};
use tauri_plugin_dialog::MessageDialogKind;
use tauri_plugin_store::StoreExt;

use crate::database::db;
use crate::install::{
    protocol::setup_install_protocol, recover_interrupted_tasks, resume_pending_tasks,
};
use crate::utils::{
    dialog::NativeDialog,
    legacy_migration::{StartupMigrationResult, run_startup_migrations},
    logs::setup_logging,
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
    let startup_context = format!(
        "version={} os={} arch={} mode={} silent_startup={}",
        app.package_info().version,
        std::env::consts::OS,
        std::env::consts::ARCH,
        if reina_path::is_portable_mode() {
            "portable"
        } else {
            "standard"
        },
        silent_startup,
    );

    let result = tauri::async_runtime::block_on(initialize_database(
        app.handle(),
        &startup_context,
        silent_startup,
    ))
    .and_then(|warning| {
        create_main_window(app, silent_startup).map_err(|error| {
            log::error!("创建主窗口失败: {error}");
            NativeDialog::new(
                "Reina 启动失败",
                "无法创建主窗口，Reina 无法继续启动。\n错误已记录到日志。",
                MessageDialogKind::Error,
            )
            .details(error)
            .button_label("退出")
        })?;
        if let Some(warning) = warning {
            startup_dialogs.dialogs.push(warning);
        }
        Ok(())
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

fn summarize_file_migration(
    result: Result<StartupMigrationResult, String>,
    silent_startup: bool,
) -> (String, Option<NativeDialog>) {
    let (summary, warning) = match result {
        Ok(result) => {
            let incomplete = result.failed_files > 0 || result.scan_failures > 0;
            let status = if incomplete {
                "partial"
            } else if result.executed == 0 {
                "skipped"
            } else {
                "completed"
            };
            (
                format!(
                    "file_migration={status} executed={} skipped={} moved={} replaced={} removed_legacy={} failed_files={} scan_failures={}",
                    result.executed,
                    result.skipped,
                    result.migrated_files,
                    result.replaced_files,
                    result.removed_legacy_files,
                    result.failed_files,
                    result.scan_failures
                ),
                incomplete.then(|| {
                    format!(
                        "{} 个封面文件迁移失败，{} 个目录未能完成扫描。",
                        result.failed_files, result.scan_failures
                    )
                }),
            )
        }
        Err(error) => {
            log::warn!("旧封面迁移未完成，继续启动: {error}");
            (
                "file_migration=failed".into(),
                Some("旧封面目录迁移或扫描未能完成，暂时无法统计受影响的封面数量。".into()),
            )
        }
    };
    let dialog = warning.filter(|_| !silent_startup).map(|warning| {
        NativeDialog::new(
            "Reina 封面迁移提醒",
            format!(
                "{warning}\n部分封面可能暂时无法显示。未完成迁移的文件已保留，下次启动会重试。\n你可以继续使用 Reina，或查看日志了解原因。"
            ),
            MessageDialogKind::Warning,
        )
        .button_label("继续使用")
    });
    (summary, dialog)
}

async fn initialize_database(
    app: &AppHandle,
    startup_context: &str,
    silent_startup: bool,
) -> Result<Option<NativeDialog>, NativeDialog> {
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
    let (file_migration_summary, warning) =
        summarize_file_migration(run_startup_migrations(&conn).await, silent_startup);
    log::info!(
        "启动初始化完成: {startup_context} database_migration=completed {file_migration_summary}"
    );
    app.manage(conn.clone());

    match recover_interrupted_tasks(&conn).await {
        Ok(task_ids) => resume_pending_tasks(app, &conn, task_ids),
        Err(error) => log::error!("恢复中断任务失败: {error}"),
    }
    Ok(warning)
}

fn create_main_window(app: &App, silent_startup: bool) -> tauri::Result<()> {
    // 数据库必须就绪；封面迁移失败允许先显示占位图。
    let window =
        tauri::WebviewWindowBuilder::from_config(app, &app.config().app.windows[0])?.build()?;

    #[cfg(target_os = "windows")]
    if let Err(error) = listen_to_webview_zoom(&window) {
        log::warn!("监听 WebView 缩放失败: {error}");
    }
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

#[cfg(test)]
mod migration_warning_tests {
    use super::*;

    #[test]
    fn only_incomplete_migrations_warn_and_silent_startup_suppresses_dialogs() {
        for silent in [false, true] {
            let (summary, warning) =
                summarize_file_migration(Ok(StartupMigrationResult::default()), silent);
            assert!(summary.contains("file_migration=skipped"));
            assert!(warning.is_none());
            let (summary, warning) = summarize_file_migration(
                Ok(StartupMigrationResult {
                    executed: 1,
                    migrated_files: 3,
                    ..Default::default()
                }),
                silent,
            );
            assert!(summary.contains("file_migration=completed"));
            assert!(warning.is_none());
            for (failed_files, scan_failures) in [(2, 0), (0, 1), (2, 1)] {
                let (summary, warning) = summarize_file_migration(
                    Ok(StartupMigrationResult {
                        failed_files,
                        scan_failures,
                        ..Default::default()
                    }),
                    silent,
                );
                assert!(summary.contains("file_migration=partial"));
                assert_eq!(warning.is_some(), !silent);
            }
            let (summary, warning) =
                summarize_file_migration(Err("测试目录无法读取".into()), silent);
            assert_eq!(summary, "file_migration=failed");
            assert_eq!(warning.is_some(), !silent);
        }
    }
}
