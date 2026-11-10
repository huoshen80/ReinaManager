use sea_orm::{DatabaseConnection, TransactionTrait};
use tauri::State;

use crate::database::dto::{
    BatchOperationResult, FullGameData, InsertCollectionData, InsertGameData, UpdateCollectionData,
    UpdateGameData, UpdateSettingsData,
};
use crate::database::repository::{
    collections_repository::{
        CategoryWithCount, CollectionBackendSortField, CollectionsRepository, GroupWithCount,
    },
    game_stats_repository::{GameLastPlayed, GameStatsRepository, StatisticsDistribution},
    games_repository::{GameType, GamesRepository, NameDisplayPreferences, SortOption, SortOrder},
    settings_repository::SettingsRepository,
};
use crate::entity::{savedata, user};
use crate::game::cover::{assets, delete_game_cover_dir};

// ==================== 游戏数据相关 ====================

/// 插入游戏数据（聚合架构）
#[tauri::command]
pub async fn insert_game(
    db: State<'_, DatabaseConnection>,
    game: InsertGameData,
) -> Result<FullGameData, String> {
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
) -> Result<Option<FullGameData>, String> {
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
) -> Result<Vec<FullGameData>, String> {
    GamesRepository::find_all(&db, game_type, sort_option, sort_order, language)
        .await
        .map_err(|e| format!("获取游戏数据失败: {}", e))
}

/// 只返回排序/筛选后的游戏 ID 列表
///
/// 前端已缓存完整游戏数据，切换排序/筛选时只需传输 ID 数组，
/// 避免数 MB 级 JSON 反复穿过 IPC 桥梁。
#[tauri::command]
pub async fn find_game_ids(
    db: State<'_, DatabaseConnection>,
    game_type: GameType,
    sort_option: SortOption,
    sort_order: SortOrder,
    language: Option<String>,
    name_preferences: Option<NameDisplayPreferences>,
) -> Result<Vec<i32>, String> {
    GamesRepository::find_ids_with_name_preferences(
        &db,
        game_type,
        sort_option,
        sort_order,
        language,
        name_preferences.unwrap_or_default(),
    )
    .await
    .map_err(|e| format!("获取游戏 ID 列表失败: {}", e))
}

/// 更新游戏数据（聚合架构）
#[tauri::command]
pub async fn update_game(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
    mut updates: UpdateGameData,
) -> Result<FullGameData, String> {
    let _backup_guard = crate::backup::common::acquire_database_backup_operation_lock().await;
    if let Some(path) = updates.custom_cover_path.take() {
        let root = reina_path::get_base_data_dir()?.join("covers");
        save_game_with_custom_cover(&db, &root, game_id, updates, path.as_deref()).await
    } else {
        let previous = if updates.upsert_sources.is_some() || updates.remove_sources.is_some() {
            assets::game_asset_paths(&db, game_id as u32, Some("cloud")).await?
        } else {
            Vec::new()
        };
        let game = GamesRepository::update(&db, game_id, updates)
            .await
            .map_err(|e| format!("更新游戏数据失败: {e}"))?;
        assets::clean_replaced_files(&db, game_id as u32, previous).await;
        Ok(game)
    }
}

async fn save_game_with_custom_cover(
    db: &DatabaseConnection,
    root: &std::path::Path,
    game_id: i32,
    updates: UpdateGameData,
    image_path: Option<&str>,
) -> Result<FullGameData, String> {
    use crate::game::cover::{assets, custom::save_custom_cover};
    let previous = assets::game_asset_paths_at(db, game_id as u32, root, None).await?;
    let new_asset = if let Some(path) = image_path {
        let id = uuid::Uuid::now_v7().to_string();
        let extension = save_custom_cover(root, &id, std::path::Path::new(path)).await?;
        Some((id, extension))
    } else {
        None
    };
    let result = async {
        let transaction = db.begin().await.map_err(|e| e.to_string())?;
        assets::set_custom(
            &transaction,
            game_id as u32,
            new_asset
                .as_ref()
                .map(|(id, ext)| (id.as_str(), ext.as_str())),
        )
        .await?;
        let game = GamesRepository::update_aggregate(
            &transaction,
            game_id,
            updates.cleaned(),
            chrono::Utc::now().timestamp() as i32,
        )
        .await
        .map_err(|e| e.to_string())?;
        transaction.commit().await.map_err(|e| e.to_string())?;
        Ok(game)
    }
    .await;
    // 提交成功后清旧图，失败则回收本次新图；清理前仍核对数据库关联。
    let obsolete = if result.is_ok() {
        previous
    } else if let Some((id, ext)) = new_asset {
        vec![assets::asset_path(root, "custom", &id, &ext)?]
    } else {
        Vec::new()
    };
    assets::clean_replaced_files_at(db, game_id as u32, obsolete, root).await;
    result
}

