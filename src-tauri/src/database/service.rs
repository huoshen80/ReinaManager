use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use crate::database::dto::{InsertGameData, UpdateGameData};
use crate::database::repository::{
    collections_repository::{CategoryWithCount, CollectionsRepository, GroupWithCategories},
    game_stats_repository::{DailyStats, GameStatsRepository},
    games_repository::{GameType, GamesRepository, SortOption, SortOrder},
    settings_repository::SettingsRepository,
};
use crate::entity::{games, savedata, user};
use crate::utils::fs::PathManager;

// ==================== 便携模式相关类型 ====================

/// 便携模式切换结果
#[derive(Debug, Serialize, Deserialize)]
pub struct PortableModeResult {
    /// 是否需要重启应用
    pub requires_restart: bool,
    /// 是否迁移了数据库文件
    pub database_migrated: bool,
    /// 迁移的数据库备份文件数量
    pub database_backups_count: usize,
    /// 迁移的存档备份文件数量
    pub savedata_backups_count: usize,
    /// 迁移的文件总数
    pub total_files: usize,
    /// 提示消息
    pub message: String,
}

// ==================== 游戏数据相关 ====================

/// 插入游戏数据（单表架构）
#[tauri::command]
pub async fn insert_game(
    db: State<'_, DatabaseConnection>,
    game: InsertGameData,
) -> Result<i32, String> {
    GamesRepository::insert(&db, game)
        .await
        .map_err(|e| format!("插入游戏数据失败: {}", e))
}

/// 根据 ID 查询游戏数据
#[tauri::command]
pub async fn find_game_by_id(
    db: State<'_, DatabaseConnection>,
    id: i32,
) -> Result<Option<games::Model>, String> {
    GamesRepository::find_by_id(&db, id)
        .await
        .map_err(|e| format!("查询游戏数据失败: {}", e))
}

/// 获取所有游戏数据，支持按类型筛选和排序
#[tauri::command]
pub async fn find_all_games(
    db: State<'_, DatabaseConnection>,
    game_type: GameType,
    sort_option: SortOption,
    sort_order: SortOrder,
) -> Result<Vec<games::Model>, String> {
    GamesRepository::find_all(&db, game_type, sort_option, sort_order)
        .await
        .map_err(|e| format!("获取游戏数据失败: {}", e))
}

/// 更新游戏数据（单表架构）
#[tauri::command]
pub async fn update_game(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
    updates: UpdateGameData,
) -> Result<games::Model, String> {
    GamesRepository::update(&db, game_id, updates)
        .await
        .map_err(|e| format!("更新游戏数据失败: {}", e))
}

/// 删除游戏
#[tauri::command]
pub async fn delete_game(db: State<'_, DatabaseConnection>, id: i32) -> Result<u64, String> {
    GamesRepository::delete(&db, id)
        .await
        .map(|result| result.rows_affected)
        .map_err(|e| format!("删除游戏失败: {}", e))
}

/// 批量删除游戏
#[tauri::command]
pub async fn delete_games_batch(
    db: State<'_, DatabaseConnection>,
    ids: Vec<i32>,
) -> Result<u64, String> {
    GamesRepository::delete_many(&db, ids)
        .await
        .map(|result| result.rows_affected)
        .map_err(|e| format!("批量删除游戏失败: {}", e))
}

/// 获取游戏总数
#[tauri::command]
pub async fn count_games(db: State<'_, DatabaseConnection>) -> Result<u64, String> {
    GamesRepository::count(&db)
        .await
        .map_err(|e| format!("获取游戏总数失败: {}", e))
}

/// 检查 BGM ID 是否已存在
#[tauri::command]
pub async fn game_exists_by_bgm_id(
    db: State<'_, DatabaseConnection>,
    bgm_id: String,
) -> Result<bool, String> {
    GamesRepository::exists_bgm_id(&db, &bgm_id)
        .await
        .map_err(|e| format!("检查 BGM ID 是否存在失败: {}", e))
}

/// 检查 VNDB ID 是否已存在
#[tauri::command]
pub async fn game_exists_by_vndb_id(
    db: State<'_, DatabaseConnection>,
    vndb_id: String,
) -> Result<bool, String> {
    GamesRepository::exists_vndb_id(&db, &vndb_id)
        .await
        .map_err(|e| format!("检查 VNDB ID 是否存在失败: {}", e))
}

