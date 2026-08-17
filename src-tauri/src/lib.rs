mod backup;
mod database;
mod entity;
mod game;
mod install;
mod oauth;
mod utils;

use backup::covers::backup_custom_covers;
use backup::database::{backup_database, import_database};
use backup::savedata::{
    create_savedata_backup, delete_savedata_backup, move_backup_folder, restore_savedata_backup,
};
use database::*;
use game::cover::custom::{delete_game_covers, import_clipboard_image_to_temp};
use game::cover::{delete_cloud_cache, register_game_cover_protocol};
use game::drop_import::resolve_bulk_import_paths;
use game::launch::{launch_game, stop_game};
#[cfg(target_os = "linux")]
use game::launch::list_proton_profiles;
use game::scan::scan_directory_for_games;
use game::steam::{resolve_steam_shortcut_file, scan_steam_launch_targets};
use install::protocol::{
    InstallProtocolState, setup_install_protocol, take_pending_install_rejections,
    take_pending_install_requests,
};
use install::{
    TaskRuntimeState, cancel_task, complete_game_install_task, create_game_install_task,
    delete_task, fail_game_install_metadata, list_tasks, pause_task, recover_interrupted_tasks,
    resume_pending_tasks, resume_task, retry_task,
};
use migration::MigratorTrait;
use oauth::{
    bgm_auth::{
        bgm_oauth_cancel_login, bgm_oauth_exchange_code, bgm_oauth_refresh_token,
        bgm_oauth_start_login,
    },
    hikarinagi_auth::{
        hikarinagi_oauth_cancel_login, hikarinagi_oauth_exchange_code,
        hikarinagi_oauth_refresh_token, hikarinagi_oauth_start_login,
    },
};
use tauri::Manager;
use tauri_plugin_log::{RotationStrategy, Target, TargetKind, TimezoneStrategy};
use tauri_plugin_store::StoreExt;
use utils::{
    fs::{copy_file, delete_file, is_portable_mode, open_directory, resolve_dropped_local_path},
    http::update_proxy_config,
    image::register_image_proxy_protocol,
    legacy_migration::run_startup_migrations,
    logs::{get_reina_log_level, set_reina_log_level},
};

#[cfg(target_os = "windows")]
use utils::http::{SystemProxyMonitor, start_system_proxy_monitor};

const LOG_MAX_FILE_SIZE: u128 = 1_000_000;
const LOG_KEEP_FILE_COUNT: usize = 5;
const SETTINGS_STORE_PATH: &str = "settings.json";
const SILENT_STARTUP_STORE_KEY: &str = "silent_startup";

#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.request_restart();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    register_image_proxy_protocol(register_game_cover_protocol(tauri::Builder::default()))
        // 单实例插件必须最先注册，第二实例传入的深链接才能稳定转交给主实例。
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .manage(InstallProtocolState::default())
        .manage(TaskRuntimeState::default())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        .difference(tauri_plugin_window_state::StateFlags::VISIBLE),
                )
                .build(),
        )
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--flag1", "--flag2"]), /* arbitrary number of args to pass to your app */
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            // 工具类 commands
            launch_game,
            stop_game,
            #[cfg(target_os = "linux")]
            list_proton_profiles,
            open_directory,
            resolve_dropped_local_path,
            resolve_bulk_import_paths,
            is_portable_mode,
            scan_directory_for_games,
            scan_steam_launch_targets,
            resolve_steam_shortcut_file,
            take_pending_install_requests,
            take_pending_install_rejections,
            create_game_install_task,
            list_tasks,
            retry_task,
            pause_task,
            resume_task,
            cancel_task,
            delete_task,
            complete_game_install_task,
            fail_game_install_metadata,
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
            bgm_oauth_cancel_login,
            bgm_oauth_exchange_code,
            bgm_oauth_refresh_token,
            // Hikarinagi OAuth 相关 commands
            hikarinagi_oauth_start_login,
            hikarinagi_oauth_cancel_login,
            hikarinagi_oauth_exchange_code,
            hikarinagi_oauth_refresh_token,
            // 日志相关 commands（运行时动态调整）
            set_reina_log_level,
            get_reina_log_level,
            restart_app,
            // 合集相关 commands
            create_collection,
            find_root_collections,
            get_root_collections_with_count,
            update_collection,
            delete_collection,
            remove_games_from_collection,
            get_games_in_collection,
            get_game_collection_ids,
            add_games_to_collections,
            set_game_collections,
            update_category_games,
            count_games_in_group,
            get_categories_with_count,
        ])
        .setup(|app| {
            let silent_startup = match app.store(SETTINGS_STORE_PATH) {
                Ok(store) => store
                    .get(SILENT_STARTUP_STORE_KEY)
                    .and_then(|value| value.as_bool())
                    .unwrap_or(false),
                Err(error) => {
                    eprintln!("读取静默启动设置失败: {error}");
                    false
                }
            };

            if let Some(window) = app.get_webview_window("main") {
                if !silent_startup {
                    let _ = window.show();
                }

                // 仅在调试模式下自动打开开发者工具
                #[cfg(debug_assertions)]
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

            // 日志插件初始化后再注册协议，确保注册失败信息能够写入日志。
            setup_install_protocol(app);

            #[cfg(target_os = "windows")]
            match start_system_proxy_monitor() {
                Ok(monitor) => {
                    app.manage(monitor);
                    log::debug!("Windows 系统代理监听已启动");
                }
                Err(error) => log::warn!("Windows 系统代理监听启动失败: {error}"),
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

                        match recover_interrupted_tasks(&conn).await {
                            Ok(task_ids) => resume_pending_tasks(&app_handle, &conn, task_ids),
                            Err(error) => log::error!("恢复中断任务失败: {error}"),
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
                #[cfg(target_os = "windows")]
                if let Some(monitor) = app_handle.try_state::<SystemProxyMonitor>() {
                    monitor.shutdown();
                }

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
