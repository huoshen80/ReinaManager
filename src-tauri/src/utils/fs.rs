#[cfg(target_os = "windows")]
use crate::utils::command_ext::CommandGuiExt;

use crate::backup::archive::create_7z_archive;
use crate::database::db::{BackupResult, resolve_backup_dir};
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;
use tauri::{State, command};

#[derive(Debug, Serialize, Deserialize)]
pub struct PortableModeResult {
    pub is_portable: bool,
}

// ==================== 文件操作相关 ====================

#[derive(Debug, Serialize, Deserialize)]
pub struct MoveResult {
    pub success: bool,
    pub message: String,
}

/// 打开目录
///
/// # Arguments
///
/// * `dir_path` - 要打开的目录路径
///
/// # Returns
///
/// 操作结果
#[command]
pub async fn open_directory(dir_path: String) -> Result<(), String> {
    // 首先检查路径是否存在
    if !Path::new(&dir_path).exists() {
        return Err(format!("路径不存在且无法创建: {}", dir_path));
    }

    #[cfg(target_os = "windows")]
    {
        // Windows Explorer 在某些情况下对反斜杠的处理更稳定
        // 虽然 Windows 系统本身支持正斜杠，但 Explorer 更喜欢原生的反斜杠格式
        let normalized_path = dir_path.replace('/', "\\");

        let result = Command::new("explorer")
            .arg(&normalized_path)
            .gui_safe()
            .spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => {
                // 如果 explorer 失败，尝试使用 cmd /c start
                let fallback_result = Command::new("cmd")
                    .args(["/c", "start", "", &normalized_path])
                    .gui_safe()
                    .spawn();

                match fallback_result {
                    Ok(_) => Ok(()),
                    Err(e2) => Err(format!(
                        "无法打开目录 '{}': explorer 失败 ({}), cmd 备用方案也失败 ({})",
                        normalized_path, e, e2
                    )),
                }
            }
        }
    }
    #[cfg(target_os = "linux")]
    {
        let result = Command::new("xdg-open").arg(&dir_path).spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("无法打开目录 '{}': {}", dir_path, e)),
        }
    }
}

/// 判断当前是否为便携模式
#[command]
pub fn is_portable_mode() -> PortableModeResult {
    PortableModeResult {
        is_portable: reina_path::is_portable_mode(),
    }
}

/// 移动备份文件夹到新位置
///
/// # Arguments
///
/// * `old_path` - 旧的备份文件夹路径
/// * `new_path` - 新的备份文件夹路径
///
/// # Returns
///
/// 移动操作的结果
#[command]
pub async fn move_backup_folder(old_path: String, new_path: String) -> Result<MoveResult, String> {
    let old_backup_path = Path::new(&old_path);
    let new_backup_path = Path::new(&new_path);

    // 检查旧路径是否存在
    if !old_backup_path.exists() {
        return Ok(MoveResult {
            success: true,
            message: "旧备份文件夹不存在，无需移动".to_string(),
        });
    }

    // 检查新路径的父目录是否存在，如果不存在则创建
    if let Some(parent) = new_backup_path.parent()
        && !parent.exists()
        && let Err(e) = fs::create_dir_all(parent)
    {
        return Ok(MoveResult {
            success: false,
            message: format!("无法创建目标目录: {}", e),
        });
    }

    // 检查新路径是否已经存在
    if new_backup_path.exists() {
        return Ok(MoveResult {
            success: false,
            message: "目标位置已存在备份文件夹，请手动处理".to_string(),
        });
    }

    // 尝试移动文件夹
    match fs::rename(old_backup_path, new_backup_path) {
        Ok(_) => Ok(MoveResult {
            success: true,
            message: "备份文件夹移动成功".to_string(),
        }),
        Err(_e) => {
            // 如果简单重命名失败（可能是跨分区），尝试复制然后删除
            match copy_dir_recursive(old_backup_path, new_backup_path) {
                Ok(_) => {
                    // 复制成功后删除原文件夹
                    match fs::remove_dir_all(old_backup_path) {
                        Ok(_) => Ok(MoveResult {
                            success: true,
                            message: "备份文件夹移动成功（通过复制）".to_string(),
                        }),
                        Err(e) => Ok(MoveResult {
                            success: false,
                            message: format!("文件夹已复制到新位置，但删除旧文件夹失败: {}", e),
                        }),
                    }
                }
                Err(e) => Ok(MoveResult {
                    success: false,
                    message: format!("移动文件夹失败: {}", e),
                }),
            }
        }
    }
}

// ==================== 数据迁移相关文件操作 ====================

