use sea_orm::{ConnectionTrait, DatabaseConnection, DatabaseTransaction, DbBackend, Statement};
use std::path::{Path, PathBuf};
use uuid::Uuid;

pub fn asset_path(root: &Path, kind: &str, id: &str, extension: &str) -> Result<PathBuf, String> {
    Uuid::parse_str(id).map_err(|_| "无效的封面 UUID".to_string())?;
    if !matches!(kind, "cloud" | "custom")
        || !matches!(
            extension,
            "jpg" | "png" | "webp" | "gif" | "bmp" | "avif" | "ico"
        )
    {
        return Err("无效的封面格式".into());
    }
    Ok(root.join(kind).join(format!("{id}.{extension}")))
}

pub fn image_extension(bytes: &[u8]) -> Result<&'static str, String> {
    use image::ImageFormat;
    match image::guess_format(bytes).map_err(|e| format!("无法识别封面图片: {e}"))? {
        ImageFormat::Jpeg => Ok("jpg"),
        ImageFormat::Png => Ok("png"),
        ImageFormat::WebP => Ok("webp"),
        ImageFormat::Gif => Ok("gif"),
        ImageFormat::Bmp => Ok("bmp"),
        ImageFormat::Avif => Ok("avif"),
        ImageFormat::Ico => Ok("ico"),
        _ => Err("不支持的封面格式".into()),
    }
}

#[cfg(test)]
pub async fn write_asset(
    root: &Path,
    kind: &str,
    bytes: &[u8],
) -> Result<(String, String), String> {
    let extension = image_extension(bytes)?.to_string();
    let id = Uuid::now_v7().to_string();
    let target = asset_path(root, kind, &id, &extension)?;
    write_asset_file(&target, bytes).await?;
    Ok((id, extension))
}

pub async fn write_asset_file(target: &Path, bytes: &[u8]) -> Result<(), String> {
    write_asset_stream(target, bytes).await
}

pub async fn write_asset_stream(
    target: &Path,
    mut source: impl tokio::io::AsyncRead + Unpin,
) -> Result<(), String> {
    tokio::fs::create_dir_all(target.parent().unwrap())
        .await
        .map_err(|e| e.to_string())?;
    let temporary = target.with_extension("part");
    let result = async {
        let mut file = tokio::fs::File::create(&temporary)
            .await
            .map_err(|e| e.to_string())?;
        tokio::io::copy(&mut source, &mut file)
            .await
            .map_err(|e| e.to_string())?;
        file.sync_all().await.map_err(|e| e.to_string())?;
        drop(file);
        tokio::fs::rename(&temporary, &target)
            .await
            .map_err(|e| e.to_string())
    }
    .await;
    if result.is_err() {
        let _ = tokio::fs::remove_file(&temporary).await;
    }
    result
}

pub async fn cache_path(
    db: &DatabaseConnection,
    root: &Path,
    asset_id: &str,
) -> Result<Option<PathBuf>, String> {
    let row = db
        .query_one_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT extension FROM cover_assets WHERE id = ? AND kind = 'cloud'",
            [asset_id.into()],
        ))
        .await
        .map_err(|e| e.to_string())?;
    let Some(row) = row else {
        return Ok(None);
    };
    let Some(extension) = row
        .try_get::<Option<String>>("", "extension")
        .map_err(|e| e.to_string())?
    else {
        return Ok(None);
    };
    let path = asset_path(root, "cloud", asset_id, &extension)?;
    match tokio::fs::metadata(&path).await {
        Ok(_) => Ok(Some(path)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub async fn set_custom(
    db: &DatabaseTransaction,
    game_id: u32,
    asset: Option<(&str, &str)>,
) -> Result<(), String> {
    db.execute_raw(Statement::from_sql_and_values(
        DbBackend::Sqlite,
        "DELETE FROM cover_assets WHERE game_id = ? AND kind = 'custom'",
        [game_id.into()],
    ))
    .await
    .map_err(|e| e.to_string())?;
    if let Some((id, extension)) = asset {
        db.execute_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO cover_assets(id, game_id, kind, extension) VALUES (?, ?, 'custom', ?)",
            [id.into(), game_id.into(), extension.into()],
        ))
        .await
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub async fn game_asset_paths(
    db: &DatabaseConnection,
    game_id: u32,
    kind: Option<&str>,
) -> Result<Vec<PathBuf>, String> {
    game_asset_paths_at(
        db,
        game_id,
        &reina_path::get_base_data_dir()?.join("covers"),
        kind,
    )
    .await
}

pub async fn game_asset_paths_at<C: ConnectionTrait>(
    db: &C,
    game_id: u32,
    root: &Path,
    kind: Option<&str>,
) -> Result<Vec<PathBuf>, String> {
    let rows = db
        .query_all_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "SELECT id, kind, extension FROM cover_assets WHERE game_id = ? AND extension IS NOT NULL AND (? IS NULL OR kind = ?)",
            [game_id.into(), kind.into(), kind.into()],
        ))
        .await
        .map_err(|e| e.to_string())?;
    rows.into_iter()
        .map(|row| {
            asset_path(
                root,
                &row.try_get::<String>("", "kind")
                    .map_err(|e| e.to_string())?,
                &row.try_get::<String>("", "id").map_err(|e| e.to_string())?,
                &row.try_get::<String>("", "extension")
                    .map_err(|e| e.to_string())?,
            )
        })
        .collect()
}

