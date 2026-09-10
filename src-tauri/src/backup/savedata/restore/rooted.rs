use super::common::{
    RestorePlan, RestoreSavedataResult, commit_restored_payload, create_restore_temp_dir,
    ensure_safe_existing_ancestors, ensure_safe_existing_object, extract_archive,
    validate_extracted_tree,
};
use super::service::remove_staging;
use crate::backup::savedata::archive::{ArchiveSaveInfo, inspect_rooted_archive};
use sevenz_rust2::ArchiveReader;
use std::fs;
use std::io::{Read, Seek};
use std::path::Path;

pub(super) fn restore<R: Read + Seek>(
    reader: &mut ArchiveReader<R>,
    target_path: &Path,
) -> Result<RestoreSavedataResult, String> {
    let info = inspect_rooted_archive(reader).map_err(|error| format!("备份预检失败: {error}"))?;
    let plan = plan_restore(&info, target_path)?;
    let parent = plan.final_path.parent().ok_or("恢复目标没有父目录")?;
    ensure_safe_existing_ancestors(parent)?;
    fs::create_dir_all(parent).map_err(|error| format!("创建恢复目录失败: {error}"))?;
    ensure_safe_existing_ancestors(parent)?;

    let staging = create_restore_temp_dir(parent)?;
    let payload = staging.join(&info.root_name);
    if let Err(error) = extract_archive(reader, &staging) {
        remove_staging(&staging);
        return Err(format!("解压备份失败: {error}"));
    }
    if let Err(error) = validate_payload(&payload, &info) {
        remove_staging(&staging);
        return Err(format!("解压内容校验失败: {error}"));
    }

    let committed = commit_restored_payload(&payload, &plan, info.root_kind, |source, target| {
        fs::rename(source, target)
    });
    let mut cleanup_warning = committed?;
    if let Err(error) = fs::remove_dir_all(&staging)
        && error.kind() != std::io::ErrorKind::NotFound
    {
        let warning = format!(
            "恢复成功，但清理临时目录 {} 失败: {error}",
            staging.display()
        );
        cleanup_warning = Some(match cleanup_warning {
            Some(previous) => format!("{previous}；{warning}"),
            None => warning,
        });
    }
    log::info!("V2 存档备份恢复成功 target={}", plan.final_path.display());
    Ok(RestoreSavedataResult {
        restored_path: plan.final_path.to_string_lossy().into_owned(),
        replaced_existing: plan.replace_existing,
        cleanup_warning,
    })
}

fn plan_restore(info: &ArchiveSaveInfo, target: &Path) -> Result<RestorePlan, String> {
    let target_name = target
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "当前存档路径没有有效名称".to_string())?;
    let target_kind = match fs::symlink_metadata(target) {
        Ok(_) => Some(ensure_safe_existing_object(target)?),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => None,
        Err(error) => return Err(format!("读取当前存档路径失败: {error}")),
    };
    if target_kind.is_some_and(|kind| kind != info.root_kind) {
        return Err("当前存档与备份类型不一致，拒绝恢复".to_string());
    }
    let parent = target.parent().ok_or("当前存档路径没有父目录")?;
    if target_name == info.root_name {
        return Ok(RestorePlan {
            final_path: target.to_path_buf(),
            replace_existing: target_kind.is_some(),
        });
    }
    let alternate = parent.join(&info.root_name);
    match fs::symlink_metadata(&alternate) {
        Ok(_) => Err(format!(
            "备份原名目标已存在，拒绝覆盖未知存档: {}",
            alternate.display()
        )),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(RestorePlan {
            final_path: alternate,
            replace_existing: false,
        }),
        Err(error) => Err(format!("检查备份原名目标失败: {error}")),
    }
}

