//! 数据库重构迁移：从星型多表架构到混合型单表架构
//!
//! 核心目标：将元数据（VNDB/BGM/YMGAL/用户数据）内化为 games 表的 JSON 列，
//! 简化数据模型，提升查询效率。
//!
//! 迁移策略（三步走）：
//! 1. 扩展：在 games 表中 ADD COLUMN 新的 JSON 列和其他新字段
//! 2. ETL：从旧表读取数据，序列化为 JSON 并写入新列（使用事务保证原子性）
//! 3. 清理：DROP TABLE 旧表，DROP COLUMN 废弃的列
//!
//! 优化：
//! - 使用 LEFT JOIN 避免 N+1 查询问题
//! - 使用参数绑定避免 SQL 注入
//! - 使用事务确保数据一致性
//! - 在清理前关闭外键检查
//!
//! 注意：本迁移要求 SQLite >= 3.35.0 以支持 DROP COLUMN

use crate::backup::backup_sqlite;
use log::{error, info};
use sea_orm::{ConnectionTrait, DatabaseBackend, Statement};
use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::TransactionTrait;
use serde::{Deserialize, Serialize};

#[derive(DeriveMigrationName)]
pub struct Migration;

// === JSON 结构定义（不含 game_id，包含 date）===

/// VNDB 数据结构（JSON 列）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)] // 确保向后兼容
struct VndbDataJson {
    #[serde(skip_serializing_if = "Option::is_none")]
    image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name_cn: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    all_titles: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    aliases: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    average_hours: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    developer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    nsfw: Option<bool>,
}

/// BGM 数据结构（JSON 列）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)] // 确保向后兼容
struct BgmDataJson {
    #[serde(skip_serializing_if = "Option::is_none")]
    image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name_cn: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    aliases: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    rank: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    developer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    nsfw: Option<bool>,
}

/// 自定义数据结构（JSON 列，替代 other_data + custom_name/custom_cover）
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(default)] // 确保向后兼容
struct CustomDataJson {
    #[serde(skip_serializing_if = "Option::is_none")]
    image: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    aliases: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    developer: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    date: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    nsfw: Option<bool>,
}

// === 辅助函数 ===

/// 将字符串解析为 JSON 数组
fn parse_json_array(s: Option<String>) -> Option<Vec<String>> {
    s.and_then(|str| {
        if str.is_empty() {
            return None;
        }
        serde_json::from_str::<Vec<String>>(&str).ok()
    })
}

/// 从 QueryResult 获取可选字符串
fn get_opt_string(row: &sea_orm::QueryResult, col: &str) -> Option<String> {
    row.try_get::<Option<String>>("", col).ok().flatten()
}

/// 从 QueryResult 获取可选 i32
fn get_opt_i32(row: &sea_orm::QueryResult, col: &str) -> Option<i32> {
    row.try_get::<Option<i32>>("", col).ok().flatten()
}

/// 从 QueryResult 获取可选 f64
fn get_opt_f64(row: &sea_orm::QueryResult, col: &str) -> Option<f64> {
    row.try_get::<Option<f64>>("", col).ok().flatten()
}

