//! 游戏数据仓库（单表架构）
//!
//! 重构后的 Repository，games 表包含所有元数据（以 JSON 列存储）。
//! 移除了多表事务代码，简化为单表 CRUD 操作。

use crate::database::dto::{InsertGameData, UpdateGameData};
use crate::entity::prelude::*;
use crate::entity::{games, savedata};
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

/// 游戏数据仓库（单表架构）
pub struct GamesRepository;

impl GamesRepository {
    // ==================== 游戏 CRUD 操作 ====================

    /// 插入游戏数据（单表操作）
    ///
    /// 所有元数据通过 JSON 列直接存储，无需多表事务
    pub async fn insert(db: &DatabaseConnection, game: InsertGameData) -> Result<i32, DbErr> {
        let game = game.cleaned(); // 清洗空字符串为 NULL

        let now = chrono::Utc::now().timestamp() as i32;

        let game_active = games::ActiveModel {
            id: NotSet,
            bgm_id: Set(game.bgm_id),
            vndb_id: Set(game.vndb_id),
            ymgal_id: Set(game.ymgal_id),
            id_type: Set(game.id_type),
            date: Set(game.date),
            localpath: Set(game.localpath),
            savepath: NotSet,
            autosave: NotSet,
            maxbackups: NotSet,
            clear: Set(Some(1)), // 数据库迁移默认值麻烦，临时设定默认值为 1
            le_launch: NotSet,
            magpie: NotSet,
            vndb_data: Set(game.vndb_data),
            bgm_data: Set(game.bgm_data),
            ymgal_data: Set(game.ymgal_data),
            custom_data: Set(game.custom_data),
            created_at: Set(Some(now)),
            updated_at: Set(Some(now)),
        };

        let result = game_active.insert(db).await?;
        Ok(result.id)
    }

    /// 更新游戏数据（单表操作）
    ///
    /// 支持部分更新，未提供的字段保持不变
    pub async fn update(
        db: &DatabaseConnection,
        game_id: i32,
        updates: UpdateGameData,
    ) -> Result<games::Model, DbErr> {
        let updates = updates.cleaned(); // 清洗空字符串为 NULL
        let now = chrono::Utc::now().timestamp() as i32;

        let game_active = games::ActiveModel {
            id: Set(game_id),
            bgm_id: updates.bgm_id.map_or(NotSet, Set),
            vndb_id: updates.vndb_id.map_or(NotSet, Set),
            ymgal_id: updates.ymgal_id.map_or(NotSet, Set),
            id_type: updates.id_type.map_or(NotSet, Set),
            date: updates.date.map_or(NotSet, Set),
            localpath: updates.localpath.map_or(NotSet, Set),
            savepath: updates.savepath.map_or(NotSet, Set),
            autosave: updates.autosave.map_or(NotSet, Set),
            maxbackups: updates.maxbackups.map_or(NotSet, Set),
            clear: updates.clear.map_or(NotSet, Set),
            le_launch: updates.le_launch.map_or(NotSet, Set),
            magpie: updates.magpie.map_or(NotSet, Set),
            vndb_data: updates.vndb_data.map_or(NotSet, Set),
            bgm_data: updates.bgm_data.map_or(NotSet, Set),
            ymgal_data: updates.ymgal_data.map_or(NotSet, Set),
            custom_data: updates.custom_data.map_or(NotSet, Set),
            updated_at: Set(Some(now)),
            ..Default::default()
        };

        game_active.update(db).await
    }

    /// 批量更新游戏数据
    ///
    /// 在事务中批量更新，保证原子性
    pub async fn update_batch(
        db: &DatabaseConnection,
        updates: Vec<(i32, UpdateGameData)>,
    ) -> Result<u64, DbErr> {
        if updates.is_empty() {
            return Ok(0);
        }

        let txn = db.begin().await?;
        let now = chrono::Utc::now().timestamp() as i32;
        let mut count = 0u64;

        for (game_id, update) in updates {
            let update = update.cleaned(); // 清洗空字符串为 NULL

            let game_active = games::ActiveModel {
                id: Set(game_id),
                bgm_id: update.bgm_id.map_or(NotSet, Set),
                vndb_id: update.vndb_id.map_or(NotSet, Set),
                ymgal_id: update.ymgal_id.map_or(NotSet, Set),
                id_type: update.id_type.map_or(NotSet, Set),
                date: update.date.map_or(NotSet, Set),
                localpath: update.localpath.map_or(NotSet, Set),
                savepath: update.savepath.map_or(NotSet, Set),
                autosave: update.autosave.map_or(NotSet, Set),
                maxbackups: update.maxbackups.map_or(NotSet, Set),
                clear: update.clear.map_or(NotSet, Set),
                le_launch: update.le_launch.map_or(NotSet, Set),
                magpie: update.magpie.map_or(NotSet, Set),
                vndb_data: update.vndb_data.map_or(NotSet, Set),
                bgm_data: update.bgm_data.map_or(NotSet, Set),
                ymgal_data: update.ymgal_data.map_or(NotSet, Set),
                custom_data: update.custom_data.map_or(NotSet, Set),
                updated_at: Set(Some(now)),
                ..Default::default()
            };

            let result = game_active.update(&txn).await?;
            if result.id > 0 {
                count += 1;
            }
        }

        txn.commit().await?;
        Ok(count)
    }

    // ==================== 查询操作 ====================