/// 获取所有游戏的 BGM ID（返回 {id, bgm_id} 对象数组）
#[tauri::command]
pub async fn get_all_bgm_ids(
    db: State<'_, DatabaseConnection>,
) -> Result<Vec<(i32, String)>, String> {
    GamesRepository::get_all_bgm_ids(&db)
        .await
        .map_err(|e| format!("获取 BGM ID 列表失败: {}", e))
}

/// 获取所有游戏的 VNDB ID（返回 {id, vndb_id} 对象数组）
#[tauri::command]
pub async fn get_all_vndb_ids(
    db: State<'_, DatabaseConnection>,
) -> Result<Vec<(i32, String)>, String> {
    GamesRepository::get_all_vndb_ids(&db)
        .await
        .map_err(|e| format!("获取 VNDB ID 列表失败: {}", e))
}

/// 批量更新游戏数据
///
/// 使用单个事务处理所有更新操作，性能远优于逐个更新
#[tauri::command]
pub async fn update_games_batch(
    db: State<'_, DatabaseConnection>,
    updates: Vec<(i32, UpdateGameData)>,
) -> Result<u64, String> {
    GamesRepository::update_batch(&db, updates)
        .await
        .map_err(|e| format!("批量更新数据失败: {}", e))
}

// ==================== 存档备份相关 ====================

/// 保存存档备份记录
#[tauri::command]
pub async fn save_savedata_record(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
    file_name: String,
    backup_time: i32,
    file_size: i32,
) -> Result<i32, String> {
    GamesRepository::save_savedata_record(&db, game_id, &file_name, backup_time, file_size)
        .await
        .map_err(|e| format!("保存存档备份记录失败: {}", e))
}

/// 获取指定游戏的备份数量
#[tauri::command]
pub async fn get_savedata_count(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
) -> Result<u64, String> {
    GamesRepository::get_savedata_count(&db, game_id)
        .await
        .map_err(|e| format!("获取备份数量失败: {}", e))
}

/// 获取指定游戏的所有备份记录
#[tauri::command]
pub async fn get_savedata_records(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
) -> Result<Vec<savedata::Model>, String> {
    GamesRepository::get_savedata_records(&db, game_id)
        .await
        .map_err(|e| format!("获取备份记录失败: {}", e))
}

// ==================== 游戏统计相关 ====================

/// 记录游戏会话
#[tauri::command]
pub async fn record_game_session(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
    start_time: i32,
    end_time: i32,
    duration: i32,
    date: String,
) -> Result<i32, String> {
    GameStatsRepository::record_session(&db, game_id, start_time, end_time, duration, date)
        .await
        .map_err(|e| format!("记录游戏会话失败: {}", e))
}

/// 获取游戏会话历史
#[tauri::command]
pub async fn get_game_sessions(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
    limit: u64,
    offset: u64,
) -> Result<Vec<crate::entity::game_sessions::Model>, String> {
    GameStatsRepository::get_sessions(&db, game_id, limit, offset)
        .await
        .map_err(|e| format!("获取游戏会话历史失败: {}", e))
}

/// 获取所有游戏的最近会话
#[tauri::command]
pub async fn get_recent_sessions_for_all(
    db: State<'_, DatabaseConnection>,
    game_ids: Vec<i32>,
    limit: u64,
) -> Result<Vec<crate::entity::game_sessions::Model>, String> {
    GameStatsRepository::get_recent_sessions_for_all(&db, game_ids, limit)
        .await
        .map_err(|e| format!("获取最近会话失败: {}", e))
}

/// 删除游戏会话
#[tauri::command]
pub async fn delete_game_session(
    db: State<'_, DatabaseConnection>,
    session_id: i32,
) -> Result<u64, String> {
    GameStatsRepository::delete_session(&db, session_id)
        .await
        .map(|result| result.rows_affected)
        .map_err(|e| format!("删除游戏会话失败: {}", e))
}

