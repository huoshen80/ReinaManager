mod backup;
mod database;
mod entity;
mod game;
mod install;
mod lifecycle;
mod oauth;
mod utils;

use backup::automatic::create_auto_backup;
use backup::covers::backup_custom_covers;
use backup::database::{backup_database, import_database, open_database_backup_folder};
use backup::savedata::{
    change_savedata_backup_root, create_savedata_backup, delete_savedata_backup,
    delete_savedata_backup_record, open_savedata_backup_folder, restore_savedata_backup,
};
use database::*;
use game::cover::custom::{delete_game_covers, import_clipboard_image_to_temp};
use game::cover::{delete_cloud_cache, register_game_cover_protocol};
use game::drop_import::resolve_bulk_import_paths;
use game::launch::{launch_game, stop_game};
use game::scan::scan_directory_for_games;
use game::steam::{resolve_steam_shortcut_file, scan_steam_launch_targets};
use install::protocol::{
    InstallProtocolState, take_pending_install_rejections, take_pending_install_requests,
};
use install::{
    TaskRuntimeState, cancel_task, complete_game_install_task, create_game_install_task,
    delete_task, fail_game_install_metadata, list_tasks, pause_task, resume_task, retry_task,
};
use oauth::{
    bgm_auth::{
        bgm_oauth_cancel_login, bgm_oauth_exchange_code, bgm_oauth_refresh_token,
        bgm_oauth_start_login,
    },
    hikarinagi_auth::{
        hikarinagi_oauth_cancel_login, hikarinagi_oauth_exchange_code,
        hikarinagi_oauth_refresh_token, hikarinagi_oauth_start_login,
    },
    nextmoe_auth::{
        nextmoe_oauth_cancel_login, nextmoe_oauth_exchange_code, nextmoe_oauth_get_auth,
        nextmoe_oauth_logout, nextmoe_oauth_start_login,
    },
};
use tauri::Manager;
use utils::{
    fs::{
        copy_file, delete_file, inspect_user_path, is_portable_mode, open_directory,
        open_savedata_location, resolve_dropped_local_path,
    },
    http::{get_system_proxy_status, update_proxy_config},
    image::register_image_proxy_protocol,
    logs::{get_reina_log_level, set_reina_log_level},
    runtime::{configure_runtime, is_development},
    updater::{check_app_update, inspect_update_installation},
};

#[tauri::command]
fn restart_app(app: tauri::AppHandle) {
    app.request_restart();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut context = tauri::generate_context!();
    configure_runtime(&mut context);

    #[cfg(target_os = "linux")]
    let builder = tauri::Builder::default().runtime(tauri_runtime_cef::Cef::default());
    #[cfg(not(target_os = "linux"))]
    let builder = tauri::Builder::default().runtime(tauri_runtime_wry::Wry::default());

    let builder = register_image_proxy_protocol(register_game_cover_protocol(builder))
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
        .plugin(tauri_plugin_deep_link::init());

    // 开发版不注册会修改正式安装或系统启动项的插件，前端也同步禁用入口。
    let builder = if is_development() {
        builder
    } else {
        builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                Some(vec!["--startup"]),
            ))
    };

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            check_app_update,
            inspect_update_installation,
            // 工具类 commands
            launch_game,
            stop_game,
            open_directory,
            open_savedata_location,
            inspect_user_path,
            resolve_dropped_local_path,
            resolve_bulk_import_paths,
            is_portable_mode,
            is_development,
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
            change_savedata_backup_root,
            copy_file,
            create_savedata_backup,
            delete_savedata_backup,
            delete_savedata_backup_record,
            open_savedata_backup_folder,
            restore_savedata_backup,
            delete_file,
            import_clipboard_image_to_temp,
            delete_game_covers,
            delete_cloud_cache,
            backup_database,
            create_auto_backup,
            open_database_backup_folder,
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
            get_statistics_distribution,
            // 用户设置相关 commands
            get_all_settings,
            update_settings,
            update_proxy_config,
            get_system_proxy_status,
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
            nextmoe_oauth_start_login,
            nextmoe_oauth_cancel_login,
            nextmoe_oauth_exchange_code,
            nextmoe_oauth_get_auth,
            nextmoe_oauth_logout,
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
            reorder_category_games,
            count_games_in_group,
            get_categories_with_count,
        ])
        .setup(lifecycle::setup)
        .build(context)
        .expect("error while building tauri application")
        .run(lifecycle::on_event);
}