/// 移动单个文件（剪切操作）
///
/// 优先使用 fs::rename，失败则使用 copy + remove
/// 如果目标文件已存在，会先尝试删除后重试
///
/// **跨盘策略**：对于跨盘符场景，先完整复制文件，成功后再删除源文件
pub fn move_file(from: &Path, to: &Path) -> Result<(), String> {
    // 确保目标目录存在
    if let Some(parent) = to.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("创建目标目录失败: {}", e))?;
    }

    // 尝试使用 rename（性能最好，适用于同盘符）
    match fs::rename(from, to) {
        Ok(_) => {
            log::debug!("已移动文件(rename): {} -> {}", from.display(), to.display());
            Ok(())
        }
        Err(_) => {
            // rename 失败（可能跨盘符或目标文件已存在）
            // 策略：先复制，成功后再删除源文件

            // 如果目标文件已存在，先尝试删除
            if to.exists() {
                log::warn!("目标文件已存在，尝试删除: {}", to.display());
                fs::remove_file(to)
                    .map_err(|e| format!("无法删除已存在的目标文件 {}: {}", to.display(), e))?;
            }

            // 复制文件
            fs::copy(from, to).map_err(|e| format!("复制文件失败: {}", e))?;

            // 复制成功，删除源文件
            fs::remove_file(from).map_err(|e| format!("删除源文件失败: {}", e))?;

            log::debug!(
                "已移动文件(copy+remove): {} -> {}",
                from.display(),
                to.display()
            );
            Ok(())
        }
    }
}

/// 递归移动目录（剪切操作）
///
/// 优先使用 fs::rename (性能最好)，失败则使用 copy + remove
///
/// **跨盘策略**：
/// 1. 先尝试 rename（同盘符时最快）
/// 2. rename 失败则使用分步骤策略：
///    - 第一阶段：复制所有文件到目标位置（记录错误但继续尝试）
///    - 第二阶段：如果复制全部成功，才删除源目录
///    - 如果有任何错误，保留源文件，返回错误信息
///    - **不会清理目标目录**，避免删除已成功复制的文件
///
/// # Arguments
/// * `from` - 源目录
/// * `to` - 目标目录
///
/// # Returns
/// * `Result<usize, String>` - 成功移动的文件数量或错误消息
#[allow(dead_code)]
pub fn move_dir_recursive(from: &Path, to: &Path) -> Result<usize, String> {
    // 尝试使用 rename（同盘符时性能最好）
    match fs::rename(from, to) {
        Ok(_) => {
            // rename 成功，统计文件数量
            let count = count_files_in_dir(to).unwrap_or(0);
            log::info!(
                "已移动目录(rename): {} -> {} ({} 个文件)",
                from.display(),
                to.display(),
                count
            );
            Ok(count)
        }
        Err(_) => {
            // rename 失败，可能是跨盘符
            log::info!(
                "rename 失败，使用分步骤复制策略: {} -> {}",
                from.display(),
                to.display()
            );

            // 第一阶段：复制所有文件到目标位置（收集错误但继续）
            let mut copy_errors = Vec::new();
            let copied_count = match copy_dir_with_error_collection(from, to, &mut copy_errors) {
                Ok(count) => count,
                Err(e) => {
                    // 复制过程中出现致命错误
                    return Err(format!(
                        "目录复制失败: {}\n注意: 源目录保持不变，目标目录可能包含部分文件",
                        e
                    ));
                }
            };

            // 检查是否有错误
            if !copy_errors.is_empty() {
                // 有文件复制失败，不删除源目录，也不清理目标目录
                let error_summary = copy_errors.join("\n");
                return Err(format!(
                    "目录复制部分失败（已复制 {} 个文件）：\n{}\n\n注意: 源目录保持不变，目标目录包含部分文件，请解决问题后重试",
                    copied_count, error_summary
                ));
            }

            // 第二阶段：所有文件复制成功，删除源目录
            fs::remove_dir_all(from).map_err(|e| {
                format!(
                    "所有文件已复制到目标位置，但删除源目录失败: {}\n源目录: {}\n目标目录: {}\n请手动删除源目录",
                    e,
                    from.display(),
                    to.display()
                )
            })?;

            log::info!(
                "已移动目录(copy+remove): {} -> {} ({} 个文件)",
                from.display(),
                to.display(),
                copied_count
            );

            Ok(copied_count)
        }
    }
}

/// 递归复制目录（带错误收集）
///
/// 此函数会尝试复制所有文件，遇到错误时不会立即停止，
/// 而是记录错误并继续处理其他文件。
///
/// # Returns
/// * `Result<usize, String>` - 成功复制的文件数量或致命错误
#[allow(dead_code)]
fn copy_dir_with_error_collection(
    from: &Path,
    to: &Path,
    errors: &mut Vec<String>,
) -> Result<usize, String> {
    let mut copied_count = 0;

    // 确保目标目录存在
    if let Err(e) = fs::create_dir_all(to) {
        return Err(format!("创建目标目录失败: {}", e));
    }

    // 遍历源目录
    let entries = fs::read_dir(from).map_err(|e| format!("读取源目录失败: {}", e))?;

    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                errors.push(format!("读取目录项失败: {}", e));
                continue;
            }
        };

        let entry_path = entry.path();
        let file_name = entry.file_name();
        let target_path = to.join(&file_name);

        if entry_path.is_dir() {
            // 递归复制子目录
            match copy_dir_with_error_collection(&entry_path, &target_path, errors) {
                Ok(count) => copied_count += count,
                Err(e) => {
                    errors.push(format!(
                        "复制子目录 {} 失败: {}",
                        file_name.to_string_lossy(),
                        e
                    ));
                }
            }
        } else {
            // 复制文件
            match fs::copy(&entry_path, &target_path) {
                Ok(_) => {
                    copied_count += 1;
                    log::debug!(
                        "已复制文件: {} -> {}",
                        entry_path.display(),
                        target_path.display()
                    );
                }
                Err(e) => {
                    errors.push(format!(
                        "复制文件 {} 失败: {}",
                        file_name.to_string_lossy(),
                        e
                    ));
                }
            }
        }
    }

    Ok(copied_count)
}

