use sea_orm::{ConnectionTrait, DatabaseBackend, Statement};
use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::TransactionTrait;

use crate::backup::{backup_sqlite, path_to_sqlite_url};
use reina_path::get_db_path;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();

        // 判断是否为新用户 - 检查是否存在任何遗留数据表
        let is_new_user = !has_any_legacy_tables(conn).await?;

        if is_new_user {
            // 新用户建表使用事务，保证 schema 初始化原子性。
            let txn = conn.begin().await?;
            log::info!("[MIGRATION] New user detected, creating modern split table structure");
            create_modern_schema(&txn).await?;
            txn.commit().await?;
        } else {
            // 迁移前备份数据库
            match backup_sqlite("v0.6.9").await {
                Ok(path) => log::info!("[MIGRATION] Database backed up to: {}", path.display()),
                Err(e) => log::warn!("[MIGRATION] Backup failed (continuing anyway): {}", e),
            }
            log::info!("[MIGRATION] Existing user detected, running legacy migration catch-up");
            run_legacy_migrations_with_sqlx().await?;
        }

        log::info!("[MIGRATION] v1 baseline schema created successfully");
        Ok(())
    }
}

/// 检查是否存在任何遗留数据表或数据
async fn has_any_legacy_tables<C>(conn: &C) -> Result<bool, DbErr>
where
    C: ConnectionTrait,
{
    // 老版本可能没有 _sqlx_migrations，只能通过业务表判断是否已有旧数据。
    let legacy_table_exists = conn
        .query_one_raw(Statement::from_string(
            DatabaseBackend::Sqlite,
            r#"SELECT 1 FROM sqlite_master
               WHERE type='table'
               AND name IN (
                   '_sqlx_migrations',
                   'games',
                   'user',
                   'game_sessions',
                   'game_statistics',
                   'savedata'
               )
               LIMIT 1"#,
        ))
        .await?
        .is_some();
    Ok(legacy_table_exists)
}

/// 为新用户创建现代的拆分表结构
async fn create_modern_schema<C>(conn: &C) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    // 1. 创建核心 games 表（只保留本地管理相关字段）
    conn.execute_raw(Statement::from_string(
        DatabaseBackend::Sqlite,
        r#"CREATE TABLE "games" (
            "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            "bgm_id" TEXT,
            "vndb_id" TEXT,
            "id_type" TEXT NOT NULL,
            "date" TEXT,
            "localpath" TEXT,
            "savepath" TEXT,
            "autosave" INTEGER DEFAULT 0,
            "clear" INTEGER DEFAULT 0,
            "custom_name" TEXT,
            "custom_cover" TEXT,
            "created_at" INTEGER DEFAULT (strftime('%s', 'now')),
            "updated_at" INTEGER DEFAULT (strftime('%s', 'now'))
        )"#,
    ))
    .await?;

    // 2. 创建 BGM 数据表
    conn.execute_raw(Statement::from_string(
        DatabaseBackend::Sqlite,
        r#"CREATE TABLE "bgm_data" (
            "game_id" INTEGER NOT NULL PRIMARY KEY,
            "image" TEXT,
            "name" TEXT,
            "name_cn" TEXT,
            "aliases" TEXT,
            "summary" TEXT,
            "tags" TEXT,
            "rank" INTEGER,
            "score" REAL,
            "developer" TEXT,
            FOREIGN KEY("game_id") REFERENCES "games"("id") ON DELETE CASCADE
        )"#,
    ))
    .await?;

    // 3. 创建 VNDB 数据表
    conn.execute_raw(Statement::from_string(
        DatabaseBackend::Sqlite,
        r#"CREATE TABLE "vndb_data" (
            "game_id" INTEGER NOT NULL PRIMARY KEY,
            "image" TEXT,
            "name" TEXT,
            "name_cn" TEXT,
            "all_titles" TEXT,
            "aliases" TEXT,
            "summary" TEXT,
            "tags" TEXT,
            "average_hours" REAL,
            "developer" TEXT,
            "score" REAL,
            FOREIGN KEY("game_id") REFERENCES "games"("id") ON DELETE CASCADE
        )"#,
    ))
    .await?;

    // 4. 创建其他数据表
    conn.execute_raw(Statement::from_string(
        DatabaseBackend::Sqlite,
        r#"CREATE TABLE "other_data" (
            "game_id" INTEGER NOT NULL PRIMARY KEY,
            "image" TEXT,
            "name" TEXT,
            "summary" TEXT,
            "tags" TEXT,
            "developer" TEXT,
            FOREIGN KEY("game_id") REFERENCES "games"("id") ON DELETE CASCADE
        )"#,
    ))
    .await?;

    // 5. 创建关联表
    create_related_tables(conn).await?;

    // 6. 创建用户表
    conn.execute_raw(Statement::from_string(
        DatabaseBackend::Sqlite,
        r#"CREATE TABLE "user" (
            "id" INTEGER PRIMARY KEY,
            "BGM_TOKEN" TEXT,
            "save_root_path" TEXT,
            "db_backup_path" TEXT
        )"#,
    ))
    .await?;

    // 7. 创建现代结构的索引
    create_modern_indexes(conn).await?;

    Ok(())
}

