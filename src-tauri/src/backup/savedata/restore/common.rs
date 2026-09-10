use super::super::archive::SaveEntryKind;
use serde::Serialize;
use sevenz_rust2::ArchiveReader;
use std::fs;
use std::io::{Read, Seek, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Serialize)]
pub struct RestoreSavedataResult {
    pub restored_path: String,
    pub replaced_existing: bool,
    pub cleanup_warning: Option<String>,
}

pub(super) struct RestorePlan {
    pub final_path: PathBuf,
    pub replace_existing: bool,
}

pub(super) fn commit_restored_payload(
    payload: &Path,
    plan: &RestorePlan,
    kind: SaveEntryKind,
    mut rename: impl FnMut(&Path, &Path) -> std::io::Result<()>,
) -> Result<Option<String>, String> {
    let parent = plan.final_path.parent().ok_or("恢复目标没有父目录")?;
    ensure_safe_existing_ancestors(parent)?;
    let final_exists = match fs::symlink_metadata(&plan.final_path) {
        Ok(_) => true,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => false,
        Err(error) => return Err(format!("检查恢复目标失败: {error}")),
    };
    if final_exists {
        if !plan.replace_existing {
            return Err(format!(
                "恢复目标已存在，拒绝覆盖: {}",
                plan.final_path.display()
            ));
        }
        if ensure_safe_existing_object(&plan.final_path)? != kind {
            return Err("恢复目标类型在解压期间发生变化，拒绝替换".to_string());
        }
    }
    let old_path = if plan.replace_existing {
        Some(create_restore_sibling_path(parent, ".reina_old")?)
    } else {
        None
    };
    if let Some(old) = &old_path {
        rename(&plan.final_path, old).map_err(|error| format!("暂存原存档失败: {error}"))?;
    }
    if let Err(error) = rename(payload, &plan.final_path) {
        let rollback = old_path.as_ref().map(|old| rename(old, &plan.final_path));
        return match rollback {
            Some(Ok(())) => Err(format!("安装恢复内容失败，已回滚原存档: {error}")),
            Some(Err(rollback_error)) => Err(format!(
                "安装恢复内容失败且回滚失败；原存档保留在 {}（恢复错误: {}; 回滚错误: {}）",
                old_path.as_ref().unwrap().display(),
                error,
                rollback_error
            )),
            None => Err(format!("安装恢复内容失败: {error}")),
        };
    }
    Ok(old_path.and_then(|old| {
        remove_savedata_object(&old)
            .err()
            .map(|error| format!("恢复成功，但清理旧存档 {} 失败: {error}", old.display()))
    }))
}

pub(super) fn ensure_safe_existing_object(path: &Path) -> Result<SaveEntryKind, String> {
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format!("读取存档路径失败 {}: {error}", path.display()))?;
    if metadata.file_type().is_symlink() {
        return Err(format!("存档路径不能是符号链接: {}", path.display()));
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(format!(
                "存档路径不能是 junction/reparse 对象: {}",
                path.display()
            ));
        }
    }
    if metadata.is_dir() {
        Ok(SaveEntryKind::Directory)
    } else if metadata.is_file() {
        Ok(SaveEntryKind::File)
    } else {
        Err(format!("存档路径必须是普通文件或目录: {}", path.display()))
    }
}

pub(super) fn ensure_safe_existing_ancestors(path: &Path) -> Result<(), String> {
    let mut current = Some(path);
    while let Some(candidate) = current {
        match fs::symlink_metadata(candidate) {
            Ok(_) => {
                if ensure_safe_existing_object(candidate)? != SaveEntryKind::Directory
                    && candidate.parent().is_some()
                {
                    return Err(format!("恢复父路径不是目录: {}", candidate.display()));
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => {
                return Err(format!("检查恢复路径失败 {}: {error}", candidate.display()));
            }
        }
        current = candidate.parent();
    }
    Ok(())
}

fn remove_savedata_object(path: &Path) -> Result<(), std::io::Error> {
    if fs::symlink_metadata(path)?.is_dir() {
        fs::remove_dir_all(path)
    } else {
        fs::remove_file(path)
    }
}

pub(super) fn create_restore_temp_dir(parent: &Path) -> Result<PathBuf, String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("获取临时目录时间失败: {error}"))?
        .as_nanos();
    for index in 0..100u32 {
        let candidate = parent.join(format!(".reina_restore_{stamp}_{index}"));
        match fs::create_dir(&candidate) {
            Ok(()) => return Ok(candidate),
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("创建恢复临时目录失败: {error}")),
        }
    }
    Err("无法创建唯一恢复临时目录".to_string())
}

