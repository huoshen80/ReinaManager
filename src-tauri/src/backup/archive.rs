//! 通用 7z 压缩能力。

use sevenz_rust2::{ArchiveReader, ArchiveWriter, Password, encoder_options::ZstandardOptions};
use std::fs;
use std::path::Path;

/// 速度与压缩率折中：使用 Zstd 低压缩等级。
pub(crate) const ZSTD_COMPRESSION_LEVEL: u32 = 3;

/// 递归压缩目录内容，保留自定义封面等现有归档结构。
pub fn create_7z_archive(
    source_dir: &Path,
    archive_path: &Path,
) -> Result<u64, Box<dyn std::error::Error>> {
    let mut writer = ArchiveWriter::create(archive_path)?;
    writer.set_content_methods(vec![
        ZstandardOptions::from_level(ZSTD_COMPRESSION_LEVEL).into(),
    ]);
    writer.push_source_path(source_dir, |_| true)?;
    writer.finish()?;
    Ok(fs::metadata(archive_path)?.len())
}

/// 重新打开归档并读取头部，避免发布无法被解析的正式备份文件。
pub fn verify_7z_archive(archive_path: &Path) -> Result<(), Box<dyn std::error::Error>> {
    ArchiveReader::open(archive_path, Password::empty())?;
    Ok(())
}