/// 创建关联表（游戏会话、统计、存档等）
async fn create_related_tables<C>(conn: &C) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    // 游戏会话记录表
    conn.execute_raw(Statement::from_string(
        DatabaseBackend::Sqlite,
        r#"CREATE TABLE "game_sessions" (
            "session_id" INTEGER PRIMARY KEY AUTOINCREMENT,
            "game_id" INTEGER NOT NULL,
            "start_time" INTEGER NOT NULL,
            "end_time" INTEGER NOT NULL,
            "duration" INTEGER NOT NULL,
            "date" TEXT NOT NULL,
            "created_at" INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY("game_id") REFERENCES "games"("id") ON DELETE CASCADE
        )"#,
    ))
    .await?;

    // 游戏统计信息表
    conn.execute_raw(Statement::from_string(
        DatabaseBackend::Sqlite,
        r#"CREATE TABLE "game_statistics" (
            "game_id" INTEGER PRIMARY KEY,
            "total_time" INTEGER,
            "session_count" INTEGER,
            "last_played" INTEGER,
            "daily_stats" TEXT,
            FOREIGN KEY("game_id") REFERENCES "games"("id") ON DELETE CASCADE
        )"#,
    ))
    .await?;

    // 存档备份表
    conn.execute_raw(Statement::from_string(
        DatabaseBackend::Sqlite,
        r#"CREATE TABLE "savedata" (
            "id" INTEGER PRIMARY KEY AUTOINCREMENT,
            "game_id" INTEGER NOT NULL,
            "file" TEXT NOT NULL,
            "backup_time" INTEGER NOT NULL,
            "file_size" INTEGER NOT NULL,
            "created_at" INTEGER DEFAULT (strftime('%s', 'now')),
            FOREIGN KEY("game_id") REFERENCES "games"("id") ON DELETE CASCADE
        )"#,
    ))
    .await?;

    Ok(())
}

/// 为现代拆分结构创建索引
async fn create_modern_indexes<C>(conn: &C) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    let indexes = [
        // games 表索引
        ("idx_games_bgm_id", "games", "bgm_id"),
        ("idx_games_vndb_id", "games", "vndb_id"),
        ("idx_games_id_type", "games", "id_type"),
        ("idx_games_clear", "games", "clear"),
        ("idx_games_created_at", "games", "created_at"),
        // 数据表索引
        ("idx_bgm_data_name", "bgm_data", "name"),
        ("idx_vndb_data_name", "vndb_data", "name"),
        ("idx_other_data_name", "other_data", "name"),
        // 关联表索引
        ("idx_game_sessions_game_id", "game_sessions", "game_id"),
        ("idx_game_sessions_date", "game_sessions", "date"),
        (
            "idx_game_sessions_start_time",
            "game_sessions",
            "start_time",
        ),
        (
            "idx_game_statistics_last_played",
            "game_statistics",
            "last_played",
        ),
        ("idx_savedata_game_id", "savedata", "game_id"),
        ("idx_savedata_backup_time", "savedata", "backup_time"),
    ];

    for (index_name, table_name, column_name) in &indexes {
        conn.execute_raw(Statement::from_string(
            DatabaseBackend::Sqlite,
            format!(
                r#"CREATE INDEX IF NOT EXISTS "{}" ON "{}" ("{}")"#,
                index_name, table_name, column_name
            ),
        ))
        .await?;
    }

    Ok(())
}

