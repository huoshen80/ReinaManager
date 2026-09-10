use super::inspect::inspect_archive_path;
use crate::backup::archive::ZSTD_COMPRESSION_LEVEL;
use sevenz_rust2::{ArchiveEntry, ArchiveWriter, encoder_options::ZstandardOptions};
use std::fs::{self, File, OpenOptions};
use std::path::Path;

pub(in crate::backup::savedata) fn create_savedata_archive(
    source_path: &Path,
    archive_path: &Path,
) -> Result<u64, Box<dyn std::error::Error>> {
    validate_source_tree(source_path)?;
    reject_archive_inside_source(source_path, archive_path)?;
    let root_name = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("存档路径没有有效名称")?
        .to_string();
    if let Some(parent) = archive_path.parent() {
        fs::create_dir_all(parent)?;
    }
    let output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(archive_path)?;
    let result = (|| -> Result<u64, Box<dyn std::error::Error>> {
        let mut writer = ArchiveWriter::new(output)?;
        writer.set_content_methods(vec![
            ZstandardOptions::from_level(ZSTD_COMPRESSION_LEVEL).into(),
        ]);
        if source_path.is_dir() {
            push_directory(&mut writer, source_path, &root_name)
        } else {
            writer
                .push_archive_entry(
                    ArchiveEntry::from_path(source_path, root_name),
                    Some(File::open(source_path)?),
                )
                .map(|_| ())
                .map_err(|error| error.into())
        }?;
        writer.finish()?;
        let info = inspect_archive_path(archive_path)?;
        log::debug!(
            "存档归档预检成功 root={} kind={:?} entries={} bytes={}",
            info.root_name,
            info.root_kind,
            info.entry_count,
            info.total_size
        );
        Ok(fs::metadata(archive_path)?.len())
    })();
    if result.is_err() {
        let _ = fs::remove_file(archive_path);
    }
    result
}

fn push_directory(
    writer: &mut ArchiveWriter<File>,
    source: &Path,
    archive_name: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    writer.push_archive_entry::<&[u8]>(
        ArchiveEntry::from_path(source, archive_name.to_string()),
        None,
    )?;
    let mut children = fs::read_dir(source)?.collect::<Result<Vec<_>, _>>()?;
    children.sort_by_key(|entry| entry.file_name());
    for child in children {
        let child_path = child.path();
        let child_name = child
            .file_name()
            .to_str()
            .ok_or("存档路径包含无效文件名")?
            .to_string();
        let entry_name = format!("{archive_name}/{child_name}");
        let metadata = fs::symlink_metadata(&child_path)?;
        reject_special_metadata(&metadata, &child_path)?;
        if metadata.is_dir() {
            push_directory(writer, &child_path, &entry_name)?;
        } else if metadata.is_file() {
            writer.push_archive_entry(
                ArchiveEntry::from_path(&child_path, entry_name),
                Some(File::open(&child_path)?),
            )?;
        }
    }
    Ok(())
}

fn reject_special_metadata(
    metadata: &fs::Metadata,
    path: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    if metadata.file_type().is_symlink() || (!metadata.is_file() && !metadata.is_dir()) {
        return Err(format!("存档包含符号链接或特殊文件: {}", path.display()).into());
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(format!("存档包含 junction/reparse 文件: {}", path.display()).into());
        }
    }
    Ok(())
}

fn validate_source_tree(source: &Path) -> Result<(), Box<dyn std::error::Error>> {
    let metadata = fs::symlink_metadata(source)?;
    reject_special_metadata(&metadata, source)?;
    if metadata.is_dir() {
        for entry in fs::read_dir(source)? {
            validate_source_tree(&entry?.path())?;
        }
    }
    Ok(())
}

fn reject_archive_inside_source(
    source: &Path,
    archive: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    if !source.is_dir() {
        return Ok(());
    }
    let source = fs::canonicalize(source)?;
    let archive = if archive.exists() {
        fs::canonicalize(archive)?
    } else {
        archive
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .canonicalize()?
            .join(archive.file_name().ok_or("归档路径无文件名")?)
    };
    if archive.starts_with(source) {
        return Err("7z 归档不能位于源存档目录内部".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backup::savedata::archive::SaveEntryKind;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn preserves_file_and_empty_directory_roots() {
        let root = std::env::temp_dir().join(format!(
            "reina_archive_{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).unwrap();
        for (name, kind) in [
            ("save.dat", SaveEntryKind::File),
            ("SaveData", SaveEntryKind::Directory),
        ] {
            let source = root.join(name);
            if kind == SaveEntryKind::File {
                fs::write(&source, b"save").unwrap();
            } else {
                fs::create_dir(&source).unwrap();
            }
            let archive = root.join(format!("{name}.7z"));
            create_savedata_archive(&source, &archive).unwrap();
            let info = inspect_archive_path(&archive).unwrap();
            assert_eq!((info.root_name.as_str(), info.root_kind), (name, kind));
        }
        fs::remove_dir_all(root).unwrap();
    }
}