/// 删除游戏
#[tauri::command]
pub async fn delete_game(db: State<'_, DatabaseConnection>, id: i32) -> Result<u64, String> {
    let _backup_guard = crate::backup::common::acquire_database_backup_operation_lock().await;
    let previous = crate::game::cover::assets::game_asset_paths(&db, id as u32, None).await?;
    let rows_affected = GamesRepository::delete(&db, id)
        .await
        .map(|result| result.rows_affected)
        .map_err(|e| format!("删除游戏失败: {}", e))?;

    if rows_affected > 0 {
        log::info!(
            "游戏删除成功 game_id={} rows_affected={}",
            id,
            rows_affected
        );
    }

    if rows_affected > 0
        && let Err(err) = delete_game_cover_dir(id).await
    {
        log::warn!("删除游戏封面目录失败 game_id={}: {}", id, err);
    }

    crate::game::cover::assets::clean_replaced_files(&db, id as u32, previous).await;
    Ok(rows_affected)
}

/// 批量删除游戏
#[tauri::command]
pub async fn delete_games_batch(
    db: State<'_, DatabaseConnection>,
    ids: Vec<i32>,
) -> Result<u64, String> {
    let _backup_guard = crate::backup::common::acquire_database_backup_operation_lock().await;
    let mut previous_files = Vec::new();
    for id in &ids {
        previous_files.push((
            *id,
            crate::game::cover::assets::game_asset_paths(&db, *id as u32, None).await?,
        ));
    }
    let rows_affected = GamesRepository::delete_many(&db, ids.clone())
        .await
        .map(|result| result.rows_affected)
        .map_err(|e| format!("批量删除游戏失败: {}", e))?;
    let requested_count = ids.len();
    for (id, files) in previous_files {
        crate::game::cover::assets::clean_replaced_files(&db, id as u32, files).await;
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

    log::info!(
        "批量删除游戏完成 requested_count={} rows_affected={}",
        requested_count,
        rows_affected
    );

    Ok(rows_affected)
}

/// 获取游戏总数
#[tauri::command]
pub async fn count_games(db: State<'_, DatabaseConnection>) -> Result<u64, String> {
    GamesRepository::count(&db)
        .await
        .map_err(|e| format!("获取游戏总数失败: {}", e))
}

/// 获取指定 source 的全部游戏绑定
#[tauri::command]
pub async fn get_source_bindings(
    db: State<'_, DatabaseConnection>,
    source: String,
) -> Result<Vec<(i32, String)>, String> {
    GamesRepository::get_source_bindings(&db, &source)
        .await
        .map_err(|e| format!("获取 source ID 列表失败: {}", e))
}

/// 批量更新游戏数据
///
/// 使用单个事务处理所有更新操作，性能远优于逐个更新
#[tauri::command]
pub async fn update_games_batch(
    db: State<'_, DatabaseConnection>,
    updates: Vec<(i32, UpdateGameData)>,
) -> Result<Vec<FullGameData>, String> {
    let _backup_guard = crate::backup::common::acquire_database_backup_operation_lock().await;
    let mut previous = Vec::new();
    for (id, update) in &updates {
        if update.upsert_sources.is_some() || update.remove_sources.is_some() {
            previous.push((
                *id,
                assets::game_asset_paths(&db, *id as u32, Some("cloud")).await?,
            ));
        }
    }
    let games = GamesRepository::update_batch(&db, updates)
        .await
        .map_err(|e| format!("批量更新数据失败: {e}"))?;
    for (id, paths) in previous {
        assets::clean_replaced_files(&db, id as u32, paths).await;
    }
    Ok(games)
}

// ==================== 存档备份相关 ====================

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

/// 手动创建游戏会话
#[tauri::command]
pub async fn create_manual_game_session(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
    start_time: i32,
    duration: i32,
) -> Result<i32, String> {
    GameStatsRepository::create_manual_session(&db, game_id, start_time, duration)
        .await
        .map(|session| session.session_id)
        .map_err(|e| format!("创建游戏会话失败: {}", e))
}

/// 修复/调试命令：从全部事实会话重建指定游戏的统计投影
///
/// 常规会话增删已在事务内同步维护统计，不应调用此命令。
#[tauri::command]
pub async fn rebuild_game_statistics(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
) -> Result<(), String> {
    GameStatsRepository::rebuild_statistics(&db, game_id)
        .await
        .map_err(|e| format!("重建游戏统计失败: {}", e))
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

/// 获取指定游戏范围内的全局最近会话
#[tauri::command]
pub async fn get_recent_sessions_for_all(
    db: State<'_, DatabaseConnection>,
    game_ids: Vec<i32>,
    limit: u64,
    offset: u64,
) -> Result<Vec<crate::entity::game_sessions::Model>, String> {
    GameStatsRepository::get_recent_sessions_for_all(&db, game_ids, limit, offset)
        .await
        .map_err(|e| format!("获取最近会话失败: {}", e))
}

/// 删除游戏会话
#[tauri::command]
pub async fn delete_game_session(
    db: State<'_, DatabaseConnection>,
    session_id: i32,
) -> Result<i32, String> {
    GameStatsRepository::delete_session_with_statistics(&db, session_id)
        .await
        .map_err(|e| format!("删除游戏会话失败: {}", e))
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

/// 获取所有游戏统计信息
#[tauri::command]
pub async fn get_all_game_statistics(
    db: State<'_, DatabaseConnection>,
) -> Result<Vec<crate::entity::game_statistics::Model>, String> {
    GameStatsRepository::get_all_statistics(&db)
        .await
        .map_err(|e| format!("获取所有游戏统计失败: {}", e))
}

/// 获取所有游戏的最近游玩时间
#[tauri::command]
pub async fn get_all_game_last_played(
    db: State<'_, DatabaseConnection>,
) -> Result<Vec<GameLastPlayed>, String> {
    GameStatsRepository::get_all_last_played(&db)
        .await
        .map_err(|e| format!("获取所有游戏最近游玩时间失败: {}", e))
}

/// 获取指定游戏和日期范围内的游玩时段分布
#[tauri::command]
pub async fn get_statistics_distribution(
    db: State<'_, DatabaseConnection>,
    game_ids: Vec<i32>,
    start_date: String,
    end_date: String,
) -> Result<StatisticsDistribution, String> {
    GameStatsRepository::get_statistics_distribution(&db, game_ids, &start_date, &end_date)
        .await
        .map_err(|e| format!("获取游玩时段分布失败: {}", e))
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

fn validate_collection_sort(
    sort_field: Option<CollectionBackendSortField>,
    sort_order: Option<SortOrder>,
) -> Result<Option<(CollectionBackendSortField, SortOrder)>, String> {
    match (sort_field, sort_order) {
        (None, None) => Ok(None),
        (Some(sort_field), Some(sort_order)) => Ok(Some((sort_field, sort_order))),
        _ => Err("排序字段和排序方向必须同时提供".to_string()),
    }
}

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

/// 获取根合集
#[tauri::command]
pub async fn find_root_collections(
    db: State<'_, DatabaseConnection>,
) -> Result<Vec<crate::entity::collections::Model>, String> {
    CollectionsRepository::find_root_collections(&db)
        .await
        .map_err(|e| format!("获取根合集失败: {}", e))
}

/// 获取根分组列表（带游戏数量）
#[tauri::command]
pub async fn get_root_collections_with_count(
    db: State<'_, DatabaseConnection>,
    sort_field: Option<CollectionBackendSortField>,
    sort_order: Option<SortOrder>,
) -> Result<Vec<GroupWithCount>, String> {
    let sort = validate_collection_sort(sort_field, sort_order)?;
    CollectionsRepository::get_root_collections_with_count(&db, sort)
        .await
        .map_err(|e| format!("获取根分组列表失败: {}", e))
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

/// 从单个合集中批量移除游戏
#[tauri::command]
pub async fn remove_games_from_collection(
    db: State<'_, DatabaseConnection>,
    game_ids: Vec<i32>,
    collection_id: i32,
) -> Result<u64, String> {
    CollectionsRepository::remove_games_from_collection(&db, game_ids, collection_id)
        .await
        .map(|result| result.rows_affected)
        .map_err(|e| format!("从合集中批量移除游戏失败: {}", e))
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

/// 获取游戏所在的所有合集 ID
#[tauri::command]
pub async fn get_game_collection_ids(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
) -> Result<Vec<i32>, String> {
    CollectionsRepository::get_game_collection_ids(&db, game_id)
        .await
        .map_err(|e| format!("获取游戏所在合集失败: {}", e))
}

/// 批量将多个游戏添加到多个合集
#[tauri::command]
pub async fn add_games_to_collections(
    db: State<'_, DatabaseConnection>,
    game_ids: Vec<i32>,
    collection_ids: Vec<i32>,
) -> Result<(), String> {
    CollectionsRepository::add_games_to_collections(&db, game_ids, collection_ids)
        .await
        .map_err(|e| format!("批量添加游戏到合集失败: {}", e))
}

/// 设置单个游戏所在的合集列表
#[tauri::command]
pub async fn set_game_collections(
    db: State<'_, DatabaseConnection>,
    game_id: i32,
    collection_ids: Vec<i32>,
) -> Result<(), String> {
    CollectionsRepository::set_game_collections(&db, game_id, collection_ids)
        .await
        .map_err(|e| format!("设置游戏合集失败: {}", e))
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

/// 仅调整分类内的游戏顺序，不增删成员。
#[tauri::command]
pub async fn reorder_category_games(
    db: State<'_, DatabaseConnection>,
    ordered_game_ids: Vec<i32>,
    collection_id: i32,
) -> Result<(), String> {
    CollectionsRepository::reorder_category_games(&db, ordered_game_ids, collection_id)
        .await
        .map_err(|e| format!("调整分类游戏顺序失败: {}", e))
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

/// 获取指定分组的分类列表（带游戏数量）
#[tauri::command]
pub async fn get_categories_with_count(
    db: State<'_, DatabaseConnection>,
    group_id: i32,
    sort_field: Option<CollectionBackendSortField>,
    sort_order: Option<SortOrder>,
) -> Result<Vec<CategoryWithCount>, String> {
    let sort = validate_collection_sort(sort_field, sort_order)?;
    CollectionsRepository::get_categories_with_count(&db, group_id, sort)
        .await
        .map_err(|e| format!("获取分类列表失败: {}", e))
}

#[cfg(test)]
mod cover_tests {
    use super::*;
    use crate::database::repository::games_repository::tests::{insert_data, setup_database};
    use crate::game::cover::assets::tests::{png, temporary_root};
    use sea_orm::ConnectionTrait;
    use std::path::PathBuf;

    async fn fixture() -> (DatabaseConnection, PathBuf, FullGameData) {
        let db = setup_database().await;
        let root = temporary_root();
        std::fs::create_dir_all(&root).unwrap();
        let source = root.join("selected.png");
        std::fs::write(&source, png()).unwrap();
        let game = GamesRepository::insert(&db, insert_data("custom", None, vec![]))
            .await
            .unwrap();
        let saved = save_game_with_custom_cover(
            &db,
            &root,
            game.id,
            UpdateGameData::default(),
            source.to_str(),
        )
        .await
        .unwrap();
        (db, root, saved)
    }

    #[tokio::test]
    async fn replace_and_remove_custom_cover_without_affecting_other_updates() {
        let (db, root, game) = fixture().await;
        let original = game.custom_cover.unwrap();
        let custom_dir = root.join("custom");
        assert_eq!(std::fs::read(custom_dir.join(&original)).unwrap(), png());
        let ordinary = GamesRepository::update(
            &db,
            game.id,
            UpdateGameData {
                custom_data: Some(None),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        assert_eq!(ordinary.custom_cover.as_deref(), Some(original.as_str()));

        let replacement = save_game_with_custom_cover(
            &db,
            &root,
            game.id,
            UpdateGameData {
                clear: Some(Some(1)),
                ..Default::default()
            },
            root.join("selected.png").to_str(),
        )
        .await
        .unwrap();
        assert_eq!(replacement.clear, Some(1));
        let reference = replacement.custom_cover.unwrap();
        assert_ne!(original, reference);
        assert!(!custom_dir.join(original).exists());
        assert_eq!(std::fs::read(custom_dir.join(&reference)).unwrap(), png());
        let removed =
            save_game_with_custom_cover(&db, &root, game.id, UpdateGameData::default(), None)
                .await
                .unwrap();
        assert!(removed.custom_cover.is_none());
        assert!(!custom_dir.join(reference).exists());
        assert!(root.join("selected.png").is_file());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn failed_save_preserves_profile_and_old_cover_and_cleans_new_file() {
        let (db, root, game) = fixture().await;
        let source = root.join("selected.png");
        std::fs::write(&source, b"invalid image").unwrap();
        assert!(
            save_game_with_custom_cover(
                &db,
                &root,
                game.id,
                UpdateGameData::default(),
                source.to_str()
            )
            .await
            .is_err()
        );
        std::fs::write(&source, png()).unwrap();
        db.execute_unprepared("CREATE TRIGGER reject_profile BEFORE UPDATE ON games BEGIN SELECT RAISE(ABORT, 'fixture failure'); END").await.unwrap();
        // 替换和移除都必须随资料事务一起回滚。
        for path in [source.to_str(), None] {
            assert!(
                save_game_with_custom_cover(
                    &db,
                    &root,
                    game.id,
                    UpdateGameData {
                        clear: Some(Some(1)),
                        ..Default::default()
                    },
                    path
                )
                .await
                .is_err()
            );
        }
        let unchanged = GamesRepository::find_by_id(&db, game.id)
            .await
            .unwrap()
            .unwrap();
        assert_eq!(unchanged.custom_cover, game.custom_cover);
        assert_eq!(unchanged.clear, game.clear);
        assert!(
            root.join("custom")
                .join(game.custom_cover.unwrap())
                .is_file()
        );
        assert_eq!(std::fs::read_dir(root.join("custom")).unwrap().count(), 1);
        assert!(source.is_file());
        std::fs::remove_dir_all(root).unwrap();
    }
}
