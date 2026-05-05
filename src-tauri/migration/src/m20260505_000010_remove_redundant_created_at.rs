//! 删除冗余的创建时间字段
//!
//! `game_sessions.created_at` 与 `end_time` 语义重复，`savedata.created_at` 与
//! `backup_time` 语义重复。业务代码只使用业务时间字段。

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(GameSessions::Table)
                    .drop_column(GameSessions::CreatedAt)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Savedata::Table)
                    .drop_column(Savedata::CreatedAt)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum GameSessions {
    Table,
    CreatedAt,
}

#[derive(DeriveIden)]
enum Savedata {
    Table,
    CreatedAt,
}
