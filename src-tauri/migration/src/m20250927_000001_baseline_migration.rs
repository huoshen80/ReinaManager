use sea_orm::{ConnectionTrait, DatabaseBackend, Statement};
use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::TransactionTrait;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let conn = manager.get_connection();

        // 开启事务，保证所有操作的原子性
        let txn = conn.begin().await?;

        // 判断是否为新用户 - 检查是否存在任何遗留数据表
        let is_new_user = !has_any_legacy_tables(&txn).await?;

        if is_new_user {
            println!("[MIGRATION] New user detected, creating modern split table structure");
            create_modern_schema(&txn).await?;
        } else {
            println!("[MIGRATION] Existing user detected, running legacy migration catch-up");
            run_legacy_migrations_with_sqlx().await?;
        }

        // 提交事务
        txn.commit().await?;

        println!("[MIGRATION] v1 baseline schema created successfully");
        Ok(())
    }
}

/// 检查是否存在任何遗留数据表或数据
async fn has_any_legacy_tables<C>(conn: &C) -> Result<bool, DbErr>
where
    C: ConnectionTrait,
{
    // 检查是否存在 tauri-plugin-sql 的迁移表
    let legacy_migration_exists = conn
        .query_one(Statement::from_string(
            DatabaseBackend::Sqlite,
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='_sqlx_migrations'",
        ))
        .await?
        .is_some();
    Ok(legacy_migration_exists)
}

