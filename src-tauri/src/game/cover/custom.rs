use arboard::Clipboard;
use image::{ColorType, ImageFormat};
use std::fs;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::command;

fn map_clipboard_error(error: arboard::Error) -> String {
    let message = error.to_string();
    let lower_message = message.to_lowercase();
    if lower_message.contains("not available")
        || lower_message.contains("unavailable")
        || lower_message.contains("requested format")
    {
        "CLIPBOARD_IMAGE_NOT_FOUND".to_string()
    } else {
        format!("CLIPBOARD_IMAGE_READ_FAILED: {}", message)
    }
}

/// 从剪贴板读取图片并写入临时 PNG 文件。
///
/// 该文件只用于前端保存前预览，保存成功后仍由现有上传逻辑复制到正式封面目录。
#[command]
pub async fn import_clipboard_image_to_temp(game_id: u32) -> Result<String, String> {
    let mut clipboard = Clipboard::new().map_err(map_clipboard_error)?;
    let clipboard_image = clipboard.get_image().map_err(map_clipboard_error)?;
    let width = u32::try_from(clipboard_image.width)
        .map_err(|_| "CLIPBOARD_IMAGE_READ_FAILED: 图片宽度超出支持范围".to_string())?;
    let height = u32::try_from(clipboard_image.height)
        .map_err(|_| "CLIPBOARD_IMAGE_READ_FAILED: 图片高度超出支持范围".to_string())?;

    let temp_dir = std::env::temp_dir()
        .join("ReinaManager")
        .join("clipboard-cover");
    fs::create_dir_all(&temp_dir).map_err(|e| format!("创建剪贴板图片临时目录失败: {}", e))?;

    let timestamp_nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| format!("获取系统时间失败: {}", e))?
        .as_nanos();
    let target_path = temp_dir.join(format!(
        "clipboard_cover_{}_{}.png",
        game_id, timestamp_nanos
    ));

    image::save_buffer_with_format(
        &target_path,
        clipboard_image.bytes.as_ref(),
        width,
        height,
        ColorType::Rgba8,
        ImageFormat::Png,
    )
    .map_err(|e| format!("CLIPBOARD_IMAGE_WRITE_FAILED: {}", e))?;

    Ok(target_path.to_string_lossy().to_string())
}

/// 删除指定游戏的所有自定义封面文件，但保留封面目录
#[command]
pub async fn delete_game_covers(game_id: u32, covers_dir: String) -> Result<(), String> {
    let dir_path = Path::new(&covers_dir);

    if !dir_path.exists() {
        return Ok(());
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