/// 更新游戏统计信息
#[tauri::command]
pub async fn update_game_statistics(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
    total_time: i32,
    session_count: i32,
    last_played: Option<i32>,
    daily_stats: Vec<DailyStats>,
) -> Result<(), String> {
    GameStatsRepository::update_statistics(
        &db,
        game_id,
        total_time,
        session_count,
        last_played,
        daily_stats,
    )
    .await
    .map_err(|e| format!("更新游戏统计失败: {}", e))
}

/// 获取游戏统计信息
#[tauri::command]
pub async fn get_game_statistics(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
) -> Result<Option<crate::entity::game_statistics::Model>, String> {
    GameStatsRepository::get_statistics(&db, game_id)
        .await
        .map_err(|e| format!("获取游戏统计失败: {}", e))
}

/// 批量获取游戏统计信息
#[tauri::command]
pub async fn get_multiple_game_statistics(
    db: State<'_, DatabaseConnection>,
    game_ids: Vec<i32>,
) -> Result<Vec<crate::entity::game_statistics::Model>, String> {
    GameStatsRepository::get_statistics_batch(&db, game_ids)
        .await
        .map_err(|e| format!("批量获取游戏统计失败: {}", e))
}

/// 获取所有游戏统计信息
#[tauri::command]
pub async fn get_all_game_statistics(
    db: State<'_, DatabaseConnection>,
) -> Result<Vec<crate::entity::game_statistics::Model>, String> {
    GameStatsRepository::get_all_statistics(&db)
        .await
        .map_err(|e| format!("获取所有游戏统计失败: {}", e))
}

/// 删除游戏统计信息
#[tauri::command]
pub async fn delete_game_statistics(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
) -> Result<u64, String> {
    GameStatsRepository::delete_statistics(&db, game_id)
        .await
        .map(|result| result.rows_affected)
        .map_err(|e| format!("删除游戏统计失败: {}", e))
}

/// 获取今天的游戏时间
#[tauri::command]
pub async fn get_today_playtime(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
    today: String,
) -> Result<i32, String> {
    GameStatsRepository::get_today_playtime(&db, game_id, &today)
        .await
        .map_err(|e| format!("获取今天游戏时间失败: {}", e))
}

/// 初始化游戏统计记录
#[tauri::command]
pub async fn init_game_statistics(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
) -> Result<(), String> {
    GameStatsRepository::init_statistics_if_not_exists(&db, game_id)
        .await
        .map_err(|e| format!("初始化游戏统计失败: {}", e))
}

// ==================== 用户设置相关 ====================

/// 获取 BGM Token
#[tauri::command]
pub async fn get_bgm_token(db: State<'_, DatabaseConnection>) -> Result<String, String> {
    SettingsRepository::get_bgm_token(&db)
        .await
        .map_err(|e| format!("获取 BGM Token 失败: {}", e))
}

/// 设置 BGM Token
#[tauri::command]
pub async fn set_bgm_token(db: State<'_, DatabaseConnection>, token: String) -> Result<(), String> {
    SettingsRepository::set_bgm_token(&db, token)
        .await
        .map_err(|e| format!("设置 BGM Token 失败: {}", e))
}

/// 获取存档根路径
#[tauri::command]
pub async fn get_save_root_path(db: State<'_, DatabaseConnection>) -> Result<String, String> {
    SettingsRepository::get_save_root_path(&db)
        .await
        .map_err(|e| format!("获取存档根路径失败: {}", e))
}

/// 设置存档根路径
#[tauri::command]
pub async fn set_save_root_path(
    app: AppHandle,
    db: State<'_, DatabaseConnection>,
    path: String,
) -> Result<(), String> {
    use crate::utils::fs::PathManager;

    SettingsRepository::set_save_root_path(&db, path)
        .await
        .map_err(|e| format!("设置存档根路径失败: {}", e))?;

    let path_manager = app.state::<PathManager>();
    path_manager.preload_config_paths(&app, &db).await?;

    Ok(())
}

/// 获取数据库备份保存路径
#[tauri::command]
pub async fn get_db_backup_path(db: State<'_, DatabaseConnection>) -> Result<String, String> {
    SettingsRepository::get_db_backup_path(&db)
        .await
        .map_err(|e| format!("获取数据库备份保存路径失败: {}", e))
}

