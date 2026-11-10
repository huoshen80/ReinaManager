use crate::game::cover::assets::asset_path;
use crate::game::cover::custom::{custom_cover_extension, save_custom_cover};
use sea_orm::{ConnectionTrait, DatabaseConnection, DbBackend, Statement};
use std::fs;
use std::path::Path;
use std::time::SystemTime;

use reina_path::{get_base_data_dir, get_base_data_dir_for_mode};

use crate::utils::fs::move_file;

#[derive(Debug, Default)]
pub struct StartupMigrationResult {
    pub migrated_files: usize,
    pub replaced_files: usize,
    pub removed_legacy_files: usize,
    pub skipped: usize,
    pub executed: usize,
}

pub async fn run_startup_migrations(
    db: &DatabaseConnection,
) -> Result<StartupMigrationResult, String> {
    let legacy_covers = get_base_data_dir_for_mode(true)?.join("covers");
    let current_covers = get_base_data_dir()?.join("covers");
    run_startup_migrations_at(db, &legacy_covers, &current_covers).await
}

async fn run_startup_migrations_at(
    db: &DatabaseConnection,
    legacy_covers: &Path,
    current_covers: &Path,
) -> Result<StartupMigrationResult, String> {
    let mut result = StartupMigrationResult::default();
    append_migration_result(
        &mut result,
        m20260326_000001_migrate_legacy_covers(legacy_covers, current_covers),
    )?;
    // 旧目录归集失败时停止，保留现场等待下次重试。
    append_migration_result(
        &mut result,
        m20261107_000002_migrate_cover_assets(db, current_covers).await,
    )?;
    Ok(result)
}

fn append_migration_result(
    aggregate: &mut StartupMigrationResult,
    result: Result<StartupMigrationResult, String>,
) -> Result<(), String> {
    let result = result?;
    aggregate.migrated_files += result.migrated_files;
    aggregate.replaced_files += result.replaced_files;
    aggregate.removed_legacy_files += result.removed_legacy_files;
    aggregate.skipped += result.skipped;
    aggregate.executed += result.executed;
    Ok(())
}

fn m20260326_000001_migrate_legacy_covers(
    legacy_covers_dir: &Path,
    current_covers_dir: &Path,
) -> Result<StartupMigrationResult, String> {
    if current_covers_dir == legacy_covers_dir || !legacy_covers_dir.exists() {
        return Ok(StartupMigrationResult {
            skipped: 1,
            ..Default::default()
        });
    }

    if !legacy_covers_dir.is_dir() {
        return Err(format!(
            "旧版 covers 路径不是目录: {}",
            legacy_covers_dir.display()
        ));
    }

    fs::create_dir_all(current_covers_dir).map_err(|e| {
        format!(
            "无法创建新的 covers 目录 {}: {}",
            current_covers_dir.display(),
            e
        )
    })?;

    let mut result = StartupMigrationResult {
        executed: 1,
        ..Default::default()
    };

    merge_covers_dir(legacy_covers_dir, current_covers_dir, &mut result)?;
    remove_dir_if_empty(legacy_covers_dir)?;

    log::info!(
        "旧版封面迁移明细 name=m20260326_000001_migrate_legacy_covers from={} to={} migrated={} replaced={} removed_legacy={}",
        legacy_covers_dir.display(),
        current_covers_dir.display(),
        result.migrated_files,
        result.replaced_files,
        result.removed_legacy_files
    );

    Ok(result)
}

fn merge_covers_dir(
    from_dir: &Path,
    to_dir: &Path,
    result: &mut StartupMigrationResult,
) -> Result<(), String> {
    for entry in fs::read_dir(from_dir)
        .map_err(|e| format!("读取 legacy covers 目录失败 {}: {}", from_dir.display(), e))?
    {
        let entry = entry.map_err(|e| format!("读取 legacy covers 项失败: {}", e))?;
        let from_path = entry.path();
        let to_path = to_dir.join(entry.file_name());

        if from_path.is_dir() {
            fs::create_dir_all(&to_path)
                .map_err(|e| format!("创建目标目录失败 {}: {}", to_path.display(), e))?;
            merge_covers_dir(&from_path, &to_path, result)?;
            remove_dir_if_empty(&from_path)?;
            continue;
        }

        if !from_path.is_file() {
            continue;
        }

        if !to_path.exists() {
            move_file(&from_path, &to_path)?;
            result.migrated_files += 1;
            continue;
        }

        if !to_path.is_file() {
            return Err(format!(
                "目标 covers 路径已存在且不是文件: {}",
                to_path.display()
            ));
        }

        let from_modified = file_modified_time(&from_path)?;
        let to_modified = file_modified_time(&to_path)?;

        if from_modified > to_modified {
            fs::remove_file(&to_path)
                .map_err(|e| format!("删除旧目标文件失败 {}: {}", to_path.display(), e))?;
            move_file(&from_path, &to_path)?;
            result.migrated_files += 1;
            result.replaced_files += 1;
        } else {
            fs::remove_file(&from_path)
                .map_err(|e| format!("删除 legacy 重复文件失败 {}: {}", from_path.display(), e))?;
            result.removed_legacy_files += 1;
        }
    }

    Ok(())
}