pub async fn clean_replaced_files(db: &DatabaseConnection, game_id: u32, previous: Vec<PathBuf>) {
    match reina_path::get_base_data_dir() {
        Ok(root) => clean_replaced_files_at(db, game_id, previous, &root.join("covers")).await,
        Err(e) => log::warn!("跳过封面清理: {e}"),
    }
}

pub async fn clean_replaced_files_at(
    db: &DatabaseConnection,
    game_id: u32,
    previous: Vec<PathBuf>,
    root: &Path,
) {
    if previous.is_empty() {
        return;
    }
    let retained = match game_asset_paths_at(db, game_id, root, None).await {
        Ok(paths) => paths,
        Err(e) => {
            log::warn!("跳过封面清理，无法确认有效文件: {e}");
            return;
        }
    };
    for path in previous {
        if !retained.contains(&path)
            && let Err(e) = tokio::fs::remove_file(&path).await
            && e.kind() != std::io::ErrorKind::NotFound
        {
            log::warn!("清理旧封面失败 {}: {e}", path.display());
        }
    }
}

#[derive(Debug, Default, serde::Serialize)]
pub struct CoverCleanupResult {
    pub deleted_files: u64,
    pub freed_bytes: u64,
    pub failed_files: u64,
}

#[tauri::command]
pub async fn clean_unused_covers(
    db: tauri::State<'_, DatabaseConnection>,
) -> Result<CoverCleanupResult, String> {
    let root = reina_path::get_base_data_dir()?.join("covers");
    clean_unused_covers_at(&db, &root).await
}

