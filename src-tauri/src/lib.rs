mod backup;
mod database;
mod entity;
mod utils;

use backup::savedata::{create_savedata_backup, delete_savedata_backup};
use database::*;
use migration::MigratorTrait;
use tauri::Manager;
use utils::{
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
            // 工具类 commands
            launch_game,
            open_directory,
            move_backup_folder,
            copy_file,
            monitor_game,
            create_savedata_backup,
            delete_savedata_backup,
            delete_file,
            delete_game_covers,
            // 游戏数据相关 commands
            insert_game_with_related,
            find_full_game_by_id,
            find_all_full_games,
            find_full_games_by_type,
            search_full_games,
            update_game_with_related,
            delete_game,
            delete_bgm_data,
            delete_vndb_data,
            delete_other_data,
            delete_games_batch,
            count_games,
            game_exists_by_bgm_id,
            game_exists_by_vndb_id,
            // 存档备份相关 commands
            save_savedata_record,
            get_savedata_count,
            get_savedata_records,
            get_savedata_record_by_id,
            delete_savedata_record,
            delete_all_savedata_by_game,
            // 游戏统计相关 commands
            record_game_session,
            get_game_sessions,
            get_recent_sessions_for_all,
            delete_game_session,
            update_game_statistics,
            get_game_statistics,
            get_multiple_game_statistics,
            get_all_game_statistics,
            delete_game_statistics,
            get_today_playtime,
            init_game_statistics,
            // 用户设置相关 commands
            get_bgm_token,
            set_bgm_token,
            get_save_root_path,
            set_save_root_path,
            get_all_settings,
            update_settings,
            clear_bgm_token,
            clear_save_root_path,
            // 合集相关 commands
            create_collection,
            find_collection_by_id,
            find_all_collections,
            find_root_collections,
            find_child_collections,
            update_collection,
            delete_collection,
            collection_exists,
            add_game_to_collection,
            remove_game_from_collection,
            remove_collection_link_by_id,
            get_games_in_collection,
            get_collections_for_game,
            count_games_in_collection,
            add_games_to_collection,
            update_game_sort_order_in_collection,
            is_game_in_collection,
            get_all_collection_links,
            clear_collection_games
        ])
        .setup(|app| {
            // 执行 SeaORM 数据库迁移并注册到状态管理
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                match connection::establish_connection(&app_handle).await {
                    Ok(conn) => {
                        log::info!("数据库连接建立成功");

                        // 执行数据库迁移
                        log::info!("开始执行数据库迁移...");
                        match migration::Migrator::up(&conn, None).await {
                            Ok(_) => log::info!("数据库迁移完成"),
                            Err(e) => log::error!("数据库迁移失败: {}", e),
                        }

                        // 将数据库连接注册到 Tauri 状态管理
                        app_handle.manage(conn);
                        log::info!("数据库连接已注册到状态管理");
                    }
                    Err(e) => {
                        log::error!("无法建立数据库连接: {}", e);
                        panic!("数据库初始化失败: {}", e);
                    }
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
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // 监听应用退出事件
            if let tauri::RunEvent::Exit = event {
                // 同步获取并关闭数据库连接
                if let Some(conn_state) = app_handle.try_state::<sea_orm::DatabaseConnection>() {
                    let conn = conn_state.inner().clone();

                    // 使用 block_on 确保数据库连接在应用退出前完全关闭
                    tauri::async_runtime::block_on(async {
                        match connection::close_connection(conn).await {
                            Ok(_) => log::info!("数据库连接已成功关闭"),
                            Err(e) => log::error!("关闭数据库连接时出错: {}", e),
                        }
                    });
                }
            }
        });
}
