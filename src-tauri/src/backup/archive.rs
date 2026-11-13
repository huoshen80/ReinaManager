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

/// 普通备份只检查归档头部；迁移保护备份还需完整读取内容。
pub fn verify_7z_archive(
    archive_path: &Path,
    verify_contents: bool,
) -> Result<(), Box<dyn std::error::Error>> {
    let mut reader = ArchiveReader::open(archive_path, Password::empty())?;
    if !verify_contents {
        return Ok(());
    }
    reader.for_each_entries(|entry, input| {
        if !entry.is_directory() {
            std::io::copy(input, &mut std::io::sink())?;
        }
        Ok(true)
    })?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn full_verification_detects_payload_damage_beyond_readable_headers() {
        let root =
            std::env::temp_dir().join(format!("reina-archive-check-{}", uuid::Uuid::now_v7()));
        let source = root.join("source");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("data"), vec![42; 4096]).unwrap();
        let archive = root.join("backup.7z");
        create_7z_archive(&source, &archive).unwrap();
        verify_7z_archive(&archive, false).unwrap();
        verify_7z_archive(&archive, true).unwrap();
        let mut bytes = fs::read(&archive).unwrap();
        // 7z 固定起始头之后是压缩数据；只破坏载荷，保留归档元数据。
        bytes[32] ^= 0xff;
        fs::write(&archive, bytes).unwrap();
        verify_7z_archive(&archive, false).unwrap();
        assert!(verify_7z_archive(&archive, true).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
