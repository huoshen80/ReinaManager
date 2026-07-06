//! 将 games 中的外部数据源宽列迁移到 game_sources。

use crate::backup::backup_sqlite;
use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{ConnectionTrait, Statement, TransactionTrait};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        ensure_sqlite_version(manager.get_connection()).await?;

        let backup_path = backup_sqlite("pre_source_table_v1").await?;
        log::info!(
            "[MIGRATION] Source table backup created: {}",
            backup_path.display()
        );

        let transaction = manager.get_connection().begin().await?;
        migrate_schema(&transaction).await?;
        transaction.commit().await?;

        ensure_database_integrity(manager.get_connection()).await
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Err(DbErr::Custom(
            "game_sources 迁移不支持自动回滚，请恢复迁移前备份".to_string(),
        ))
    }
}

async fn migrate_schema<C>(connection: &C) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    validate_source_json(connection).await?;

    connection
        .execute_unprepared(
            r#"
            CREATE TABLE game_sources (
                game_id INTEGER NOT NULL,
                source TEXT NOT NULL CHECK (trim(source) <> ''),
                external_id TEXT,
                data TEXT,
                score REAL GENERATED ALWAYS AS (
                    CAST(json_extract(data, '$.score') AS REAL)
                ) VIRTUAL,
                rank INTEGER GENERATED ALWAYS AS (
                    CAST(json_extract(data, '$.rank') AS INTEGER)
                ) VIRTUAL,
                PRIMARY KEY (game_id, source),
                FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
                CHECK (external_id IS NOT NULL OR data IS NOT NULL),
                CHECK (data IS NULL OR json_valid(data))
            )
            "#,
        )
        .await?;

    for source in SOURCES {
        let expected = source_row_count(connection, source).await?;
        connection
            .execute_unprepared(&format!(
                r#"
                INSERT INTO game_sources(game_id, source, external_id, data)
                SELECT
                    id,
                    '{source_key}',
                    NULLIF(trim({id_column}), ''),
                    {data_column}
                FROM games
                WHERE NULLIF(trim({id_column}), '') IS NOT NULL
                   OR {data_column} IS NOT NULL
                "#,
                source_key = source.key,
                id_column = source.id_column,
                data_column = source.data_column,
            ))
            .await?;

        verify_source_rows(connection, source, expected).await?;
    }

    log_source_statistics(connection).await?;
    ensure_no_foreign_key_violations(connection).await?;

    connection
        .execute_unprepared("DROP INDEX IF EXISTS idx_games_bgm_id")
        .await?;
    connection
        .execute_unprepared("DROP INDEX IF EXISTS idx_games_vndb_id")
        .await?;

    for column in LEGACY_SOURCE_COLUMNS {
        connection
            .execute_unprepared(&format!("ALTER TABLE games DROP COLUMN {column}"))
            .await?;
    }

    connection
        .execute_unprepared(
            r#"
            ALTER TABLE games ADD COLUMN user_rating REAL
            GENERATED ALWAYS AS (
                CAST(json_extract(custom_data, '$.user_rating') AS REAL)
            ) VIRTUAL
            "#,
        )
        .await?;

    for statement in SOURCE_INDEXES {
        connection.execute_unprepared(statement).await?;
    }

    ensure_no_foreign_key_violations(connection).await
}

async fn validate_source_json<C>(connection: &C) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    let invalid_custom_data = query_count(
        connection,
        "SELECT COUNT(*) AS count FROM games \
         WHERE custom_data IS NOT NULL AND NOT json_valid(custom_data)",
    )
    .await?;
    if invalid_custom_data > 0 {
        let game_ids = invalid_json_game_ids(connection, "custom_data").await?;
        return Err(DbErr::Custom(format!(
            "custom_data 存在 {} 条无效 JSON，game_id={:?}，迁移已停止",
            invalid_custom_data, game_ids
        )));
    }

    for source in SOURCES {
        let invalid_count = query_count(
            connection,
            &format!(
                "SELECT COUNT(*) AS count FROM games \
                 WHERE {column} IS NOT NULL AND NOT json_valid({column})",
                column = source.data_column,
            ),
        )
        .await?;

        if invalid_count > 0 {
            let game_ids = invalid_json_game_ids(connection, source.data_column).await?;
            return Err(DbErr::Custom(format!(
                "{} source 存在 {} 条无效 JSON，game_id={:?}，迁移已停止",
                source.key, invalid_count, game_ids
            )));
        }
    }

    Ok(())
}

