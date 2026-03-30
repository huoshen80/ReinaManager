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

pub fn run_startup_migrations() -> Result<StartupMigrationResult, String> {
    let mut result = StartupMigrationResult::default();

    run_startup_migration(&mut result, m20260326_000001_migrate_legacy_covers)?;

    Ok(result)
}

fn run_startup_migration(
    aggregate: &mut StartupMigrationResult,
    migration: fn() -> Result<StartupMigrationResult, String>,
) -> Result<(), String> {
    let result = migration()?;

    aggregate.migrated_files += result.migrated_files;
    aggregate.replaced_files += result.replaced_files;
    aggregate.removed_legacy_files += result.removed_legacy_files;
    aggregate.skipped += result.skipped;
    aggregate.executed += result.executed;

    Ok(())
}

fn m20260326_000001_migrate_legacy_covers() -> Result<StartupMigrationResult, String> {
    let legacy_covers_dir = get_base_data_dir_for_mode(true)?.join("covers");
    let current_covers_dir = get_base_data_dir()?.join("covers");

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

    fs::create_dir_all(&current_covers_dir).map_err(|e| {
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

    merge_covers_dir(&legacy_covers_dir, &current_covers_dir, &mut result)?;
    remove_dir_if_empty(&legacy_covers_dir)?;
    // 清理可能存在的空 resources 目录
    remove_dir_if_empty(&legacy_covers_dir)?;

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
