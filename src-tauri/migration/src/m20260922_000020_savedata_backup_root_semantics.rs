//! 统一存档备份根目录语义。
//!
//! 旧版本把自定义配置当作父目录，并在运行时隐式追加 `backups`。
//! 新版本直接把配置值作为实际备份根目录，因此这里只迁移配置文本，
//! 不触碰可能位于移动盘或网络盘上的备份文件。

use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{ConnectionTrait, DatabaseBackend, Statement};
use std::path::PathBuf;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        migrate_savedata_backup_roots(manager.get_connection()).await
    }

    async fn down(&self, _manager: &SchemaManager) -> Result<(), DbErr> {
        Err(DbErr::Custom(
            "此迁移不可逆，无法区分迁移后的旧配置和用户新设置的路径".to_string(),
        ))
    }
}

async fn migrate_savedata_backup_roots<C>(connection: &C) -> Result<(), DbErr>
where
    C: ConnectionTrait,
{
    let rows = connection
        .query_all_raw(Statement::from_string(
            DatabaseBackend::Sqlite,
            "SELECT id, save_root_path FROM user \
             WHERE save_root_path IS NOT NULL AND trim(save_root_path) <> ''"
                .to_string(),
        ))
        .await?;

    for row in rows {
        let id = row.try_get::<i32>("", "id")?;
        let old_path = row.try_get::<String>("", "save_root_path")?;
        let new_path = append_backup_component(&old_path);
        connection
            .execute_raw(Statement::from_sql_and_values(
                DatabaseBackend::Sqlite,
                "UPDATE user SET save_root_path = ? WHERE id = ?",
                [new_path.into(), id.into()],
            ))
            .await?;
    }

    Ok(())
}

fn append_backup_component(path: &str) -> String {
    PathBuf::from(path)
        .join(reina_path::BACKUP_SUBDIR)
        .to_string_lossy()
        .into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use sea_orm_migration::sea_orm::Database;

    #[tokio::test]
    async fn migrates_only_non_empty_custom_roots() {
        let database = Database::connect("sqlite::memory:").await.unwrap();
        database
            .execute_unprepared(
                "CREATE TABLE user (id INTEGER PRIMARY KEY, save_root_path TEXT); \
                 INSERT INTO user(id, save_root_path) VALUES \
                    (1, 'configured'), \
                    (2, NULL), \
                    (3, '');",
            )
            .await
            .unwrap();

        migrate_savedata_backup_roots(&database).await.unwrap();

        let rows = database
            .query_all_raw(Statement::from_string(
                DatabaseBackend::Sqlite,
                "SELECT id, save_root_path FROM user ORDER BY id".to_string(),
            ))
            .await
            .unwrap();
        assert_eq!(
            rows[0]
                .try_get::<Option<String>>("", "save_root_path")
                .unwrap(),
            Some(append_backup_component("configured"))
        );
        assert_eq!(
            rows[1]
                .try_get::<Option<String>>("", "save_root_path")
                .unwrap(),
            None
        );
        assert_eq!(
            rows[2]
                .try_get::<Option<String>>("", "save_root_path")
                .unwrap(),
            Some(String::new())
        );
    }

    #[test]
    fn appends_exactly_one_component_without_expanding_variables() {
        let configured = if cfg!(windows) {
            r"%USERPROFILE%\Reina"
        } else {
            "$HOME/Reina"
        };

        assert_eq!(
            append_backup_component(configured),
            PathBuf::from(configured).join("backups").to_string_lossy()
        );
        assert_eq!(
            append_backup_component(&append_backup_component(configured)),
            PathBuf::from(configured)
                .join("backups")
                .join("backups")
                .to_string_lossy()
        );
    }
}