/// 设置数据库备份保存路径
#[tauri::command]
pub async fn set_db_backup_path(
    app: AppHandle,
    db: State<'_, DatabaseConnection>,
    path: String,
) -> Result<(), String> {
    use crate::utils::fs::PathManager;

    SettingsRepository::set_db_backup_path(&db, path)
        .await
        .map_err(|e| format!("设置数据库备份保存路径失败: {}", e))?;

    let path_manager = app.state::<PathManager>();
    path_manager.preload_config_paths(&app, &db).await?;

    Ok(())
}

/// 获取LE转区软件路径
#[tauri::command]
pub async fn get_le_path(db: State<'_, DatabaseConnection>) -> Result<String, String> {
    SettingsRepository::get_le_path(&db)
        .await
        .map_err(|e| format!("获取LE转区软件路径失败: {}", e))
}

/// 设置LE转区软件路径
#[tauri::command]
pub async fn set_le_path(
    db: State<'_, DatabaseConnection>,
    app: AppHandle,
    path: String,
) -> Result<(), String> {
    SettingsRepository::set_le_path(&db, path)
        .await
        .map_err(|e| format!("设置LE转区软件路径失败: {}", e))?;

    // 路径修改后刷新缓存
    let path_manager = app.state::<PathManager>();
    path_manager.preload_config_paths(&app, &db).await?;

    Ok(())
}

/// 获取Magpie转区软件路径
#[tauri::command]
pub async fn get_magpie_path(db: State<'_, DatabaseConnection>) -> Result<String, String> {
    SettingsRepository::get_magpie_path(&db)
        .await
        .map_err(|e| format!("获取Magpie转区软件路径失败: {}", e))
}

/// 设置Magpie转区软件路径
#[tauri::command]
pub async fn set_magpie_path(
    db: State<'_, DatabaseConnection>,
    app: AppHandle,
    path: String,
) -> Result<(), String> {
    SettingsRepository::set_magpie_path(&db, path)
        .await
        .map_err(|e| format!("设置Magpie转区软件路径失败: {}", e))?;

    // 路径修改后刷新缓存
    let path_manager = app.state::<PathManager>();
    path_manager.preload_config_paths(&app, &db).await?;

    Ok(())
}

/// 获取所有设置
#[tauri::command]
pub async fn get_all_settings(db: State<'_, DatabaseConnection>) -> Result<user::Model, String> {
    SettingsRepository::get_all_settings(&db)
        .await
        .map_err(|e| format!("获取所有设置失败: {}", e))
}

/// 批量更新设置 暂时无用
#[tauri::command]
pub async fn update_settings(
    app: AppHandle,
    db: State<'_, DatabaseConnection>,
    bgm_token: Option<String>,
    save_root_path: Option<String>,
    db_backup_path: Option<String>,
) -> Result<(), String> {
    use crate::utils::fs::PathManager;

    SettingsRepository::update_settings(&db, bgm_token, save_root_path, db_backup_path)
        .await
        .map_err(|e| format!("更新设置失败: {}", e))?;

    // 清除缓存，下次获取时会重新计算路径
    let path_manager = app.state::<PathManager>();
    path_manager.clear_cache();

    Ok(())
}

/// 设置便携模式
///
/// 切换便携模式时会自动迁移数据库文件、数据库备份和存档备份，并要求重启应用
///
/// **重要**：
/// - 迁移过程会先关闭数据库连接以确保数据完整性
/// - 使用**剪切**操作（移动文件），源文件将被删除
/// - 便携模式通过文件位置判断，不再存储在数据库中
/// - 启用便携模式：将文件从 AppData 移动到程序目录/resources
/// - 禁用便携模式：将文件从程序目录/resources 移动到 AppData
#[tauri::command]
pub async fn set_portable_mode(
    app: tauri::AppHandle,
    db: State<'_, DatabaseConnection>,
    enabled: bool,
) -> Result<PortableModeResult, String> {
    use crate::database::db::migrate_data_files;

    // 读取用户的存档路径配置（在关闭连接前）
    let user_save_root_path = SettingsRepository::get_save_root_path(&db).await.ok();

    // 迁移数据文件（此函数会关闭数据库连接，使用剪切操作）
    // 如果迁移失败，直接返回错误给前端
    let migration_result = migrate_data_files(&app, enabled, user_save_root_path)
        .await
        .map_err(|e| {
            log::error!("数据文件迁移失败: {}", e);
            format!(
                "数据文件迁移失败: {}\n\n应用将不会自动重启，请解决问题后重启重试",
                e
            )
        })?;

    let mode_name = if enabled {
        "便携模式"
    } else {
        "标准模式"
    };
    let message = if migration_result.total_files == 0 {
        format!("已切换到{}，应用将重启以应用更改", mode_name)
    } else {
        let mut details = Vec::new();
        if migration_result.database_migrated {
            details.push("数据库文件".to_string());
        }
        if migration_result.database_backups_count > 0 {
            details.push(format!(
                "{} 个数据库备份",
                migration_result.database_backups_count
            ));
        }
        if migration_result.savedata_backups_count > 0 {
            details.push(format!(
                "{} 个存档备份",
                migration_result.savedata_backups_count
            ));
        }
        format!(
            "已切换到{}并移动了 {}，应用将重启",
            mode_name,
            details.join("、")
        )
    };

    Ok(PortableModeResult {
        requires_restart: true,
        database_migrated: migration_result.database_migrated,
        database_backups_count: migration_result.database_backups_count,
        savedata_backups_count: migration_result.savedata_backups_count,
        total_files: migration_result.total_files,
        message,
    })
}

