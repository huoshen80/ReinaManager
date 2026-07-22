//! 将 games.localpath 从完整启动路径拆为目录和启动文件名。

use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{ConnectionTrait, DatabaseBackend, Statement, TransactionTrait};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let transaction = manager.get_connection().begin().await?;
        migrate_schema(&transaction).await?;
        transaction.commit().await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let transaction = manager.get_connection().begin().await?;
        restore_schema(&transaction).await?;
        transaction.commit().await
    }
}

async fn migrate_schema<C>(connection: &C) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    let row_count = query_count(connection, "SELECT COUNT(*) AS count FROM games").await?;

    connection
        .execute_unprepared("ALTER TABLE games ADD COLUMN executable TEXT")
        .await?;

    let rows = connection
        .query_all(Statement::from_string(
            DatabaseBackend::Sqlite,
            r#"
            SELECT
                g.id,
                g.localpath,
                COALESCE(
                    NULLIF(trim(json_extract(g.custom_data, '$.name')), ''),
                    (
                        SELECT COALESCE(
                            NULLIF(trim(json_extract(s.data, '$.name_cn')), ''),
                            NULLIF(trim(json_extract(s.data, '$.name')), '')
                        )
                        FROM game_sources AS s
                        WHERE s.game_id = g.id
                          AND s.source = g.id_type
                          AND COALESCE(
                              NULLIF(trim(json_extract(s.data, '$.name_cn')), ''),
                              NULLIF(trim(json_extract(s.data, '$.name')), '')
                          ) IS NOT NULL
                        LIMIT 1
                    ),
                    (
                        SELECT COALESCE(
                            NULLIF(trim(json_extract(s.data, '$.name_cn')), ''),
                            NULLIF(trim(json_extract(s.data, '$.name')), '')
                        )
                        FROM game_sources AS s
                        WHERE s.game_id = g.id
                          AND COALESCE(
                              NULLIF(trim(json_extract(s.data, '$.name_cn')), ''),
                              NULLIF(trim(json_extract(s.data, '$.name')), '')
                          ) IS NOT NULL
                        ORDER BY
                            CASE
                                WHEN s.source = 'bgm' THEN 0
                                WHEN s.source = 'vndb' THEN 1
                                WHEN s.source = 'ymgal' THEN 2
                                WHEN s.source = 'kun' THEN 3
                                ELSE 4
                            END
                        LIMIT 1
                    )
                ) AS game_name
            FROM games AS g
            WHERE g.localpath IS NOT NULL
            "#
            .to_string(),
        ))
        .await?;

    for row in rows {
        let id = row.try_get::<i32>("", "id")?;
        let old_localpath = row.try_get::<String>("", "localpath")?;
        let game_name = row.try_get::<Option<String>>("", "game_name")?;
        let (localpath, executable) = split_legacy_localpath(&old_localpath);
        if let Some(executable) = executable.as_deref() {
            if !executable.contains('.') {
                log::warn!(
                    "[MIGRATION] 迁移后的启动文件名没有扩展名 game_id={} game_name={} executable={}",
                    id,
                    game_name.as_deref().unwrap_or("<未知>"),
                    executable
                );
            }
        }
        connection
            .execute(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "UPDATE games SET localpath = ?, executable = ? WHERE id = ?",
                [localpath.into(), executable.into(), id.into()],
            ))
            .await?;
    }

    let migrated_row_count = query_count(connection, "SELECT COUNT(*) AS count FROM games").await?;
    if migrated_row_count != row_count {
        return Err(DbErr::Custom(format!(
            "localpath 迁移前后游戏数量不一致: {row_count} -> {migrated_row_count}"
        )));
    }

    let orphan_count = query_count(
        connection,
        "SELECT COUNT(*) AS count FROM games \
         WHERE localpath IS NULL AND executable IS NOT NULL",
    )
    .await?;
    if orphan_count != 0 {
        return Err(DbErr::Custom(format!(
            "localpath 迁移产生了 {orphan_count} 个孤立 executable"
        )));
    }

    Ok(())
}

async fn restore_schema<C>(connection: &C) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    let rows = connection
        .query_all(Statement::from_string(
            DatabaseBackend::Sqlite,
            "SELECT id, localpath, executable FROM games WHERE executable IS NOT NULL".to_string(),
        ))
        .await?;

    for row in rows {
        let id = row.try_get::<i32>("", "id")?;
        let localpath = row.try_get::<Option<String>>("", "localpath")?;
        let executable = row.try_get::<String>("", "executable")?;
        let restored = localpath
            .as_deref()
            .map(|directory| join_lexical_path(directory, &executable));
        connection
            .execute(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "UPDATE games SET localpath = ? WHERE id = ?",
                [restored.into(), id.into()],
            ))
            .await?;
    }

    connection
        .execute_unprepared("ALTER TABLE games DROP COLUMN executable")
        .await?;
    Ok(())
}

