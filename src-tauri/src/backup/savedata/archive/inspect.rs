use sevenz_rust2::{ArchiveEntry, ArchiveReader, Password};
use std::collections::{HashMap, HashSet};
use std::io::{Read, Seek};
use std::path::Path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(in crate::backup::savedata) enum SaveEntryKind {
    File,
    Directory,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(in crate::backup::savedata) struct ArchiveSaveInfo {
    pub root_name: String,
    pub root_kind: SaveEntryKind,
    pub entry_count: usize,
    pub total_size: u64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(in crate::backup::savedata) struct LegacyArchiveInfo {
    pub entry_count: usize,
    pub total_size: u64,
}

const MAX_ENTRIES: usize = 100_000;
const MAX_SIZE: u64 = 128 * 1024 * 1024 * 1024;

pub(super) fn inspect_archive_path(
    path: &Path,
) -> Result<ArchiveSaveInfo, Box<dyn std::error::Error>> {
    let mut reader = ArchiveReader::open(path, Password::empty())?;
    inspect_rooted_archive(&mut reader)
}

pub(in crate::backup::savedata) fn inspect_rooted_archive<R: Read + Seek>(
    reader: &mut ArchiveReader<R>,
) -> Result<ArchiveSaveInfo, Box<dyn std::error::Error>> {
    inspect_rooted_entries(&reader.archive().files)
}

fn inspect_rooted_entries(
    entries: &[ArchiveEntry],
) -> Result<ArchiveSaveInfo, Box<dyn std::error::Error>> {
    let (parsed, total_size) = validate_entries(entries, false)?;
    let root_name = parsed[0].0[0].clone();
    let mut root_kind = None;
    for (components, is_directory) in &parsed {
        if components[0] != root_name {
            return Err("V2 存档归档必须只有一个顶层对象".into());
        }
        if components.len() == 1 && root_kind.replace(*is_directory).is_some() {
            return Err("V2 存档归档顶层对象重复".into());
        }
    }
    let root_is_directory = root_kind.ok_or("V2 存档归档缺少顶层对象")?;
    if !root_is_directory && parsed.iter().any(|(parts, _)| parts.len() > 1) {
        return Err("文件型存档不能包含子条目".into());
    }
    Ok(ArchiveSaveInfo {
        root_name,
        root_kind: if root_is_directory {
            SaveEntryKind::Directory
        } else {
            SaveEntryKind::File
        },
        entry_count: entries.len(),
        total_size,
    })
}

pub(in crate::backup::savedata) fn inspect_legacy_archive<R: Read + Seek>(
    reader: &mut ArchiveReader<R>,
) -> Result<LegacyArchiveInfo, Box<dyn std::error::Error>> {
    let (_, total_size) = validate_entries(&reader.archive().files, true)?;
    Ok(LegacyArchiveInfo {
        entry_count: reader.archive().files.len(),
        total_size,
    })
}

type ParsedEntries = Vec<(Vec<String>, bool)>;

fn validate_entries(
    entries: &[ArchiveEntry],
    allow_empty: bool,
) -> Result<(ParsedEntries, u64), Box<dyn std::error::Error>> {
    if entries.is_empty() && !allow_empty {
        return Err("V2 存档归档为空".into());
    }
    if entries.len() > MAX_ENTRIES {
        return Err("存档归档条目数量超出限制".into());
    }
    let mut aliases = HashSet::new();
    let mut parsed = Vec::with_capacity(entries.len());
    let mut total_size = 0u64;
    for entry in entries {
        let components = parse_entry_path(&entry.name)?;
        let key = components
            .iter()
            .map(|part| part.to_lowercase())
            .collect::<Vec<_>>()
            .join("/");
        if !aliases.insert(key) {
            return Err(format!("存档归档包含重复或别名路径: {}", entry.name).into());
        }
        reject_entry_kind(entry)?;
        total_size = total_size
            .checked_add(entry.size)
            .ok_or("存档归档解压大小溢出")?;
        if total_size > MAX_SIZE {
            return Err("存档归档解压大小超出限制".into());
        }
        parsed.push((components, entry.is_directory));
    }
    validate_entry_tree(&parsed)?;
    Ok((parsed, total_size))
}

fn validate_entry_tree(parsed: &ParsedEntries) -> Result<(), Box<dyn std::error::Error>> {
    let kinds: HashMap<String, bool> = parsed
        .iter()
        .map(|(parts, directory)| (parts.join("/"), *directory))
        .collect();
    let mut names = HashMap::new();
    for (parts, _) in parsed {
        for depth in 1..=parts.len() {
            let name = parts[..depth].join("/");
            if depth < parts.len() && kinds.get(&name) == Some(&false) {
                return Err(format!("归档中的文件不能包含子条目: {name}").into());
            }
            if let Some(previous) = names.insert(name.to_lowercase(), name.clone())
                && previous != name
            {
                return Err(format!("归档包含大小写冲突的路径: {name}").into());
            }
        }
    }
    Ok(())
}

fn parse_entry_path(name: &str) -> Result<Vec<String>, Box<dyn std::error::Error>> {
    crate::utils::fs::validate_safe_relative_path(name)?;
    let normalized = name.replace('\\', "/");
    if normalized.ends_with('/') {
        return Err(format!("存档归档路径不是普通相对路径: {name}").into());
    }
    let mut result = Vec::new();
    for part in normalized.split('/') {
        if part.contains(':') || part.trim_end_matches([' ', '.']) != part {
            return Err(format!("存档归档路径包含盘符、尾随点或空格: {name}").into());
        }
        if is_windows_device_name(part) {
            return Err(format!("存档归档路径包含 Windows 设备名: {name}").into());
        }
        if part
            .chars()
            .any(|character| character.is_control() || "<>\"|?*".contains(character))
        {
            return Err(format!("存档归档路径包含非法字符: {name}").into());
        }
        result.push(part.to_string());
    }
    if result.len() > 256 {
        return Err("存档归档目录层级过深".into());
    }
    Ok(result)
}

fn is_windows_device_name(part: &str) -> bool {
    let stem = part
        .split('.')
        .next()
        .unwrap_or(part)
        .trim_end()
        .to_ascii_uppercase();
    matches!(
        stem.as_str(),
        "CON"
            | "PRN"
            | "AUX"
            | "NUL"
            | "CONIN$"
            | "CONOUT$"
            | "COM¹"
            | "COM²"
            | "COM³"
            | "LPT¹"
            | "LPT²"
            | "LPT³"
            | "COM1"
            | "COM2"
            | "COM3"
            | "COM4"
            | "COM5"
            | "COM6"
            | "COM7"
            | "COM8"
            | "COM9"
            | "LPT1"
            | "LPT2"
            | "LPT3"
            | "LPT4"
            | "LPT5"
            | "LPT6"
            | "LPT7"
            | "LPT8"
            | "LPT9"
    )
}

fn reject_entry_kind(entry: &ArchiveEntry) -> Result<(), Box<dyn std::error::Error>> {
    if entry.is_anti_item {
        return Err(format!("存档归档包含 anti-item: {}", entry.name).into());
    }
    // 自定义解压器只创建普通文件/目录，不会还原归档中的 reparse 属性。
    if entry.has_windows_attributes && entry.windows_attributes & 0x40 != 0 {
        return Err(format!("存档归档包含特殊文件: {}", entry.name).into());
    }
    if entry.has_windows_attributes {
        let unix_type = (entry.windows_attributes >> 16) & 0xf000;
        if unix_type != 0
            && ((!entry.is_directory && unix_type != 0x8000)
                || (entry.is_directory && unix_type != 0x4000))
        {
            return Err(format!("存档归档包含 Unix 特殊文件: {}", entry.name).into());
        }
    }
    if entry.is_directory && entry.has_stream {
        return Err(format!("存档归档目录包含数据流: {}", entry.name).into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn distinguishes_legacy_shape_and_v2_invariants() {
        let entries = [
            ArchiveEntry::new_file("save.dat"),
            ArchiveEntry::new_file("config.ini"),
            ArchiveEntry::new_file("system/settings.dat"),
        ];
        assert!(validate_entries(&entries, true).is_ok());
        assert!(validate_entries(&[], true).is_ok());
        assert!(inspect_rooted_entries(&entries).is_err());
        for name in [
            "../save",
            "/save",
            "C:/save",
            "//server/save",
            "SaveData/x:stream",
            "NUL.dat",
            "SaveData/x.",
        ] {
            assert!(validate_entries(&[ArchiveEntry::new_file(name)], true).is_err());
        }
        let mut symlink = ArchiveEntry::new_file("save.dat");
        symlink.has_windows_attributes = true;
        symlink.windows_attributes = (0o120777 << 16) | 0x8000;
        assert!(validate_entries(&[symlink], true).is_err());
        assert!(
            validate_entries(
                &[ArchiveEntry::new_file("x"), ArchiveEntry::new_file("x/y"),],
                true,
            )
            .is_err()
        );
    }
}
