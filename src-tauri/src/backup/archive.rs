//! 7z 压缩/解压工具模块
//!
//! 提供基于 Zstd 的 7z 压缩与解压功能，供存档备份、自定义封面备份等多处复用。

use sevenz_rust2::{ArchiveWriter, decompress_file, encoder_options::ZstandardOptions};
use std::fs;
use std::path::Path;

/// 速度与压缩率折中：使用 Zstd 低压缩等级。
const ZSTD_COMPRESSION_LEVEL: u32 = 3;

/// 创建 7z 压缩包（递归压缩整个目录）
///
/// # Arguments
/// * `source_dir` - 源目录路径
/// * `archive_path` - 目标压缩包路径
///
/// # Returns
/// * `Result<u64, Box<dyn std::error::Error>>` - 压缩包文件大小或错误
pub fn create_7z_archive(
    source_dir: &Path,
    archive_path: &Path,
) -> Result<u64, Box<dyn std::error::Error>> {
    let mut writer = ArchiveWriter::create(archive_path)?;

    let zstd_options = ZstandardOptions::from_level(ZSTD_COMPRESSION_LEVEL);
    log::info!("7z 压缩参数: codec=ZSTD, level={}", ZSTD_COMPRESSION_LEVEL);
    writer.set_content_methods(vec![zstd_options.into()]);

    // 递归添加源目录中的所有文件，过滤器返回 true 表示包含
    writer.push_source_path(source_dir, |_| true)?;

    writer.finish()?;

    let metadata = fs::metadata(archive_path)?;
    Ok(metadata.len())
}

/// 解压 7z 压缩包（覆盖模式）
///
/// 解压前会先清空目标目录的所有内容，确保恢复结果完整干净。
///
/// # Arguments
/// * `archive_path` - 压缩包路径
/// * `target_dir` - 目标解压目录
///
/// # Returns
/// * `Result<(), Box<dyn std::error::Error>>` - 成功或错误
pub fn extract_7z_archive(
    archive_path: &Path,
    target_dir: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    // 如果目标目录存在，先清空内容以实现覆盖
    if target_dir.exists() {
        for entry in fs::read_dir(target_dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.is_dir() {
                fs::remove_dir_all(&path)?;
            } else {
                fs::remove_file(&path)?;
            }
        }
    } else {
        fs::create_dir_all(target_dir)?;
    }

    decompress_file(archive_path, target_dir)?;
    Ok(())
}
