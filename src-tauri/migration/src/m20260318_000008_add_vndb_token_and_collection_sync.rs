//! 给 user 表新增 VNDB token，并交换 clear 的在玩/玩过状态
//!
//! 本迁移执行以下操作：
//! 1. user 表新增 VNDB_TOKEN 字段
//! 2. 交换 games.clear 中 2/3 的含义，使其与 BGM 收藏状态一一对应

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();

        db.execute_unprepared(
            r#"
            ALTER TABLE "user" ADD COLUMN "VNDB_TOKEN" TEXT;
            "#,
        )
        .await?;

        // 交换 2/3：
        // 2 原本是 PLAYING，改为 PLAYED
        // 3 原本是 PLAYED，改为 PLAYING
        db.execute_unprepared(
            r#"
            UPDATE games
            SET clear = CASE
                WHEN clear = 2 THEN 3
                WHEN clear = 3 THEN 2
                ELSE clear
            END
            WHERE clear IN (2, 3);
            "#,
        )
        .await?;

        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Err(DbErr::Custom(
            "此迁移无法回滚，请从备份恢复数据库".to_string(),
        ))
    }
}
