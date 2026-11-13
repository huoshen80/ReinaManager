use std::fs;
use std::path::Path;

pub(super) fn legacy_game_id(directory: &str) -> Option<u32> {
    directory.strip_prefix("game_")?.parse().ok()
}

pub(super) fn is_legacy_custom_cover(directory: &str, filename: &str) -> bool {
    let Some(id) = legacy_game_id(directory) else {
        return false;
    };
    let prefix = format!("cover_{id}_");
    let Some(reference) = filename.strip_prefix(&prefix) else {
        return false;
    };
    reference
        .bytes()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'.' | b'-'))
        && matches!(
            reference
                .split(['_', '.'])
                .next()
                .unwrap_or_default()
                .to_ascii_lowercase()
                .as_str(),
            "jpg" | "jpeg" | "png" | "webp" | "gif" | "bmp" | "avif" | "ico"
        )
        && !filename.ends_with(".part")
}

/// 保留新旧自定义封面的相对路径，排除云缓存和未完成文件。
pub(super) fn scan_and_copy_custom_covers(
    covers_dir: &Path,
    temp_dir: &Path,
) -> Result<(), String> {
    for directory in fs::read_dir(covers_dir).map_err(|e| e.to_string())? {
        let directory = directory.map_err(|e| e.to_string())?;
        let name = directory.file_name().to_string_lossy().into_owned();
        if name != "custom" && legacy_game_id(&name).is_none() {
            continue;
        }
        let kind = directory.file_type().map_err(|e| e.to_string())?;
        if !kind.is_dir() || kind.is_symlink() {
            return Err(format!(
                "自定义封面路径不是普通目录: {}",
                directory.path().display()
            ));
        }
        for file in fs::read_dir(directory.path()).map_err(|e| e.to_string())? {
            let file = file.map_err(|e| e.to_string())?;
            let filename = file.file_name().to_string_lossy().into_owned();
            let selected = if name == "custom" {
                file.path().extension().is_some_and(|e| e != "part")
            } else {
                is_legacy_custom_cover(&name, &filename)
            };
            if !selected {
                continue;
            }
            let kind = file.file_type().map_err(|e| e.to_string())?;
            if !kind.is_file() || kind.is_symlink() {
                return Err(format!("自定义封面不是普通文件: {}", file.path().display()));
            }
            let destination = temp_dir.join(&name).join(&filename);
            fs::create_dir_all(destination.parent().unwrap()).map_err(|e| e.to_string())?;
            // 多个旧目录存在同名文件时不能静默覆盖，避免发布不确定的恢复包。
            if destination.try_exists().map_err(|e| e.to_string())? {
                return Err(format!("自定义封面备份路径冲突: {}", destination.display()));
            }
            fs::copy(file.path(), destination).map_err(|e| format!("复制自定义封面失败: {e}"))?;
        }
    }

    Ok(())
}