    /// 根据 ID 查询游戏
    pub async fn find_by_id(
        db: &DatabaseConnection,
        id: i32,
    ) -> Result<Option<games::Model>, DbErr> {
        Games::find_by_id(id).one(db).await
    }

    /// 获取所有游戏，支持按类型筛选和排序
    pub async fn find_all(
        db: &DatabaseConnection,
        game_type: GameType,
        sort_option: SortOption,
        sort_order: SortOrder,
    ) -> Result<Vec<games::Model>, DbErr> {
        Self::find_with_sort(db, game_type, sort_option, sort_order).await
    }

    /// 删除游戏
    pub async fn delete(db: &DatabaseConnection, id: i32) -> Result<DeleteResult, DbErr> {
        Games::delete_by_id(id).exec(db).await
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

    /// 获取所有游戏的 BGM ID
    pub async fn get_all_bgm_ids(db: &DatabaseConnection) -> Result<Vec<(i32, String)>, DbErr> {
        Games::find()
            .filter(games::Column::BgmId.is_not_null())
            .all(db)
            .await
            .map(|games| {
                games
                    .into_iter()
                    .filter_map(|g| g.bgm_id.map(|bgm_id| (g.id, bgm_id)))
                    .collect()
            })
    }

    /// 获取所有游戏的 VNDB ID
    pub async fn get_all_vndb_ids(db: &DatabaseConnection) -> Result<Vec<(i32, String)>, DbErr> {
        Games::find()
            .filter(games::Column::VndbId.is_not_null())
            .all(db)
            .await
            .map(|games| {
                games
                    .into_iter()
                    .filter_map(|g| g.vndb_id.map(|vndb_id| (g.id, vndb_id)))
                    .collect()
            })
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

    // ==================== 私有方法 ====================

    /// 通用的查询构建器：应用类型筛选
    fn build_base_query(game_type: GameType) -> Select<Games> {
        let mut query = Games::find();

        query = match game_type {
            GameType::All => query,
            GameType::Local => query.filter(games::Column::Localpath.is_not_null()),
            GameType::Online => query.filter(games::Column::Localpath.is_null()),
            // clear 字段已迁移到 1-5 枚举：1=WISH, 2=PLAYING, 3=PLAYED, 4=ON_HOLD, 5=DROPPED
            GameType::NoClear => query.filter(games::Column::Clear.ne(3)),
            GameType::Clear => query.filter(games::Column::Clear.eq(3)),
        };
        query
    }

    /// 应用层排序：按可选数值键排序，None 值统一置末尾
    ///
    /// - `key_fn`：从游戏记录提取排序键，返回 `Option<K>`
    /// - `desc`：true 时降序（大值靠前），false 时升序（小值靠前）
    fn sort_by_optional_key<K, F>(games: &mut [games::Model], desc: bool, key_fn: F)
    where
        K: PartialOrd,
        F: Fn(&games::Model) -> Option<K>,
    {
        games.sort_by(|a, b| match (key_fn(a), key_fn(b)) {
            (None, None) => std::cmp::Ordering::Equal,
            (None, _) => std::cmp::Ordering::Greater,
            (_, None) => std::cmp::Ordering::Less,
            (Some(ka), Some(kb)) => {
                let ord = ka.partial_cmp(&kb).unwrap_or(std::cmp::Ordering::Equal);
                if desc {
                    ord.reverse()
                } else {
                    ord
                }
            }
        });
    }

    /// 通用的排序和查询方法
    async fn find_with_sort(
        db: &DatabaseConnection,
        game_type: GameType,
        sort_option: SortOption,
        sort_order: SortOrder,
    ) -> Result<Vec<games::Model>, DbErr> {
        use crate::entity::game_statistics;

        match sort_option {
            SortOption::Addtime => {
                let mut query = Self::build_base_query(game_type);
                query = match sort_order {
                    SortOrder::Asc => query.order_by_asc(games::Column::Id),
                    SortOrder::Desc => query.order_by_desc(games::Column::Id),
                };
                query.all(db).await
            }
            SortOption::Datetime => {
                let mut query = Self::build_base_query(game_type);
                query = match sort_order {
                    SortOrder::Asc => query.order_by_asc(games::Column::Date),
                    SortOrder::Desc => query.order_by_desc(games::Column::Date),
                };
                query.all(db).await
            }
            SortOption::LastPlayed => {
                let query = Self::build_base_query(game_type).left_join(game_statistics::Entity);
                query
                    .order_by(game_statistics::Column::LastPlayed, Order::Desc)
                    .order_by_asc(games::Column::Id)
                    .all(db)
                    .await
            }
            SortOption::BGMRank => {
                // bgm_data.rank：数值越小排名越靠前，无 rank 或 rank=0 置末尾
                let mut games = Self::build_base_query(game_type).all(db).await?;
                let desc = matches!(sort_order, SortOrder::Desc);
                Self::sort_by_optional_key(&mut games, desc, |g| {
                    g.bgm_data.as_ref().and_then(|d| d.rank).filter(|&r| r != 0)
                });
                Ok(games)
            }
            SortOption::VNDBRank => {
                // vndb_data.score：数值越大越靠前，无 score 或 score=0 置末尾
                let mut games = Self::build_base_query(game_type).all(db).await?;
                let desc = matches!(sort_order, SortOrder::Asc);
                Self::sort_by_optional_key(&mut games, desc, |g| {
                    g.vndb_data
                        .as_ref()
                        .and_then(|d| d.score)
                        .filter(|&s| s != 0.0)
                });
                Ok(games)
            }
        }
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
            created_at: NotSet,
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
}
