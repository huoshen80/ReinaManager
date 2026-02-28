use std::path::PathBuf;

/// 数据库相关路径常量
pub const DB_DATA_DIR: &str = "data";
pub const DB_FILE_NAME: &str = "reina_manager.db";
pub const DB_BACKUP_SUBDIR: &str = "backups";
pub const RESOURCE_DIR: &str = "resources";

/// 判断是否处于便携模式（纯 Rust 版本）
///
/// 检测逻辑：检查可执行文件同级目录下是否存在 resources/data/reina_manager.db
pub fn is_portable_mode() -> bool {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let portable_data_dir = exe_dir.join(RESOURCE_DIR).join(DB_DATA_DIR);
            let portable_db_file = portable_data_dir.join(DB_FILE_NAME);
            return portable_data_dir.exists() && portable_db_file.exists();
        }
    }
    false
}

/// 获取基础数据目录（纯 Rust 版本）
pub fn get_base_data_dir() -> Result<PathBuf, String> {
    if is_portable_mode() {
        // 便携模式：使用可执行文件所在目录的 resources 子目录
        let exe_path =
            std::env::current_exe().map_err(|e| format!("无法获取可执行文件路径: {}", e))?;
        let exe_dir = exe_path
            .parent()
            .ok_or_else(|| "无法获取可执行文件父目录".to_string())?;
        Ok(exe_dir.join(RESOURCE_DIR))
    } else {
        // 标准模式：使用系统应用数据目录
        get_system_data_dir()
    }
}

/// 获取系统数据目录（跨平台）
fn get_system_data_dir() -> Result<PathBuf, String> {
    use directories::BaseDirs;

    let base_dirs = BaseDirs::new().ok_or_else(|| "无法获取系统目录信息".to_string())?;

    #[cfg(target_os = "windows")]
    {
        Ok(base_dirs.data_dir().join("com.reinamanager.dev"))
    }

    #[cfg(target_os = "macos")]
    {
        Ok(base_dirs.data_dir().join("com.reinamanager.dev"))
    }

    #[cfg(target_os = "linux")]
    {
        Ok(base_dirs.data_dir().join("reina-manager"))
    }
}

/// 获取数据库文件路径
pub fn get_db_path() -> Result<PathBuf, String> {
    Ok(get_base_data_dir()?.join(DB_DATA_DIR).join(DB_FILE_NAME))
}

/// 获取指定模式的数据库目录
pub fn get_base_data_dir_for_mode(portable: bool) -> Result<PathBuf, String> {
    if portable {
        let exe_path =
            std::env::current_exe().map_err(|e| format!("无法获取可执行文件路径: {}", e))?;
        let exe_dir = exe_path
            .parent()
            .ok_or_else(|| "无法获取可执行文件父目录".to_string())?;
        Ok(exe_dir.join(RESOURCE_DIR))
    } else {
        get_system_data_dir()
    }
}

/// 获取默认的数据库备份路径
pub fn get_default_db_backup_path() -> Result<PathBuf, String> {
    Ok(get_base_data_dir()?
        .join(DB_DATA_DIR)
        .join(DB_BACKUP_SUBDIR))
}

/// 获取默认的存档备份路径
pub fn get_default_savedata_backup_path() -> Result<PathBuf, String> {
    Ok(get_base_data_dir()?.join("backups"))
}
