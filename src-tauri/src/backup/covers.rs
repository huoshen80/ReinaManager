use std::fs;
use std::path::Path;

/// 数据包仅复制 custom 中的自定义图片，排除未完成文件。
pub(super) fn scan_and_copy_custom_covers(
    covers_dir: &Path,
    temp_dir: &Path,
) -> Result<(), String> {
    let files = match fs::read_dir(covers_dir.join("custom")) {
        Ok(files) => files,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(format!("无法读取自定义封面目录: {error}")),
    };
    let destination = temp_dir.join("custom");
    fs::create_dir_all(&destination).map_err(|e| e.to_string())?;
    for file in files {
        let file = file.map_err(|e| e.to_string())?;
        if file.file_type().map_err(|e| e.to_string())?.is_file()
            && file.path().extension().is_some_and(|e| e != "part")
        {
            fs::copy(file.path(), destination.join(file.file_name()))
                .map_err(|e| format!("复制自定义封面失败: {e}"))?;
        }
    }

    Ok(())
}