async fn invalid_json_game_ids<C>(connection: &C, column: &str) -> Result<Vec<i32>, DbErr>
where
    C: ConnectionTrait,
{
    connection
        .query_all(Statement::from_string(
            connection.get_database_backend(),
            format!(
                "SELECT id FROM games \
                 WHERE {column} IS NOT NULL AND NOT json_valid({column}) \
                 ORDER BY id LIMIT 10"
            ),
        ))
        .await?
        .into_iter()
        .map(|row| row.try_get_by_index(0))
        .collect()
}

async fn log_source_statistics<C>(connection: &C) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    let game_count = query_count(connection, "SELECT COUNT(*) AS count FROM games").await?;
    let source_count =
        query_count(connection, "SELECT COUNT(*) AS count FROM game_sources").await?;
    log::info!(
        "[MIGRATION] Source table counts: games={}, game_sources={}",
        game_count,
        source_count
    );

    for source in SOURCES {
        let id_only = query_count(
            connection,
            &format!(
                "SELECT COUNT(*) AS count FROM game_sources \
                 WHERE source = '{}' AND external_id IS NOT NULL AND data IS NULL",
                source.key
            ),
        )
        .await?;
        let data_only = query_count(
            connection,
            &format!(
                "SELECT COUNT(*) AS count FROM game_sources \
                 WHERE source = '{}' AND external_id IS NULL AND data IS NOT NULL",
                source.key
            ),
        )
        .await?;
        let duplicates = query_count(
            connection,
            &format!(
                "SELECT COUNT(*) AS count FROM (\
                    SELECT external_id FROM game_sources \
                    WHERE source = '{}' AND external_id IS NOT NULL \
                    GROUP BY external_id HAVING COUNT(*) > 1\
                 )",
                source.key
            ),
        )
        .await?;
        log::info!(
            "[MIGRATION] source={} id_only={} data_only={} duplicate_external_ids={}",
            source.key,
            id_only,
            data_only,
            duplicates
        );
    }

    Ok(())
}

async fn source_row_count<C>(connection: &C, source: &SourceColumns) -> Result<i64, DbErr>
where
    C: ConnectionTrait,
{
    query_count(
        connection,
        &format!(
            "SELECT COUNT(*) AS count FROM games \
             WHERE NULLIF(trim({id_column}), '') IS NOT NULL \
                OR {data_column} IS NOT NULL",
            id_column = source.id_column,
            data_column = source.data_column,
        ),
    )
    .await
}

async fn verify_source_rows<C>(
    connection: &C,
    source: &SourceColumns,
    expected: i64,
) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    let actual = query_count(
        connection,
        &format!(
            "SELECT COUNT(*) AS count FROM game_sources WHERE source = '{}'",
            source.key
        ),
    )
    .await?;

    let mismatched = query_count(
        connection,
        &format!(
            r#"
            SELECT COUNT(*) AS count
            FROM games AS g
            LEFT JOIN game_sources AS s
              ON s.game_id = g.id AND s.source = '{source_key}'
            WHERE (
                    NULLIF(trim(g.{id_column}), '') IS NOT NULL
                    OR g.{data_column} IS NOT NULL
                  )
              AND (
                    s.game_id IS NULL
                    OR s.external_id IS NOT NULLIF(trim(g.{id_column}), '')
                    OR s.data IS NOT g.{data_column}
                  )
            "#,
            source_key = source.key,
            id_column = source.id_column,
            data_column = source.data_column,
        ),
    )
    .await?;

    if actual != expected || mismatched != 0 {
        return Err(DbErr::Custom(format!(
            "{} source 迁移校验失败: expected={}, actual={}, mismatched={}",
            source.key, expected, actual, mismatched
        )));
    }

    Ok(())
}

async fn query_count<C>(connection: &C, sql: &str) -> Result<i64, DbErr>
where
    C: ConnectionTrait,
{
    connection
        .query_one(Statement::from_string(
            connection.get_database_backend(),
            sql.to_string(),
        ))
        .await?
        .ok_or_else(|| DbErr::Custom("计数查询未返回结果".to_string()))?
        .try_get("", "count")
}