fn create_restore_sibling_path(parent: &Path, prefix: &str) -> Result<PathBuf, String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("获取暂存路径时间失败: {error}"))?
        .as_nanos();
    for index in 0..100u32 {
        let candidate = parent.join(format!("{prefix}_{stamp}_{index}"));
        match fs::symlink_metadata(&candidate) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(candidate),
            Err(error) => {
                return Err(format!("检查暂存路径失败 {}: {error}", candidate.display()));
            }
            Ok(_) => {}
        }
    }
    Err("无法创建唯一原存档暂存路径".to_string())
}

pub(super) fn extract_archive<R: Read + Seek>(
    reader: &mut ArchiveReader<R>,
    output_dir: &Path,
) -> Result<(), sevenz_rust2::Error> {
    reader.for_each_entries(|entry, input| {
        let output = output_dir.join(entry.name.replace('\\', "/"));
        if entry.is_directory {
            fs::create_dir_all(&output).map_err(sevenz_rust2::Error::from)?;
            return Ok(true);
        }
        if let Some(parent) = output.parent() {
            fs::create_dir_all(parent).map_err(sevenz_rust2::Error::from)?;
        }
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&output)
            .map_err(sevenz_rust2::Error::from)?;
        let copied = std::io::copy(input, &mut file).map_err(sevenz_rust2::Error::from)?;
        if copied != entry.size {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "解压文件大小与归档声明不符",
            )
            .into());
        }
        file.flush().map_err(sevenz_rust2::Error::from)?;
        file.sync_all().map_err(sevenz_rust2::Error::from)?;
        Ok(true)
    })
}

pub(super) fn validate_extracted_tree(path: &Path) -> Result<(), String> {
    let metadata =
        fs::symlink_metadata(path).map_err(|error| format!("读取解压内容失败: {error}"))?;
    if metadata.file_type().is_symlink() {
        return Err(format!("解压内容包含符号链接: {}", path.display()));
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x400 != 0 {
            return Err(format!(
                "解压内容包含 junction/reparse 对象: {}",
                path.display()
            ));
        }
    }
    if metadata.is_dir() {
        for entry in fs::read_dir(path).map_err(|error| format!("读取解压目录失败: {error}"))?
        {
            validate_extracted_tree(
                &entry
                    .map_err(|error| format!("读取解压条目失败: {error}"))?
                    .path(),
            )?;
        }
    } else if !metadata.is_file() {
        return Err(format!("解压内容包含特殊对象: {}", path.display()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn failed_install_rolls_back_and_reports_preserved_old_object() {
        for rollback_fails in [false, true] {
            let root = std::env::temp_dir().join(format!(
                "reina_rollback_{}_{}",
                rollback_fails,
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_nanos()
            ));
            fs::create_dir_all(&root).unwrap();
            let target = root.join("save");
            let payload = root.join("payload");
            fs::write(&target, b"old").unwrap();
            fs::write(&payload, b"new").unwrap();
            let plan = RestorePlan {
                final_path: target.clone(),
                replace_existing: true,
            };
            let mut calls = 0;
            let mut old = PathBuf::new();
            let error =
                commit_restored_payload(&payload, &plan, SaveEntryKind::File, |from, to| {
                    calls += 1;
                    if calls == 1 {
                        old = to.to_path_buf();
                    }
                    if calls == 2 || (calls == 3 && rollback_fails) {
                        return Err(std::io::Error::other("注入 rename 故障"));
                    }
                    fs::rename(from, to)
                })
                .unwrap_err();
            let preserved = if rollback_fails { &old } else { &target };
            assert_eq!(fs::read(preserved).unwrap(), b"old");
            assert!(payload.exists());
            assert_eq!(rollback_fails, error.contains(old.to_str().unwrap()));
            fs::remove_dir_all(root).unwrap();
        }
    }
}