async fn query_count<C>(connection: &C, sql: &str) -> Result<i64, DbErr>
where
    C: ConnectionTrait,
{
    connection
        .query_one(Statement::from_string(
            DatabaseBackend::Sqlite,
            sql.to_string(),
        ))
        .await?
        .ok_or_else(|| DbErr::Custom("计数查询未返回结果".to_string()))?
        .try_get("", "count")
}

fn split_legacy_localpath(value: &str) -> (Option<String>, Option<String>) {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return (None, None);
    }
    if is_path_root(trimmed) {
        return (Some(trimmed.to_string()), None);
    }

    let path = trimmed.trim_end_matches(is_separator);
    if is_path_root(path) {
        return (Some(path.to_string()), None);
    }
    let Some((separator_index, separator)) = path
        .char_indices()
        .rev()
        .find(|(_, character)| is_separator(*character))
    else {
        return (Some(".".to_string()), Some(path.to_string()));
    };

    let file_name = &path[separator_index + separator.len_utf8()..];
    let parent = if separator_index == 0 || is_drive_root_separator(path, separator_index) {
        &path[..separator_index + separator.len_utf8()]
    } else {
        path[..separator_index].trim_end_matches(is_separator)
    };

    (
        Some(parent.to_string()),
        (!file_name.is_empty()).then(|| file_name.to_string()),
    )
}

fn is_separator(character: char) -> bool {
    matches!(character, '/' | '\\')
}

fn is_drive_root_separator(path: &str, separator_index: usize) -> bool {
    separator_index == 2
        && path.as_bytes().first().is_some_and(u8::is_ascii_alphabetic)
        && path.as_bytes().get(1) == Some(&b':')
}

fn is_path_root(path: &str) -> bool {
    if path.chars().all(is_separator) {
        return true;
    }

    let bytes = path.as_bytes();
    if bytes.len() >= 3
        && bytes[0].is_ascii_alphabetic()
        && bytes[1] == b':'
        && path[2..].chars().all(is_separator)
    {
        return true;
    }

    let mut characters = path.chars();
    if !characters.next().is_some_and(is_separator) || !characters.next().is_some_and(is_separator)
    {
        return false;
    }

    path[2..]
        .split(is_separator)
        .filter(|component| !component.is_empty())
        .count()
        == 2
}

