use crate::database::repository::games_repository::GamesRepository;
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use tauri::{State, command};
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize)]
pub struct ScanResult {
    /// 文件夹名=游戏名
    pub name: String,
    /// 完整路径
    pub path: String,
    /// exe文件列表
    pub executables: Vec<String>,
}

const VALID_EXE_EXTENSIONS: &[&str] = &["exe", "bat", "cmd"];

/// 扫描时跳过的目录名（不区分大小写）
const EXCLUDED_DIRS: &[&str] = &[
    // Windows 系统目录
    "$recycle.bin",
    "system volume information",
    "windows",
    "program files",
    "program files (x86)",
    "programdata",
    "appdata",
    // 开发 / 版本控制
    ".git",
    ".vs",
    "node_modules",
    "__pycache__",
    // 常见运行时 / 补丁目录（通常不含游戏主程序）
    "redist",
    "redistributables",
    "_commonredist",
    "directx",
    "vcredist",
];

/// exe 文件名（stem）中包含以下关键字则视为非游戏程序，予以排除
const EXCLUDED_EXE_PATTERNS: &[&str] = &[
    "unins", // 卸载程序
    "uninst",
    "uninstall",
    "setup", // 安装 / 配置向导
    "install",
    "dxsetup",  // DirectX
    "vcredist", // VC++ 运行时
    "vc_redist",
    "dotnetfx",     // .NET
    "oalinst",      // OpenAL
    "crashhandler", // 崩溃处理器
    "crash_handler",
    "crashreport",
    "crash_report",
    "bugreport",
    "bug_report",
    "unitycrashandler",
];

fn trim_dirname_to_search_name(dir_name: &str) -> String {
    let mut result = String::with_capacity(dir_name.len());
    let mut square_depth = 0_u32;
    let mut round_depth = 0_u32;
    let mut corner_depth = 0_u32;
    let mut fullwidth_round_depth = 0_u32;

    for ch in dir_name.chars() {
        match ch {
            '[' => square_depth += 1,
            ']' => square_depth = square_depth.saturating_sub(1),
            '(' => round_depth += 1,
            ')' => round_depth = round_depth.saturating_sub(1),
            '【' => corner_depth += 1,
            '】' => corner_depth = corner_depth.saturating_sub(1),
            '（' => fullwidth_round_depth += 1,
            '）' => fullwidth_round_depth = fullwidth_round_depth.saturating_sub(1),
            _ => {
                if square_depth == 0
                    && round_depth == 0
                    && corner_depth == 0
                    && fullwidth_round_depth == 0
                {
                    result.push(ch);
                }
            }
        }
    }

    let trimmed = result.split_whitespace().collect::<Vec<_>>().join(" ");
    if trimmed.is_empty() {
        dir_name.trim().to_string()
    } else {
        trimmed
    }
}

fn is_excluded_dir(name: &str) -> bool {
    let lower = name.to_lowercase();
    EXCLUDED_DIRS.iter().any(|&d| lower == d)
}

fn is_excluded_exe(path: &Path) -> bool {
    path.file_stem().is_some_and(|stem| {
        let lower = stem.to_string_lossy().to_lowercase();
        EXCLUDED_EXE_PATTERNS.iter().any(|&p| lower.contains(p))
    })
}

#[command]
pub async fn scan_directory_for_games(
    db: State<'_, DatabaseConnection>,
    path: String,
) -> Result<Vec<ScanResult>, String> {
    // 先做路径预检查（一次 syscall，可在 async 上下文进行）
    if !Path::new(&path).is_dir() {
        return Err(format!("目录不存在或不是文件夹: {}", path));
    }

    // 异步查询 DB，获取已导入目录集合
    let existing_dirs: HashSet<PathBuf> = GamesRepository::get_all_localpaths(&db)
        .await
        .map_err(|e| format!("查询已有路径失败: {}", e))?
        .into_iter()
        .filter_map(|lp| PathBuf::from(lp).parent().map(Path::to_path_buf))
        .collect();

    // WalkDir 大量文件系统 I/O 属于阻塞操作，
    // 放入 Tokio 革层阻塞线程池，避免占用异步运行时线程。
    tokio::task::spawn_blocking(move || scan_games_blocking(path, existing_dirs))
        .await
        .map_err(|e| format!("扫描任务异常: {}", e))?
}

