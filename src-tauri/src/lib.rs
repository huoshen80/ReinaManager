mod backup;
mod database;
mod entity;
mod utils;

use backup::savedata::{create_savedata_backup, delete_savedata_backup, restore_savedata_backup};
use database::db::{backup_database, import_database};
use database::*;
use migration::MigratorTrait;
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind, TimezoneStrategy};
use utils::{
    fs::{
        PathManager, copy_file, delete_file, delete_game_covers, is_portable_mode,
        move_backup_folder, open_directory,
    },
    game_cover::{delete_cloud_cache, register_game_cover_protocol},
    launch::{launch_game, stop_game},
    legacy_migration::run_startup_migrations,
    logs::{get_reina_log_level, set_reina_log_level},
    scan::scan_directory_for_games,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    register_game_cover_protocol(tauri::Builder::default().plugin(tauri_plugin_os::init()))
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
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
            stop_game,
            open_directory,
            is_portable_mode,
            scan_directory_for_games,
            move_backup_folder,
            copy_file,
            create_savedata_backup,
            delete_savedata_backup,
            restore_savedata_backup,
            delete_file,
            delete_game_covers,
            delete_cloud_cache,
            backup_database,
            import_database,
            // 游戏数据相关 commands
            insert_game,
            insert_games_batch,
            find_game_by_id,
            find_all_games,
            update_game,
            delete_game,
            delete_games_batch,
            count_games,
            game_exists_by_bgm_id,
            game_exists_by_vndb_id,
            get_all_bgm_ids,
            get_all_vndb_ids,
            update_games_batch,
            // 存档备份相关 commands
            save_savedata_record,
            get_savedata_count,
            get_savedata_records,
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
            get_vndb_token,
            set_vndb_token,
            get_save_root_path,
            set_save_root_path,
            get_db_backup_path,
            set_db_backup_path,
            get_all_settings,
            update_settings,
            get_le_path,
            set_le_path,
            get_magpie_path,
            set_magpie_path,
            // 日志相关 commands（运行时动态调整）
            set_reina_log_level,
            get_reina_log_level,
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
            get_games_in_collection,
            count_games_in_collection,
            update_category_games,
            is_game_in_collection,
            batch_count_games_in_groups,
            count_games_in_group,
            get_collection_tree,
            get_categories_with_count,
        ])
        .setup(|app| {
            // 仅在调试模式下自动打开开发者工具
            #[cfg(debug_assertions)]
            {
                // "main" 是他在 tauri.conf.json 中定义的窗口 label
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .timezone_strategy(TimezoneStrategy::UseLocal)
                        .level(log::LevelFilter::Debug) // 允许运行时动态调整到任意级别
                        .targets([
                            Target::new(TargetKind::LogDir {
                                // set custom log file name for debug
                                file_name: Some("debug".into()),
                            }),
                            Target::new(TargetKind::Stdout),
                        ])
                        .build(),
                )?;
            } else {
                // 设置初始日志级别为 Warn（运行时可通过命令调整）
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .timezone_strategy(TimezoneStrategy::UseLocal)
                        .level(log::LevelFilter::Warn) // 允许运行时动态调整到任意级别
                        .build(),
                )?;
            }

            // 初始化路径管理器
            let path_manager = PathManager::new();
            app.manage(path_manager);

            match run_startup_migrations() {
                Ok(result) if result.executed == 0 => {
                    log::debug!("启动迁移检查完成，无需执行");
                }
                Ok(result) => {
                    log::info!(
                        "启动迁移完成: executed={}, skipped={}, moved={}, replaced={}, removed_legacy={}",
                        result.executed,
                        result.skipped,
                        result.migrated_files,
                        result.replaced_files,
                        result.removed_legacy_files
                    );
                }
                Err(err) => {
                    log::error!("启动迁移失败: {}", err);
                }
            }

            // 执行 SeaORM 数据库迁移并注册到状态管理
            let app_handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                match db::establish_connection().await {
                    Ok(conn) => {
                        log::info!("数据库连接建立成功");

                        // 执行数据库迁移
                        log::info!("开始执行数据库迁移...");
                        match migration::Migrator::up(&conn, None).await {
                            Ok(_) => log::info!("数据库迁移完成"),
                            Err(e) => log::error!("数据库迁移失败: {}", e),
                        }

                        // 将数据库连接注册到 Tauri 状态管理
                        app_handle.manage(conn.clone());

                        // 预加载配置路径到路径管理器
                        if let Some(path_manager) = app_handle.try_state::<PathManager>() {
                            if let Err(e) = path_manager.inner().preload_config_paths(&conn).await {
                                log::warn!("预加载配置路径失败: {}", e);
                            } else {
                                log::info!("配置路径预加载完成");
                            }
                        }
                    }
                    Err(e) => {
                        log::error!("无法建立数据库连接: {}", e);
                        panic!("数据库初始化失败: {}", e);
                    }
                }
            });
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
                        match db::close_connection(conn).await {
                            Ok(_) => log::info!("数据库连接已成功关闭"),
                            Err(e) => log::error!("关闭数据库连接时出错: {}", e),
                        }
                    });
                }
            }
        });
}