async fn ensure_sqlite_version<C>(connection: &C) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    let version: String = connection
        .query_one(Statement::from_string(
            connection.get_database_backend(),
            "SELECT sqlite_version() AS version".to_string(),
        ))
        .await?
        .ok_or_else(|| DbErr::Custom("无法读取 SQLite 版本".to_string()))?
        .try_get("", "version")?;

    let mut parts = version
        .split('.')
        .take(3)
        .map(|part| part.parse::<u32>().unwrap_or(0));
    let parsed = (
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
        parts.next().unwrap_or(0),
    );

    if parsed < (3, 31, 0) {
        return Err(DbErr::Custom(format!(
            "SQLite {} 不支持生成列，至少需要 3.31.0",
            version
        )));
    }

    Ok(())
}

async fn ensure_no_foreign_key_violations<C>(connection: &C) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    let violations = connection
        .query_all(Statement::from_string(
            connection.get_database_backend(),
            "PRAGMA foreign_key_check".to_string(),
        ))
        .await?;

    if violations.is_empty() {
        Ok(())
    } else {
        Err(DbErr::Custom(format!(
            "迁移后发现 {} 条外键错误",
            violations.len()
        )))
    }
}

async fn ensure_database_integrity<C>(connection: &C) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    ensure_no_foreign_key_violations(connection).await?;

    let result: String = connection
        .query_one(Statement::from_string(
            connection.get_database_backend(),
            "PRAGMA integrity_check".to_string(),
        ))
        .await?
        .ok_or_else(|| DbErr::Custom("数据库完整性检查未返回结果".to_string()))?
        .try_get_by_index(0)?;

    if result.eq_ignore_ascii_case("ok") {
        Ok(())
    } else {
        Err(DbErr::Custom(format!("数据库完整性检查失败: {}", result)))
    }
}

struct SourceColumns {
    key: &'static str,
    id_column: &'static str,
    data_column: &'static str,
}

const SOURCES: &[SourceColumns] = &[
    SourceColumns {
        key: "bgm",
        id_column: "bgm_id",
        data_column: "bgm_data",
    },
    SourceColumns {
        key: "vndb",
        id_column: "vndb_id",
        data_column: "vndb_data",
    },
    SourceColumns {
        key: "ymgal",
        id_column: "ymgal_id",
        data_column: "ymgal_data",
    },
    SourceColumns {
        key: "kun",
        id_column: "kun_id",
        data_column: "kun_data",
    },
];

const LEGACY_SOURCE_COLUMNS: &[&str] = &[
    "bgm_id",
    "vndb_id",
    "ymgal_id",
    "kun_id",
    "bgm_data",
    "vndb_data",
    "ymgal_data",
    "kun_data",
];

const SOURCE_INDEXES: &[&str] = &[
    "CREATE INDEX idx_game_sources_source_external_id \
     ON game_sources(source, external_id) \
     WHERE external_id IS NOT NULL AND trim(external_id) <> ''",
    "CREATE INDEX idx_game_sources_source_score \
     ON game_sources(source, score DESC) \
     WHERE score IS NOT NULL",
    "CREATE INDEX idx_game_sources_source_rank \
     ON game_sources(source, rank) \
     WHERE rank IS NOT NULL",
    "CREATE INDEX idx_games_user_rating \
     ON games(user_rating DESC) \
     WHERE user_rating IS NOT NULL AND user_rating > 0",
];

#[cfg(test)]
mod tests {
    use super::*;
    use sea_orm_migration::sea_orm::{Database, DatabaseBackend, DatabaseConnection};
    use std::collections::HashSet;

    async fn setup_legacy_database() -> DatabaseConnection {
        let database = Database::connect("sqlite::memory:").await.unwrap();
        database
            .execute_unprepared("PRAGMA foreign_keys = ON")
            .await
            .unwrap();
        database
            .execute_unprepared(
                r#"
                CREATE TABLE games (
                    id INTEGER PRIMARY KEY,
                    bgm_id TEXT,
                    vndb_id TEXT,
                    ymgal_id TEXT,
                    kun_id TEXT,
                    id_type TEXT NOT NULL,
                    date TEXT,
                    localpath TEXT,
                    savepath TEXT,
                    autosave INTEGER,
                    maxbackups INTEGER,
                    clear INTEGER,
                    le_launch INTEGER,
                    magpie INTEGER,
                    bgm_data TEXT,
                    vndb_data TEXT,
                    ymgal_data TEXT,
                    kun_data TEXT,
                    custom_data TEXT,
                    created_at INTEGER,
                    updated_at INTEGER
                );
                CREATE INDEX idx_games_bgm_id ON games(bgm_id);
                CREATE INDEX idx_games_vndb_id ON games(vndb_id);
                "#,
            )
            .await
            .unwrap();
        database
    }

