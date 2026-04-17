use sea_orm::DatabaseConnection;
use tauri::State;

use crate::database::dto::{
    BatchOperationResult, InsertCollectionData, InsertGameData, UpdateCollectionData,
    UpdateGameData, UpdateSettingsData,
};
use crate::database::repository::{
    collections_repository::{CategoryWithCount, CollectionsRepository, GroupWithCategories},
    game_stats_repository::{DailyStats, GameStatsRepository},
    games_repository::{GameType, GamesRepository, SortOption, SortOrder},
    settings_repository::SettingsRepository,
};
use crate::entity::{games, savedata, user};
use crate::utils::fs::delete_game_cover_dir;
use crate::utils::game_cover::DownloadState;

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

#[tauri::command]
pub async fn insert_games_batch(
    db: State<'_, DatabaseConnection>,
    games: Vec<InsertGameData>,
) -> Result<BatchOperationResult, String> {
    Ok(GamesRepository::insert_batch(&db, games).await)
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
    language: Option<String>,
) -> Result<Vec<games::Model>, String> {
    GamesRepository::find_all(&db, game_type, sort_option, sort_order, language)
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
pub async fn delete_game(
    db: State<'_, DatabaseConnection>,
    cover_state: State<'_, DownloadState>,
    id: i32,
) -> Result<u64, String> {
    let rows_affected = GamesRepository::delete(&db, id)
        .await
        .map(|result| result.rows_affected)
        .map_err(|e| format!("删除游戏失败: {}", e))?;

    if rows_affected > 0 {
        cover_state.mark_game_deleted(id as u32).await;
    }

    if rows_affected > 0
        && let Err(err) = delete_game_cover_dir(id).await
    {
        log::warn!("删除游戏封面目录失败 game_id={}: {}", id, err);
    }

    Ok(rows_affected)
}

/// 批量删除游戏
#[tauri::command]
pub async fn delete_games_batch(
    db: State<'_, DatabaseConnection>,
    cover_state: State<'_, DownloadState>,
    ids: Vec<i32>,
) -> Result<u64, String> {
    let rows_affected = GamesRepository::delete_many(&db, ids.clone())
        .await
        .map(|result| result.rows_affected)
        .map_err(|e| format!("批量删除游戏失败: {}", e))?;

    for game_id in &ids {
        if *game_id > 0 {
            cover_state.mark_game_deleted(*game_id as u32).await;
        }
    }

    for game_id in ids {
        if let Err(err) = delete_game_cover_dir(game_id).await {
            log::warn!(
                "批量删除时清理游戏封面目录失败 game_id={}: {}",
                game_id,
                err
            );
        }
    }

    Ok(rows_affected)
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

/// 获取所有设置
#[tauri::command]
pub async fn get_all_settings(db: State<'_, DatabaseConnection>) -> Result<user::Model, String> {
    SettingsRepository::get_all_settings(&db)
        .await
        .map_err(|e| format!("获取所有设置失败: {}", e))
}

/// 批量更新设置
#[tauri::command]
pub async fn update_settings(
    db: State<'_, DatabaseConnection>,
    data: UpdateSettingsData,
) -> Result<(), String> {
    let data = data.cleaned(); // 清洗空字符串

    SettingsRepository::update_settings(&db, data)
        .await
        .map_err(|e| format!("更新设置失败: {}", e))
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
    let data = InsertCollectionData {
        name,
        parent_id,
        sort_order,
        icon,
    }
    .cleaned(); // 清洗空字符串

    CollectionsRepository::create(&db, data)
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
    let data = UpdateCollectionData {
        name,
        parent_id,
        sort_order,
        icon,
    }
    .cleaned(); // 清洗空字符串

    CollectionsRepository::update(&db, id, data)
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
