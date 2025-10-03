use crate::database::dto::{
    BgmDataInput, GameWithRelatedUpdate, InsertGameData, IntoActiveModel, OtherDataInput,
    VndbDataInput,
};
use crate::entity::prelude::*;
use crate::entity::{bgm_data, games, other_data, savedata, vndb_data};
use sea_orm::*;
use serde::{Deserialize, Serialize};

/// 游戏数据排序选项
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SortOption {
    Addtime,
    Datetime,
    LastPlayed,
    BGMRank,
    VNDBRank,
}

/// 排序方向
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SortOrder {
    Asc,
    Desc,
}

/// 游戏类型筛选
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GameType {
    All,
    Local,
    Online,
    NoClear,
    Clear,
}

/// 完整的游戏数据，包含关联的 BGM、VNDB 和其他数据
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FullGameData {
    pub game: games::Model,
    pub bgm_data: Option<bgm_data::Model>,
    pub vndb_data: Option<vndb_data::Model>,
    pub other_data: Option<other_data::Model>,
}

/// 游戏数据仓库
pub struct GamesRepository;

impl GamesRepository {
    // ==================== 游戏 CRUD 操作 ====================

    /// 批量插入游戏数据（包含关联数据）
    pub async fn insert_with_related(
        db: &DatabaseConnection,
        game: InsertGameData,
        bgm: Option<BgmDataInput>,
        vndb: Option<VndbDataInput>,
        other: Option<OtherDataInput>,
    ) -> Result<i32, DbErr> {
        let txn = db.begin().await?;

        // 构建 ActiveModel 并插入游戏基础数据
        let now = chrono::Utc::now().timestamp() as i32;
        let game_active = games::ActiveModel {
            id: NotSet,
            bgm_id: Set(game.bgm_id),
            vndb_id: Set(game.vndb_id),
            id_type: Set(game.id_type),
            date: Set(game.date),
            localpath: Set(game.localpath),
            savepath: Set(game.savepath),
            autosave: Set(game.autosave),
            clear: Set(game.clear),
            custom_name: Set(game.custom_name),
            custom_cover: Set(game.custom_cover),
            created_at: Set(Some(now)),
            updated_at: Set(Some(now)),
        };

        let game_model = game_active.insert(&txn).await?;
        let game_id = game_model.id;

        // 使用辅助函数插入关联数据
        Self::insert_bgm_data(&txn, game_id, bgm).await?;
        Self::insert_vndb_data(&txn, game_id, vndb).await?;
        Self::insert_other_data(&txn, game_id, other).await?;

        txn.commit().await?;
        Ok(game_id)
    }

    /// 批量更新游戏数据（包含关联数据）
    pub async fn update_with_related(
        db: &DatabaseConnection,
        game_id: i32,
        updates: GameWithRelatedUpdate,
    ) -> Result<(), DbErr> {
        let txn = db.begin().await?;

        // 更新游戏基础数据（如果有）
        if let Some(g) = updates.game {
            let game_active = games::ActiveModel {
                id: Set(game_id),
                bgm_id: g.bgm_id.map_or(NotSet, Set),
                vndb_id: g.vndb_id.map_or(NotSet, Set),
                id_type: g.id_type.map_or(NotSet, Set),
                date: g.date.map_or(NotSet, Set),
                localpath: g.localpath.map_or(NotSet, Set),
                savepath: g.savepath.map_or(NotSet, Set),
                autosave: g.autosave.map_or(NotSet, Set),
                clear: g.clear.map_or(NotSet, Set),
                custom_name: g.custom_name.map_or(NotSet, Set),
                custom_cover: g.custom_cover.map_or(NotSet, Set),
                updated_at: Set(Some(chrono::Utc::now().timestamp() as i32)),
                ..Default::default()
            };
            game_active.update(&txn).await?;
        }

        // 使用辅助函数更新或插入关联数据
        Self::upsert_bgm_data(&txn, game_id, updates.bgm_data).await?;
        Self::upsert_vndb_data(&txn, game_id, updates.vndb_data).await?;
        Self::upsert_other_data(&txn, game_id, updates.other_data).await?;

        txn.commit().await?;
        Ok(())
    }

    // ==================== 私有辅助函数 ====================

