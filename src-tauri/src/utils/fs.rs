use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;
use tauri::command;

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
    use std::fs;

    // 首先检查路径是否存在
    if !Path::new(&dir_path).exists() {
        // 如果路径不存在，尝试创建它
        if let Err(e) = fs::create_dir_all(&dir_path) {
            return Err(format!("路径不存在且无法创建: {} - {}", dir_path, e));
        }
    }
    #[cfg(target_os = "windows")]
    {
        // 使用正斜杠转换为反斜杠，Windows Explorer 更喜欢反斜杠
        let normalized_path = dir_path.replace('/', "\\");

        let result = Command::new("explorer").arg(&normalized_path).spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => {
                // 如果 explorer 失败，尝试使用 cmd /c start
                let fallback_result = Command::new("cmd")
                    .args(["/c", "start", "", &normalized_path])
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
    #[cfg(target_os = "macos")]
    {
        match Command::new("open").arg(&dir_path).spawn() {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("无法在 macOS 上打开目录 '{}': {}", dir_path, e)),
        }
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
    if let Some(parent) = new_backup_path.parent() {
        if !parent.exists() {
            if let Err(e) = fs::create_dir_all(parent) {
                return Ok(MoveResult {
                    success: false,
                    message: format!("无法创建目标目录: {}", e),
                });
            }
        }
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
            match copy_dir_all(old_backup_path, new_backup_path) {
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

/// 递归复制目录
///
/// # Arguments
///
/// * `src` - 源目录路径
/// * `dst` - 目标目录路径
///
/// # Returns
///
/// 复制操作的结果
fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), Box<dyn std::error::Error>> {
    fs::create_dir_all(dst)?;

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        let ty = entry.file_type()?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        if ty.is_dir() {
            copy_dir_all(&src_path, &dst_path)?;
        } else {
            fs::copy(&src_path, &dst_path)?;
        }
    }

    Ok(())
}
