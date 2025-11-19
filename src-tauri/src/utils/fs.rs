use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Mutex;
use tauri::{command, AppHandle, Manager};

// ==================== 路径相关常量（重导出） ====================

pub use reina_path::{DB_DATA_DIR, DB_FILE_NAME, DB_BACKUP_SUBDIR, RESOURCE_DIR};

// ==================== 路径基础函数（直接使用 Tauri API） ====================

/// 判断是否处于便携模式
pub fn is_portable_mode(app: &AppHandle) -> bool {
    if let Ok(resource_dir) = app.path().resource_dir() {
        let portable_data_dir = resource_dir.join(RESOURCE_DIR).join(DB_DATA_DIR);
        let portable_db_file = portable_data_dir.join(DB_FILE_NAME);
        portable_data_dir.exists() && portable_db_file.exists()
    } else {
        false
    }
}

/// 获取基础数据目录
pub fn get_base_data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    if is_portable_mode(app) {
        Ok(app.path()
            .resource_dir()
            .map_err(|e| format!("无法获取应用目录: {}", e))?
            .join(RESOURCE_DIR))
    } else {
        app.path()
            .app_data_dir()
            .map_err(|e| format!("无法获取应用数据目录: {}", e))
    }
}

/// 获取数据库文件路径
pub fn get_db_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(get_base_data_dir(app)?.join(DB_DATA_DIR).join(DB_FILE_NAME))
}

/// 获取指定模式的数据库目录
pub fn get_base_data_dir_for_mode(app: &AppHandle, portable: bool) -> Result<PathBuf, String> {
    if portable {
        Ok(app.path()
            .resource_dir()
            .map_err(|e| format!("无法获取应用目录: {}", e))?
            .join(RESOURCE_DIR))
    } else {
        app.path()
            .app_data_dir()
            .map_err(|e| format!("无法获取应用数据目录: {}", e))
    }
}

// ==================== 路径管理器 ====================

/// 路径缓存，用于在应用运行期间复用已计算的路径
#[derive(Debug, Default)]
struct PathCache {
    db_backup_path: Option<PathBuf>,
    savedata_backup_path: Option<PathBuf>,
    le_path: Option<String>,
    magpie_path: Option<String>,
}

/// 全局路径管理器
pub struct PathManager {
    cache: Mutex<PathCache>,
}

impl PathManager {
    pub fn new() -> Self {
        Self {
            cache: Mutex::new(PathCache::default()),
        }
    }

    /// 获取数据库备份路径
    pub async fn get_db_backup_path(
        &self,
        app: &AppHandle,
        db: &DatabaseConnection,
    ) -> Result<PathBuf, String> {
        // 检查缓存
        {
            let cache = self.cache.lock().expect("路径管理器缓存锁已被污染");
            if let Some(path) = &cache.db_backup_path {
                return Ok(path.clone());
            }
        }

        // 从数据库读取配置
        let custom_path = self.get_db_backup_path_from_db(db).await?;

        let path = if let Some(custom) = custom_path {
            // 使用数据库中的自定义路径
            PathBuf::from(custom)
        } else {
            // 使用默认路径（根据便携模式判断）
            self.get_default_db_backup_path(app)?
        };

        // 缓存路径
        {
            let mut cache = self.cache.lock().expect("路径管理器缓存锁已被污染");
            cache.db_backup_path = Some(path.clone());
        }

        Ok(path)
    }

    /// 获取存档备份路径
    pub async fn get_savedata_backup_path(
        &self,
        app: &AppHandle,
        db: &DatabaseConnection,
    ) -> Result<PathBuf, String> {
        // 检查缓存
        {
            let cache = self.cache.lock().expect("路径管理器缓存锁已被污染");
            if let Some(path) = &cache.savedata_backup_path {
                return Ok(path.clone());
            }
        }

        // 从数据库读取配置
        let custom_path = self.get_save_root_path_from_db(db).await?;

        let path = if let Some(custom) = custom_path {
            // 使用数据库中的自定义路径 + /backups
            PathBuf::from(custom).join("backups")
        } else {
            // 使用默认路径（根据便携模式判断）
            get_base_data_dir(app)?.join("backups")
        };

        // 缓存路径
        {
            let mut cache = self.cache.lock().expect("路径管理器缓存锁已被污染");
            cache.savedata_backup_path = Some(path.clone());
        }

        Ok(path)
    }

