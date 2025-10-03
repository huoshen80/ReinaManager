use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 1. 创建 collections 表
        manager
            .create_table(
                Table::create()
                    .table(Collections::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Collections::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Collections::Name).text().not_null())
                    .col(ColumnDef::new(Collections::ParentId).integer())
                    .col(
                        ColumnDef::new(Collections::SortOrder)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(ColumnDef::new(Collections::Icon).text())
                    .col(
                        ColumnDef::new(Collections::CreatedAt)
                            .integer()
                            .default(Expr::cust("(strftime('%s', 'now'))")),
                    )
                    .col(
                        ColumnDef::new(Collections::UpdatedAt)
                            .integer()
                            .default(Expr::cust("(strftime('%s', 'now'))")),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_collections_parent")
                            .from(Collections::Table, Collections::ParentId)
                            .to(Collections::Table, Collections::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // 2. 创建 collections 表的索引
        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_collections_parent_id")
                    .table(Collections::Table)
                    .col(Collections::ParentId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_collections_sort_order")
                    .table(Collections::Table)
                    .col(Collections::SortOrder)
                    .to_owned(),
            )
            .await?;

        // 3. 创建 game_collection_link 表
        manager
            .create_table(
                Table::create()
                    .table(GameCollectionLink::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(GameCollectionLink::Id)
                            .integer()
                            .not_null()
                            .auto_increment()
                            .primary_key(),
                    )
                    .col(
                        ColumnDef::new(GameCollectionLink::GameId)
                            .integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(GameCollectionLink::CollectionId)
                            .integer()
                            .not_null(),
                    )
                    .col(
                        ColumnDef::new(GameCollectionLink::SortOrder)
                            .integer()
                            .not_null()
                            .default(0),
                    )
                    .col(
                        ColumnDef::new(GameCollectionLink::CreatedAt)
                            .integer()
                            .default(Expr::cust("(strftime('%s', 'now'))")),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_game_collection_link_game")
                            .from(GameCollectionLink::Table, GameCollectionLink::GameId)
                            .to(Games::Table, Games::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_game_collection_link_collection")
                            .from(GameCollectionLink::Table, GameCollectionLink::CollectionId)
                            .to(Collections::Table, Collections::Id)
                            .on_delete(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // 4. 添加 UNIQUE 约束（防止重复关联）
        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_game_collection_link_unique")
                    .table(GameCollectionLink::Table)
                    .col(GameCollectionLink::GameId)
                    .col(GameCollectionLink::CollectionId)
                    .unique()
                    .to_owned(),
            )
            .await?;

        // 5. 创建其他索引
        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_game_collection_link_game_id")
                    .table(GameCollectionLink::Table)
                    .col(GameCollectionLink::GameId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_game_collection_link_collection_id")
                    .table(GameCollectionLink::Table)
                    .col(GameCollectionLink::CollectionId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .if_not_exists()
                    .name("idx_game_collection_link_sort_order")
                    .table(GameCollectionLink::Table)
                    .col(GameCollectionLink::SortOrder)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 删除表（逆序）
        manager
            .drop_table(Table::drop().table(GameCollectionLink::Table).to_owned())
            .await?;

        manager
            .drop_table(Table::drop().table(Collections::Table).to_owned())
            .await?;

        Ok(())
    }
}

/// Collections 表的列定义
#[derive(DeriveIden)]
enum Collections {
    Table,
    Id,
    Name,
    ParentId,
    SortOrder,
    Icon,
    CreatedAt,
    UpdatedAt,
}

/// GameCollectionLink 表的列定义
#[derive(DeriveIden)]
enum GameCollectionLink {
    Table,
    Id,
    GameId,
    CollectionId,
    SortOrder,
    CreatedAt,
}

/// Games 表引用（用于外键）
#[derive(DeriveIden)]
enum Games {
    Table,
    Id,
}