pub async fn clean_unused_covers_at(
    db: &DatabaseConnection,
    root: &Path,
) -> Result<CoverCleanupResult, String> {
    // 与自定义保存、云图落盘和备份恢复互斥，扫描期间不会出现未提交的新文件。
    let _guard = crate::backup::common::acquire_database_backup_operation_lock().await;
    let rows = db
        .query_all_raw(Statement::from_string(
            DbBackend::Sqlite,
            "SELECT id, kind, extension FROM cover_assets",
        ))
        .await
        .map_err(|e| e.to_string())?;
    let mut retained = std::collections::HashSet::new();
    let mut pending = std::collections::HashSet::new();
    for row in rows {
        let id: String = row.try_get("", "id").map_err(|e| e.to_string())?;
        let kind: String = row.try_get("", "kind").map_err(|e| e.to_string())?;
        if let Some(ext) = row
            .try_get::<Option<String>>("", "extension")
            .map_err(|e| e.to_string())?
        {
            retained.insert(asset_path(root, &kind, &id, &ext)?);
        } else {
            pending.insert((kind, id));
        }
    }
    let mut result = CoverCleanupResult::default();
    for kind in ["custom", "cloud"] {
        let directory = root.join(kind);
        match tokio::fs::symlink_metadata(&directory).await {
            Ok(meta) if meta.is_dir() && !meta.file_type().is_symlink() => {}
            Ok(_) => return Err(format!("封面目录不是普通目录: {}", directory.display())),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
            Err(e) => return Err(e.to_string()),
        }
        let resolved_root = tokio::fs::canonicalize(root)
            .await
            .map_err(|e| e.to_string())?;
        let resolved_directory = tokio::fs::canonicalize(&directory)
            .await
            .map_err(|e| e.to_string())?;
        if resolved_directory.parent() != Some(resolved_root.as_path()) {
            return Err(format!("封面目录指向受管目录之外: {}", directory.display()));
        }
        let mut entries = tokio::fs::read_dir(directory)
            .await
            .map_err(|e| e.to_string())?;
        while let Some(entry) = entries.next_entry().await.map_err(|e| e.to_string())? {
            let path = entry.path();
            let (Some(id), Some(ext)) = (
                path.file_stem().and_then(|s| s.to_str()),
                path.extension().and_then(|s| s.to_str()),
            ) else {
                continue;
            };
            if Uuid::parse_str(id).is_err()
                || (ext != "part" && asset_path(root, kind, id, ext).is_err())
            {
                continue;
            }
            if retained.contains(&path)
                || (ext != "part" && pending.contains(&(kind.to_string(), id.to_string())))
            {
                continue;
            }
            let removal = async {
                let metadata = tokio::fs::symlink_metadata(&path).await?;
                if !metadata.is_file() || metadata.file_type().is_symlink() {
                    return Ok(None);
                }
                tokio::fs::remove_file(&path).await?;
                Ok::<_, std::io::Error>(Some(metadata.len()))
            }
            .await;
            match removal {
                Ok(Some(size)) => {
                    result.deleted_files += 1;
                    result.freed_bytes += size;
                }
                Ok(None) => {}
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => {}
                Err(e) => {
                    result.failed_files += 1;
                    log::warn!("清理无用封面失败 {}: {e}", path.display());
                }
            }
        }
    }
    Ok(result)
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use sea_orm::{Database, TransactionTrait};
    pub(crate) async fn database() -> DatabaseConnection {
        database_with_custom_data(None).await
    }
    pub(crate) async fn database_with_custom_data(data: Option<&str>) -> DatabaseConnection {
        let db = Database::connect("sqlite::memory:").await.unwrap();
        db.execute_unprepared(
            "PRAGMA foreign_keys=ON; CREATE TABLE games(id INTEGER PRIMARY KEY, custom_data TEXT); CREATE TABLE game_sources(game_id INTEGER, source TEXT, data TEXT);",
        )
        .await
        .unwrap();
        db.execute_raw(Statement::from_sql_and_values(
            DbBackend::Sqlite,
            "INSERT INTO games VALUES(1, ?)",
            [data.into()],
        ))
        .await
        .unwrap();
        // 使用正式迁移创建表，避免测试 schema 与运行代码漂移。
        use migration::MigratorTrait;
        let migrations = migration::Migrator::migrations();
        migrations
            .last()
            .unwrap()
            .up(&migration::SchemaManager::new(&db))
            .await
            .unwrap();
        db
    }
    pub(crate) fn temporary_root() -> PathBuf {
        std::env::temp_dir().join(format!("reina-cover-tests-{}", Uuid::now_v7()))
    }
    pub(crate) fn png() -> Vec<u8> {
        let mut bytes = std::io::Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(1, 1)
            .write_to(&mut bytes, image::ImageFormat::Png)
            .unwrap();
        bytes.into_inner()
    }
    #[tokio::test]
    async fn recovery_keeps_registered_covers_and_removes_orphan_files() {
        let db = database().await;
        let root = temporary_root();
        let transaction = db.begin().await.unwrap();
        let (id, ext) = write_asset(&root, "custom", &png()).await.unwrap();
        set_custom(&transaction, 1, Some((&id, &ext)))
            .await
            .unwrap();
        transaction.commit().await.unwrap();
        assert!(db.execute_unprepared("INSERT INTO cover_assets(id, game_id, kind, extension) VALUES('duplicate', 1, 'custom', 'png')").await.is_err());
        let (orphan_id, ext) = write_asset(&root, "custom", &png()).await.unwrap();
        let orphan = asset_path(&root, "custom", &orphan_id, &ext).unwrap();
        let unrelated = root.join("custom/notes.txt");
        tokio::fs::write(&unrelated, b"keep").await.unwrap();
        let pending = Uuid::now_v7().to_string();
        db.execute_raw(Statement::from_sql_and_values(DbBackend::Sqlite,
            "INSERT INTO cover_assets(id,game_id,kind,source,original_url) VALUES(?,1,'cloud','bgm','url')", [pending.clone().into()])).await.unwrap();
        let pending_path = asset_path(&root, "cloud", &pending, "png").unwrap();
        write_asset_file(&pending_path, &png()).await.unwrap();
        let partial = root.join("cloud").join(format!("{}.part", Uuid::now_v7()));
        tokio::fs::write(&partial, b"partial").await.unwrap();
        // 清理必须等待写入事务，不能在文件落盘到登记关联的窗口内运行。
        let guard = crate::backup::common::acquire_database_backup_operation_lock().await;
        let cleanup = clean_unused_covers_at(&db, &root);
        tokio::pin!(cleanup);
        assert!(
            tokio::time::timeout(std::time::Duration::from_millis(20), &mut cleanup)
                .await
                .is_err()
        );
        drop(guard);
        let result = cleanup.await.unwrap();
        assert_eq!(result.deleted_files, 2);
        assert_eq!(result.freed_bytes, png().len() as u64 + 7);
        assert_eq!(result.failed_files, 0);
        assert!(unrelated.exists());
        assert!(pending_path.exists());
        assert!(!partial.exists());
        assert!(asset_path(&root, "custom", &id, &ext).unwrap().is_file());
        assert!(!orphan.exists());
        tokio::fs::remove_dir_all(&root).await.unwrap();
    }
    #[test]
    fn paths_reject_traversal() {
        assert!(asset_path(Path::new("covers"), "cloud", "../x", "png").is_err());
        assert!(
            asset_path(
                Path::new("covers"),
                "custom",
                &Uuid::now_v7().to_string(),
                "../../x"
            )
            .is_err()
        );
    }
}