/// 获取当前便携模式状态
///
/// 通过检查文件系统判断当前是否处于便携模式
/// - 便携模式：resources/data/reina_manager.db 存在
/// - 标准模式：resources/data/reina_manager.db 不存在
#[tauri::command]
pub async fn get_portable_mode(app: tauri::AppHandle) -> Result<bool, String> {
    use crate::utils::fs::is_portable_mode;
    Ok(is_portable_mode(&app))
}

// ==================== 合集相关 ====================

/// 创建合集
#[tauri::command]
pub async fn create_collection(
    db: State<'_, DatabaseConnection>,
    name: String,
    parent_id: Option<i32>,
    sort_order: i32,
    icon: Option<String>,
) -> Result<crate::entity::collections::Model, String> {
    CollectionsRepository::create(&db, name, parent_id, sort_order, icon)
        .await
        .map_err(|e| format!("创建合集失败: {}", e))
}

/// 根据 ID 查询合集
#[tauri::command]
pub async fn find_collection_by_id(
    db: State<'_, DatabaseConnection>,
    id: i32,
) -> Result<Option<crate::entity::collections::Model>, String> {
    CollectionsRepository::find_by_id(&db, id)
        .await
        .map_err(|e| format!("查询合集失败: {}", e))
}

/// 获取所有合集
#[tauri::command]
pub async fn find_all_collections(
    db: State<'_, DatabaseConnection>,
) -> Result<Vec<crate::entity::collections::Model>, String> {
    CollectionsRepository::find_all(&db)
        .await
        .map_err(|e| format!("获取所有合集失败: {}", e))
}

/// 获取根合集
#[tauri::command]
pub async fn find_root_collections(
    db: State<'_, DatabaseConnection>,
) -> Result<Vec<crate::entity::collections::Model>, String> {
    CollectionsRepository::find_root_collections(&db)
        .await
        .map_err(|e| format!("获取根合集失败: {}", e))
}

/// 获取子合集
#[tauri::command]
pub async fn find_child_collections(
    db: State<'_, DatabaseConnection>,
    parent_id: i32,
) -> Result<Vec<crate::entity::collections::Model>, String> {
    CollectionsRepository::find_children(&db, parent_id)
        .await
        .map_err(|e| format!("获取子合集失败: {}", e))
}

/// 更新合集
#[tauri::command]
pub async fn update_collection(
    db: State<'_, DatabaseConnection>,
    id: i32,
    name: Option<String>,
    parent_id: Option<Option<i32>>,
    sort_order: Option<i32>,
    icon: Option<Option<String>>,
) -> Result<crate::entity::collections::Model, String> {
    CollectionsRepository::update(&db, id, name, parent_id, sort_order, icon)
        .await
        .map_err(|e| format!("更新合集失败: {}", e))
}

/// 删除合集
#[tauri::command]
pub async fn delete_collection(db: State<'_, DatabaseConnection>, id: i32) -> Result<u64, String> {
    CollectionsRepository::delete(&db, id)
        .await
        .map(|result| result.rows_affected)
        .map_err(|e| format!("删除合集失败: {}", e))
}

