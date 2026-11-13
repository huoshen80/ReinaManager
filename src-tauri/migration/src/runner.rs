use crate::backup::{backup_sqlite, connected_database_path};
use crate::{Migrator, MigratorTrait};
use sea_orm_migration::sea_orm::{
    ConnectionTrait, DatabaseConnection, DbBackend, DbErr, Statement,
};

/// 统一执行启动迁移：新库不备份，已有库在整轮迁移前只备份一次。
pub async fn migrate_database<F, Fut>(
    connection: &DatabaseConnection,
    target_version: &str,
    complete_backup: F,
) -> Result<(), DbErr>
where
    F: FnOnce(std::path::PathBuf) -> Fut,
    Fut: std::future::Future<Output = Result<std::path::PathBuf, DbErr>>,
{
    // 必须在建表前判断，初始化生成的业务表不能被后续迁移误认为历史数据库。
    let existing_schema = has_existing_schema(connection).await?;
    let pending = Migrator::get_pending_migrations_read_only(connection).await?;
    if pending.is_empty() {
        log::debug!("[MIGRATION] 数据库已是最新结构，无需迁移或备份");
        return Ok(());
    }

    let backup_path = if existing_schema {
        let db_path = connected_database_path(connection).await?;
        let path = backup_sqlite(&db_path, target_version)
            .await
            .map_err(|error| DbErr::Custom(format!("迁移前数据库备份失败，已停止迁移: {error}")))?;
        // 应用层补齐封面快照；完整备份失败时不得进入数据库迁移。
        let path = complete_backup(path)
            .await
            .map_err(|error| DbErr::Custom(format!("迁移前数据备份失败，已停止迁移: {error}")))?;
        log::info!(
            "[MIGRATION] 迁移前备份完成，target_version={}，pending={}，backup={}",
            target_version,
            pending.len(),
            path.display()
        );
        Some(path)
    } else {
        log::info!(
            "[MIGRATION] 初始化新数据库，跳过迁移备份，pending={}",
            pending.len()
        );
        None
    };

    Migrator::up(connection, None).await.map_err(|error| {
        if let Some(path) = backup_path {
            DbErr::Custom(format!(
                "数据库迁移失败，迁移前备份保留在 {}: {error}",
                path.display()
            ))
        } else {
            error
        }
    })
}