    #[async_std::test]
    async fn migrates_source_rows_and_generated_values() {
        let database = setup_legacy_database().await;
        database
            .execute_unprepared(
                r#"
                INSERT INTO games(
                    id, bgm_id, vndb_id, id_type, date,
                    bgm_data, vndb_data, custom_data
                ) VALUES (
                    1, '123', 'v456', 'mixed', '2024-01-02',
                    '{"name":"BGM","score":8.5,"rank":12}',
                    '{"name":"VNDB","score":7.5}',
                    '{"name":"自定义","user_rating":9.2}'
                )
                "#,
            )
            .await
            .unwrap();

        let transaction = database.begin().await.unwrap();
        migrate_schema(&transaction).await.unwrap();
        transaction.commit().await.unwrap();

        let sources = database
            .query_all(Statement::from_string(
                DatabaseBackend::Sqlite,
                "SELECT source, external_id, score, rank FROM game_sources ORDER BY source"
                    .to_string(),
            ))
            .await
            .unwrap();
        assert_eq!(sources.len(), 2);
        assert_eq!(sources[0].try_get::<String>("", "source").unwrap(), "bgm");
        assert_eq!(
            sources[0].try_get::<Option<f64>>("", "score").unwrap(),
            Some(8.5)
        );
        assert_eq!(
            sources[0].try_get::<Option<i32>>("", "rank").unwrap(),
            Some(12)
        );

        let game = database
            .query_one(Statement::from_string(
                DatabaseBackend::Sqlite,
                "SELECT date, user_rating FROM games WHERE id = 1".to_string(),
            ))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            game.try_get::<Option<String>>("", "date").unwrap(),
            Some("2024-01-02".to_string())
        );
        assert_eq!(
            game.try_get::<Option<f64>>("", "user_rating").unwrap(),
            Some(9.2)
        );

        let columns = database
            .query_all(Statement::from_string(
                DatabaseBackend::Sqlite,
                "PRAGMA table_xinfo(games)".to_string(),
            ))
            .await
            .unwrap()
            .into_iter()
            .map(|row| row.try_get::<String>("", "name").unwrap())
            .collect::<HashSet<_>>();
        assert!(!columns.contains("bgm_id"));
        assert!(!columns.contains("vndb_data"));
        assert!(columns.contains("user_rating"));

        database
            .execute_unprepared("DELETE FROM games WHERE id = 1")
            .await
            .unwrap();
        assert_eq!(
            query_count(&database, "SELECT COUNT(*) AS count FROM game_sources")
                .await
                .unwrap(),
            0
        );
    }

    #[async_std::test]
    async fn rejects_invalid_source_json_before_schema_changes() {
        let database = setup_legacy_database().await;
        database
            .execute_unprepared(
                "INSERT INTO games(id, bgm_id, id_type, bgm_data) \
                 VALUES (1, '1', 'bgm', '{invalid')",
            )
            .await
            .unwrap();

        let error = migrate_schema(&database).await.unwrap_err();
        assert!(error.to_string().contains("无效 JSON"));

        let table_count = query_count(
            &database,
            "SELECT COUNT(*) AS count FROM sqlite_master \
             WHERE type = 'table' AND name = 'game_sources'",
        )
        .await
        .unwrap();
        assert_eq!(table_count, 0);
    }

    #[async_std::test]
    async fn rejects_invalid_custom_data_before_adding_user_rating() {
        let database = setup_legacy_database().await;
        database
            .execute_unprepared(
                "INSERT INTO games(id, id_type, custom_data) \
                 VALUES (1, 'custom', '{invalid')",
            )
            .await
            .unwrap();

        let error = migrate_schema(&database).await.unwrap_err();
        assert!(error.to_string().contains("custom_data"));
    }
}
