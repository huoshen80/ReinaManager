use std::path::PathBuf;

/// 数据库相关路径常量
pub const DB_DATA_DIR: &str = "data";
pub const DB_FILE_NAME: &str = "reina_manager.db";

// 基础数据目录下的子目录名称
pub const BACKUP_SUBDIR: &str = "backups";
pub const RESOURCE_DIR: &str = "resources";

/// 判断是否处于便携模式（纯 Rust 版本）
///
/// 检测逻辑：检查可执行文件同级目录下是否存在 resources/data 目录。
pub fn is_portable_mode() -> bool {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let portable_data_dir = exe_dir.join(RESOURCE_DIR).join(DB_DATA_DIR);
            return portable_data_dir.is_dir();
        }
    }
    false
}

/// 获取基础数据根目录。
///
/// 该目录是应用非数据库资源的统一根目录：
/// - 便携模式: `<exe>/resources`
/// - 安装模式: `<system-data>/<identifier>`
///
/// 数据库属于该根目录下的专用子目录 `<base>/data`，不要把本函数当作数据库目录使用。
pub fn get_base_data_dir() -> Result<PathBuf, String> {
    if is_portable_mode() {
        get_base_data_dir_for_mode(true)
    } else {
        let system_dir = get_base_data_dir_for_mode(false)?;
        std::fs::create_dir_all(&system_dir)
            .map_err(|e| format!("无法创建系统数据目录 {}: {}", system_dir.display(), e))?;
        Ok(system_dir)
    }
}

/// 获取指定模式下的基础数据根目录。
///
/// 返回值语义与 `get_base_data_dir` 一致：
/// - 便携模式: `<exe>/resources`
/// - 安装模式: `<system-data>/<identifier>`
pub fn get_base_data_dir_for_mode(portable: bool) -> Result<PathBuf, String> {
    if portable {
        let exe_path =
            std::env::current_exe().map_err(|e| format!("无法获取可执行文件路径: {}", e))?;
        let exe_dir = exe_path
            .parent()
            .ok_or_else(|| "无法获取可执行文件父目录".to_string())?;
        Ok(exe_dir.join(RESOURCE_DIR))
    } else {
        use directories::BaseDirs;

        let identifier = "com.reinamanager.dev";

        let base_dirs = BaseDirs::new().ok_or_else(|| "无法获取系统目录信息".to_string())?;

        Ok(base_dirs.data_dir().join(identifier))
    }
}

/// 获取数据库专用目录 `<base>/data`。
pub fn get_db_data_dir() -> Result<PathBuf, String> {
    Ok(get_base_data_dir()?.join(DB_DATA_DIR))
}

/// 获取指定模式下的数据库专用目录 `<base>/data`。
pub fn get_db_data_dir_for_mode(portable: bool) -> Result<PathBuf, String> {
    Ok(get_base_data_dir_for_mode(portable)?.join(DB_DATA_DIR))
}

/// 获取数据库文件路径 `<base>/data/reina_manager.db`。
pub fn get_db_path() -> Result<PathBuf, String> {
    Ok(get_db_data_dir()?.join(DB_FILE_NAME))
}

/// 获取默认的数据库备份路径
pub fn get_default_db_backup_path() -> Result<PathBuf, String> {
    Ok(get_db_data_dir()?.join(BACKUP_SUBDIR))
}

/// 获取默认的存档备份路径
pub fn get_default_savedata_backup_path() -> Result<PathBuf, String> {
    Ok(get_base_data_dir()?.join(BACKUP_SUBDIR))
}