pub(crate) async fn has_existing_schema<C>(connection: &C) -> Result<bool, DbErr>
where
    C: ConnectionTrait,
{
    // 老版本可能没有当前迁移记录；即使业务表没有数据也按已有库保护。
    Ok(connection
        .query_one_raw(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT 1 FROM sqlite_master WHERE type = 'table' \
             AND name <> 'seaql_migrations' AND name NOT GLOB 'sqlite_*' LIMIT 1",
        ))
        .await?
        .is_some())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backup::{create_test_directory, path_to_sqlite_url, path_to_sqlite_url_with_mode};
    use sea_orm_migration::sea_orm::{ConnectOptions, Database};
    use sea_orm_migration::SchemaManager;
    use std::fs;
    use std::path::PathBuf;

    async fn migrate_database(connection: &DatabaseConnection, version: &str) -> Result<(), DbErr> {
        super::migrate_database(connection, version, |path| async { Ok(path) }).await
    }

    struct TestDatabase {
        directory: PathBuf,
        connection: DatabaseConnection,
    }

    impl TestDatabase {
        async fn new(name: &str) -> Self {
            let directory = create_test_directory(name);
            let path = directory.join("source.db");
            let mut options = ConnectOptions::new(path_to_sqlite_url(&path).unwrap());
            options.max_connections(1).min_connections(1);
            let connection = Database::connect(options).await.unwrap();
            connection
                .execute_unprepared("PRAGMA foreign_keys = ON")
                .await
                .unwrap();
            Self {
                directory,
                connection,
            }
        }

        fn backups(&self) -> Vec<PathBuf> {
            let directory = self.directory.join("backups");
            if !directory.is_dir() {
                return Vec::new();
            }
            let mut files = fs::read_dir(directory)
                .unwrap()
                .map(|entry| entry.unwrap().path())
                .collect::<Vec<_>>();
            files.sort();
            files
        }

        async fn cleanup(self) {
            self.connection.close().await.unwrap();
            fs::remove_dir_all(self.directory).unwrap();
        }
    }

    #[tokio::test]
    async fn incomplete_data_backup_stops_migration() {
        let test = TestDatabase::new("cover_backup_failure").await;
        Migrator::up(&test.connection, Some(22)).await.unwrap();
        let error = super::migrate_database(&test.connection, "0.33.0", |snapshot| async move {
            assert!(snapshot.is_file());
            Err(DbErr::Custom("封面读取失败".into()))
        })
        .await
        .unwrap_err();
        assert!(error.to_string().contains("已停止迁移"));
        assert!(!SchemaManager::new(&test.connection)
            .has_table("cover_assets")
            .await
            .unwrap());
        assert_eq!(test.backups().len(), 1);
        test.cleanup().await;
    }

    #[tokio::test]
    async fn fresh_database_runs_all_migrations_without_backups() {
        for existing_tracking_table in [false, true] {
            let test = TestDatabase::new("fresh_migration").await;
            if existing_tracking_table {
                Migrator::install(&test.connection).await.unwrap();
            }
            migrate_database(&test.connection, "0.31.1").await.unwrap();
            assert!(!test.directory.join("backups").exists());
            assert!(Migrator::get_pending_migrations_read_only(&test.connection)
                .await
                .unwrap()
                .is_empty());
            test.cleanup().await;
        }
    }

    #[tokio::test]
    async fn cross_version_upgrade_creates_one_pre_upgrade_snapshot() {
        let test = TestDatabase::new("cross_version").await;
        Migrator::up(&test.connection, Some(3)).await.unwrap();
        test.connection
            .execute_unprepared(
                "INSERT INTO games(id, bgm_id, id_type) VALUES (1, '123', 'bgm'); \
             INSERT INTO bgm_data(game_id, name) VALUES (1, '保留名称');",
            )
            .await
            .unwrap();
        migrate_database(&test.connection, "0.31.1").await.unwrap();

        let backups = test.backups();
        assert_eq!(backups.len(), 1);
        assert!(backups[0]
            .file_name()
            .unwrap()
            .to_str()
            .unwrap()
            .starts_with("reina_manager_pre_migration_v0.31.1_"));
        let backup = Database::connect(path_to_sqlite_url_with_mode(&backups[0], "ro").unwrap())
            .await
            .unwrap();
        assert_eq!(
            Migrator::get_applied_migrations_read_only(&backup)
                .await
                .unwrap()
                .len(),
            3
        );
        let row = backup
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT name FROM bgm_data WHERE game_id = 1",
            ))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(row.try_get::<String>("", "name").unwrap(), "保留名称");
        backup.close().await.unwrap();
        migrate_database(&test.connection, "0.31.1").await.unwrap();
        assert_eq!(test.backups(), backups);
        test.cleanup().await;
    }

    #[tokio::test]
    async fn backup_failure_stops_all_migrations() {
        let test = TestDatabase::new("migration_backup_failure").await;
        Migrator::up(&test.connection, Some(3)).await.unwrap();
        let custom = test.directory.join("invalid-custom");
        fs::write(&custom, "不是目录").unwrap();
        fs::write(test.directory.join("backups"), "也不是目录").unwrap();
        test.connection
            .execute_raw(Statement::from_sql_and_values(
                DbBackend::Sqlite,
                "INSERT INTO user(id, db_backup_path) VALUES (1, ?)",
                [custom.to_string_lossy().into_owned().into()],
            ))
            .await
            .unwrap();
        let error = migrate_database(&test.connection, "0.31.1")
            .await
            .unwrap_err()
            .to_string();
        assert!(error.contains("已停止迁移"));
        assert_eq!(
            Migrator::get_applied_migrations_read_only(&test.connection)
                .await
                .unwrap()
                .len(),
            3
        );
        assert!(!SchemaManager::new(&test.connection)
            .has_column("games", "vndb_data")
            .await
            .unwrap());
        assert!(test.backups().is_empty());
        test.cleanup().await;
    }

    #[tokio::test]
    async fn untracked_legacy_database_without_games_preserves_user_settings() {
        let test = TestDatabase::new("legacy_untracked").await;
        test.connection
            .execute_unprepared(include_str!(
                "../old_migrations/001_database_initialization.sql"
            ))
            .await
            .unwrap();
        test.connection
            .execute_unprepared("INSERT INTO user(id, save_root_path) VALUES (1, '历史存档目录')")
            .await
            .unwrap();
        migrate_database(&test.connection, "0.31.1").await.unwrap();
        let backups = test.backups();
        assert_eq!(backups.len(), 1);
        let backup = Database::connect(path_to_sqlite_url_with_mode(&backups[0], "ro").unwrap())
            .await
            .unwrap();
        assert!(!SchemaManager::new(&backup)
            .has_table("seaql_migrations")
            .await
            .unwrap());
        let row = backup
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT save_root_path, (SELECT COUNT(*) FROM games) AS game_count FROM user WHERE id = 1",
            ))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(row.try_get::<i64>("", "game_count").unwrap(), 0);
        assert_eq!(
            row.try_get::<String>("", "save_root_path").unwrap(),
            "历史存档目录"
        );
        backup.close().await.unwrap();
        assert!(Migrator::get_pending_migrations_read_only(&test.connection)
            .await
            .unwrap()
            .is_empty());
        test.cleanup().await;
    }

    #[tokio::test]
    async fn failed_migration_retains_backup_and_retry_creates_another_snapshot() {
        let test = TestDatabase::new("migration_retry").await;
        Migrator::up(&test.connection, Some(21)).await.unwrap();
        test.connection.execute_unprepared(
            "INSERT INTO games(id, id_type) VALUES (1, 'kun'); \
             INSERT INTO game_sources(game_id, source, external_id, data) VALUES (1, 'kun', '923', '{}'); \
             CREATE TRIGGER reject_reset BEFORE UPDATE ON game_sources BEGIN SELECT RAISE(ABORT, '测试失败'); END;"
        ).await.unwrap();
        let error = migrate_database(&test.connection, "0.31.1")
            .await
            .unwrap_err()
            .to_string();
        let backups = test.backups();
        assert_eq!(backups.len(), 1);
        assert!(error.contains(&backups[0].display().to_string()));
        test.connection
            .execute_unprepared("DROP TRIGGER reject_reset")
            .await
            .unwrap();
        migrate_database(&test.connection, "0.31.1").await.unwrap();
        assert_eq!(test.backups().len(), 2);
        assert!(backups[0].is_file());
        test.cleanup().await;
    }
}