/// 为现有用户运行旧的 tauri-plugin-sql 迁移，使用 sqlx 执行
async fn run_legacy_migrations_with_sqlx() -> Result<(), DbErr> {
    log::info!("[MIGRATION] Running legacy migrations with sqlx...");

    // 获取数据库连接 URL（从系统目录推导）
    let db_path =
        get_db_path().map_err(|e| DbErr::Custom(format!("Failed to get database path: {}", e)))?;
    let database_url = path_to_sqlite_url(&db_path)?;

    // 创建 sqlx 连接池
    let pool = sqlx::SqlitePool::connect(&database_url)
        .await
        .map_err(|e| DbErr::Custom(format!("Failed to connect with sqlx: {}", e)))?;

    // 更老的数据库可能没有 sqlx 迁移记录表，先补齐后再执行补偿迁移。
    ensure_sqlx_migrations_table(&pool).await?;

    // 检查并运行旧迁移
    run_legacy_migration_001(&pool).await?;
    run_legacy_migration_002(&pool).await?;

    // 清理 sqlx 的迁移记录，因为我们转移到 SeaORM
    cleanup_sqlx_migration_table(&pool).await?;

    pool.close().await;
    log::info!("[MIGRATION] Legacy migrations completed successfully");
    Ok(())
}

/// 确保旧 sqlx 迁移记录表存在
async fn ensure_sqlx_migrations_table(pool: &sqlx::SqlitePool) -> Result<(), DbErr> {
    sqlx::query(
        r#"CREATE TABLE IF NOT EXISTS _sqlx_migrations (
            version        BIGINT    PRIMARY KEY,
            description    TEXT      NOT NULL,
            installed_on   TIMESTAMP NOT NULL
                                     DEFAULT CURRENT_TIMESTAMP,
            success        BOOLEAN   NOT NULL,
            checksum       BLOB      NOT NULL,
            execution_time BIGINT    NOT NULL
        )"#,
    )
    .execute(pool)
    .await
    .map_err(|e| DbErr::Custom(format!("Failed to ensure sqlx migrations table: {}", e)))?;

    Ok(())
}

/// 运行旧迁移 001 - 数据库初始化
async fn run_legacy_migration_001(pool: &sqlx::SqlitePool) -> Result<(), DbErr> {
    log::debug!("[MIGRATION] Checking legacy migration 001...");

    // 检查是否已经执行过这个迁移
    let migration_exists =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM _sqlx_migrations WHERE version = 1")
            .fetch_one(pool)
            .await
            .unwrap_or(0)
            > 0;

    if migration_exists {
        log::debug!("[MIGRATION] Migration 001 already applied, skipping");
        return Ok(());
    }

    log::info!("[MIGRATION] Applying migration 001 - database initialization");

    // 执行迁移 001 的 SQL
    let migration_sql = include_str!("../old_migrations/001_database_initialization.sql");

    sqlx::query(migration_sql)
        .execute(pool)
        .await
        .map_err(|e| DbErr::Custom(format!("Failed to execute migration 001: {}", e)))?;

    // 记录迁移
    sqlx::query(
        "INSERT INTO _sqlx_migrations (version, description, installed_on, success, checksum, execution_time)
         VALUES (1, 'database_initialization', datetime('now'), 1, 0, 0)"
    )
    .execute(pool)
    .await
    .map_err(|e| DbErr::Custom(format!("Failed to record migration 001: {}", e)))?;

    log::info!("[MIGRATION] Migration 001 applied successfully");
    Ok(())
}

