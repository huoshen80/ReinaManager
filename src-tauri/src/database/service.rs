use sea_orm::DatabaseConnection;
use tauri::State;

use crate::database::dto::{
    BgmDataInput, GameWithRelatedUpdate, InsertGameData, OtherDataInput, VndbDataInput,
};
use crate::database::repository::{
    collections_repository::CollectionsRepository,
    game_stats_repository::{DailyStats, GameStatsRepository},
    games_repository::{FullGameData, GameType, GamesRepository, SortOption, SortOrder},
    settings_repository::SettingsRepository,
};
use crate::entity::{savedata, user};

// ==================== 游戏数据相关 ====================

/// 插入游戏数据（包含关联数据）
#[tauri::command]
pub async fn insert_game_with_related(
    db: State<'_, DatabaseConnection>,
    game: InsertGameData,
    bgm: Option<BgmDataInput>,
    vndb: Option<VndbDataInput>,
    other: Option<OtherDataInput>,
) -> Result<i32, String> {
    GamesRepository::insert_with_related(&db, game, bgm, vndb, other)
        .await
        .map_err(|e| format!("插入游戏数据失败: {}", e))
}

/// 根据 ID 查询完整游戏数据（包含关联数据）
#[tauri::command]
pub async fn find_full_game_by_id(
    db: State<'_, DatabaseConnection>,
    id: i32,
) -> Result<Option<FullGameData>, String> {
    GamesRepository::find_full_by_id(&db, id)
        .await
        .map_err(|e| format!("查询完整游戏数据失败: {}", e))
}

/// 获取所有游戏的完整数据（包含关联）
#[tauri::command]
pub async fn find_all_full_games(
    db: State<'_, DatabaseConnection>,
    sort_option: SortOption,
    sort_order: SortOrder,
) -> Result<Vec<FullGameData>, String> {
    GamesRepository::find_all_full(&db, sort_option, sort_order)
        .await
        .map_err(|e| format!("获取完整游戏列表失败: {}", e))
}

/// 根据类型筛选完整游戏数据（包含关联）
#[tauri::command]
pub async fn find_full_games_by_type(
    db: State<'_, DatabaseConnection>,
    game_type: GameType,
    sort_option: SortOption,
    sort_order: SortOrder,
) -> Result<Vec<FullGameData>, String> {
    GamesRepository::find_full_by_type(&db, game_type, sort_option, sort_order)
        .await
        .map_err(|e| format!("根据类型筛选完整游戏失败: {}", e))
}

/// 搜索完整游戏数据（包含关联）
#[tauri::command]
pub async fn search_full_games(
    db: State<'_, DatabaseConnection>,
    keyword: String,
    game_type: GameType,
    sort_option: SortOption,
    sort_order: SortOrder,
) -> Result<Vec<FullGameData>, String> {
    GamesRepository::search_full(&db, &keyword, game_type, sort_option, sort_order)
        .await
        .map_err(|e| format!("搜索完整游戏失败: {}", e))
}

/// 批量更新游戏数据（包含关联数据）
#[tauri::command]
pub async fn update_game_with_related(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
    updates: GameWithRelatedUpdate,
) -> Result<(), String> {
    GamesRepository::update_with_related(&db, game_id, updates)
        .await
        .map_err(|e| format!("批量更新游戏数据失败: {}", e))
}

/// 删除游戏
#[tauri::command]
pub async fn delete_game(db: State<'_, DatabaseConnection>, id: i32) -> Result<u64, String> {
    GamesRepository::delete(&db, id)
        .await
        .map(|result| result.rows_affected)
        .map_err(|e| format!("删除游戏失败: {}", e))
}

/// 删除指定游戏的 BGM 关联数据
#[tauri::command]
pub async fn delete_bgm_data(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
) -> Result<u64, String> {
    GamesRepository::delete_bgm_data(&db, game_id)
        .await
        .map_err(|e| format!("删除 BGM 关联数据失败: {}", e))
}

/// 删除指定游戏的 VNDB 关联数据
#[tauri::command]
pub async fn delete_vndb_data(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
) -> Result<u64, String> {
    GamesRepository::delete_vndb_data(&db, game_id)
        .await
        .map_err(|e| format!("删除 VNDB 关联数据失败: {}", e))
}

