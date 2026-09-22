//! 添加 LE 和 Magpie 相关字段
//!
//! 此迁移添加四个新字段：
//! 1. games 表添加 le_launch 字段，默认值为 0
//! 2. user 表添加 le_path 字段，用于存储 LE 转区软件路径
//! 3. games 表添加 magpie 字段，默认值为 0
//! 4. user 表添加 magpie_path 字段，用于存储 Magpie 软件路径

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 1. 给 games 表添加 le_launch 列，默认值为 0
        manager
            .alter_table(
                Table::alter()
                    .table(Games::Table)
                    .add_column(ColumnDef::new(Games::LeLaunch).integer().default(0))
                    .to_owned(),
            )
            .await?;

        // 2. 给 user 表添加 le_path 列
        manager
            .alter_table(
                Table::alter()
                    .table(User::Table)
                    .add_column(ColumnDef::new(User::LePath).text().null())
                    .to_owned(),
            )
            .await?;

        // 3. 给 games 表添加 magpie 列，默认值为 0
        manager
            .alter_table(
                Table::alter()
                    .table(Games::Table)
                    .add_column(ColumnDef::new(Games::Magpie).integer().default(0))
                    .to_owned(),
            )
            .await?;

        // 4. 给 user 表添加 magpie_path 列
        manager
            .alter_table(
                Table::alter()
                    .table(User::Table)
                    .add_column(ColumnDef::new(User::MagpiePath).text().null())
                    .to_owned(),
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

#[derive(DeriveIden)]
enum Games {
    Table,
    LeLaunch,
    Magpie,
}

#[derive(DeriveIden)]
enum User {
    Table,
    LePath,
    MagpiePath,
}