/// 将结构体序列化为 JSON 字符串
fn to_json<T: Serialize>(data: &T) -> Result<String, DbErr> {
    serde_json::to_string(data).map_err(|e| DbErr::Custom(format!("JSON 序列化失败: {}", e)))
}

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // ========================================
        // 备份数据库
        // ========================================
        info!("[MIGRATION] Starting database backup before hybrid single table migration...");
        match backup_sqlite("v0.13.0").await {
            Ok(backup_path) => info!("[MIGRATION] Backup successful: {:?}", backup_path),
            Err(e) => error!("[MIGRATION] Backup failed (continuing anyway): {}", e),
        }

        let conn = manager.get_connection();

        // 幂等性检查：如果已存在 vndb_data 列则跳过
        let check_result = conn
            .query_one(Statement::from_string(
                DatabaseBackend::Sqlite,
                "SELECT COUNT(*) as cnt FROM pragma_table_info('games') WHERE name = 'vndb_data'",
            ))
            .await?;

        if let Some(row) = check_result {
            let count: i32 = row.try_get("", "cnt")?;
            if count > 0 {
                return Ok(());
            }
        }

        // ========================================
        // 第一步：扩展 - 添加新列
        // ========================================

        // 添加 JSON 数据列
        conn.execute_unprepared("ALTER TABLE games ADD COLUMN vndb_data TEXT")
            .await?;
        conn.execute_unprepared("ALTER TABLE games ADD COLUMN bgm_data TEXT")
            .await?;
        conn.execute_unprepared("ALTER TABLE games ADD COLUMN ymgal_data TEXT")
            .await?;
        conn.execute_unprepared("ALTER TABLE games ADD COLUMN custom_data TEXT")
            .await?;

        // 添加新的业务字段
        conn.execute_unprepared("ALTER TABLE games ADD COLUMN maxbackups INTEGER DEFAULT 20")
            .await?;
        conn.execute_unprepared("ALTER TABLE games ADD COLUMN ymgal_id TEXT")
            .await?;

        // ========================================
        // 第二步：ETL - 数据清洗与迁移（使用事务）
        // ========================================

        let txn = conn.begin().await?;

        // 2.1 迁移 vndb_data 表（使用 LEFT JOIN 避免 N+1 查询）
        let vndb_rows = txn
            .query_all(Statement::from_string(
                DatabaseBackend::Sqlite,
                r#"SELECT v.game_id, v.image, v.name, v.name_cn, v.all_titles, v.aliases, 
                          v.summary, v.tags, v.average_hours, v.developer, v.score, g.date
                   FROM vndb_data v
                   LEFT JOIN games g ON v.game_id = g.id"#,
            ))
            .await?;

        for row in vndb_rows {
            let game_id: i32 = row.try_get("", "game_id")?;

            let data = VndbDataJson {
                image: get_opt_string(&row, "image"),
                name: get_opt_string(&row, "name"),
                name_cn: get_opt_string(&row, "name_cn"),
                all_titles: parse_json_array(get_opt_string(&row, "all_titles")),
                aliases: parse_json_array(get_opt_string(&row, "aliases")),
                summary: get_opt_string(&row, "summary"),
                tags: parse_json_array(get_opt_string(&row, "tags")),
                average_hours: get_opt_f64(&row, "average_hours"),
                developer: get_opt_string(&row, "developer"),
                score: get_opt_f64(&row, "score"),
                date: get_opt_string(&row, "date"),
                nsfw: None,
            };

            let json_str = to_json(&data)?;

            // 使用参数绑定确保类型安全
            txn.execute(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "UPDATE games SET vndb_data = ? WHERE id = ?",
                vec![json_str.into(), game_id.into()],
            ))
            .await?;
        }

        // 2.2 迁移 bgm_data 表（使用 LEFT JOIN）
        let bgm_rows = txn
            .query_all(Statement::from_string(
                DatabaseBackend::Sqlite,
                r#"SELECT b.game_id, b.image, b.name, b.name_cn, b.aliases, b.summary, 
                          b.tags, b.rank, b.score, b.developer, g.date
                   FROM bgm_data b
                   LEFT JOIN games g ON b.game_id = g.id"#,
            ))
            .await?;

        for row in bgm_rows {
            let game_id: i32 = row.try_get("", "game_id")?;

            let data = BgmDataJson {
                image: get_opt_string(&row, "image"),
                name: get_opt_string(&row, "name"),
                name_cn: get_opt_string(&row, "name_cn"),
                aliases: parse_json_array(get_opt_string(&row, "aliases")),
                summary: get_opt_string(&row, "summary"),
                tags: parse_json_array(get_opt_string(&row, "tags")),
                rank: get_opt_i32(&row, "rank"),
                score: get_opt_f64(&row, "score"),
                developer: get_opt_string(&row, "developer"),
                date: get_opt_string(&row, "date"),
                nsfw: None,
            };

            let json_str = to_json(&data)?;

            txn.execute(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "UPDATE games SET bgm_data = ? WHERE id = ?",
                vec![json_str.into(), game_id.into()],
            ))
            .await?;
        }

        // 2.3 迁移 other_data 表到 custom_data（合并 custom_name/custom_cover，使用 LEFT JOIN）
        let other_rows = txn
            .query_all(Statement::from_string(
                DatabaseBackend::Sqlite,
                r#"SELECT o.game_id, o.name, o.summary, o.tags, o.developer,
                          g.date, g.custom_name, g.custom_cover
                   FROM other_data o
                   LEFT JOIN games g ON o.game_id = g.id"#,
            ))
            .await?;

        for row in other_rows {
            let game_id: i32 = row.try_get("", "game_id")?;

            // 优先使用 custom_name/custom_cover
            let data = CustomDataJson {
                image: get_opt_string(&row, "custom_cover"),
                name: get_opt_string(&row, "custom_name").or_else(|| get_opt_string(&row, "name")),
                aliases: None,
                summary: get_opt_string(&row, "summary"),
                tags: parse_json_array(get_opt_string(&row, "tags")),
                developer: get_opt_string(&row, "developer"),
                date: get_opt_string(&row, "date"),
                nsfw: None,
            };

            let json_str = to_json(&data)?;

            txn.execute(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "UPDATE games SET custom_data = ? WHERE id = ?",
                vec![json_str.into(), game_id.into()],
            ))
            .await?;
        }

        // 2.4 处理没有 other_data 但有 custom_name/custom_cover 的记录
        let custom_only_rows = txn
            .query_all(Statement::from_string(
                DatabaseBackend::Sqlite,
                r#"SELECT id, date, custom_name, custom_cover FROM games 
                   WHERE (custom_name IS NOT NULL OR custom_cover IS NOT NULL) 
                   AND id NOT IN (SELECT game_id FROM other_data)"#,
            ))
            .await?;

        for row in custom_only_rows {
            let game_id: i32 = row.try_get("", "id")?;

            let data = CustomDataJson {
                image: get_opt_string(&row, "custom_cover"),
                name: get_opt_string(&row, "custom_name"),
                aliases: None,
                summary: None,
                tags: None,
                developer: None,
                date: get_opt_string(&row, "date"),
                nsfw: None,
            };

            let json_str = to_json(&data)?;

            txn.execute(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "UPDATE games SET custom_data = ? WHERE id = ?",
                vec![json_str.into(), game_id.into()],
            ))
            .await?;
        }

        // 提交事务
        txn.commit().await?;

        // ========================================
        // 第三步：清理 - 删除旧表和废弃列
        // ========================================

        // 关闭外键检查以避免删除表时的约束冲突
        conn.execute_unprepared("PRAGMA foreign_keys = OFF").await?;

        // 删除旧的数据库迁移表
        conn.execute_unprepared("DROP TABLE IF EXISTS _sqlx_migrations")
            .await?;

        // 删除旧的数据表
        conn.execute_unprepared("DROP TABLE IF EXISTS vndb_data")
            .await?;
        conn.execute_unprepared("DROP TABLE IF EXISTS bgm_data")
            .await?;
        conn.execute_unprepared("DROP TABLE IF EXISTS other_data")
            .await?;

        // 删除废弃的列（需要 SQLite >= 3.35.0）
        conn.execute_unprepared("ALTER TABLE games DROP COLUMN custom_name")
            .await?;
        conn.execute_unprepared("ALTER TABLE games DROP COLUMN custom_cover")
            .await?;

        // 重新开启外键检查
        conn.execute_unprepared("PRAGMA foreign_keys = ON").await?;

        // 整理数据库碎片
        conn.execute_unprepared("VACUUM").await?;

        Ok(())
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        // 此迁移涉及数据转换和删除旧表，回滚操作非常复杂
        // 建议从备份恢复数据库
        Err(DbErr::Custom(
            "此迁移无法回滚，请从备份恢复数据库".to_string(),
        ))
    }
}