    /// 插入 BGM 关联数据
    async fn insert_bgm_data(
        txn: &DatabaseTransaction,
        game_id: i32,
        data: Option<BgmDataInput>,
    ) -> Result<(), DbErr> {
        if let Some(input) = data {
            input.into_active_model(game_id).insert(txn).await?;
        }
        Ok(())
    }

    /// 插入 VNDB 关联数据
    async fn insert_vndb_data(
        txn: &DatabaseTransaction,
        game_id: i32,
        data: Option<VndbDataInput>,
    ) -> Result<(), DbErr> {
        if let Some(input) = data {
            input.into_active_model(game_id).insert(txn).await?;
        }
        Ok(())
    }

    /// 插入 Other 关联数据
    async fn insert_other_data(
        txn: &DatabaseTransaction,
        game_id: i32,
        data: Option<OtherDataInput>,
    ) -> Result<(), DbErr> {
        if let Some(input) = data {
            input.into_active_model(game_id).insert(txn).await?;
        }
        Ok(())
    }

    /// 更新或插入 BGM 关联数据
    async fn upsert_bgm_data(
        txn: &DatabaseTransaction,
        game_id: i32,
        data: Option<BgmDataInput>,
    ) -> Result<(), DbErr> {
        if let Some(input) = data {
            let active_model = input.into_active_model(game_id);
            let existing = BgmData::find_by_id(game_id).one(txn).await?;
            if existing.is_some() {
                active_model.update(txn).await?;
            } else {
                active_model.insert(txn).await?;
            }
        }
        Ok(())
    }

    /// 更新或插入 VNDB 关联数据
    async fn upsert_vndb_data(
        txn: &DatabaseTransaction,
        game_id: i32,
        data: Option<VndbDataInput>,
    ) -> Result<(), DbErr> {
        if let Some(input) = data {
            let active_model = input.into_active_model(game_id);
            let existing = VndbData::find_by_id(game_id).one(txn).await?;
            if existing.is_some() {
                active_model.update(txn).await?;
            } else {
                active_model.insert(txn).await?;
            }
        }
        Ok(())
    }

    /// 更新或插入 Other 关联数据
    async fn upsert_other_data(
        txn: &DatabaseTransaction,
        game_id: i32,
        data: Option<OtherDataInput>,
    ) -> Result<(), DbErr> {
        if let Some(input) = data {
            let active_model = input.into_active_model(game_id);
            let existing = OtherData::find_by_id(game_id).one(txn).await?;
            if existing.is_some() {
                active_model.update(txn).await?;
            } else {
                active_model.insert(txn).await?;
            }
        }
        Ok(())
    }

    // ==================== 查询操作 ====================

    /// 根据 ID 查询完整游戏数据（包含关联数据）
    pub async fn find_full_by_id(
        db: &DatabaseConnection,
        id: i32,
    ) -> Result<Option<FullGameData>, DbErr> {
        let game = match Games::find_by_id(id).one(db).await? {
            Some(g) => g,
            None => return Ok(None),
        };

        let bgm = BgmData::find_by_id(id).one(db).await?;
        let vndb = VndbData::find_by_id(id).one(db).await?;
        let other = OtherData::find_by_id(id).one(db).await?;

        Ok(Some(FullGameData {
            game,
            bgm_data: bgm,
            vndb_data: vndb,
            other_data: other,
        }))
    }

    /// 获取所有游戏的完整数据（包含关联）
    pub async fn find_all_full(
        db: &DatabaseConnection,
        sort_option: SortOption,
        sort_order: SortOrder,
    ) -> Result<Vec<FullGameData>, DbErr> {
        // 1. 使用通用方法获取排序后的游戏列表
        let games = Self::find_with_sort(db, GameType::All, None, sort_option, sort_order).await?;

        // 2. 如果没有游戏，直接返回空列表
        if games.is_empty() {
            return Ok(Vec::new());
        }

        // 3. 批量查询关联数据
        let game_ids: Vec<i32> = games.iter().map(|g| g.id).collect();

        let bgm_data_list = BgmData::find()
            .filter(bgm_data::Column::GameId.is_in(game_ids.clone()))
            .all(db)
            .await?;

        let vndb_data_list = VndbData::find()
            .filter(vndb_data::Column::GameId.is_in(game_ids.clone()))
            .all(db)
            .await?;

        let other_data_list = OtherData::find()
            .filter(other_data::Column::GameId.is_in(game_ids))
            .all(db)
            .await?;

        // 4. 构建 HashMap 方便查找
        use std::collections::HashMap;
        let bgm_map: HashMap<i32, bgm_data::Model> =
            bgm_data_list.into_iter().map(|d| (d.game_id, d)).collect();
        let vndb_map: HashMap<i32, vndb_data::Model> =
            vndb_data_list.into_iter().map(|d| (d.game_id, d)).collect();
        let other_map: HashMap<i32, other_data::Model> = other_data_list
            .into_iter()
            .map(|d| (d.game_id, d))
            .collect();

        // 5. 组合数据
        let full_games = games
            .into_iter()
            .map(|game| FullGameData {
                game: game.clone(),
                bgm_data: bgm_map.get(&game.id).cloned(),
                vndb_data: vndb_map.get(&game.id).cloned(),
                other_data: other_map.get(&game.id).cloned(),
            })
            .collect();

        Ok(full_games)
    }

