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
                results.push(ScanResult {
                    name: name.to_string(),
                    path: entry_path.to_string_lossy().to_string(),
                });
            }
        }
    }

    results.sort_by(|a, b| a.name.cmp(&b.name));

    Ok(results)
}