    /// 预加载所有配置路径到缓存
    /// 【修改】新增 app 参数，用于在配置为空时计算默认路径
    pub async fn preload_config_paths(
        &self,
        app: &AppHandle, // <--- 新增参数
        db: &DatabaseConnection,
    ) -> Result<(), String> {
        use crate::database::repository::settings_repository::SettingsRepository;

        let settings = SettingsRepository::get_all_settings(db)
            .await
            .map_err(|e| format!("获取设置失败: {}", e))?;

        // ------------------ 临时修复逻辑开始 ------------------

        // 辅助闭包：清洗数据，将 None 和 "" 统一视为 None
        let clean_str = |s: Option<String>| s.filter(|x| !x.trim().is_empty());

        // 1. 处理 LE 和 Magpie (保持原样或存为空字符串)
        // 注意：由于你的 get_le_path 实现中 None 代表"未加载"，
        // 所以这里即使没值也必须存一个 Some("")，否则会报错"未加载"。
        // 这一步维持现状，前端负责判断空字符串。
        let le_path = settings.le_path.unwrap_or_default();
        let magpie_path = settings.magpie_path.unwrap_or_default();

        // 2. 处理 DB 备份路径 (系统关键路径，必须有值)
        // 如果数据库没值(或为空)，直接计算出默认路径存入缓存
        let db_backup_path = match clean_str(settings.db_backup_path) {
            Some(custom) => PathBuf::from(custom),
            None => self.get_default_db_backup_path(app)?, // <--- 这里的逻辑现在和 get_db_backup_path 一致了
        };

        // 3. 处理存档根目录 (系统关键路径，必须有值)
        let savedata_backup_path = match clean_str(settings.save_root_path) {
            Some(custom) => PathBuf::from(custom).join("backups"),
            None => get_base_data_dir(app)?.join("backups"), // <--- 对齐默认逻辑
        };

        // ------------------ 临时修复逻辑结束 ------------------

        // 缓存所有路径
        {
            let mut cache = self.cache.lock().expect("路径管理器缓存锁已被污染");
            cache.le_path = Some(le_path);
            cache.magpie_path = Some(magpie_path);
            cache.db_backup_path = Some(db_backup_path); 
            cache.savedata_backup_path = Some(savedata_backup_path);
        }

        log::info!("路径配置预加载完成（已处理默认回退逻辑）");
        Ok(())
    }

    /// 同步获取LE路径（需要先调用preload_config_paths）
    #[cfg(target_os = "windows")]
    pub fn get_le_path(&self) -> Result<String, String> {
        let cache = self.cache.lock().expect("路径管理器缓存锁已被污染");
        match &cache.le_path {
            Some(path) => Ok(path.clone()),
            None => Err("LE路径未加载，请先调用preload_config_paths".to_string()),
        }
    }

    /// 同步获取Magpie路径（需要先调用preload_config_paths）
    #[cfg(target_os = "windows")]
    pub fn get_magpie_path(&self) -> Result<String, String> {
        let cache = self.cache.lock().expect("路径管理器缓存锁已被污染");
        match &cache.magpie_path {
            Some(path) => Ok(path.clone()),
            None => Err("Magpie路径未加载，请先调用preload_config_paths".to_string()),
        }
    }
    /// 清空路径缓存（用于用户修改配置后）
    pub fn clear_cache(&self) {
        let mut cache = self.cache.lock().expect("路径管理器缓存锁已被污染");
        *cache = PathCache::default();
    }

    // ==================== 私有辅助方法 ====================

    /// 从数据库读取数据库备份路径配置
    async fn get_db_backup_path_from_db(
        &self,
        db: &DatabaseConnection,
    ) -> Result<Option<String>, String> {
        use crate::entity::prelude::*;
        use sea_orm::EntityTrait;

        let user = User::find()
            .one(db)
            .await
            .map_err(|e| format!("查询用户配置失败: {}", e))?;

        Ok(user
            .and_then(|u| u.db_backup_path)
            .filter(|s| !s.trim().is_empty()))
    }

    /// 从数据库读取存档根路径配置
    async fn get_save_root_path_from_db(
        &self,
        db: &DatabaseConnection,
    ) -> Result<Option<String>, String> {
        use crate::entity::prelude::*;
        use sea_orm::EntityTrait;

        let user = User::find()
            .one(db)
            .await
            .map_err(|e| format!("查询用户配置失败: {}", e))?;

        Ok(user
            .and_then(|u| u.save_root_path)
            .filter(|s| !s.trim().is_empty()))
    }

    /// 获取默认的数据库备份路径
    fn get_default_db_backup_path(&self, app: &AppHandle) -> Result<PathBuf, String> {
        Ok(get_base_data_dir(app)?
            .join(DB_DATA_DIR)
            .join(DB_BACKUP_SUBDIR))
    }
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
    #[cfg(target_os = "linux")]
    {
        let result = Command::new("xdg-open").arg(&dir_path).spawn();

        match result {
            Ok(_) => Ok(()),
            Err(e) => Err(format!("无法打开目录 '{}': {}", dir_path, e)),
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
                    copied_count,
                    error_summary
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

    if let Some(parent) = dst_path.parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("无法创建目标目录的父目录: {}", e))?;
        }
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

/// 删除指定游戏的所有自定义封面文件
#[command]
pub async fn delete_game_covers(game_id: u32, covers_dir: String) -> Result<(), String> {
    let dir_path = Path::new(&covers_dir);

    if !dir_path.exists() {
        return Ok(()); // 目录不存在，视为成功
    }

    // 读取目录中的所有文件
    let entries = fs::read_dir(dir_path).map_err(|e| format!("无法读取封面目录: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("读取目录项失败: {}", e))?;
        let file_name = entry.file_name();
        let file_name_str = file_name.to_string_lossy();

        // 匹配该游戏的封面文件模式：cover_{game_id}_*
        if file_name_str.starts_with(&format!("cover_{}_", game_id)) {
            let file_path = entry.path();
            if let Err(e) = fs::remove_file(&file_path) {
                eprintln!("删除文件失败 {:?}: {}", file_path, e);
                // 继续删除其他文件，不中断流程
            }
        }
    }

    Ok(())
}