/// 检查合集是否存在
#[tauri::command]
pub async fn collection_exists(db: State<'_, DatabaseConnection>, id: i32) -> Result<bool, String> {
    CollectionsRepository::exists(&db, id)
        .await
        .map_err(|e| format!("检查合集是否存在失败: {}", e))
}

/// 将游戏添加到合集
#[tauri::command]
pub async fn add_game_to_collection(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
    collection_id: i32,
    sort_order: i32,
) -> Result<crate::entity::game_collection_link::Model, String> {
    CollectionsRepository::add_game_to_collection(&db, game_id, collection_id, sort_order)
        .await
        .map_err(|e| format!("添加游戏到合集失败: {}", e))
}

/// 从合集中移除游戏
#[tauri::command]
pub async fn remove_game_from_collection(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
    collection_id: i32,
) -> Result<u64, String> {
    CollectionsRepository::remove_game_from_collection(&db, game_id, collection_id)
        .await
        .map(|result| result.rows_affected)
        .map_err(|e| format!("从合集中移除游戏失败: {}", e))
}

/// 获取合集中的所有游戏 ID
#[tauri::command]
pub async fn get_games_in_collection(
    db: State<'_, DatabaseConnection>,
    collection_id: i32,
) -> Result<Vec<i32>, String> {
    CollectionsRepository::get_games_in_collection(&db, collection_id)
        .await
        .map_err(|e| format!("获取合集中的游戏失败: {}", e))
}

/// 获取合集中的游戏数量
#[tauri::command]
pub async fn count_games_in_collection(
    db: State<'_, DatabaseConnection>,
    collection_id: i32,
) -> Result<u64, String> {
    CollectionsRepository::count_games_in_collection(&db, collection_id)
        .await
        .map_err(|e| format!("获取合集游戏数量失败: {}", e))
}

/// 批量更新分类中的游戏列表
#[tauri::command]
pub async fn update_category_games(
    db: State<'_, DatabaseConnection>,
    game_ids: Vec<i32>,
    collection_id: i32,
) -> Result<(), String> {
    CollectionsRepository::update_category_games(&db, game_ids, collection_id)
        .await
        .map_err(|e| format!("批量更新分类游戏失败: {}", e))
}

/// 检查游戏是否在合集中
#[tauri::command]
pub async fn is_game_in_collection(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
    collection_id: i32,
) -> Result<bool, String> {
    CollectionsRepository::is_game_in_collection(&db, game_id, collection_id)
        .await
        .map_err(|e| format!("检查游戏是否在合集中失败: {}", e))
}

/// 批量获取多个分组的游戏数量（优化版）
#[tauri::command]
pub async fn batch_count_games_in_groups(
    db: State<'_, DatabaseConnection>,
    group_ids: Vec<i32>,
) -> Result<std::collections::HashMap<i32, u64>, String> {
    CollectionsRepository::batch_count_games_in_groups(&db, group_ids)
        .await
        .map_err(|e| format!("批量获取分组游戏数量失败: {}", e))
}

/// 获取分组中的游戏总数
#[tauri::command]
pub async fn count_games_in_group(
    db: State<'_, DatabaseConnection>,
    group_id: i32,
) -> Result<u64, String> {
    CollectionsRepository::count_games_in_group(&db, group_id)
        .await
        .map_err(|e| format!("获取分组游戏数量失败: {}", e))
}

// ==================== 前端友好的组合 API ====================

/// 获取完整的分组-分类树（一次性返回所有数据）
#[tauri::command]
pub async fn get_collection_tree(
    db: State<'_, DatabaseConnection>,
) -> Result<Vec<GroupWithCategories>, String> {
    CollectionsRepository::get_collection_tree(&db)
        .await
        .map_err(|e| format!("获取分组树失败: {}", e))
}

/// 获取指定分组的分类列表（带游戏数量）
#[tauri::command]
pub async fn get_categories_with_count(
    db: State<'_, DatabaseConnection>,
    group_id: i32,
) -> Result<Vec<CategoryWithCount>, String> {
    CollectionsRepository::get_categories_with_count(&db, group_id)
        .await
        .map_err(|e| format!("获取分类列表失败: {}", e))
}
