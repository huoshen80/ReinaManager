//! 向 user 表添加 WebDAV 配置字段。
//! 幂等设计：检查字段是否存在，避免重复添加。

use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{ConnectionTrait, Statement};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        add_column_if_not_exists(conn, "user", "webdav_url", "Text").await?;
        add_column_if_not_exists(conn, "user", "webdav_username", "Text").await?;
        add_column_if_not_exists(conn, "user", "webdav_password", "Text").await?;
        add_column_if_not_exists(conn, "user", "webdav_root", "Text").await?;
        add_column_if_not_exists(conn, "user", "webdav_sync_categories", "Text").await?;
        add_column_if_not_exists(conn, "user", "webdav_enabled", "Integer DEFAULT 0").await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();
        drop_column_if_exists(conn, "user", "webdav_url").await?;
        drop_column_if_exists(conn, "user", "webdav_username").await?;
        drop_column_if_exists(conn, "user", "webdav_password").await?;
        drop_column_if_exists(conn, "user", "webdav_root").await?;
        drop_column_if_exists(conn, "user", "webdav_sync_categories").await?;
        drop_column_if_exists(conn, "user", "webdav_enabled").await?;
        Ok(())
    }
}

async fn add_column_if_not_exists<C>(
    conn: &C,
    table: &str,
    column: &str,
    col_type: &str,
) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    let exists = column_exists(conn, table, column).await?;
    if !exists {
        let sql = format!(
            "ALTER TABLE {table} ADD COLUMN {column} {col_type}"
        );
        conn.execute_unprepared(&sql).await?;
    }
    Ok(())
}

async fn drop_column_if_exists<C>(
    conn: &C,
    table: &str,
    column: &str,
) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    let exists = column_exists(conn, table, column).await?;
    if exists {
        let sql = format!(
            "ALTER TABLE {table} DROP COLUMN {column}"
        );
        conn.execute_unprepared(&sql).await?;
    }
    Ok(())
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
