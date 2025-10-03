use crate::entity::prelude::*;
use crate::entity::{collections, game_collection_link};
use sea_orm::*;
use serde::{Deserialize, Serialize};

/// 完整的合集数据（包含游戏列表）
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CollectionWithGames {
    pub collection: collections::Model,
    pub game_ids: Vec<i32>,
}

/// 合集数据仓库
pub struct CollectionsRepository;

impl CollectionsRepository {
    // ==================== 合集 CRUD 操作 ====================

    /// 创建合集
    pub async fn create(
        db: &DatabaseConnection,
        name: String,
        parent_id: Option<i32>,
        sort_order: i32,
        icon: Option<String>,
    ) -> Result<collections::Model, DbErr> {
        let now = chrono::Utc::now().timestamp() as i32;

        let collection = collections::ActiveModel {
            id: NotSet,
            name: Set(name),
            parent_id: Set(parent_id),
            sort_order: Set(sort_order),
            icon: Set(icon),
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
        name: Option<String>,
        parent_id: Option<Option<i32>>,
        sort_order: Option<i32>,
        icon: Option<Option<String>>,
    ) -> Result<collections::Model, DbErr> {
        let existing = Collections::find_by_id(id)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("Collection not found".to_string()))?;

        let mut active: collections::ActiveModel = existing.into();

        if let Some(n) = name {
            active.name = Set(n);
        }
        if let Some(p) = parent_id {
            active.parent_id = Set(p);
        }
        if let Some(s) = sort_order {
            active.sort_order = Set(s);
        }
        if let Some(i) = icon {
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

    /// 根据关联 ID 删除
    pub async fn remove_link_by_id(
        db: &DatabaseConnection,
        link_id: i32,
    ) -> Result<DeleteResult, DbErr> {
        GameCollectionLink::delete_by_id(link_id).exec(db).await
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

    /// 获取游戏所属的所有合集 ID
    pub async fn get_collections_for_game(
        db: &DatabaseConnection,
        game_id: i32,
    ) -> Result<Vec<i32>, DbErr> {
        let links = GameCollectionLink::find()
            .filter(game_collection_link::Column::GameId.eq(game_id))
            .all(db)
            .await?;

        Ok(links.into_iter().map(|link| link.collection_id).collect())
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

    /// 批量添加游戏到合集
    pub async fn add_games_to_collection(
        db: &DatabaseConnection,
        game_ids: Vec<i32>,
        collection_id: i32,
    ) -> Result<(), DbErr> {
        let now = chrono::Utc::now().timestamp() as i32;

        for (index, game_id) in game_ids.iter().enumerate() {
            let link = game_collection_link::ActiveModel {
                id: NotSet,
                game_id: Set(*game_id),
                collection_id: Set(collection_id),
                sort_order: Set(index as i32),
                created_at: Set(Some(now)),
            };

            link.insert(db).await?;
        }

        Ok(())
    }

    /// 更新游戏在合集中的排序
    pub async fn update_game_sort_order(
        db: &DatabaseConnection,
        link_id: i32,
        new_sort_order: i32,
    ) -> Result<game_collection_link::Model, DbErr> {
        let existing = GameCollectionLink::find_by_id(link_id)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("Link not found".to_string()))?;

        let mut active: game_collection_link::ActiveModel = existing.into();
        active.sort_order = Set(new_sort_order);

        active.update(db).await
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

    /// 获取所有游戏-合集关联
    pub async fn get_all_links(
        db: &DatabaseConnection,
    ) -> Result<Vec<game_collection_link::Model>, DbErr> {
        GameCollectionLink::find().all(db).await
    }

    /// 清空合集中的所有游戏
    pub async fn clear_collection(
        db: &DatabaseConnection,
        collection_id: i32,
    ) -> Result<DeleteResult, DbErr> {
        GameCollectionLink::delete_many()
            .filter(game_collection_link::Column::CollectionId.eq(collection_id))
            .exec(db)
            .await
    }
}