/// 删除指定游戏的 Other 关联数据
#[tauri::command]
pub async fn delete_other_data(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
) -> Result<u64, String> {
    GamesRepository::delete_other_data(&db, game_id)
        .await
        .map_err(|e| format!("删除 Other 关联数据失败: {}", e))
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

/// 根据 ID 获取备份记录
#[tauri::command]
pub async fn get_savedata_record_by_id(
    db: State<'_, DatabaseConnection>,
    backup_id: i32,
) -> Result<Option<savedata::Model>, String> {
    GamesRepository::get_savedata_record_by_id(&db, backup_id)
        .await
        .map_err(|e| format!("获取备份记录失败: {}", e))
}

/// 删除备份记录
#[tauri::command]
pub async fn delete_savedata_record(
    db: State<'_, DatabaseConnection>,
    backup_id: i32,
) -> Result<u64, String> {
    GamesRepository::delete_savedata_record(&db, backup_id)
        .await
        .map(|result| result.rows_affected)
        .map_err(|e| format!("删除备份记录失败: {}", e))
}

/// 批量删除指定游戏的所有备份记录
#[tauri::command]
pub async fn delete_all_savedata_by_game(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
) -> Result<u64, String> {
    GamesRepository::delete_all_savedata_by_game(&db, game_id)
        .await
        .map(|result| result.rows_affected)
        .map_err(|e| format!("删除所有备份记录失败: {}", e))
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
    db: State<'_, DatabaseConnection>,
    path: String,
) -> Result<(), String> {
    SettingsRepository::set_save_root_path(&db, path)
        .await
        .map_err(|e| format!("设置存档根路径失败: {}", e))
}

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
    bgm_token: Option<String>,
    save_root_path: Option<String>,
) -> Result<(), String> {
    SettingsRepository::update_settings(&db, bgm_token, save_root_path)
        .await
        .map_err(|e| format!("更新设置失败: {}", e))
}

/// 清除 BGM Token
#[tauri::command]
pub async fn clear_bgm_token(db: State<'_, DatabaseConnection>) -> Result<(), String> {
    SettingsRepository::clear_bgm_token(&db)
        .await
        .map_err(|e| format!("清除 BGM Token 失败: {}", e))
}

/// 清除存档根路径
#[tauri::command]
pub async fn clear_save_root_path(db: State<'_, DatabaseConnection>) -> Result<(), String> {
    SettingsRepository::clear_save_root_path(&db)
        .await
        .map_err(|e| format!("清除存档根路径失败: {}", e))
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

/// 根据关联 ID 删除
#[tauri::command]
pub async fn remove_collection_link_by_id(
    db: State<'_, DatabaseConnection>,
    link_id: i32,
) -> Result<u64, String> {
    CollectionsRepository::remove_link_by_id(&db, link_id)
        .await
        .map(|result| result.rows_affected)
        .map_err(|e| format!("删除关联失败: {}", e))
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

/// 获取游戏所属的所有合集 ID
#[tauri::command]
pub async fn get_collections_for_game(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
) -> Result<Vec<i32>, String> {
    CollectionsRepository::get_collections_for_game(&db, game_id)
        .await
        .map_err(|e| format!("获取游戏所属合集失败: {}", e))
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

/// 批量添加游戏到合集
#[tauri::command]
pub async fn add_games_to_collection(
    db: State<'_, DatabaseConnection>,
    game_ids: Vec<i32>,
    collection_id: i32,
) -> Result<(), String> {
    CollectionsRepository::add_games_to_collection(&db, game_ids, collection_id)
        .await
        .map_err(|e| format!("批量添加游戏到合集失败: {}", e))
}

/// 更新游戏在合集中的排序
#[tauri::command]
pub async fn update_game_sort_order_in_collection(
    db: State<'_, DatabaseConnection>,
    link_id: i32,
    new_sort_order: i32,
) -> Result<crate::entity::game_collection_link::Model, String> {
    CollectionsRepository::update_game_sort_order(&db, link_id, new_sort_order)
        .await
        .map_err(|e| format!("更新排序失败: {}", e))
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

/// 获取所有游戏-合集关联
#[tauri::command]
pub async fn get_all_collection_links(
    db: State<'_, DatabaseConnection>,
) -> Result<Vec<crate::entity::game_collection_link::Model>, String> {
    CollectionsRepository::get_all_links(&db)
        .await
        .map_err(|e| format!("获取所有关联失败: {}", e))
}

/// 清空合集中的所有游戏
#[tauri::command]
pub async fn clear_collection_games(
    db: State<'_, DatabaseConnection>,
    collection_id: i32,
) -> Result<u64, String> {
    CollectionsRepository::clear_collection(&db, collection_id)
        .await
        .map(|result| result.rows_affected)
        .map_err(|e| format!("清空合集失败: {}", e))
}