fn join_lexical_path(directory: &str, executable: &str) -> String {
    if directory == "." {
        return executable.to_string();
    }
    if directory.ends_with(is_separator) {
        return format!("{directory}{executable}");
    }

    let separator = if directory.starts_with("\\\\")
        || directory
            .rfind('\\')
            .is_some_and(|backslash| directory.rfind('/').is_none_or(|slash| backslash > slash))
        || directory.as_bytes().get(1) == Some(&b':')
    {
        '\\'
    } else {
        '/'
    };
    format!("{directory}{separator}{executable}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_orm_migration::sea_orm::Database;

    #[test]
    fn splits_windows_posix_and_bare_paths_lexically() {
        for (input, expected_directory, expected_executable) in [
            (r"D:\Games\Foo\Foo.exe", r"D:\Games\Foo", Some("Foo.exe")),
            (r"D:\Foo.exe", r"D:\", Some("Foo.exe")),
            ("/home/me/Foo/Foo", "/home/me/Foo", Some("Foo")),
            (
                r"\\server\share\Foo.exe",
                r"\\server\share",
                Some("Foo.exe"),
            ),
            ("Foo.exe", ".", Some("Foo.exe")),
            ("游戏/启动器", "游戏", Some("启动器")),
            (r"D:\Games/Foo.exe", r"D:\Games", Some("Foo.exe")),
        ] {
            let actual = split_legacy_localpath(input);
            assert_eq!(actual.0.as_deref(), Some(expected_directory), "{input}");
            assert_eq!(actual.1.as_deref(), expected_executable, "{input}");
        }
    }

    #[test]
    fn preserves_roots_and_splits_after_cleaning_trailing_separators() {
        for root in ["/", r"D:\", r"\\server\share"] {
            assert_eq!(split_legacy_localpath(root), (Some(root.to_string()), None));
        }
        assert_eq!(
            split_legacy_localpath(r"D:\Games\Foo\"),
            (Some(r"D:\Games".to_string()), Some("Foo".to_string()))
        );
        assert_eq!(
            split_legacy_localpath("/home/me/Foo///"),
            (Some("/home/me".to_string()), Some("Foo".to_string()))
        );
        assert_eq!(split_legacy_localpath("  "), (None, None));
    }

    #[tokio::test]
    async fn migrates_rows_without_changing_count_or_creating_orphans() {
        let database = Database::connect("sqlite::memory:").await.unwrap();
        database
            .execute_unprepared(
                r#"
                CREATE TABLE games (
                    id INTEGER PRIMARY KEY,
                    id_type TEXT NOT NULL,
                    localpath TEXT,
                    custom_data TEXT
                );
                CREATE TABLE game_sources (
                    game_id INTEGER NOT NULL,
                    source TEXT NOT NULL,
                    data TEXT,
                    PRIMARY KEY (game_id, source)
                );
                INSERT INTO games(id, id_type, localpath, custom_data) VALUES
                    (1, 'custom', 'D:\Games\Foo\Foo.exe', '{"name":"Foo"}'),
                    (2, 'vndb', '/home/me/Foo/Foo', NULL),
                    (3, 'custom', 'Foo.exe', '{"name":"Bare Foo"}'),
                    (4, 'custom', '   ', NULL),
                    (5, 'custom', NULL, NULL),
                    (6, 'custom', 'D:\Games\Bar\', '{"name":"Bar"}');
                INSERT INTO game_sources(game_id, source, data) VALUES
                    (2, 'vndb', '{"name":"Source Foo"}');
                "#,
            )
            .await
            .unwrap();

        migrate_schema(&database).await.unwrap();

        let rows = database
            .query_all(Statement::from_string(
                DatabaseBackend::Sqlite,
                "SELECT id, localpath, executable FROM games ORDER BY id".to_string(),
            ))
            .await
            .unwrap();
        assert_eq!(rows.len(), 6);
        assert_eq!(
            rows[0].try_get::<Option<String>>("", "localpath").unwrap(),
            Some(r"D:\Games\Foo".to_string())
        );
        assert_eq!(
            rows[0].try_get::<Option<String>>("", "executable").unwrap(),
            Some("Foo.exe".to_string())
        );
        assert_eq!(
            rows[2].try_get::<Option<String>>("", "localpath").unwrap(),
            Some(".".to_string())
        );
        assert_eq!(
            rows[3].try_get::<Option<String>>("", "localpath").unwrap(),
            None
        );
        assert_eq!(
            rows[5].try_get::<Option<String>>("", "localpath").unwrap(),
            Some(r"D:\Games".to_string())
        );
        assert_eq!(
            rows[5].try_get::<Option<String>>("", "executable").unwrap(),
            Some("Bar".to_string())
        );
        assert_eq!(
            query_count(
                &database,
                "SELECT COUNT(*) AS count FROM games WHERE localpath IS NULL AND executable IS NOT NULL"
            )
            .await
            .unwrap(),
            0
        );
    }

    #[tokio::test]
    async fn restores_full_paths_and_removes_executable_column() {
        let database = Database::connect("sqlite::memory:").await.unwrap();
        database
            .execute_unprepared(
                r#"
                CREATE TABLE games (
                    id INTEGER PRIMARY KEY,
                    id_type TEXT NOT NULL,
                    localpath TEXT,
                    custom_data TEXT
                );
                CREATE TABLE game_sources (
                    game_id INTEGER NOT NULL,
                    source TEXT NOT NULL,
                    data TEXT,
                    PRIMARY KEY (game_id, source)
                );
                INSERT INTO games(id, id_type, localpath, custom_data) VALUES
                    (1, 'custom', 'D:\Games\Foo\Foo.exe', '{"name":"Foo"}'),
                    (2, 'custom', NULL, NULL);
                "#,
            )
            .await
            .unwrap();

        migrate_schema(&database).await.unwrap();
        restore_schema(&database).await.unwrap();

        let game = database
            .query_one(Statement::from_string(
                DatabaseBackend::Sqlite,
                "SELECT localpath FROM games WHERE id = 1".to_string(),
            ))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(
            game.try_get::<Option<String>>("", "localpath").unwrap(),
            Some(r"D:\Games\Foo\Foo.exe".to_string())
        );

        let columns = database
            .query_all(Statement::from_string(
                DatabaseBackend::Sqlite,
                "PRAGMA table_info(games)".to_string(),
            ))
            .await
            .unwrap();
        assert!(columns
            .iter()
            .all(|column| column.try_get::<String>("", "name").unwrap() != "executable"));
    }
}