/// 运行旧迁移 002 - 添加自定义字段
async fn run_legacy_migration_002(pool: &sqlx::SqlitePool) -> Result<(), DbErr> {
    log::debug!("[MIGRATION] Checking legacy migration 002...");

    // 检查是否已经执行过这个迁移
    let migration_exists =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM _sqlx_migrations WHERE version = 2")
            .fetch_one(pool)
            .await
            .unwrap_or(0)
            > 0;

    if migration_exists {
        log::debug!("[MIGRATION] Migration 002 already applied, skipping");
        return Ok(());
    }

    log::info!("[MIGRATION] Applying migration 002 - add custom fields");

    ensure_games_column(pool, "aliases", "TEXT").await?;
    ensure_games_column(pool, "custom_name", "TEXT").await?;
    ensure_games_column(pool, "custom_cover", "TEXT").await?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_games_custom_name ON games(custom_name)")
        .execute(pool)
        .await
        .map_err(|e| DbErr::Custom(format!("Failed to create idx_games_custom_name: {}", e)))?;

    sqlx::query("CREATE INDEX IF NOT EXISTS idx_games_custom_cover ON games(custom_cover)")
        .execute(pool)
        .await
        .map_err(|e| DbErr::Custom(format!("Failed to create idx_games_custom_cover: {}", e)))?;

    // 记录迁移
    sqlx::query(
        "INSERT INTO _sqlx_migrations (version, description, installed_on, success, checksum, execution_time)
         VALUES (2, 'add_custom_fields', datetime('now'), 1, 0, 0)"
    )
    .execute(pool)
    .await
    .map_err(|e| DbErr::Custom(format!("Failed to record migration 002: {}", e)))?;

    log::info!("[MIGRATION] Migration 002 applied successfully");
    Ok(())
}

/// SQLite 不支持旧版本通用的 ADD COLUMN IF NOT EXISTS，需要先查列。
async fn ensure_games_column(
    pool: &sqlx::SqlitePool,
    column_name: &str,
    column_type: &str,
) -> Result<(), DbErr> {
    let column_exists = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM pragma_table_info('games') WHERE name = ?",
    )
    .bind(column_name)
    .fetch_one(pool)
    .await
    .map_err(|e| DbErr::Custom(format!("Failed to inspect games.{}: {}", column_name, e)))?
        > 0;

    if column_exists {
        return Ok(());
    }

    // 列名和类型仅由上方迁移中的固定字面量传入，已确认不存在外部输入。
    sqlx::query(sqlx::AssertSqlSafe(format!(
        r#"ALTER TABLE games ADD COLUMN "{}" {}"#,
        column_name, column_type
    )))
    .execute(pool)
    .await
    .map_err(|e| DbErr::Custom(format!("Failed to add games.{}: {}", column_name, e)))?;

    Ok(())
}

/// 清理 sqlx 的迁移记录表，为转移到 SeaORM 做准备
async fn cleanup_sqlx_migration_table(pool: &sqlx::SqlitePool) -> Result<(), DbErr> {
    log::info!("[MIGRATION] Cleaning up sqlx migration records...");

    sqlx::query("DROP TABLE IF EXISTS _legacy_sqlx_migrations")
        .execute(pool)
        .await
        .map_err(|e| {
            DbErr::Custom(format!(
                "Failed to drop legacy sqlx migrations table: {}",
                e
            ))
        })?;

    // 保留本轮补偿迁移历史，但避免重试时 rename 目标表已存在。
    sqlx::query("ALTER TABLE _sqlx_migrations RENAME TO _legacy_sqlx_migrations")
        .execute(pool)
        .await
        .map_err(|e| DbErr::Custom(format!("Failed to rename sqlx migrations table: {}", e)))?;

    log::info!("[MIGRATION] sqlx migration table renamed to _legacy_sqlx_migrations");
    Ok(())
}
