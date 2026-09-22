use crate::backup::archive::{create_7z_archive, verify_7z_archive};
use crate::backup::common::{
    BackupResult, acquire_database_backup_operation_lock, ensure_database_backup_available,
    next_backup_filename, resolve_backup_dir, temporary_sibling_path,
};
use sea_orm::DatabaseConnection;
use std::fs;
use std::path::Path;
use tauri::{State, command};

/// 备份所有自定义封面（仅自定义封面，不含云端缓存）
///
/// 将自定义封面文件复制到临时目录后压缩为 7z 文件，
/// 备份路径跟随数据库备份路径逻辑。
///
/// 压缩包内结构（解压后直接覆盖到数据目录即可）：
/// ```text
/// covers/
///   game_123/
///     cover_123_jpg_1703123456789.jpg
///   game_456/
///     cover_456_png_1703123456789.png
/// ```
#[command]
pub async fn backup_custom_covers(
    db: State<'_, DatabaseConnection>,
) -> Result<BackupResult, String> {
    let _operation_guard = acquire_database_backup_operation_lock().await;
    ensure_database_backup_available()?;
    backup_custom_covers_archive(&db).await
}

pub async fn backup_custom_covers_archive(db: &DatabaseConnection) -> Result<BackupResult, String> {
    let backup_dir = resolve_backup_dir(db).await?;
    let timestamp = chrono::Local::now().format("%Y%m%d_%H%M%S").to_string();
    let archive_name = next_backup_filename(&backup_dir, "custom_covers_", &timestamp, ".7z")?;
    backup_custom_covers_archive_to(&backup_dir, &archive_name)
}

pub(super) fn backup_custom_covers_archive_to(
    backup_dir: &Path,
    archive_name: &str,
) -> Result<BackupResult, String> {
    // 1. 获取封面根目录
    let covers_dir = reina_path::get_base_data_dir()?.join("covers");
    if !covers_dir.exists() {
        return Ok(BackupResult {
            success: true,
            path: None,
            message: "没有自定义封面需要备份".to_string(),
        });
    }

    // 2. 创建临时目录，内层套 covers 文件夹方便用户直接覆盖
    let timestamp = chrono::Local::now().timestamp_millis();
    let temp_dir = std::env::temp_dir().join(format!("reina_covers_{}", timestamp));
    let covers_temp_dir = temp_dir.join("covers");

    // 3. 遍历 covers 目录，仅复制自定义封面文件
    let mut has_covers = false;
    let scan_result = scan_and_copy_custom_covers(&covers_dir, &covers_temp_dir, &mut has_covers);

    // 扫描失败时清理临时目录
    if let Err(e) = scan_result {
        fs::remove_dir_all(&temp_dir).ok();
        return Err(e);
    }

    if !has_covers {
        fs::remove_dir_all(&temp_dir).ok();
        return Ok(BackupResult {
            success: true,
            path: None,
            message: "没有自定义封面需要备份".to_string(),
        });
    }

    // 4. 压缩为 7z 文件
    let archive_path = backup_dir.join(archive_name);
    if let Err(error) = ensure_archive_target_absent(&archive_path) {
        fs::remove_dir_all(&temp_dir).ok();
        return Err(error);
    }
    let temporary_archive = match temporary_sibling_path(&archive_path, "reina-creating") {
        Ok(path) => path,
        Err(error) => {
            fs::remove_dir_all(&temp_dir).ok();
            return Err(error);
        }
    };

    let size = match create_7z_archive(&temp_dir, &temporary_archive).and_then(|size| {
        verify_7z_archive(&temporary_archive)?;
        Ok(size)
    }) {
        Ok(size) => size,
        Err(e) => {
            fs::remove_dir_all(&temp_dir).ok();
            fs::remove_file(&temporary_archive).ok();
            return Err(format!("压缩自定义封面失败: {}", e));
        }
    };

    if let Err(error) = ensure_archive_target_absent(&archive_path) {
        fs::remove_dir_all(&temp_dir).ok();
        fs::remove_file(&temporary_archive).ok();
        return Err(error);
    }
    if let Err(error) = fs::rename(&temporary_archive, &archive_path) {
        fs::remove_dir_all(&temp_dir).ok();
        fs::remove_file(&temporary_archive).ok();
        return Err(format!("提交自定义封面备份失败: {error}"));
    }

    // 5. 清理临时目录
    fs::remove_dir_all(&temp_dir).ok();

    log::info!(
        "自定义封面备份成功: {} ({} bytes)",
        archive_path.display(),
        size
    );

    Ok(BackupResult {
        success: true,
        path: Some(archive_path.to_string_lossy().to_string()),
        message: "自定义封面备份成功".to_string(),
    })
}

