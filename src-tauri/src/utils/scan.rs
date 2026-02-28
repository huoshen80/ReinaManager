use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use tauri::command;

#[derive(Debug, Serialize, Deserialize)]
pub struct ScanResult {
    /// 文件夹名=游戏名
    pub name: String,
    /// 完整路径
    pub path: String,
    /// exe文件列表
    pub executables: Vec<String>,
}

fn find_executables(dir: &Path, base_dir: &Path, depth: u8, max_depth: u8) -> Vec<String> {
    let mut exes = Vec::new();
    if depth > max_depth {
        return exes;
    }

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                exes.extend(find_executables(&path, base_dir, depth + 1, max_depth));
            } else if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext.to_string_lossy().eq_ignore_ascii_case("exe") {
                        if let Ok(rel_path) = path.strip_prefix(base_dir) {
                            exes.push(rel_path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        }
    }
    exes
}

#[command]
pub async fn scan_directory_for_games(path: String) -> Result<Vec<ScanResult>, String> {
    let dir_path = Path::new(&path);
    if !dir_path.exists() || !dir_path.is_dir() {
        return Err(format!("目录不存在或不是文件夹: {}", path));
    }

    let mut results = Vec::new();
    let entries = fs::read_dir(dir_path).map_err(|e| format!("无法读取目录: {}", e))?;

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if entry_path.is_dir() {
            if let Some(name) = entry_path.file_name().and_then(|n| n.to_str()) {
                let mut executables = find_executables(&entry_path, &entry_path, 0, 2);
                // Todo 可能可以编写一个白名单与黑名单，比如文件名中有chs的exe顺序靠前，config的exe顺序靠后
                let lower_name = name.to_lowercase();
                executables.sort_by(|a, b| {
                    let a_lower = a.to_lowercase();
                    let b_lower = b.to_lowercase();
                    
                    let a_contains = a_lower.contains(&lower_name);
                    let b_contains = b_lower.contains(&lower_name);
                    
                    if a_contains && !b_contains {
                        std::cmp::Ordering::Less
                    } else if !a_contains && b_contains {
                        std::cmp::Ordering::Greater
                    } else {
                        a.len().cmp(&b.len())
                    }
                });

                results.push(ScanResult {
                    name: name.to_string(),
                    path: entry_path.to_string_lossy().to_string(),
                    executables,
                });
            }
        }
    }

    results.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(results)
}