    /// 根据类型筛选完整游戏数据（包含关联）
    pub async fn find_full_by_type(
        db: &DatabaseConnection,
        game_type: GameType,
        sort_option: SortOption,
        sort_order: SortOrder,
    ) -> Result<Vec<FullGameData>, DbErr> {
        // 1. 使用通用方法获取排序后的游戏列表
        let games = Self::find_with_sort(db, game_type, None, sort_option, sort_order).await?;

        // 2. 如果没有游戏，直接返回空列表
        if games.is_empty() {
            return Ok(Vec::new());
        }

        // 3. 批量查询关联数据
        let game_ids: Vec<i32> = games.iter().map(|g| g.id).collect();

        let bgm_data_list = BgmData::find()
            .filter(bgm_data::Column::GameId.is_in(game_ids.clone()))
            .all(db)
            .await?;

        let vndb_data_list = VndbData::find()
            .filter(vndb_data::Column::GameId.is_in(game_ids.clone()))
            .all(db)
            .await?;

        let other_data_list = OtherData::find()
            .filter(other_data::Column::GameId.is_in(game_ids))
            .all(db)
            .await?;

        // 4. 构建 HashMap 方便查找
        use std::collections::HashMap;
        let bgm_map: HashMap<i32, bgm_data::Model> =
            bgm_data_list.into_iter().map(|d| (d.game_id, d)).collect();
        let vndb_map: HashMap<i32, vndb_data::Model> =
            vndb_data_list.into_iter().map(|d| (d.game_id, d)).collect();
        let other_map: HashMap<i32, other_data::Model> = other_data_list
            .into_iter()
            .map(|d| (d.game_id, d))
            .collect();

        // 5. 组合数据
        let full_games = games
            .into_iter()
            .map(|game| FullGameData {
                game: game.clone(),
                bgm_data: bgm_map.get(&game.id).cloned(),
                vndb_data: vndb_map.get(&game.id).cloned(),
                other_data: other_map.get(&game.id).cloned(),
            })
            .collect();

        Ok(full_games)
    }

    /// 搜索完整游戏数据（包含关联）
    pub async fn search_full(
        db: &DatabaseConnection,
        keyword: &str,
        game_type: GameType,
        sort_option: SortOption,
        sort_order: SortOrder,
    ) -> Result<Vec<FullGameData>, DbErr> {
        // 1. 使用通用方法获取排序后的游戏列表
        let keyword_opt = if keyword.trim().is_empty() {
            None
        } else {
            Some(keyword)
        };
        let games =
            Self::find_with_sort(db, game_type, keyword_opt, sort_option, sort_order).await?;

        // 2. 如果没有游戏，直接返回空列表
        if games.is_empty() {
            return Ok(Vec::new());
        }

        // 3. 批量查询关联数据
        let game_ids: Vec<i32> = games.iter().map(|g| g.id).collect();

        let bgm_data_list = BgmData::find()
            .filter(bgm_data::Column::GameId.is_in(game_ids.clone()))
            .all(db)
            .await?;

        let vndb_data_list = VndbData::find()
            .filter(vndb_data::Column::GameId.is_in(game_ids.clone()))
            .all(db)
            .await?;

        let other_data_list = OtherData::find()
            .filter(other_data::Column::GameId.is_in(game_ids))
            .all(db)
            .await?;

        // 4. 构建 HashMap 方便查找
        use std::collections::HashMap;
        let bgm_map: HashMap<i32, bgm_data::Model> =
            bgm_data_list.into_iter().map(|d| (d.game_id, d)).collect();
        let vndb_map: HashMap<i32, vndb_data::Model> =
            vndb_data_list.into_iter().map(|d| (d.game_id, d)).collect();
        let other_map: HashMap<i32, other_data::Model> = other_data_list
            .into_iter()
            .map(|d| (d.game_id, d))
            .collect();

        // 5. 组合数据
        let full_games = games
            .into_iter()
            .map(|game| FullGameData {
                game: game.clone(),
                bgm_data: bgm_map.get(&game.id).cloned(),
                vndb_data: vndb_map.get(&game.id).cloned(),
                other_data: other_map.get(&game.id).cloned(),
            })
            .collect();

        Ok(full_games)
    }

