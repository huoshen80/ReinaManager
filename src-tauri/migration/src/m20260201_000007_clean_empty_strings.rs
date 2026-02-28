//! 清洗数据库中的空字符串为 NULL
//!
//! 此迁移执行以下转换：
//! - games 表: bgm_id, vndb_id, ymgal_id, date, localpath, savepath 从 "" -> NULL
//! - user 表: BGM_TOKEN, save_root_path, db_backup_path 从 "" -> NULL
//! - collections 表: name, icon 从 "" -> NULL
//!
//! 注意: id_type 字段是 NOT NULL，保持原样不处理

use crate::backup::backup_sqlite;
use log::{error, info};
use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // ========================================
        // 备份数据库
        // ========================================
        info!("[MIGRATION] Starting database backup before clean empty strings migration...");
        match backup_sqlite("v0.14.2").await {
            Ok(backup_path) => info!("[MIGRATION] Backup successful: {:?}", backup_path),
            Err(e) => error!("[MIGRATION] Backup failed (continuing anyway): {}", e),
        }
        let db = manager.get_connection();

        // 清洗 games 表中的空字符串为 NULL
        // === 外部 ID 列 ===
        db.execute_unprepared("UPDATE games SET bgm_id = NULL WHERE bgm_id = ''")
            .await?;
        db.execute_unprepared("UPDATE games SET vndb_id = NULL WHERE vndb_id = ''")
            .await?;
        db.execute_unprepared("UPDATE games SET ymgal_id = NULL WHERE ymgal_id = ''")
            .await?;

        // === 核心状态列 ===
        db.execute_unprepared("UPDATE games SET date = NULL WHERE date = ''")
            .await?;
        db.execute_unprepared("UPDATE games SET localpath = NULL WHERE localpath = ''")
            .await?;
        db.execute_unprepared("UPDATE games SET savepath = NULL WHERE savepath = ''")
            .await?;

        // === JSON 元数据列 (处理顶层 NULL 值) ===
        // JSON 列内部的空字符串需要在应用层处理
        db.execute_unprepared("UPDATE games SET vndb_data = NULL WHERE vndb_data = 'null'")
            .await?;
        db.execute_unprepared("UPDATE games SET bgm_data = NULL WHERE bgm_data = 'null'")
            .await?;
        db.execute_unprepared("UPDATE games SET ymgal_data = NULL WHERE ymgal_data = 'null'")
            .await?;
        db.execute_unprepared("UPDATE games SET custom_data = NULL WHERE custom_data = 'null'")
            .await?;

        // 清洗 user 表中的空字符串为 NULL
        db.execute_unprepared("UPDATE user SET BGM_TOKEN = NULL WHERE BGM_TOKEN = ''")
            .await?;
        db.execute_unprepared("UPDATE user SET save_root_path = NULL WHERE save_root_path = ''")
            .await?;
        db.execute_unprepared("UPDATE user SET db_backup_path = NULL WHERE db_backup_path = ''")
            .await?;
        db.execute_unprepared("UPDATE user SET le_path = NULL WHERE le_path = ''")
            .await?;
        db.execute_unprepared("UPDATE user SET magpie_path = NULL WHERE magpie_path = ''")
            .await?;

        // 清洗 collections 表中的空字符串为 NULL
        db.execute_unprepared("UPDATE collections SET name = NULL WHERE name = ''")
            .await?;
        db.execute_unprepared("UPDATE collections SET icon = NULL WHERE icon = ''")
            .await?;

        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        // 此迁移不可逆，因为无法区分原始 NULL 和从空字符串转换来的 NULL
        Err(DbErr::Custom(
            "此迁移不可逆，无法区分原始 NULL 和从空字符串转换来的 NULL".to_string(),
        ))
    }
}
