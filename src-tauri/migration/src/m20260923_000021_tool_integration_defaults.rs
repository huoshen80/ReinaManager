//! 为新游戏的 LE 与 Magpie 默认状态增加用户设置。

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                "ALTER TABLE \"user\" ADD COLUMN \"default_le_launch\" BOOLEAN NOT NULL DEFAULT 0; \
                 ALTER TABLE \"user\" ADD COLUMN \"default_magpie\" BOOLEAN NOT NULL DEFAULT 0;",
            )
            .await?;
        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                "ALTER TABLE \"user\" DROP COLUMN \"default_magpie\"; \
                 ALTER TABLE \"user\" DROP COLUMN \"default_le_launch\";",
            )
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_orm_migration::sea_orm::{ConnectionTrait, Database, DatabaseBackend, Statement};

    #[tokio::test]
    async fn existing_user_defaults_remain_disabled() {
        let db = Database::connect("sqlite::memory:").await.unwrap();
        db.execute_unprepared(
            "CREATE TABLE user (id INTEGER PRIMARY KEY); INSERT INTO user(id) VALUES (1);",
        )
        .await
        .unwrap();
        let manager = SchemaManager::new(&db);
        Migration.up(&manager).await.unwrap();

        let row = db
            .query_one_raw(Statement::from_string(
                DatabaseBackend::Sqlite,
                "SELECT default_le_launch, default_magpie FROM user WHERE id = 1".to_string(),
            ))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(row.try_get::<bool>("", "default_le_launch").unwrap(), false);
        assert_eq!(row.try_get::<bool>("", "default_magpie").unwrap(), false);
    }
}