fn file_modified_time(path: &Path) -> Result<SystemTime, String> {
    fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .map_err(|e| format!("读取文件修改时间失败 {}: {}", path.display(), e))
}

fn remove_dir_if_empty(path: &Path) -> Result<(), String> {
    if !path.exists() || !path.is_dir() {
        return Ok(());
    }

    let mut entries = fs::read_dir(path)
        .map_err(|e| format!("检查目录是否为空失败 {}: {}", path.display(), e))?;

    if entries.next().is_none() {
        fs::remove_dir(path).map_err(|e| format!("删除空目录失败 {}: {}", path.display(), e))?;
    }

    Ok(())
}

async fn m20261107_000002_migrate_cover_assets(
    db: &DatabaseConnection,
    root: &Path,
) -> Result<StartupMigrationResult, String> {
    let mut result = StartupMigrationResult::default();
    let mut games = match tokio::fs::read_dir(root).await {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(result),
        Err(e) => return Err(e.to_string()),
    };
    while let Some(game) = games.next_entry().await.map_err(|e| e.to_string())? {
        let name = game.file_name().to_string_lossy().to_string();
        let Some(id) = name
            .strip_prefix("game_")
            .and_then(|id| id.parse::<u32>().ok())
        else {
            continue;
        };
        if !game.file_type().await.map_err(|e| e.to_string())?.is_dir() {
            continue;
        }
        result.executed = 1;
        let mut entries = tokio::fs::read_dir(game.path())
            .await
            .map_err(|e| e.to_string())?;
        while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
            if !entry
                .file_type()
                .await
                .map_err(|e| e.to_string())?
                .is_file()
            {
                continue;
            }
            let file_name = entry.file_name().to_string_lossy().to_string();
            if file_name.starts_with(&format!("cover_{id}_")) {
                // 按完整旧文件名匹配，不能仅凭游戏 ID 恢复已被用户替换或删除的封面。
                let row = db.query_one_raw(Statement::from_sql_and_values(
                    DbBackend::Sqlite,
                    "SELECT id, extension FROM cover_assets WHERE kind = 'custom' AND legacy_filename = ?",
                    [file_name.into()],
                )).await.map_err(|e| e.to_string())?;
                if let Some(row) = row {
                    let asset_id: String = row.try_get("", "id").map_err(|e| e.to_string())?;
                    let extension: String =
                        row.try_get("", "extension").map_err(|e| e.to_string())?;
                    let target = asset_path(root, "custom", &asset_id, &extension)?;
                    match tokio::fs::metadata(&target).await {
                        Ok(metadata) if metadata.is_file() => {
                            // 迁移重入不覆盖已有图片；确认可识别后才清理旧副本。
                            custom_cover_extension(&target).await?;
                        }
                        Ok(_) => return Err(format!("封面目标不是文件: {}", target.display())),
                        Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                            let actual_extension =
                                save_custom_cover(root, &asset_id, &entry.path()).await?;
                            // 旧文件后缀可能与内容不同，文件落盘后再纠正资产格式。
                            if actual_extension != extension {
                                db.execute_raw(Statement::from_sql_and_values(
                                    DbBackend::Sqlite,
                                    "UPDATE cover_assets SET extension = ? WHERE id = ?",
                                    [actual_extension.into(), asset_id.into()],
                                ))
                                .await
                                .map_err(|e| e.to_string())?;
                            }
                            result.migrated_files += 1;
                        }
                        Err(e) => return Err(format!("检查封面失败 {}: {e}", target.display())),
                    }
                } else {
                    log::info!("清理无关联的旧自定义封面: {}", entry.path().display());
                }
            } else if !file_name.starts_with(&format!("cloud_cover_{id}.")) {
                continue;
            }
            tokio::fs::remove_file(entry.path())
                .await
                .map_err(|e| e.to_string())?;
            result.removed_legacy_files += 1;
        }
        drop(entries);
        remove_dir_if_empty(&game.path())?;
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::game::cover::assets::{
        clean_unused_covers_at, set_custom,
        tests::{database_with_custom_data, png, temporary_root},
        write_asset,
    };
    use sea_orm::TransactionTrait;

    async fn legacy_database() -> DatabaseConnection {
        database_with_custom_data(Some(r#"{"name":"保留","image":"png_123"}"#)).await
    }

    #[tokio::test]
    async fn compresses_large_legacy_cover_and_resumes_after_database_failure() {
        let db = legacy_database().await;
        let root = temporary_root();
        let old = root.join("game_1/cover_1_png_123");
        fs::create_dir_all(old.parent().unwrap()).unwrap();
        fs::write(&old, png()).unwrap();
        // 旧版未限制大小；使用带尾部填充的有效 PNG 验证超过原上传限制的迁移。
        fs::OpenOptions::new()
            .write(true)
            .open(&old)
            .unwrap()
            .set_len(33 * 1024 * 1024)
            .unwrap();
        let original_target = custom_path(&db, &root).await;
        let compressed_target = original_target.with_extension("webp");
        db.execute_unprepared("CREATE TRIGGER reject_format BEFORE UPDATE ON cover_assets BEGIN SELECT RAISE(ABORT, 'test failure'); END").await.unwrap();
        assert!(run_startup_migrations_at(&db, &root, &root).await.is_err());
        assert!(old.is_file());
        assert_eq!(custom_path(&db, &root).await, original_target);
        let compressed = fs::read(&compressed_target).unwrap();
        assert_eq!(
            image::load_from_memory(&compressed).unwrap().into_rgba8(),
            image::load_from_memory(&png()).unwrap().into_rgba8()
        );
        db.execute_unprepared("DROP TRIGGER reject_format")
            .await
            .unwrap();
        run_startup_migrations_at(&db, &root, &root).await.unwrap();
        assert_eq!(custom_path(&db, &root).await, compressed_target);
        assert_eq!(fs::read(&compressed_target).unwrap(), compressed);
        assert!(!old.exists());
        run_startup_migrations_at(&db, &root, &root).await.unwrap();
        assert_eq!(fs::read(compressed_target).unwrap(), compressed);
        fs::remove_dir_all(root).unwrap();
    }

    async fn custom_path(db: &DatabaseConnection, root: &Path) -> std::path::PathBuf {
        let row = db
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT id, extension FROM cover_assets WHERE game_id=1 AND kind='custom'",
            ))
            .await
            .unwrap()
            .unwrap();
        asset_path(
            root,
            "custom",
            &row.try_get::<String>("", "id").unwrap(),
            &row.try_get::<String>("", "extension").unwrap(),
        )
        .unwrap()
    }

    #[tokio::test]
    async fn no_legacy_files_skips_database_queries() {
        let db = sea_orm::Database::connect("sqlite::memory:").await.unwrap();
        let root = temporary_root();
        // 故意没有业务表；缺目录或仅有新格式目录都不应访问数据库。
        assert_eq!(
            run_startup_migrations_at(&db, &root, &root)
                .await
                .unwrap()
                .executed,
            0
        );
        fs::create_dir_all(root.join("custom")).unwrap();
        fs::create_dir_all(root.join("cloud")).unwrap();
        fs::write(root.join("custom/keep.png"), png()).unwrap();
        assert_eq!(
            run_startup_migrations_at(&db, &root, &root)
                .await
                .unwrap()
                .executed,
            0
        );
        assert!(root.join("custom/keep.png").is_file());
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn late_restore_is_repeatable_and_never_revives_replaced_covers() {
        let db = legacy_database().await;
        let root = temporary_root();
        let target = custom_path(&db, &root).await;
        let data = db
            .query_one_raw(Statement::from_string(
                DbBackend::Sqlite,
                "SELECT custom_data FROM games WHERE id=1",
            ))
            .await
            .unwrap()
            .unwrap()
            .try_get::<String>("", "custom_data")
            .unwrap();
        assert_eq!(
            serde_json::from_str::<serde_json::Value>(&data).unwrap(),
            serde_json::json!({"name":"保留"})
        );
        run_startup_migrations_at(&db, &root, &root).await.unwrap();
        clean_unused_covers_at(&db, &root).await.unwrap();
        assert_eq!(custom_path(&db, &root).await, target);
        assert!(!target.exists());

        let old = root.join("game_1/cover_1_png_123");
        for attempt in 0..2 {
            fs::create_dir_all(old.parent().unwrap()).unwrap();
            let mut bytes = png();
            if attempt == 1 {
                bytes.extend_from_slice(b"older backup");
            }
            fs::write(&old, bytes).unwrap();
            run_startup_migrations_at(&db, &root, &root).await.unwrap();
            assert_eq!(fs::read(&target).unwrap(), png());
            assert!(!old.parent().unwrap().exists());
        }
        let (id, extension) = write_asset(&root, "custom", &png()).await.unwrap();
        let transaction = db.begin().await.unwrap();
        set_custom(&transaction, 1, Some((&id, &extension)))
            .await
            .unwrap();
        transaction.commit().await.unwrap();
        fs::create_dir_all(old.parent().unwrap()).unwrap();
        fs::write(&old, png()).unwrap();
        run_startup_migrations_at(&db, &root, &root).await.unwrap();
        clean_unused_covers_at(&db, &root).await.unwrap();
        assert!(!old.exists());
        assert!(!target.exists());
        assert_eq!(
            custom_path(&db, &root).await,
            asset_path(&root, "custom", &id, &extension).unwrap()
        );
        assert!(custom_path(&db, &root).await.is_file());
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn directory_merge_failure_preserves_files_and_resumes_before_conversion() {
        let db = legacy_database().await;
        let root = temporary_root();
        let legacy = root.join("legacy");
        let current = root.join("current");
        fs::create_dir_all(legacy.join("game_1")).unwrap();
        fs::create_dir_all(current.join("game_2")).unwrap();
        fs::write(legacy.join("game_1/cover_1_png_123"), png()).unwrap();
        fs::write(current.join("game_1"), b"blocked directory").unwrap();
        fs::write(current.join("game_2/cloud_cover_2.png"), png()).unwrap();
        assert!(
            run_startup_migrations_at(&db, &legacy, &current)
                .await
                .is_err()
        );
        assert!(legacy.join("game_1/cover_1_png_123").is_file());
        assert!(current.join("game_2/cloud_cover_2.png").is_file());
        assert!(!current.join("custom").exists());
        fs::remove_file(current.join("game_1")).unwrap();
        run_startup_migrations_at(&db, &legacy, &current)
            .await
            .unwrap();
        assert!(!legacy.exists());
        assert!(!current.join("game_1").exists());
        assert!(!current.join("game_2").exists());
        assert_eq!(fs::read(custom_path(&db, &current).await).unwrap(), png());
        fs::remove_dir_all(root).unwrap();
    }

    #[tokio::test]
    async fn failed_copy_keeps_source_and_cleanup_only_removes_recognized_old_files() {
        // 旧后缀和实际内容不一致，也要使用同一 UUID 正确恢复。
        let db = database_with_custom_data(Some(r#"{"image":"jpeg_123"}"#)).await;
        let root = temporary_root();
        let old = root.join("game_1/cover_1_jpeg_123");
        fs::create_dir_all(old.parent().unwrap()).unwrap();
        fs::write(&old, b"invalid image").unwrap();
        assert!(run_startup_migrations_at(&db, &root, &root).await.is_err());
        assert!(old.is_file());
        let target = custom_path(&db, &root).await;
        let partial = target.with_extension("part");
        fs::create_dir_all(&partial).unwrap();
        fs::write(&old, png()).unwrap();
        assert!(run_startup_migrations_at(&db, &root, &root).await.is_err());
        assert!(old.is_file());
        fs::remove_dir(&partial).unwrap();
        db.execute_unprepared("CREATE TRIGGER reject_format BEFORE UPDATE ON cover_assets BEGIN SELECT RAISE(ABORT, 'test failure'); END").await.unwrap();
        assert!(run_startup_migrations_at(&db, &root, &root).await.is_err());
        assert!(old.is_file());
        assert_eq!(fs::read(target.with_extension("png")).unwrap(), png());
        db.execute_unprepared("DROP TRIGGER reject_format")
            .await
            .unwrap();
        let mut restored_again = png();
        restored_again.extend_from_slice(b"another backup");
        fs::write(&old, restored_again).unwrap();
        for directory in ["game_2", "game_3", "game_4", "other"] {
            fs::create_dir_all(root.join(directory)).unwrap();
        }
        for file in [
            "game_2/cover_2_png_123",
            "game_2/cloud_cover_2.jpg",
            "game_4/notes.txt",
            "game_4/cover_40_png_123",
            "other/cloud_cover_1.png",
        ] {
            fs::write(root.join(file), b"leftover").unwrap();
        }
        run_startup_migrations_at(&db, &root, &root).await.unwrap();
        let actual_target = target.with_extension("png");
        assert_eq!(custom_path(&db, &root).await, actual_target);
        assert_eq!(fs::read(actual_target).unwrap(), png());
        for directory in ["game_1", "game_2", "game_3"] {
            assert!(!root.join(directory).exists());
        }
        for file in [
            "game_4/notes.txt",
            "game_4/cover_40_png_123",
            "other/cloud_cover_1.png",
        ] {
            assert!(root.join(file).is_file());
        }
        fs::remove_dir_all(root).unwrap();
    }
}
