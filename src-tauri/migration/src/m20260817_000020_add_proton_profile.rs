//! 为游戏添加 proton-autogen 配置字段。
//!
//! games 表新增 proton_profile 列：
//! - NULL 表示不使用 proton-autogen，按原有 linux_launch_command 逻辑启动
//! - 非 NULL 值为 proton-autogen 的 profile 名称（如 "dx11"、"legacy"），
//!   启动 .exe 时以 `proton-autogen --profile <name> <exe>` 方式运行

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Games::Table)
                    .add_column(ColumnDef::new(Games::ProtonProfile).text().null())
                    .to_owned(),
            )
            .await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(Games::Table)
                    .drop_column(Games::ProtonProfile)
                    .to_owned(),
            )
            .await
    }
}

#[derive(DeriveIden)]
enum Games {
    Table,
    ProtonProfile,
}