fn validate_payload(path: &Path, info: &ArchiveSaveInfo) -> Result<(), String> {
    let staging = path.parent().ok_or("解压临时目录没有父路径")?;
    let children = fs::read_dir(staging)
        .map_err(|error| format!("读取解压临时目录失败: {error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("读取解压临时目录条目失败: {error}"))?;
    if children.len() != 1 || children[0].file_name().to_string_lossy() != info.root_name {
        return Err("解压临时目录没有且仅有预期顶层对象".to_string());
    }
    if ensure_safe_existing_object(path)? != info.root_kind {
        return Err("解压后的顶层对象类型不一致".to_string());
    }
    validate_extracted_tree(path)
}

#[cfg(test)]
mod tests {
    use super::super::service::restore_for_test;
    use crate::backup::savedata::archive::create_savedata_archive;
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn root(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "reina_rooted_{name}_{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ))
    }

    #[test]
    fn same_name_replaces_files_and_directories_without_merging() {
        for directory in [false, true] {
            let root = root(if directory { "dir" } else { "file" });
            let source = root.join("source/save");
            let target = root.join("game/save");
            let archive = root.join("savedata_v2_replace.7z");
            fs::create_dir_all(source.parent().unwrap()).unwrap();
            fs::create_dir_all(target.parent().unwrap()).unwrap();
            if directory {
                fs::create_dir(&source).unwrap();
                fs::create_dir(&target).unwrap();
                fs::write(source.join("slot"), b"new").unwrap();
                fs::write(target.join("slot"), b"old").unwrap();
                fs::write(target.join("stale"), b"stale").unwrap();
            } else {
                fs::write(&source, b"new").unwrap();
                fs::write(&target, b"old").unwrap();
            }
            create_savedata_archive(&source, &archive).unwrap();
            let result = restore_for_test(&archive, &target).unwrap();
            assert!(result.replaced_existing);
            let restored = if directory {
                target.join("slot")
            } else {
                target
            };
            assert_eq!(fs::read(restored).unwrap(), b"new");
            if directory {
                assert!(!root.join("game/save/stale").exists());
            }
            fs::remove_dir_all(root).unwrap();
        }
    }

    #[test]
    fn name_and_type_rules_prevent_unknown_overwrites() {
        let root = root("rules");
        let source = root.join("source/SaveData");
        let target = root.join("game/UserData");
        let archive = root.join("savedata_v2_rules.7z");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(source.join("slot"), b"new").unwrap();
        fs::write(target.join("slot"), b"keep").unwrap();
        create_savedata_archive(&source, &archive).unwrap();
        let result = restore_for_test(&archive, &target).unwrap();
        assert_eq!(fs::read(target.join("slot")).unwrap(), b"keep");
        assert_eq!(fs::read(root.join("game/SaveData/slot")).unwrap(), b"new");
        assert!(!result.replaced_existing);

        fs::remove_dir_all(root.join("game/SaveData")).unwrap();
        fs::write(root.join("game/SaveData"), b"unknown").unwrap();
        assert!(restore_for_test(&archive, &target).is_err());
        fs::remove_file(root.join("game/SaveData")).unwrap();
        fs::remove_dir_all(&target).unwrap();
        fs::write(&target, b"wrong type").unwrap();
        assert!(restore_for_test(&archive, &target).is_err());
        assert_eq!(fs::read(&target).unwrap(), b"wrong type");
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn damaged_payload_does_not_touch_existing_target() {
        let root = root("damaged");
        fs::create_dir_all(&root).unwrap();
        let source = root.join("source/save.dat");
        let target = root.join("game/save.dat");
        let archive = root.join("savedata_v2_damaged.7z");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::create_dir_all(target.parent().unwrap()).unwrap();
        fs::write(&source, b"backup payload for CRC verification").unwrap();
        fs::write(&target, b"keep").unwrap();
        create_savedata_archive(&source, &archive).unwrap();
        let mut bytes = fs::read(&archive).unwrap();
        bytes[32] ^= 0xff;
        fs::write(&archive, bytes).unwrap();
        assert!(restore_for_test(&archive, &target).is_err());
        assert_eq!(fs::read(&target).unwrap(), b"keep");
        fs::remove_dir_all(root).unwrap();
    }
}
