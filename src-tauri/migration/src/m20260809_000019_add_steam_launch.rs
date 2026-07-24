//! 为游戏新增本地/Steam 启动配置。

use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{ConnectionTrait, TransactionTrait};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let transaction = manager.get_connection().begin().await?;
        add_steam_launch(&transaction).await?;
        transaction.commit().await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let transaction = manager.get_connection().begin().await?;
        remove_steam_launch(&transaction).await?;
        transaction.commit().await
    }
}

async fn add_steam_launch<C>(connection: &C) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    connection
        .execute_unprepared(
            r#"
            ALTER TABLE games ADD COLUMN launch_type TEXT NOT NULL DEFAULT 'local'
                CHECK (launch_type IN ('local', 'steam'));
            ALTER TABLE games ADD COLUMN steam_launch_id TEXT
                CHECK (
                    steam_launch_id IS NULL OR (
                        length(steam_launch_id) BETWEEN 1 AND 20
                        AND substr(steam_launch_id, 1, 1) BETWEEN '1' AND '9'
                        AND steam_launch_id NOT GLOB '*[^0-9]*'
                        AND (
                            length(steam_launch_id) < 20
                            OR steam_launch_id <= '18446744073709551615'
                        )
                    )
                )
                CHECK (
                    (launch_type = 'local' AND steam_launch_id IS NULL)
                    OR (launch_type = 'steam' AND steam_launch_id IS NOT NULL)
                );
            "#,
        )
        .await?;
    Ok(())
}

async fn remove_steam_launch<C>(connection: &C) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    connection
        .execute_unprepared(
            r#"
            ALTER TABLE games DROP COLUMN steam_launch_id;
            ALTER TABLE games DROP COLUMN launch_type;
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
    async fn adds_defaults_constraints_and_allows_shared_launch_id() {
        let database = Database::connect("sqlite::memory:").await.unwrap();
        database
            .execute_unprepared(
                "CREATE TABLE games (id INTEGER PRIMARY KEY, id_type TEXT NOT NULL); \
                 INSERT INTO games(id, id_type) VALUES (1, 'custom');",
            )
            .await
            .unwrap();

        add_steam_launch(&database).await.unwrap();

        let existing = database
            .query_one_raw(Statement::from_string(
                DatabaseBackend::Sqlite,
                "SELECT launch_type, steam_launch_id FROM games WHERE id = 1".to_string(),
            ))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            existing.try_get::<String>("", "launch_type").unwrap(),
            "local"
        );
        assert_eq!(
            existing
                .try_get::<Option<String>>("", "steam_launch_id")
                .unwrap(),
            None
        );

        database
            .execute_unprepared(
                "INSERT INTO games(id, id_type, launch_type, steam_launch_id) \
                 VALUES (2, 'custom', 'steam', '18446744073709551615');",
            )
            .await
            .unwrap();

        database
            .execute_unprepared(
                "INSERT INTO games(id, id_type, launch_type, steam_launch_id) \
                 VALUES (4, 'custom', 'steam', '18446744073709551615');",
            )
            .await
            .unwrap();

        for invalid_id in ["0", "001", "12x", "18446744073709551616"] {
            let statement = format!(
                "INSERT INTO games(id, id_type, launch_type, steam_launch_id) \
                 VALUES (100, 'custom', 'steam', '{invalid_id}')"
            );
            assert!(
                database.execute_unprepared(&statement).await.is_err(),
                "{invalid_id}"
            );
        }
        assert!(database
            .execute_unprepared(
                "INSERT INTO games(id, id_type, launch_type) VALUES (3, 'custom', 'steam')"
            )
            .await
            .is_err());
        assert!(database
            .execute_unprepared(
                "INSERT INTO games(id, id_type, launch_type, steam_launch_id) \
                 VALUES (3, 'custom', 'local', '730')"
            )
            .await
            .is_err());
    }

    #[tokio::test]
    async fn removes_steam_launch_columns() {
        let database = Database::connect("sqlite::memory:").await.unwrap();
        database
            .execute_unprepared(
                "CREATE TABLE games (id INTEGER PRIMARY KEY, id_type TEXT NOT NULL)",
            )
            .await
            .unwrap();
        add_steam_launch(&database).await.unwrap();
        remove_steam_launch(&database).await.unwrap();

        let columns = database
            .query_all_raw(Statement::from_string(
                DatabaseBackend::Sqlite,
                "PRAGMA table_info(games)".to_string(),
            ))
            .await
            .unwrap();
        assert!(columns.iter().all(|column| {
            !matches!(
                column.try_get::<String>("", "name").unwrap().as_str(),
                "launch_type" | "steam_launch_id"
            )
        }));
    }
}
