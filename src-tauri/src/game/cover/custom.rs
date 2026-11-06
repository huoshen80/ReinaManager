use arboard::Clipboard;
use image::{ColorType, ImageFormat};
use std::fs;
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
/// 该文件只用于前端保存前预览，由资料保存工作流复制到正式封面目录。
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

pub async fn read_custom_cover(image_path: &std::path::Path) -> Result<Vec<u8>, String> {
    let metadata = tokio::fs::metadata(image_path)
        .await
        .map_err(|e| e.to_string())?;
    if !metadata.is_file() || metadata.len() > 32 * 1024 * 1024 {
        return Err("无效或过大的封面文件".into());
    }
    let bytes = tokio::fs::read(image_path)
        .await
        .map_err(|e| e.to_string())?;
    if bytes.len() > 32 * 1024 * 1024 {
        return Err("无效或过大的封面文件".into());
    }
    Ok(bytes)
}