/// 为新用户创建现代的拆分表结构
async fn create_modern_schema<C>(conn: &C) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    // 1. 创建核心 games 表（只保留本地管理相关字段）
    conn.execute(Statement::from_string(
        DatabaseBackend::Sqlite,
        r#"CREATE TABLE "games" (
            "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
            "bgm_id" TEXT,
            "vndb_id" TEXT,
            "id_type" TEXT NOT NULL DEFAULT 'custom',
            "date" TEXT,
            "localpath" TEXT,
            "savepath" TEXT,
            "autosave" INTEGER DEFAULT 0,
            "clear" INTEGER DEFAULT 0,
            "custom_name" TEXT,
            "custom_cover" TEXT,
            "created_at" INTEGER DEFAULT (strftime('%s', 'now')),
            "updated_at" INTEGER DEFAULT (strftime('%s', 'now')),
            CONSTRAINT "ck_id_type" CHECK ("id_type" IN ('bgm', 'vndb', 'custom', 'mixed', 'other'))
        )"#,
    ))
    .await?;

    // 2. 创建 BGM 数据表
    conn.execute(Statement::from_string(
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
    conn.execute(Statement::from_string(
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
    conn.execute(Statement::from_string(
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

    // 6. 创建现代结构的索引
    create_modern_indexes(conn).await?;

    Ok(())
}

/// 创建关联表（游戏会话、统计、存档等）
async fn create_related_tables<C>(conn: &C) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    // 游戏会话记录表
    conn.execute(Statement::from_string(
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
    conn.execute(Statement::from_string(
        DatabaseBackend::Sqlite,
        r#"CREATE TABLE "game_statistics" (
            "game_id" INTEGER PRIMARY KEY,
            "total_time" INTEGER DEFAULT 0,
            "session_count" INTEGER DEFAULT 0,
            "last_played" INTEGER,
            "daily_stats" TEXT,
            FOREIGN KEY("game_id") REFERENCES "games"("id") ON DELETE CASCADE
        )"#,
    ))
    .await?;

    // 存档备份表
    conn.execute(Statement::from_string(
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
        conn.execute(Statement::from_string(
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
    println!("[MIGRATION] Running legacy migrations with sqlx...");

    // 获取数据库连接 URL（从系统目录推导）
    let database_url = get_db_path()?;

    // 创建 sqlx 连接池
    let pool = sqlx::SqlitePool::connect(&database_url)
        .await
        .map_err(|e| DbErr::Custom(format!("Failed to connect with sqlx: {}", e)))?;

    // 检查并运行旧迁移
    run_legacy_migration_001(&pool).await?;
    run_legacy_migration_002(&pool).await?;

    // 清理 sqlx 的迁移记录，因为我们转移到 SeaORM
    cleanup_sqlx_migration_table(&pool).await?;

    pool.close().await;
    println!("[MIGRATION] Legacy migrations completed successfully");
    Ok(())
}

/// 从系统目录推导数据库连接字符串（无需外部参数）
fn get_db_path() -> Result<String, DbErr> {
    use std::path::PathBuf;

    // 使用 config_dir (Roaming on Windows) 来匹配原先的 app_data_dir 行为
    let base = dirs_next::config_dir()
        .or_else(dirs_next::data_dir)
        .ok_or_else(|| DbErr::Custom("Failed to resolve user data directory".to_string()))?;

    let db_path: PathBuf = base
        .join("com.reinamanager.dev")
        .join("data")
        .join("reina_manager.db");

    // 使用 url::Url::from_file_path 保证路径格式正确
    let db_url = url::Url::from_file_path(&db_path)
        .map_err(|_| DbErr::Custom("Invalid database path".to_string()))?;
    let conn = format!("sqlite:{}?mode=rwc", db_url.path());
    Ok(conn)
}

/// 运行旧迁移 001 - 数据库初始化
async fn run_legacy_migration_001(pool: &sqlx::SqlitePool) -> Result<(), DbErr> {
    println!("[MIGRATION] Checking legacy migration 001...");

    // 检查是否已经执行过这个迁移
    let migration_exists =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM _sqlx_migrations WHERE version = 1")
            .fetch_one(pool)
            .await
            .unwrap_or(0)
            > 0;

    if migration_exists {
        println!("[MIGRATION] Migration 001 already applied, skipping");
        return Ok(());
    }

    println!("[MIGRATION] Applying migration 001 - database initialization");

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

    println!("[MIGRATION] Migration 001 applied successfully");
    Ok(())
}

/// 运行旧迁移 002 - 添加自定义字段
async fn run_legacy_migration_002(pool: &sqlx::SqlitePool) -> Result<(), DbErr> {
    println!("[MIGRATION] Checking legacy migration 002...");

    // 检查是否已经执行过这个迁移
    let migration_exists =
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM _sqlx_migrations WHERE version = 2")
            .fetch_one(pool)
            .await
            .unwrap_or(0)
            > 0;

    if migration_exists {
        println!("[MIGRATION] Migration 002 already applied, skipping");
        return Ok(());
    }

    println!("[MIGRATION] Applying migration 002 - add custom fields");

    // 执行迁移 002 的 SQL
    let migration_sql = include_str!("../old_migrations/002_add_custom_fields.sql");

    sqlx::query(migration_sql)
        .execute(pool)
        .await
        .map_err(|e| DbErr::Custom(format!("Failed to execute migration 002: {}", e)))?;

    // 记录迁移
    sqlx::query(
        "INSERT INTO _sqlx_migrations (version, description, installed_on, success, checksum, execution_time) 
         VALUES (2, 'add_custom_fields', datetime('now'), 1, 0, 0)"
    )
    .execute(pool)
    .await
    .map_err(|e| DbErr::Custom(format!("Failed to record migration 002: {}", e)))?;

    println!("[MIGRATION] Migration 002 applied successfully");
    Ok(())
}

/// 清理 sqlx 的迁移记录表，为转移到 SeaORM 做准备
async fn cleanup_sqlx_migration_table(pool: &sqlx::SqlitePool) -> Result<(), DbErr> {
    println!("[MIGRATION] Cleaning up sqlx migration records...");

    // 可选：保留迁移历史但重命名表
    sqlx::query("ALTER TABLE _sqlx_migrations RENAME TO _legacy_sqlx_migrations")
        .execute(pool)
        .await
        .map_err(|e| DbErr::Custom(format!("Failed to rename sqlx migrations table: {}", e)))?;

    println!("[MIGRATION] sqlx migration table renamed to _legacy_sqlx_migrations");
    Ok(())
}
