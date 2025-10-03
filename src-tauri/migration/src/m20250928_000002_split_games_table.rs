use sea_orm::{ConnectionTrait, DatabaseBackend, Statement};
use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::TransactionTrait;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // 检查是否已经拆分（通过检查 bgm_data 表是否存在）
        let already_split = manager.has_table("bgm_data").await?;
        if already_split {
            // 已经拆分过，直接返回
            return Ok(());
        }

        // 执行表拆分逻辑
        split_games_table(manager).await?;

        Ok(())
    }
}

async fn split_games_table(manager: &SchemaManager<'_>) -> Result<(), DbErr> {
    let conn = manager.get_connection();

    // 0. 关闭外键约束
    conn.execute(Statement::from_string(
        DatabaseBackend::Sqlite,
        "PRAGMA foreign_keys = OFF;",
    ))
    .await?;

    // 开启事务，保证所有操作的原子性
    let txn = conn.begin().await?;

    // 1. 创建新的核心 games 表（只保留本地管理相关字段）
    txn.execute(Statement::from_string(
        DatabaseBackend::Sqlite,
        r#"CREATE TABLE "games_new" (
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
    txn.execute(Statement::from_string(
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
            FOREIGN KEY("game_id") REFERENCES "games_new"("id") ON DELETE CASCADE
        )"#,
    ))
    .await?;

    // 3. 创建 VNDB 数据表
    txn.execute(Statement::from_string(
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
            FOREIGN KEY("game_id") REFERENCES "games_new"("id") ON DELETE CASCADE
        )"#,
    ))
    .await?;

    // 4. 创建其他数据表
    txn.execute(Statement::from_string(
        DatabaseBackend::Sqlite,
        r#"CREATE TABLE "other_data" (
            "game_id" INTEGER NOT NULL PRIMARY KEY,
            "image" TEXT,
            "name" TEXT,
            "summary" TEXT,
            "tags" TEXT,
            "developer" TEXT,
            FOREIGN KEY("game_id") REFERENCES "games_new"("id") ON DELETE CASCADE
        )"#,
    ))
    .await?;

    // 5. 迁移数据从原 games 表到新表结构
    // 5.1 迁移核心 games 数据
    txn.execute(Statement::from_string(
     DatabaseBackend::Sqlite,
     r#"INSERT INTO "games_new" (id, bgm_id, vndb_id, id_type, date, localpath, savepath, autosave, clear, custom_name, custom_cover, created_at, updated_at)
      SELECT id, bgm_id, vndb_id, id_type, date, localpath, savepath, autosave, clear, custom_name, custom_cover,
          COALESCE(
              -- 尝试把 ISO8601 格式 (YYYY-MM-DDTHH:MM:SS.sssZ) 转为 SQLite 可解析的 datetime 并取 unix 秒
              strftime('%s', replace(substr(time, 1, 19), 'T', ' ')),
              strftime('%s', 'now')
          ),
          strftime('%s', 'now')
      FROM games"#
    )).await?;

    // 5.2 迁移 BGM 相关数据
    txn.execute(Statement::from_string(
        DatabaseBackend::Sqlite,
        r#"INSERT INTO "bgm_data" (game_id, image, name, name_cn, aliases, summary, tags, rank, score, developer)
         SELECT id, image, name, name_cn, aliases, summary, tags, rank, score, developer
         FROM games WHERE id_type = 'bgm' OR id_type = 'mixed'"#
    )).await?;

    // 5.3 迁移 VNDB 相关数据
    txn.execute(Statement::from_string(
        DatabaseBackend::Sqlite,
        r#"INSERT INTO "vndb_data" (game_id, image, name, name_cn, all_titles, aliases, summary, tags, average_hours, developer, score)
         SELECT id, image, name, name_cn, all_titles, aliases, summary, tags,
                aveage_hours AS average_hours,
                developer, score
         FROM games WHERE id_type = 'vndb' OR id_type = 'mixed'"#
    )).await?;

    // 5.4 迁移其他数据（custom, Whitecloud 等）
    txn.execute(Statement::from_string(
        DatabaseBackend::Sqlite,
        r#"INSERT INTO "other_data" (game_id, image, name, summary, tags, developer)
         SELECT id, image, name, summary, tags, developer
         FROM games WHERE id_type NOT IN ('bgm', 'vndb', 'mixed')"#,
    ))
    .await?;

    // 6. 备份、删除并重建受外键影响的表
    // 6.1 处理 game_sessions 表
    txn.execute_unprepared(
        "CREATE TEMP TABLE _game_sessions_backup AS SELECT * FROM game_sessions;",
    )
    .await?;
    txn.execute_unprepared("DROP TABLE game_sessions;").await?;
    txn.execute_unprepared(
        r#"CREATE TABLE "game_sessions" (
            "session_id" INTEGER PRIMARY KEY,
            "game_id" INTEGER NOT NULL,
            "start_time" INTEGER NOT NULL,
            "end_time" INTEGER NOT NULL,
            "duration" INTEGER NOT NULL,
            "date" TEXT NOT NULL,
            "created_at" INTEGER,
            FOREIGN KEY("game_id") REFERENCES "games_new"("id") ON DELETE CASCADE
        )"#,
    )
    .await?;
    txn.execute_unprepared("INSERT INTO game_sessions SELECT * FROM _game_sessions_backup;")
        .await?;
    txn.execute_unprepared("DROP TABLE _game_sessions_backup;")
        .await?;

    // 6.2 处理 game_statistics 表
    txn.execute_unprepared(
        "CREATE TEMP TABLE _game_statistics_backup AS SELECT * FROM game_statistics;",
    )
    .await?;
    txn.execute_unprepared("DROP TABLE game_statistics;")
        .await?;
    txn.execute_unprepared(
        r#"CREATE TABLE "game_statistics" (
            "game_id" INTEGER PRIMARY KEY,
            "total_time" INTEGER,
            "session_count" INTEGER,
            "last_played" INTEGER,
            "daily_stats" TEXT,
            FOREIGN KEY("game_id") REFERENCES "games_new"("id") ON DELETE CASCADE
        )"#,
    )
    .await?;
    txn.execute_unprepared("INSERT INTO game_statistics SELECT * FROM _game_statistics_backup;")
        .await?;
    txn.execute_unprepared("DROP TABLE _game_statistics_backup;")
        .await?;

    // 6.3 处理 savedata 表
    txn.execute_unprepared("CREATE TEMP TABLE _savedata_backup AS SELECT * FROM savedata;")
        .await?;
    txn.execute_unprepared("DROP TABLE savedata;").await?;
    txn.execute_unprepared(
        r#"CREATE TABLE "savedata" (
            "id" INTEGER PRIMARY KEY,
            "game_id" INTEGER NOT NULL,
            "file" TEXT NOT NULL,
            "backup_time" INTEGER NOT NULL,
            "file_size" INTEGER NOT NULL,
            "created_at" INTEGER,
            FOREIGN KEY("game_id") REFERENCES "games_new"("id") ON DELETE CASCADE
        )"#,
    )
    .await?;
    txn.execute_unprepared("INSERT INTO savedata SELECT * FROM _savedata_backup;")
        .await?;
    txn.execute_unprepared("DROP TABLE _savedata_backup;")
        .await?;

    // 7. 删除原 games 表并重命名新表
    txn.execute_unprepared("DROP TABLE games;").await?;
    txn.execute_unprepared(r#"ALTER TABLE "games_new" RENAME TO "games""#)
        .await?;

    // 8. 提交事务
    txn.commit().await?;

    // 9. 重新开启外键约束
    conn.execute(Statement::from_string(
        DatabaseBackend::Sqlite,
        "PRAGMA foreign_keys = ON;",
    ))
    .await?;

    // 10. (推荐) 重建数据库以回收空间并整理碎片
    conn.execute_unprepared("VACUUM;").await?;

    Ok(())
}
