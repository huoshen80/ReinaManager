use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 添加 kun_id 和 kun_data 列
        manager
            .alter_table(
                Table::alter()
                    .table(Games::Table)
                    .add_column_if_not_exists(ColumnDef::new(Games::KunId).text().null())
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Games::Table)
                    .add_column_if_not_exists(ColumnDef::new(Games::KunData).text().null())
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // Drop columns down if reverted
        manager
            .alter_table(
                Table::alter()
                    .table(Games::Table)
                    .drop_column(Games::KunId)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(Games::Table)
                    .drop_column(Games::KunData)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

/// 需要修改的表和列枚举
#[derive(DeriveIden)]
enum Games {
    Table,
    KunId,
    KunData,
}