fn ensure_archive_target_absent(path: &Path) -> Result<(), String> {
    match fs::symlink_metadata(path) {
        Ok(_) => Err(format!("备份文件已存在，拒绝覆盖: {}", path.display())),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(format!("检查封面备份目标失败 {}: {error}", path.display())),
    }
}

pub fn delete_all_covers_dir() -> Result<(), String> {
    let covers_dir = reina_path::get_base_data_dir()?.join("covers");

    if !covers_dir.exists() {
        return Ok(());
    }

    fs::remove_dir_all(&covers_dir)
        .map_err(|error| format!("无法删除封面目录 {}: {error}", covers_dir.display()))?;

    Ok(())
}

/// 扫描 covers 目录并将自定义封面文件复制到临时目录
///
/// 只复制匹配 `cover_{game_id}_*` 模式的文件，跳过云端缓存（`cloud_*`）。
/// 无自定义封面的 game 目录不会被创建。
fn scan_and_copy_custom_covers(
    covers_dir: &Path,
    temp_dir: &Path,
    has_covers: &mut bool,
) -> Result<(), String> {
    let entries = fs::read_dir(covers_dir).map_err(|e| format!("无法读取封面目录: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let entry_path = entry.path();

        if !entry_path.is_dir() {
            continue;
        }

        let dir_name = entry.file_name().to_string_lossy().to_string();

        // 只处理 game_{id} 格式的目录
        let game_id_str = match dir_name.strip_prefix("game_") {
            Some(id) => id,
            None => continue,
        };

        // 自定义封面文件名格式：cover_{game_id}_{ext}_{timestamp}.{ext}
        let expected_prefix = format!("cover_{}", game_id_str);
        let mut game_has_covers = false;

        let file_entries = fs::read_dir(&entry_path)
            .map_err(|e| format!("无法读取游戏封面目录 {}: {}", dir_name, e))?;

        for file_entry in file_entries {
            let file_entry = file_entry.map_err(|e| format!("读取游戏封面目录项失败: {}", e))?;

            if !file_entry.path().is_file() {
                continue;
            }

            let file_name = file_entry.file_name().to_string_lossy().to_string();

            // 匹配 cover_{id}_ 前缀（自定义封面），精确匹配游戏ID避免 cover_1 匹配到 cover_10
            if !file_name.starts_with(&expected_prefix) {
                continue;
            }
            // 确保是 cover_{id}_ 格式（前缀后面紧跟下划线），而不是 cover_{id}10 等
            let rest = &file_name[expected_prefix.len()..];
            if !rest.starts_with('_') {
                continue;
            }

            // 首次为该游戏创建目录
            if !game_has_covers {
                let game_temp_dir = temp_dir.join(&dir_name);
                fs::create_dir_all(&game_temp_dir)
                    .map_err(|e| format!("创建临时目录失败: {}", e))?;
                game_has_covers = true;
            }

            let target_path = temp_dir.join(&dir_name).join(&file_name);
            fs::copy(file_entry.path(), &target_path)
                .map_err(|e| format!("复制自定义封面文件失败 {}: {}", file_name, e))?;
        }

        if game_has_covers {
            *has_covers = true;
        }
    }

    Ok(())
}
