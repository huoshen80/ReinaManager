mod backup;
mod database;
mod entity;
mod game;
mod utils;

use backup::covers::backup_custom_covers;
use backup::database::{backup_database, import_database};
use backup::savedata::{
    create_savedata_backup, delete_savedata_backup, move_backup_folder, restore_savedata_backup,
};
use database::*;
use game::cover::custom::{delete_game_covers, import_clipboard_image_to_temp};
use game::cover::{delete_cloud_cache, register_game_cover_protocol};
use game::launch::{launch_game, stop_game};
use game::scan::scan_directory_for_games;
use migration::MigratorTrait;
use tauri::Manager;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};
use utils::{
    bgm_auth::{bgm_oauth_exchange_code, bgm_oauth_refresh_token, bgm_oauth_start_login},
    fs::{copy_file, delete_file, is_portable_mode, open_directory},
    http::update_proxy_config,
    image::register_image_proxy_protocol,
    legacy_migration::run_startup_migrations,
    logs::{get_reina_log_level, set_reina_log_level},
};

const LOG_MAX_FILE_SIZE: u128 = 1_000_000;
const LOG_KEEP_FILE_COUNT: usize = 5;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    register_image_proxy_protocol(register_game_cover_protocol(
        tauri::Builder::default().plugin(tauri_plugin_os::init()),
    ))
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
        .plugin(tauri_plugin_clipboard_manager::init())
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
            import_clipboard_image_to_temp,
            delete_game_covers,
            delete_cloud_cache,
            backup_database,
            backup_custom_covers,
            import_database,
            // 游戏数据相关 commands
            insert_game,
            insert_games_batch,
            find_game_by_id,
            find_all_games,
            find_game_ids,
            update_game,
            delete_game,
            delete_games_batch,
            count_games,
            source_binding_exists,
            get_source_bindings,
            update_games_batch,
            // 存档备份相关 commands
            save_savedata_record,
            get_savedata_count,
            get_savedata_records,
            // 游戏统计相关 commands
            create_manual_game_session,
            rebuild_game_statistics,
            get_game_sessions,
            get_recent_sessions_for_all,
            delete_game_session,
            get_game_statistics,
            get_all_game_statistics,
            get_all_game_last_played,
            // 用户设置相关 commands
            get_all_settings,
            update_settings,
            update_proxy_config,
            // BGM OAuth 相关 commands
            bgm_oauth_start_login,
            bgm_oauth_exchange_code,
            bgm_oauth_refresh_token,
            // 日志相关 commands（运行时动态调整）
            set_reina_log_level,
            get_reina_log_level,
            // 合集相关 commands
            create_collection,
            find_root_collections,
            update_collection,
            delete_collection,
            remove_games_from_collection,
            get_games_in_collection,
            get_game_collection_ids,
            add_games_to_collections,
            set_game_collections,
            update_category_games,
            batch_count_games_in_groups,
            count_games_in_group,
            get_categories_with_count,
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
            }

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
                        .level(log::LevelFilter::Debug)
                        .level_for("reqwest::connect", log::LevelFilter::Warn)
                        .level_for("hyper", log::LevelFilter::Warn)
                        .level_for("hyper_util", log::LevelFilter::Warn)
                        .level_for("h2", log::LevelFilter::Warn)
                        .max_file_size(LOG_MAX_FILE_SIZE)
                        .rotation_strategy(RotationStrategy::KeepSome(LOG_KEEP_FILE_COUNT))
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
                // 设置初始日志级别为 Info（运行时可通过命令调整）
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .timezone_strategy(TimezoneStrategy::UseLocal)
                        .level(log::LevelFilter::Debug)
                        .level_for("reqwest::connect", log::LevelFilter::Warn)
                        .level_for("hyper", log::LevelFilter::Warn)
                        .level_for("hyper_util", log::LevelFilter::Warn)
                        .level_for("h2", log::LevelFilter::Warn)
                        .max_file_size(LOG_MAX_FILE_SIZE)
                        .rotation_strategy(RotationStrategy::KeepSome(LOG_KEEP_FILE_COUNT))
                        .build(),
                )?;
                // 发布版默认保持 Info，但保留本会话临时升到 Debug 的能力。
                log::set_max_level(log::LevelFilter::Info);
            }

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
                        log::debug!("数据库连接建立成功");

                        // 执行数据库迁移
                        log::debug!("开始执行数据库迁移...");
                        match migration::Migrator::up(&conn, None).await {
                            Ok(_) => log::info!("数据库迁移完成"),
                            Err(e) => {
                                log::error!("数据库迁移失败: {}", e);
                                panic!("数据库迁移失败，已停止启动: {}", e);
                            }
                        }

                        // 将数据库连接注册到 Tauri 状态管理
                        app_handle.manage(conn.clone());
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
