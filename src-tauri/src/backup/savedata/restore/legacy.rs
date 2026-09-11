use super::common::{
    RestorePlan, RestoreSavedataResult, commit_restored_payload, create_restore_temp_dir,
    ensure_safe_existing_ancestors, ensure_safe_existing_object, extract_archive,
    validate_extracted_tree,
};
use super::service::remove_staging;
use crate::backup::savedata::archive::{SaveEntryKind, inspect_legacy_archive};
use sevenz_rust2::ArchiveReader;
use std::fs;
use std::io::{Read, Seek};
use std::path::Path;

pub(super) fn restore<R: Read + Seek>(
    reader: &mut ArchiveReader<R>,
    target_path: &Path,
) -> Result<RestoreSavedataResult, String> {
    let info =
        inspect_legacy_archive(reader).map_err(|error| format!("旧版备份预检失败: {error}"))?;
    let target_kind = match fs::symlink_metadata(target_path) {
        Ok(_) => Some(ensure_safe_existing_object(target_path)?),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(format!("读取当前存档路径失败: {error}")),
    };
    if target_kind.is_some_and(|kind| kind != SaveEntryKind::Directory) {
        return Err("旧版备份一定是目录备份，当前存档路径不是目录，拒绝恢复".to_string());
    }
    let parent = target_path.parent().ok_or("恢复目标没有父目录")?;
    ensure_safe_existing_ancestors(parent)?;
    fs::create_dir_all(parent).map_err(|error| format!("创建恢复目录失败: {error}"))?;
    ensure_safe_existing_ancestors(parent)?;

    // V1 的临时目录本身代表当前 save_path 的完整新内容。
    let staging = create_restore_temp_dir(parent)?;
    if let Err(error) = extract_archive(reader, &staging) {
        remove_staging(&staging);
        return Err(format!("解压旧版备份失败: {error}"));
    }
    if let Err(error) = validate_extracted_tree(&staging) {
        remove_staging(&staging);
        return Err(format!("旧版备份解压内容校验失败: {error}"));
    }
    let plan = RestorePlan {
        final_path: target_path.to_path_buf(),
        replace_existing: target_kind.is_some(),
        restored_to_alternate: false,
    };
    let committed = commit_restored_payload(
        &staging,
        &plan,
        SaveEntryKind::Directory,
        |source, target| fs::rename(source, target),
    );
    if committed.is_err() {
        remove_staging(&staging);
    }
    let cleanup_warning = committed?;
    log::info!(
        "旧版目录备份恢复成功 target={} entries={} bytes={}",
        target_path.display(),
        info.entry_count,
        info.total_size
    );
    Ok(RestoreSavedataResult {
        restored_path: target_path.to_string_lossy().into_owned(),
        replaced_existing: plan.replace_existing,
        restored_to_alternate: false,
        cleanup_warning,
    })
}

#[cfg(test)]
mod tests {
    use super::super::service::restore_for_test;
    use crate::backup::archive::create_7z_archive;
    use sevenz_rust2::{ArchiveEntry, ArchiveWriter};
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "reina_legacy_{name}_{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    fn archive(root: &Path, files: &[(&str, &[u8])]) -> PathBuf {
        let source = root.join("source");
        fs::create_dir_all(&source).unwrap();
        for (name, content) in files {
            let path = source.join(name);
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(path, content).unwrap();
        }
        let archive = root.join("savedata_legacy.7z");
        create_7z_archive(&source, &archive).unwrap();
        archive
    }

    #[test]
    fn restores_single_multiple_and_empty_contents_as_directories() {
        for (name, files, top_level_count) in [
            ("single", vec![("save.dat", &b"save"[..])], 1),
            (
                "multiple",
                vec![
                    ("save.dat", &b"save"[..]),
                    ("system/settings.dat", &b"settings"[..]),
                ],
                2,
            ),
            ("empty", vec![], 0),
        ] {
            let root = root(name);
            fs::create_dir_all(&root).unwrap();
            let archive = archive(&root, &files);
            let target = root.join("game/SaveData");
            let result = restore_for_test(&archive, &target).unwrap();
            assert!(target.is_dir());
            assert!(!result.replaced_existing);
            assert_eq!(fs::read_dir(&target).unwrap().count(), top_level_count);
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn rejects_file_target_without_touching_it() {
        let root = root("file_target");
        fs::create_dir_all(&root).unwrap();
        let archive = archive(&root, &[("save.dat", b"legacy")]);
        let target = root.join("game/save.dat");
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(&target, b"current").unwrap();
        assert!(restore_for_test(&archive, &target).is_err());
        assert_eq!(fs::read(target).unwrap(), b"current");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn unsafe_archive_does_not_touch_existing_target() {
        let root = root("unsafe");
        fs::create_dir_all(&root).unwrap();
        let archive = root.join("savedata_legacy.7z");
        let mut writer = ArchiveWriter::create(&archive).unwrap();
        writer
            .push_archive_entry(ArchiveEntry::new_file("../escape"), Some(&b"x"[..]))
            .unwrap();
        writer.finish().unwrap();
        let target = root.join("game/SaveData");
        fs::create_dir_all(&target).unwrap();
        fs::write(target.join("current"), b"keep").unwrap();
        assert!(restore_for_test(&archive, &target).is_err());
        assert_eq!(fs::read(target.join("current")).unwrap(), b"keep");
        assert!(!root.join("escape").exists());
        fs::remove_dir_all(root).unwrap();
    }
}
