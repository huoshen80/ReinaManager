//! 将 clear 字段从 0/1 迁移到 PlayStatus 枚举 (1-5)
//!
//! 此迁移执行以下转换：
//! - 0 (未通关) -> 1 (想玩/WISH)
//! - 1 (已通关) -> 3 (玩过/PLAYED)

use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();

        // 步骤1: 将 clear = 1 (已通关) 转换为 3 (玩过/PLAYED)
        // 必须先处理 1->3，因为后面 0->1 会改变值
        db.execute_unprepared("UPDATE games SET clear = 3 WHERE clear = 1")
            .await?;

        // 步骤2: 将 clear = 0 (未通关) 转换为 1 (想玩/WISH)
        db.execute_unprepared("UPDATE games SET clear = 1 WHERE clear = 0")
            .await?;

        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Err(DbErr::Custom(
            "此迁移无法回滚，请从备份恢复数据库".to_string(),
        ))
    }
}
