mod backup;
mod utils;

use backup::savedata::{create_savedata_backup, delete_savedata_backup};
use migration::MigratorTrait;
use tauri::Manager;
use utils::{
    connection::establish_connection,
    fs::{copy_file, delete_file, delete_game_covers, move_backup_folder, open_directory},
    game_monitor::monitor_game,
    launch::launch_game,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let window = app.get_webview_window("main").expect("no main window");
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--flag1", "--flag2"]), /* arbitrary number of args to pass to your app */
        ))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            launch_game,
            open_directory,
            move_backup_folder,
            copy_file,
            monitor_game,
            create_savedata_backup,
            delete_savedata_backup,
            delete_file,
            delete_game_covers,
        ])
        .setup(|app| {
            // 执行 SeaORM 数据库迁移
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match establish_connection(&app_handle).await {
                    Ok(conn) => {
                        log::info!("开始执行数据库迁移...");
                        match migration::Migrator::up(&conn, None).await {
                            Ok(_) => log::info!("数据库迁移完成"),
                            Err(e) => log::error!("数据库迁移失败: {}", e),
                        }
                    }
                    Err(e) => log::error!("无法建立数据库连接进行迁移: {}", e),
                }
            });

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
