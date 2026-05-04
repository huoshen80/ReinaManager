use crate::database::dto::{InsertCollectionData, UpdateCollectionData};
use crate::entity::prelude::*;
use crate::entity::{collections, game_collection_link};
use sea_orm::*;
use serde::{Deserialize, Serialize};

/// 合集数据仓库
pub struct CollectionsRepository;

/// 带游戏数量的分类
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryWithCount {
    pub id: i32,
    pub name: String,
    pub icon: Option<String>,
    pub sort_order: i32,
    pub game_count: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
struct GameCollectionPair {
    game_id: i32,
    collection_id: i32,
}

struct GameCollectionInsert {
    game_id: i32,
    collection_id: i32,
    sort_order: i32,
}

struct GameCollectionDiff {
    to_insert: Vec<GameCollectionPair>,
    to_delete_link_ids: Vec<i32>,
}

struct CategoryGamesDiff {
    to_delete_link_ids: Vec<i32>,
    to_insert: Vec<GameCollectionInsert>,
    to_update_sort_orders: Vec<(i32, i32)>,
}

impl CollectionsRepository {
    fn unique_ids(ids: Vec<i32>) -> Vec<i32> {
        let mut seen = std::collections::HashSet::new();
        ids.into_iter().filter(|id| seen.insert(*id)).collect()
    }

    fn diff_game_collection_pairs(
        current_links: &[game_collection_link::Model],
        target_pairs: &[GameCollectionPair],
    ) -> GameCollectionDiff {
        use std::collections::{HashMap, HashSet};

        let current_pair_to_link_id = current_links
            .iter()
            .map(|link| {
                (
                    GameCollectionPair {
                        game_id: link.game_id,
                        collection_id: link.collection_id,
                    },
                    link.id,
                )
            })
            .collect::<HashMap<_, _>>();
        let target_pair_set = target_pairs.iter().copied().collect::<HashSet<_>>();

        let to_insert = target_pairs
            .iter()
            .filter(|pair| !current_pair_to_link_id.contains_key(pair))
            .copied()
            .collect();
        let to_delete_link_ids = current_pair_to_link_id
            .iter()
            .filter_map(|(pair, link_id)| (!target_pair_set.contains(pair)).then_some(*link_id))
            .collect();

        GameCollectionDiff {
            to_insert,
            to_delete_link_ids,
        }
    }

    fn build_category_games_diff(
        current_links: &[game_collection_link::Model],
        new_game_ids: Vec<i32>,
        collection_id: i32,
    ) -> CategoryGamesDiff {
        use std::collections::{HashMap, HashSet};

        let new_game_ids = Self::unique_ids(new_game_ids);
        let mut current_map = current_links
            .iter()
            .map(|link| (link.game_id, (link.id, link.sort_order)))
            .collect::<HashMap<_, _>>();
        let new_set = new_game_ids.iter().copied().collect::<HashSet<_>>();

        let to_delete_link_ids = current_links
            .iter()
            .filter(|link| !new_set.contains(&link.game_id))
            .map(|link| link.id)
            .collect();
        let mut to_insert = Vec::new();
        let mut to_update_sort_orders = Vec::new();

        for (new_order, game_id) in new_game_ids.into_iter().enumerate() {
            let new_order = new_order as i32;
            if let Some((link_id, old_order)) = current_map.remove(&game_id) {
                if old_order != new_order {
                    to_update_sort_orders.push((link_id, new_order));
                }
            } else {
                to_insert.push(GameCollectionInsert {
                    game_id,
                    collection_id,
                    sort_order: new_order,
                });
            }
        }

        CategoryGamesDiff {
            to_delete_link_ids,
            to_insert,
            to_update_sort_orders,
        }
    }

    async fn delete_game_collection_links(
        txn: &DatabaseTransaction,
        link_ids: Vec<i32>,
    ) -> Result<(), DbErr> {
        if link_ids.is_empty() {
            return Ok(());
        }

        GameCollectionLink::delete_many()
            .filter(game_collection_link::Column::Id.is_in(link_ids))
            .exec(txn)
            .await?;
        Ok(())
    }

    async fn insert_game_collection_links(
        txn: &DatabaseTransaction,
        inserts: Vec<GameCollectionInsert>,
    ) -> Result<(), DbErr> {
        if inserts.is_empty() {
            return Ok(());
        }

        let now = chrono::Utc::now().timestamp() as i32;
        let models = inserts
            .into_iter()
            .map(|insert| game_collection_link::ActiveModel {
                id: NotSet,
                game_id: Set(insert.game_id),
                collection_id: Set(insert.collection_id),
                sort_order: Set(insert.sort_order),
                created_at: Set(Some(now)),
            })
            .collect::<Vec<_>>();

        GameCollectionLink::insert_many(models).exec(txn).await?;
        Ok(())
    }

    async fn update_game_collection_sort_orders(
        txn: &DatabaseTransaction,
        updates: Vec<(i32, i32)>,
    ) -> Result<(), DbErr> {
        if updates.is_empty() {
            return Ok(());
        }

        let case_clause = updates
            .iter()
            .map(|(id, order)| format!("WHEN id = {} THEN {}", id, order))
            .collect::<Vec<_>>()
            .join(" ");
        let ids = updates
            .iter()
            .map(|(id, _)| id.to_string())
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "UPDATE game_collection_link SET sort_order = CASE {} END WHERE id IN ({})",
            case_clause, ids
        );

        txn.execute(Statement::from_string(DatabaseBackend::Sqlite, sql))
            .await?;
        Ok(())
    }

    async fn build_append_inserts(
        txn: &DatabaseTransaction,
        pairs: Vec<GameCollectionPair>,
    ) -> Result<Vec<GameCollectionInsert>, DbErr> {
        use std::collections::{HashMap, HashSet};

        let collection_ids = pairs
            .iter()
            .map(|pair| pair.collection_id)
            .collect::<HashSet<_>>();
        let mut next_orders = HashMap::new();

        for collection_id in collection_ids {
            let next_order = GameCollectionLink::find()
                .filter(game_collection_link::Column::CollectionId.eq(collection_id))
                .order_by_desc(game_collection_link::Column::SortOrder)
                .one(txn)
                .await?
                .map(|link| link.sort_order + 1)
                .unwrap_or(0);
            next_orders.insert(collection_id, next_order);
        }

        let inserts = pairs
            .into_iter()
            .map(|pair| {
                let sort_order = next_orders.entry(pair.collection_id).or_insert(0);
                let insert = GameCollectionInsert {
                    game_id: pair.game_id,
                    collection_id: pair.collection_id,
                    sort_order: *sort_order,
                };
                *sort_order += 1;
                insert
            })
            .collect();

        Ok(inserts)
    }

    // ==================== 合集 CRUD 操作 ====================

    /// 创建合集
    pub async fn create(
        db: &DatabaseConnection,
        data: InsertCollectionData,
    ) -> Result<collections::Model, DbErr> {
        let now = chrono::Utc::now().timestamp() as i32;

        let collection = collections::ActiveModel {
            id: NotSet,
            name: Set(data.name),
            parent_id: Set(data.parent_id),
            sort_order: Set(data.sort_order),
            icon: Set(data.icon),
            created_at: Set(Some(now)),
            updated_at: Set(Some(now)),
        };

        collection.insert(db).await
    }

    /// 获取根合集（parent_id 为 NULL）
    pub async fn find_root_collections(
        db: &DatabaseConnection,
    ) -> Result<Vec<collections::Model>, DbErr> {
        Collections::find()
            .filter(collections::Column::ParentId.is_null())
            .order_by_asc(collections::Column::SortOrder)
            .all(db)
            .await
    }

    /// 获取子合集
    pub async fn find_children(
        db: &DatabaseConnection,
        parent_id: i32,
    ) -> Result<Vec<collections::Model>, DbErr> {
        Collections::find()
            .filter(collections::Column::ParentId.eq(parent_id))
            .order_by_asc(collections::Column::SortOrder)
            .all(db)
            .await
    }

    /// 更新合集
    pub async fn update(
        db: &DatabaseConnection,
        id: i32,
        data: UpdateCollectionData,
    ) -> Result<collections::Model, DbErr> {
        let existing = Collections::find_by_id(id)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("Collection not found".to_string()))?;

        let mut active: collections::ActiveModel = existing.into();

        if let Some(n) = data.name {
            active.name = Set(n);
        }
        if let Some(p) = data.parent_id {
            active.parent_id = Set(p);
        }
        if let Some(s) = data.sort_order {
            active.sort_order = Set(s);
        }
        if let Some(i) = data.icon {
            active.icon = Set(i);
        }

        active.updated_at = Set(Some(chrono::Utc::now().timestamp() as i32));

        active.update(db).await
    }

    /// 删除合集（会级联删除子合集和游戏关联）
    pub async fn delete(db: &DatabaseConnection, id: i32) -> Result<DeleteResult, DbErr> {
        Collections::delete_by_id(id).exec(db).await
    }

    // ==================== 游戏-合集关联操作 ====================

    /// 从单个合集中批量移除游戏
    pub async fn remove_games_from_collection(
        db: &DatabaseConnection,
        game_ids: Vec<i32>,
        collection_id: i32,
    ) -> Result<DeleteResult, DbErr> {
        let game_ids = Self::unique_ids(game_ids);
        if game_ids.is_empty() {
            return Ok(DeleteResult { rows_affected: 0 });
        }

        GameCollectionLink::delete_many()
            .filter(game_collection_link::Column::CollectionId.eq(collection_id))
            .filter(game_collection_link::Column::GameId.is_in(game_ids))
            .exec(db)
            .await
    }

    /// 获取合集中的所有游戏 ID
    pub async fn get_games_in_collection(
        db: &DatabaseConnection,
        collection_id: i32,
    ) -> Result<Vec<i32>, DbErr> {
        let links = GameCollectionLink::find()
            .filter(game_collection_link::Column::CollectionId.eq(collection_id))
            .order_by_asc(game_collection_link::Column::SortOrder)
            .all(db)
            .await?;

        Ok(links.into_iter().map(|link| link.game_id).collect())
    }

    /// 获取游戏所在的所有合集 ID
    pub async fn get_game_collection_ids(
        db: &DatabaseConnection,
        game_id: i32,
    ) -> Result<Vec<i32>, DbErr> {
        let links = GameCollectionLink::find()
            .filter(game_collection_link::Column::GameId.eq(game_id))
            .order_by_asc(game_collection_link::Column::CollectionId)
            .all(db)
            .await?;

        Ok(links.into_iter().map(|link| link.collection_id).collect())
    }

    /// 批量将多个游戏添加到多个合集，已存在的关联会跳过
    pub async fn add_games_to_collections(
        db: &DatabaseConnection,
        game_ids: Vec<i32>,
        collection_ids: Vec<i32>,
    ) -> Result<(), DbErr> {
        let game_ids = Self::unique_ids(game_ids);
        let collection_ids = Self::unique_ids(collection_ids);
        if game_ids.is_empty() || collection_ids.is_empty() {
            return Ok(());
        }

        let txn = db.begin().await?;
        let current_links = GameCollectionLink::find()
            .filter(game_collection_link::Column::GameId.is_in(game_ids.clone()))
            .filter(game_collection_link::Column::CollectionId.is_in(collection_ids.clone()))
            .all(&txn)
            .await?;
        let target_pairs = collection_ids
            .iter()
            .flat_map(|collection_id| {
                game_ids.iter().map(|game_id| GameCollectionPair {
                    game_id: *game_id,
                    collection_id: *collection_id,
                })
            })
            .collect::<Vec<_>>();
        let diff = Self::diff_game_collection_pairs(&current_links, &target_pairs);
        let inserts = Self::build_append_inserts(&txn, diff.to_insert).await?;
        Self::insert_game_collection_links(&txn, inserts).await?;

        txn.commit().await?;
        Ok(())
    }

    /// 设置单个游戏所在的合集列表
    pub async fn set_game_collections(
        db: &DatabaseConnection,
        game_id: i32,
        collection_ids: Vec<i32>,
    ) -> Result<(), DbErr> {
        let txn = db.begin().await?;

        let current_links = GameCollectionLink::find()
            .filter(game_collection_link::Column::GameId.eq(game_id))
            .all(&txn)
            .await?;
        let target_pairs = Self::unique_ids(collection_ids)
            .into_iter()
            .map(|collection_id| GameCollectionPair {
                game_id,
                collection_id,
            })
            .collect::<Vec<_>>();
        let diff = Self::diff_game_collection_pairs(&current_links, &target_pairs);
        Self::delete_game_collection_links(&txn, diff.to_delete_link_ids).await?;
        let inserts = Self::build_append_inserts(&txn, diff.to_insert).await?;
        Self::insert_game_collection_links(&txn, inserts).await?;

        txn.commit().await?;
        Ok(())
    }

    /// 获取合集中的游戏数量
    pub async fn count_games_in_collection(
        db: &DatabaseConnection,
        collection_id: i32,
    ) -> Result<u64, DbErr> {
        GameCollectionLink::find()
            .filter(game_collection_link::Column::CollectionId.eq(collection_id))
            .count(db)
            .await
    }

    /// 批量更新分类中的游戏列表（差异计算优化版）
    /// 将分类中的游戏完全替换为 game_ids
    ///
    /// 算法策略：
    /// 1. 查询现有游戏列表
    /// 2. 计算差异：找出需要删除、新增、更新排序的游戏
    /// 3. 只执行必要的数据库操作
    ///
    /// 优势：
    /// - 减少数据库 I/O 操作
    /// - 保留未变动游戏的主键 ID
    /// - 适合局部修改的场景
    pub async fn update_category_games(
        db: &DatabaseConnection,
        new_game_ids: Vec<i32>,
        collection_id: i32,
    ) -> Result<(), DbErr> {
        let txn = db.begin().await?;
        let current_links = GameCollectionLink::find()
            .filter(game_collection_link::Column::CollectionId.eq(collection_id))
            .all(&txn)
            .await?;
        let diff = Self::build_category_games_diff(&current_links, new_game_ids, collection_id);

        Self::delete_game_collection_links(&txn, diff.to_delete_link_ids).await?;
        Self::insert_game_collection_links(&txn, diff.to_insert).await?;
        Self::update_game_collection_sort_orders(&txn, diff.to_update_sort_orders).await?;
        txn.commit().await?;

        Ok(())
    }

    // ==================== 前端友好的组合 API ====================

    /// 批量获取多个分组的游戏数量（优化版，解决 N+1 查询问题）
    ///
    /// 返回 HashMap<group_id, game_count>
    pub async fn batch_count_games_in_groups(
        db: &DatabaseConnection,
        group_ids: Vec<i32>,
    ) -> Result<std::collections::HashMap<i32, u64>, DbErr> {
        use std::collections::HashMap;

        if group_ids.is_empty() {
            return Ok(HashMap::new());
        }

        let mut result = HashMap::new();

        // 1. 一次查询获取所有分组下的分类
        let categories = Collections::find()
            .filter(collections::Column::ParentId.is_in(group_ids.clone()))
            .all(db)
            .await?;

        // 2. 按分组分组分类
        let mut group_category_map: HashMap<i32, Vec<i32>> = HashMap::new();
        for category in categories {
            if let Some(parent_id) = category.parent_id {
                group_category_map
                    .entry(parent_id)
                    .or_default()
                    .push(category.id);
            }
        }

        // 3. 为每个分组统计游戏数（去重）
        for group_id in group_ids {
            if let Some(category_ids) = group_category_map.get(&group_id) {
                if category_ids.is_empty() {
                    result.insert(group_id, 0);
                    continue;
                }

                let count = GameCollectionLink::find()
                    .filter(game_collection_link::Column::CollectionId.is_in(category_ids.clone()))
                    .select_only()
                    .column_as(game_collection_link::Column::GameId, "game_id")
                    .distinct()
                    .count(db)
                    .await?;

                result.insert(group_id, count);
            } else {
                result.insert(group_id, 0);
            }
        }

        Ok(result)
    }

    /// 获取单个分组中的游戏总数（统计该分组下所有分类的游戏数）
    ///
    /// 注意：如果需要获取多个分组的游戏数，请使用 batch_count_games_in_groups
    pub async fn count_games_in_group(
        db: &DatabaseConnection,
        group_id: i32,
    ) -> Result<u64, DbErr> {
        // 获取该分组下的所有分类
        let categories = Self::find_children(db, group_id).await?;
        let category_ids: Vec<i32> = categories.iter().map(|c| c.id).collect();

        if category_ids.is_empty() {
            return Ok(0);
        }

        // 统计这些分类中的游戏总数（去重）
        let count = GameCollectionLink::find()
            .filter(game_collection_link::Column::CollectionId.is_in(category_ids))
            .select_only()
            .column_as(game_collection_link::Column::GameId, "game_id")
            .distinct()
            .count(db)
            .await?;

        Ok(count)
    }

    /// 获取指定分组的分类列表（带游戏数量）
    pub async fn get_categories_with_count(
        db: &DatabaseConnection,
        group_id: i32,
    ) -> Result<Vec<CategoryWithCount>, DbErr> {
        let categories = Self::find_children(db, group_id).await?;
        let mut result = Vec::new();

        for category in categories {
            let count = Self::count_games_in_collection(db, category.id).await?;
            result.push(CategoryWithCount {
                id: category.id,
                name: category.name,
                icon: category.icon,
                sort_order: category.sort_order,
                game_count: count,
            });
        }

        Ok(result)
    }
}