/// 包含所有阻塞 I/O 和 CPU 密集计算的同步扫描逻辑
///
/// 由 [`scan_directory_for_games`] 通过 `tokio::task::spawn_blocking` 调用，
/// 运行在顶层阻塞线程池中而非异步运行时。
fn scan_games_blocking(
    path: String,
    existing_dirs: HashSet<PathBuf>,
) -> Result<Vec<ScanResult>, String> {
    let dir_path = PathBuf::from(&path);

    // Phase 1: DFS 遍历，收集所有有效 exe，按其所在目录分组
    // 使用手动迭代器控制代替 filter_entry，以便调用 skip_current_dir() 实现真正的短路：
    //   - 遇到排除目录 / 已导入目录 → skip_current_dir，剪掉整棵子树
    //   - 当某目录已确认含有直属 exe 时，之后遇到其子目录立即 skip_current_dir，
    //   - 忽略直接位于扫描根目录下的文件（它们不属于任何子游戏文件夹）
    let mut exe_by_dir: HashMap<PathBuf, Vec<PathBuf>> = HashMap::new();
    // 统计每个目录的直属文件数（不含子目录），用于过滤文件过少的误判目录
    let mut file_count_by_dir: HashMap<PathBuf, usize> = HashMap::new();
    // 已发现直属 exe 的目录集合，用于对其子目录执行 skip_current_dir
    let mut dirs_with_exe: HashSet<PathBuf> = HashSet::new();

    let mut walker = WalkDir::new(&dir_path)
        .min_depth(1)
        .max_depth(5)
        .follow_links(false)
        .sort_by(|a, b| {
            let a_is_dir = a.file_type().is_dir();
            let b_is_dir = b.file_type().is_dir();
            // bool 的比较规则中，false (文件) < true (文件夹)
            a_is_dir.cmp(&b_is_dir)
        })
        .into_iter();

    while let Some(entry) = walker.next() {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let entry_path = entry.path();

        if entry.file_type().is_dir() {
            // walkdir 在 yield 目录时已将其 ReadDir 压栈，skip_current_dir() 将其弹出，
            // 从而跳过该目录的所有内容，但不影响同级其他条目。
            let should_skip = is_excluded_dir(&entry.file_name().to_string_lossy())
                || existing_dirs.contains(entry_path)
                // 父目录已有直属 exe → 该子目录无需遍历（祖先优先短路）
                || entry_path
                    .parent()
                    .is_some_and(|p| dirs_with_exe.contains(p));
            if should_skip {
                walker.skip_current_dir();
            }
            continue; // 目录条目本身无需记录
        }

        if entry.file_type().is_file() {
            let Some(parent) = entry_path.parent() else {
                continue;
            };
            if parent == dir_path.as_path() {
                continue; // 忽略根目录直属文件
            }
            // 统计直属文件数
            *file_count_by_dir.entry(parent.to_path_buf()).or_insert(0) += 1;
            // 收集有效可执行文件，并标记该目录已有 exe
            if let Some(ext) = entry_path.extension()
                && VALID_EXE_EXTENSIONS
                    .iter()
                    .any(|&e| ext.eq_ignore_ascii_case(e))
                && !is_excluded_exe(entry_path)
            {
                dirs_with_exe.insert(parent.to_path_buf());
                exe_by_dir
                    .entry(parent.to_path_buf())
                    .or_default()
                    .push(entry_path.to_path_buf());
            }
        }
    }

    // Phase 2: 短路 —— 祖先目录优先
    //   按路径深度升序排列候选目录，若某目录的祖先已被选中则跳过，
    //   这等效于 DFS 找到可执行文件后不再向下扫描的短路行为。
    let mut dirs: Vec<PathBuf> = exe_by_dir.keys().cloned().collect();
    dirs.sort_by_key(|p| p.components().count());

    let mut selected: Vec<PathBuf> = Vec::new();
    for dir in dirs {
        if !selected.iter().any(|s| dir.starts_with(s) && dir != *s) {
            selected.push(dir);
        }
    }

    // Phase 3: 构建结果，仅返回含有效 exe 且目录直属文件数大于 3 的目录
    // 文件数过少的目录通常是安装残留、工具目录或子目录入口层，不是真实游戏目录
    let mut results: Vec<ScanResult> = selected
        .into_iter()
        .filter_map(|game_dir| {
            let exes = exe_by_dir.get(&game_dir)?;
            // 文件数少于等于 3 则忽略
            if file_count_by_dir.get(&game_dir).copied().unwrap_or(0) <= 3 {
                return None;
            }
            let raw_name = game_dir.file_name()?.to_string_lossy().to_string();
            let name = trim_dirname_to_search_name(&raw_name);
            let lower_name = name.to_lowercase();

            let mut executables: Vec<String> = exes
                .iter()
                .filter_map(|exe_path| {
                    exe_path
                        .strip_prefix(&game_dir)
                        .ok()
                        .map(|rel| rel.to_string_lossy().to_string())
                })
                .collect();

            // 排序：含 "chs" 的靠前（忽略大小写）；其次文件名含游戏目录名的靠前；最后路径越短越靠前
            executables.sort_by(|a, b| {
                let a_lower = a.to_lowercase();
                let b_lower = b.to_lowercase();
                let a_chs = a_lower.contains("chs");
                let b_chs = b_lower.contains("chs");
                if a_chs != b_chs {
                    return if a_chs {
                        std::cmp::Ordering::Less
                    } else {
                        std::cmp::Ordering::Greater
                    };
                }
                let a_match = a_lower.contains(&lower_name);
                let b_match = b_lower.contains(&lower_name);
                match (a_match, b_match) {
                    (true, false) => std::cmp::Ordering::Less,
                    (false, true) => std::cmp::Ordering::Greater,
                    _ => a.len().cmp(&b.len()),
                }
            });

            Some(ScanResult {
                name,
                path: game_dir.to_string_lossy().to_string(),
                executables,
            })
        })
        .collect();

    results.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(results)
}

#[cfg(test)]
mod tests {
    use super::trim_dirname_to_search_name;

    #[test]
    fn trim_dirname_removes_common_tags() {
        assert_eq!(
            trim_dirname_to_search_name("[社团名] 游戏名 (完整版)"),
            "游戏名"
        );
        assert_eq!(
            trim_dirname_to_search_name("【品牌】 游戏名 （初回版）"),
            "游戏名"
        );
    }

    #[test]
    fn trim_dirname_falls_back_when_everything_is_removed() {
        assert_eq!(trim_dirname_to_search_name("[社团名]"), "[社团名]");
    }
}