    /// 删除游戏（级联删除关联数据）
    pub async fn delete(db: &DatabaseConnection, id: i32) -> Result<DeleteResult, DbErr> {
        Games::delete_by_id(id).exec(db).await
    }

    /// 删除指定游戏的 BGM 关联数据
    pub async fn delete_bgm_data(db: &DatabaseConnection, game_id: i32) -> Result<u64, DbErr> {
        let res = BgmData::delete_by_id(game_id).exec(db).await?;
        Ok(res.rows_affected)
    }

    /// 删除指定游戏的 VNDB 关联数据
    pub async fn delete_vndb_data(db: &DatabaseConnection, game_id: i32) -> Result<u64, DbErr> {
        let res = VndbData::delete_by_id(game_id).exec(db).await?;
        Ok(res.rows_affected)
    }

    /// 删除指定游戏的 Other 关联数据
    pub async fn delete_other_data(db: &DatabaseConnection, game_id: i32) -> Result<u64, DbErr> {
        let res = OtherData::delete_by_id(game_id).exec(db).await?;
        Ok(res.rows_affected)
    }

    /// 批量删除游戏
    pub async fn delete_many(
        db: &DatabaseConnection,
        ids: Vec<i32>,
    ) -> Result<DeleteResult, DbErr> {
        Games::delete_many()
            .filter(games::Column::Id.is_in(ids))
            .exec(db)
            .await
    }

    /// 获取游戏总数
    pub async fn count(db: &DatabaseConnection) -> Result<u64, DbErr> {
        Games::find().count(db).await
    }

    /// 通用的查询构建器：应用类型筛选和关键词搜索
    fn build_base_query(game_type: GameType, keyword: Option<&str>) -> Select<Games> {
        let mut query = Games::find();

        // 应用类型筛选
        query = match game_type {
            GameType::All => query,
            GameType::Local => query.filter(
                games::Column::Localpath
                    .is_not_null()
                    .and(games::Column::Localpath.ne("")),
            ),
            GameType::Online => query.filter(
                games::Column::Localpath
                    .is_null()
                    .or(games::Column::Localpath.eq("")),
            ),
            GameType::NoClear => query.filter(games::Column::Clear.eq(0)),
            GameType::Clear => query.filter(games::Column::Clear.eq(1)),
        };

        // 应用关键词搜索
        if let Some(kw) = keyword {
            if !kw.trim().is_empty() {
                let keyword_pattern = format!("%{}%", kw);
                query = query.filter(
                    Condition::any()
                        .add(games::Column::CustomName.like(&keyword_pattern))
                        .add(games::Column::Localpath.like(&keyword_pattern)),
                );
            }
        }

        query
    }

