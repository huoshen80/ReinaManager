use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{DbBackend, Statement, TransactionTrait};
use uuid::Uuid;
#[derive(DeriveMigrationName)]
pub struct Migration;
#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let transaction = manager.get_connection().begin().await?;
        transaction
            .execute_unprepared(
                r#"
            CREATE TABLE cover_assets (
                id TEXT PRIMARY KEY NOT NULL,
                game_id INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
                kind TEXT NOT NULL CHECK(kind IN ('cloud', 'custom')),
                source TEXT,
                original_url TEXT,
                extension TEXT,
                legacy_filename TEXT UNIQUE,
                CHECK(kind = 'cloud' OR extension IS NOT NULL),
                CHECK(
                    (kind = 'custom' AND source IS NULL)
                    OR (kind = 'cloud' AND source IS NOT NULL AND trim(source) <> '')
                ),
                UNIQUE(game_id, kind, source)
            );
            CREATE UNIQUE INDEX idx_cover_assets_custom_game ON cover_assets(game_id) WHERE kind = 'custom';
        "#,
            )
            .await?;
        // 先保存旧关联，图片可在用户稍后恢复备份时再迁移。
        let rows = transaction.query_all_raw(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT id, json_extract(custom_data, '$.image') AS image FROM games WHERE json_type(custom_data, '$.image') = 'text'",
        )).await?;
        for row in rows {
            let game_id: i32 = row.try_get("", "id")?;
            let reference: String = row.try_get("", "image")?;
            if reference.is_empty() {
                continue;
            }
            if !reference
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'.' | b'-'))
            {
                return Err(DbErr::Custom(format!(
                    "游戏 {game_id} 的旧封面引用包含非法路径"
                )));
            }
            let extension = reference
                .split(['_', '.'])
                .next()
                .unwrap()
                .to_ascii_lowercase();
            let extension = if extension == "jpeg" {
                "jpg"
            } else {
                &extension
            };
            if !matches!(
                extension,
                "jpg" | "png" | "webp" | "gif" | "bmp" | "avif" | "ico"
            ) {
                return Err(DbErr::Custom(format!(
                    "游戏 {game_id} 的旧封面格式无效: {reference}"
                )));
            }
            transaction.execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO cover_assets(id, game_id, kind, extension, legacy_filename) VALUES (?, ?, 'custom', ?, ?)",
                [Uuid::now_v7().to_string().into(), game_id.into(), extension.into(), format!("cover_{game_id}_{reference}").into()],
            )).await?;
        }
        transaction.execute_unprepared(
            "UPDATE games SET custom_data = json_remove(custom_data, '$.image') WHERE json_type(custom_data, '$.image') IS NOT NULL",
        ).await?;
        // 为已有来源登记待下载资产，不在迁移期间联网。
        let sources = transaction.query_all_raw(Statement::from_string(DbBackend::Sqlite,
            "SELECT game_id, source, json_extract(data, '$.image') AS image FROM game_sources WHERE json_type(data, '$.image') = 'text' AND trim(json_extract(data, '$.image')) != ''"
        )).await?;
        for row in sources {
            transaction.execute_raw(Statement::from_sql_and_values(DbBackend::Sqlite,
                "INSERT INTO cover_assets(id, game_id, kind, source, original_url) VALUES (?, ?, 'cloud', ?, ?)",
                [Uuid::now_v7().to_string().into(), row.try_get::<i32>("", "game_id")?.into(), row.try_get::<String>("", "source")?.into(), row.try_get::<String>("", "image")?.into()]
            )).await?;
        }
        transaction.commit().await
    }
    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Err(DbErr::Custom(
            "封面文件迁移不可逆，请恢复迁移前数据库和封面备份".into(),
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_orm_migration::sea_orm::Database;

    #[tokio::test]
    async fn moves_references_without_files_and_rolls_back_invalid_input() {
        let db = Database::connect("sqlite::memory:").await.unwrap();
        db.execute_unprepared(
            r#"
            CREATE TABLE games(id INTEGER PRIMARY KEY, custom_data TEXT);
            CREATE TABLE game_sources(game_id INTEGER, source TEXT, data TEXT);
            INSERT INTO games VALUES
                (1, '{"name":"保留","image":"jpeg_123"}'),
                (2, '{"image":null}'),
                (3, '{"image":""}'),
                (4, '{"image":"../outside"}');
        "#,
        )
        .await
        .unwrap();
        let manager = SchemaManager::new(&db);
        assert!(Migration.up(&manager).await.is_err());
        assert!(!manager.has_table("cover_assets").await.unwrap());
        let before = db
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT json_extract(custom_data, '$.image') AS image FROM games WHERE id=1",
            ))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(before.try_get::<String>("", "image").unwrap(), "jpeg_123");
        db.execute_unprepared("DELETE FROM games WHERE id=4")
            .await
            .unwrap();
        db.execute_unprepared(r#"INSERT INTO game_sources VALUES(1, 'bgm', '{"image":"https://example.com/cover.jpg"}'), (2, 'vndb', '{}')"#).await.unwrap();
        Migration.up(&manager).await.unwrap();
        let cloud = db
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT id, extension FROM cover_assets WHERE kind='cloud'",
            ))
            .await
            .unwrap()
            .unwrap();
        assert!(Uuid::parse_str(&cloud.try_get::<String>("", "id").unwrap()).is_ok());
        assert_eq!(
            cloud.try_get::<Option<String>>("", "extension").unwrap(),
            None
        );
        let rows = db
            .query_all_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT * FROM cover_assets WHERE kind='custom'",
            ))
            .await
            .unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(
            Uuid::parse_str(&rows[0].try_get::<String>("", "id").unwrap())
                .unwrap()
                .get_version_num(),
            7
        );
        assert_eq!(rows[0].try_get::<String>("", "extension").unwrap(), "jpg");
        assert_eq!(
            rows[0].try_get::<Option<String>>("", "source").unwrap(),
            None
        );
        assert_eq!(
            rows[0].try_get::<String>("", "legacy_filename").unwrap(),
            "cover_1_jpeg_123"
        );
        let remaining = db.query_one_raw(Statement::from_string(DbBackend::Sqlite,
            "SELECT COUNT(*) AS count FROM games WHERE json_type(custom_data, '$.image') IS NOT NULL"))
            .await.unwrap().unwrap().try_get::<i64>("", "count").unwrap();
        assert_eq!(remaining, 0);
        for (game_id, kind, source, extension) in [
            (2, "custom", "''", "'jpg'"),
            (2, "custom", "'bgm'", "'jpg'"),
            (2, "custom", "NULL", "NULL"),
            (1, "custom", "NULL", "'jpg'"),
            (2, "cloud", "NULL", "NULL"),
            (2, "cloud", "''", "NULL"),
            (2, "cloud", "'   '", "NULL"),
            (1, "cloud", "'bgm'", "NULL"),
        ] {
            assert!(
                db.execute_unprepared(&format!(
                    "INSERT INTO cover_assets(id,game_id,kind,source,extension) VALUES('invalid',{game_id},'{kind}',{source},{extension})"
                ))
                .await
                .is_err(),
                "不应允许 {kind}/{source}"
            );
        }
    }
}
