//! 向 games 表添加 webdav_sync 字段，用于控制每个游戏是否同步存档到 WebDAV。
//! 幂等设计：检查字段是否存在，避免重复添加。

use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{ConnectionTrait, Statement};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        let exists = column_exists(conn, "games", "webdav_sync").await?;
        if !exists {
            let sql = "ALTER TABLE games ADD COLUMN webdav_sync Integer DEFAULT 0";
            conn.execute_unprepared(sql).await?;
        }
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        let exists = column_exists(conn, "games", "webdav_sync").await?;
        if exists {
            let sql = "ALTER TABLE games DROP COLUMN webdav_sync";
            conn.execute_unprepared(sql).await?;
        }
        Ok(())
    }
}

async fn column_exists<C>(
    conn: &C,
    table: &str,
    column: &str,
) -> Result<bool, DbErr>
where
    C: ConnectionTrait,
{
    let rows = conn
        .query_all(Statement::from_string(
            sea_orm::DatabaseBackend::Sqlite,
            format!("PRAGMA table_info({table})"),
        ))
        .await?;
    Ok(rows.iter().any(|row| {
        row.try_get::<String>("", "name")
            .ok()
            .is_some_and(|name| name == column)
    }))
}
