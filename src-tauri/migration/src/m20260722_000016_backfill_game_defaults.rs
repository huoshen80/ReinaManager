//! 回填 0.25.0 插入行为产生的游戏设置空值。

use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{ConnectionTrait, TransactionTrait};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let transaction = manager.get_connection().begin().await?;
        backfill_defaults(&transaction).await?;
        transaction.commit().await
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Err(DbErr::Custom("游戏设置默认值回填无法安全回滚".to_string()))
    }
}

async fn backfill_defaults<C>(connection: &C) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    connection
        .execute_unprepared(
            r#"
            UPDATE games
            SET
                autosave = COALESCE(autosave, 0),
                maxbackups = COALESCE(maxbackups, 20),
                le_launch = COALESCE(le_launch, 0),
                magpie = COALESCE(magpie, 0)
            WHERE autosave IS NULL
               OR maxbackups IS NULL
               OR le_launch IS NULL
               OR magpie IS NULL
            "#,
        )
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_orm_migration::sea_orm::{Database, DatabaseBackend, Statement};

    #[tokio::test]
    async fn backfills_only_missing_game_settings() {
        let database = Database::connect("sqlite::memory:").await.unwrap();
        database
            .execute_unprepared(
                r#"
                CREATE TABLE games (
                    id INTEGER PRIMARY KEY,
                    autosave INTEGER DEFAULT 0,
                    maxbackups INTEGER DEFAULT 20,
                    le_launch INTEGER DEFAULT 0,
                    magpie INTEGER DEFAULT 0
                );
                INSERT INTO games(id, autosave, maxbackups, le_launch, magpie) VALUES
                    (1, NULL, NULL, NULL, NULL),
                    (2, 1, 7, 1, 1);
                "#,
            )
            .await
            .unwrap();

        backfill_defaults(&database).await.unwrap();

        let rows = database
            .query_all(Statement::from_string(
                DatabaseBackend::Sqlite,
                "SELECT autosave, maxbackups, le_launch, magpie FROM games ORDER BY id".to_string(),
            ))
            .await
            .unwrap();
        assert_eq!(rows[0].try_get::<i32>("", "autosave").unwrap(), 0);
        assert_eq!(rows[0].try_get::<i32>("", "maxbackups").unwrap(), 20);
        assert_eq!(rows[0].try_get::<i32>("", "le_launch").unwrap(), 0);
        assert_eq!(rows[0].try_get::<i32>("", "magpie").unwrap(), 0);
        assert_eq!(rows[1].try_get::<i32>("", "autosave").unwrap(), 1);
        assert_eq!(rows[1].try_get::<i32>("", "maxbackups").unwrap(), 7);
        assert_eq!(rows[1].try_get::<i32>("", "le_launch").unwrap(), 1);
        assert_eq!(rows[1].try_get::<i32>("", "magpie").unwrap(), 1);
    }
}
