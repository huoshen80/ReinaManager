//! 根据当前查询模式统一索引。
//!
//! 历史升级路径会重建部分表，导致旧用户丢失初始迁移创建的索引。本迁移同时移除
//! 已被复合索引覆盖或不再使用的旧索引，保证新旧数据库最终结构一致。

use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::TransactionTrait;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let transaction = manager.get_connection().begin().await?;

        for index_name in INDEXES_TO_DROP {
            transaction
                .execute_unprepared(&format!("DROP INDEX IF EXISTS {index_name}"))
                .await?;
        }

        for statement in CURRENT_INDEXES {
            transaction.execute_unprepared(statement).await?;
        }

        transaction.commit().await
    }
}

const INDEXES_TO_DROP: &[&str] = &[
    "idx_games_autosave",
    "idx_games_bgm_id",
    "idx_games_clear",
    "idx_games_created_at",
    "idx_games_custom_cover",
    "idx_games_custom_name",
    "idx_games_date",
    "idx_games_date_asc",
    "idx_games_date_desc",
    "idx_games_id_type",
    "idx_games_localpath",
    "idx_games_score",
    "idx_games_vndb_id",
    "idx_game_sessions_game_id",
    "idx_game_sessions_date",
    "idx_game_sessions_game_start_time",
    "idx_game_sessions_start_time",
    "idx_savedata_game_backup_time",
    "idx_savedata_game_id",
    "idx_savedata_backup_time",
    "idx_game_statistics_last_played",
    "idx_collections_parent_id",
    "idx_collections_parent_sort_order",
    "idx_collections_sort_order",
    "idx_game_collection_link_collection_sort_order",
    "idx_game_collection_link_game_id",
    "idx_game_collection_link_collection_id",
    "idx_game_collection_link_sort_order",
];

const CURRENT_INDEXES: &[&str] = &[
    "CREATE INDEX IF NOT EXISTS idx_games_bgm_id ON games(bgm_id)",
    "CREATE INDEX IF NOT EXISTS idx_games_vndb_id ON games(vndb_id)",
    "CREATE INDEX IF NOT EXISTS idx_games_id_type ON games(id_type)",
    "CREATE INDEX IF NOT EXISTS idx_games_localpath ON games(localpath)",
    "CREATE INDEX IF NOT EXISTS idx_games_date_asc ON games((date IS NULL), date ASC, id ASC)",
    "CREATE INDEX IF NOT EXISTS idx_games_date_desc ON games((date IS NULL), date DESC, id ASC)",
    "CREATE INDEX IF NOT EXISTS idx_game_sessions_game_start_time ON game_sessions(game_id, start_time DESC)",
    "CREATE INDEX IF NOT EXISTS idx_game_sessions_start_time ON game_sessions(start_time DESC)",
    "CREATE INDEX IF NOT EXISTS idx_savedata_game_backup_time ON savedata(game_id, backup_time DESC)",
    "CREATE INDEX IF NOT EXISTS idx_collections_parent_sort_order ON collections(parent_id, sort_order)",
    "CREATE INDEX IF NOT EXISTS idx_game_collection_link_collection_sort_order ON game_collection_link(collection_id, sort_order)",
];