/// 统计目录中的文件数量（递归）
#[allow(dead_code)]
fn count_files_in_dir(dir: &Path) -> Result<usize, String> {
    let mut count = 0;

    if !dir.exists() {
        return Ok(0);
    }

    for entry in fs::read_dir(dir).map_err(|e| format!("读取目录失败: {}", e))? {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let entry_path = entry.path();

        if entry_path.is_dir() {
            count += count_files_in_dir(&entry_path)?;
        } else {
            count += 1;
        }
    }

    Ok(count)
}

/// 递归复制目录（用于 move_backup_folder）
///
/// # Arguments
///
/// * `src` - 源目录路径
/// * `dst` - 目标目录路径
///
/// # Returns
///
/// 复制操作的结果
fn copy_dir_recursive(src: &Path, dst: &Path) -> Result<(), Box<dyn std::error::Error>> {
    fs::create_dir_all(dst)?;

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if ty.is_dir() {
            copy_dir_recursive(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }

    Ok(())
}

#[command]
pub async fn copy_file(src: String, dst: String) -> Result<(), String> {
    let src_path = Path::new(&src);
    let dst_path = Path::new(&dst);

    if !src_path.exists() {
        return Err(format!("源文件不存在: {}", src));
    }

    if let Some(parent) = dst_path.parent()
        && !parent.exists()
    {
        fs::create_dir_all(parent).map_err(|e| format!("无法创建目标目录的父目录: {}", e))?;
    }
    fs::copy(src_path, dst_path).map_err(|e| format!("无法复制文件: {}", e))?;
    Ok(())
}

/// 删除文件
#[command]
pub async fn delete_file(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    if !path.exists() {
        return Ok(()); // 文件不存在，视为成功
    }

    fs::remove_file(path).map_err(|e| format!("无法删除文件: {}", e))?;
    Ok(())
}

/// 删除指定游戏的所有自定义封面文件，但保留封面目录
#[command]
pub async fn delete_game_covers(game_id: u32, covers_dir: String) -> Result<(), String> {
    let dir_path = Path::new(&covers_dir);

    if !dir_path.exists() {
        return Ok(()); // 目录不存在，视为成功
    }

    let expected_folder_name = format!("game_{}", game_id);
    let dir_name = dir_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default();

    if dir_name != expected_folder_name {
        return Err(format!(
            "封面目录与游戏ID不匹配: game_id={}, covers_dir={}",
            game_id, covers_dir
        ));
    }

    let expected_file_prefix = format!("cover_{}_", game_id);
    let entries = fs::read_dir(dir_path).map_err(|e| format!("无法读取封面目录: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let path = entry.path();

        if !path.is_file() {
            continue;
        }

        let file_name = entry.file_name();
        let file_name_str = file_name.to_string_lossy();
        if !file_name_str.starts_with(&expected_file_prefix) {
            continue;
        }

        fs::remove_file(&path).map_err(|e| format!("无法删除自定义封面文件: {}", e))?;
    }

    Ok(())
}

/// 删除指定游戏的封面目录（包含云端缓存和自定义封面）
pub async fn delete_game_cover_dir(game_id: i32) -> Result<(), String> {
    let game_cover_dir = reina_path::get_base_data_dir()?
        .join("covers")
        .join(format!("game_{}", game_id));

    if !game_cover_dir.exists() {
        return Ok(());
    }

    fs::remove_dir_all(&game_cover_dir)
        .map_err(|e| format!("无法删除游戏封面目录 {}: {}", game_cover_dir.display(), e))?;

    Ok(())
}

// ==================== 自定义封面备份 ====================

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
    let backup_dir = match resolve_backup_dir(&db).await {
        Ok(dir) => dir,
        Err(e) => {
            fs::remove_dir_all(&temp_dir).ok();
            return Err(e);
        }
    };
    let archive_name = format!(
        "custom_covers_{}.7z",
        chrono::Local::now().format("%Y%m%d_%H%M%S")
    );
    let archive_path = backup_dir.join(&archive_name);

    let size = match create_7z_archive(&temp_dir, &archive_path) {
        Ok(size) => size,
        Err(e) => {
            fs::remove_dir_all(&temp_dir).ok();
            return Err(format!("压缩自定义封面失败: {}", e));
        }
    };

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