    /// 通用的排序和查询方法
    async fn find_with_sort(
        db: &DatabaseConnection,
        game_type: GameType,
        keyword: Option<&str>,
        sort_option: SortOption,
        sort_order: SortOrder,
    ) -> Result<Vec<games::Model>, DbErr> {
        use crate::entity::game_statistics;

        let order = match sort_order {
            SortOrder::Asc => Order::Asc,
            SortOrder::Desc => Order::Desc,
        };

        // 根据排序选项决定是否需要 JOIN
        match sort_option {
            SortOption::Addtime => {
                let mut query = Self::build_base_query(game_type, keyword);
                query = match sort_order {
                    SortOrder::Asc => query.order_by_asc(games::Column::Id),
                    SortOrder::Desc => query.order_by_desc(games::Column::Id),
                };
                query.all(db).await
            }
            SortOption::Datetime => {
                let mut query = Self::build_base_query(game_type, keyword);
                query = match sort_order {
                    SortOrder::Asc => query.order_by_asc(games::Column::Date),
                    SortOrder::Desc => query.order_by_desc(games::Column::Date),
                };
                query.all(db).await
            }
            SortOption::LastPlayed => {
                // LEFT JOIN game_statistics
                let mut query =
                    Self::build_base_query(game_type, keyword).left_join(game_statistics::Entity);
                query = query
                    .order_by(game_statistics::Column::LastPlayed, Order::Desc)
                    .order_by_asc(games::Column::Id);
                query.all(db).await
            }
            SortOption::BGMRank => {
                // LEFT JOIN bgm_data
                // 注意：rank 越小越好（第1名 > 第100名），所以排序需要反转
                let mut query = Self::build_base_query(game_type, keyword).left_join(BgmData);
                let bgm_order = match sort_order {
                    SortOrder::Asc => Order::Desc, // 用户要升序 -> rank 从大到小
                    SortOrder::Desc => Order::Asc, // 用户要降序 -> rank 从小到大（最佳在前）
                };
                query = query
                    .order_by(bgm_data::Column::Rank, bgm_order)
                    .order_by_asc(games::Column::Id);
                query.all(db).await
            }
            SortOption::VNDBRank => {
                // LEFT JOIN vndb_data
                let mut query = Self::build_base_query(game_type, keyword).left_join(VndbData);
                query = query
                    .order_by(vndb_data::Column::Score, order)
                    .order_by_asc(games::Column::Id);
                query.all(db).await
            }
        }
    }

    /// 检查 BGM ID 是否已存在
    pub async fn exists_bgm_id(db: &DatabaseConnection, bgm_id: &str) -> Result<bool, DbErr> {
        Ok(Games::find()
            .filter(games::Column::BgmId.eq(bgm_id))
            .count(db)
            .await?
            > 0)
    }

    /// 检查 VNDB ID 是否已存在
    pub async fn exists_vndb_id(db: &DatabaseConnection, vndb_id: &str) -> Result<bool, DbErr> {
        Ok(Games::find()
            .filter(games::Column::VndbId.eq(vndb_id))
            .count(db)
            .await?
            > 0)
    }

    // ==================== 存档备份相关操作 ====================

    /// 保存存档备份记录
    pub async fn save_savedata_record(
        db: &DatabaseConnection,
        game_id: i32,
        file_name: &str,
        backup_time: i32,
        file_size: i32,
    ) -> Result<i32, DbErr> {
        let savedata_record = savedata::ActiveModel {
            id: NotSet,
            game_id: Set(game_id),
            file: Set(file_name.to_string()),
            backup_time: Set(backup_time),
            file_size: Set(file_size),
            created_at: Set(Some(backup_time)),
        };
        let result = savedata_record.insert(db).await?;
        Ok(result.id)
    }

    /// 获取指定游戏的备份数量
    pub async fn get_savedata_count(db: &DatabaseConnection, game_id: i32) -> Result<u64, DbErr> {
        Savedata::find()
            .filter(savedata::Column::GameId.eq(game_id))
            .count(db)
            .await
    }

    /// 获取指定游戏的所有备份记录（按时间倒序）
    pub async fn get_savedata_records(
        db: &DatabaseConnection,
        game_id: i32,
    ) -> Result<Vec<savedata::Model>, DbErr> {
        Savedata::find()
            .filter(savedata::Column::GameId.eq(game_id))
            .order_by_desc(savedata::Column::BackupTime)
            .all(db)
            .await
    }

    /// 根据 ID 获取备份记录
    pub async fn get_savedata_record_by_id(
        db: &DatabaseConnection,
        backup_id: i32,
    ) -> Result<Option<savedata::Model>, DbErr> {
        Savedata::find_by_id(backup_id).one(db).await
    }

    /// 删除备份记录
    pub async fn delete_savedata_record(
        db: &DatabaseConnection,
        backup_id: i32,
    ) -> Result<DeleteResult, DbErr> {
        Savedata::delete_by_id(backup_id).exec(db).await
    }

    /// 批量删除指定游戏的所有备份记录
    pub async fn delete_all_savedata_by_game(
        db: &DatabaseConnection,
        game_id: i32,
    ) -> Result<DeleteResult, DbErr> {
        Savedata::delete_many()
            .filter(savedata::Column::GameId.eq(game_id))
            .exec(db)
            .await
    }
}
