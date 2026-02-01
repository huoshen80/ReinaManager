use crate::database::dto::{InsertCollectionData, UpdateCollectionData};
use crate::entity::prelude::*;
use crate::entity::{collections, game_collection_link};
use sea_orm::*;
use serde::{Deserialize, Serialize};

/// 合集数据仓库
pub struct CollectionsRepository;

/// 分组与分类的树形结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GroupWithCategories {
    pub id: i32,
    pub name: String,
    pub icon: Option<String>,
    pub sort_order: i32,
    pub categories: Vec<CategoryWithCount>,
}

/// 带游戏数量的分类
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CategoryWithCount {
    pub id: i32,
    pub name: String,
    pub icon: Option<String>,
    pub sort_order: i32,
    pub game_count: u64,
}

impl CollectionsRepository {
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

    /// 根据 ID 查询合集
    pub async fn find_by_id(
        db: &DatabaseConnection,
        id: i32,
    ) -> Result<Option<collections::Model>, DbErr> {
        Collections::find_by_id(id).one(db).await
    }

    /// 获取所有合集
    pub async fn find_all(db: &DatabaseConnection) -> Result<Vec<collections::Model>, DbErr> {
        Collections::find()
            .order_by_asc(collections::Column::SortOrder)
            .all(db)
            .await
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

    /// 检查合集是否存在
    pub async fn exists(db: &DatabaseConnection, id: i32) -> Result<bool, DbErr> {
        Ok(Collections::find_by_id(id).count(db).await? > 0)
    }

    // ==================== 游戏-合集关联操作 ====================

    /// 将游戏添加到合集
    pub async fn add_game_to_collection(
        db: &DatabaseConnection,
        game_id: i32,
        collection_id: i32,
        sort_order: i32,
    ) -> Result<game_collection_link::Model, DbErr> {
        let now = chrono::Utc::now().timestamp() as i32;

        let link = game_collection_link::ActiveModel {
            id: NotSet,
            game_id: Set(game_id),
            collection_id: Set(collection_id),
            sort_order: Set(sort_order),
            created_at: Set(Some(now)),
        };

        link.insert(db).await
    }

    /// 从合集中移除游戏
    pub async fn remove_game_from_collection(
        db: &DatabaseConnection,
        game_id: i32,
        collection_id: i32,
    ) -> Result<DeleteResult, DbErr> {
        GameCollectionLink::delete_many()
            .filter(
                game_collection_link::Column::GameId
                    .eq(game_id)
                    .and(game_collection_link::Column::CollectionId.eq(collection_id)),
            )
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
        use std::collections::{HashMap, HashSet};

        // 开启事务
        let txn = db.begin().await?;

        // 1. 获取当前分类中的所有游戏（包含完整信息）
        let current_links = GameCollectionLink::find()
            .filter(game_collection_link::Column::CollectionId.eq(collection_id))
            .all(&txn)
            .await?;

        // 构建当前游戏的映射表：game_id -> (link_id, sort_order)
        let mut current_map: HashMap<i32, (i32, i32)> = current_links
            .iter()
            .map(|link| (link.game_id, (link.id, link.sort_order)))
            .collect();

        // 构建新游戏的 HashSet 用于快速查找
        let new_set: HashSet<i32> = new_game_ids.iter().copied().collect();

        // 2. 计算需要删除的游戏 ID（在旧列表但不在新列表）
        let to_delete: Vec<i32> = current_links
            .iter()
            .filter(|link| !new_set.contains(&link.game_id))
            .map(|link| link.id)
            .collect();

        // 3. 执行删除操作
        if !to_delete.is_empty() {
            GameCollectionLink::delete_many()
                .filter(game_collection_link::Column::Id.is_in(to_delete))
                .exec(&txn)
                .await?;
        }

        // 4. 处理新增和更新排序
        let now = chrono::Utc::now().timestamp() as i32;
        let mut to_insert = Vec::new();
        let mut to_update = Vec::new();

        for (new_order, &game_id) in new_game_ids.iter().enumerate() {
            let new_order_i32 = new_order as i32;

            if let Some((link_id, old_order)) = current_map.remove(&game_id) {
                // 游戏已存在，检查排序是否需要更新
                if old_order != new_order_i32 {
                    to_update.push((link_id, new_order_i32));
                }
            } else {
                // 游戏不存在，需要插入
                to_insert.push(game_collection_link::ActiveModel {
                    id: NotSet,
                    game_id: Set(game_id),
                    collection_id: Set(collection_id),
                    sort_order: Set(new_order_i32),
                    created_at: Set(Some(now)),
                });
            }
        }

        // 5. 批量插入新游戏
        if !to_insert.is_empty() {
            GameCollectionLink::insert_many(to_insert)
                .exec(&txn)
                .await?;
        }

        // 6. 批量更新排序（使用原生 SQL 优化性能）
        if !to_update.is_empty() {
            // 构建 CASE WHEN 语句批量更新
            let case_clause = to_update
                .iter()
                .map(|(id, order)| format!("WHEN id = {} THEN {}", id, order))
                .collect::<Vec<_>>()
                .join(" ");

            let ids = to_update
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
        }

        // 提交事务
        txn.commit().await?;

        Ok(())
    }

    /// 检查游戏是否在合集中
    pub async fn is_game_in_collection(
        db: &DatabaseConnection,
        game_id: i32,
        collection_id: i32,
    ) -> Result<bool, DbErr> {
        let count = GameCollectionLink::find()
            .filter(
                game_collection_link::Column::GameId
                    .eq(game_id)
                    .and(game_collection_link::Column::CollectionId.eq(collection_id)),
            )
            .count(db)
            .await?;

        Ok(count > 0)
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

    /// 获取完整的分组-分类树（一次性返回所有数据）
    pub async fn get_collection_tree(
        db: &DatabaseConnection,
    ) -> Result<Vec<GroupWithCategories>, DbErr> {
        let groups = Self::find_root_collections(db).await?;
        let mut result = Vec::new();

        for group in groups {
            let categories = Self::find_children(db, group.id).await?;
            let mut categories_with_count = Vec::new();

            for category in categories {
                let count = Self::count_games_in_collection(db, category.id).await?;
                categories_with_count.push(CategoryWithCount {
                    id: category.id,
                    name: category.name,
                    icon: category.icon,
                    sort_order: category.sort_order,
                    game_count: count,
                });
            }

            result.push(GroupWithCategories {
                id: group.id,
                name: group.name,
                icon: group.icon,
                sort_order: group.sort_order,
                categories: categories_with_count,
            });
        }

        Ok(result)
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
