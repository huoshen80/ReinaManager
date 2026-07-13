use crate::database::repository::games_repository::GamesRepository;
use sea_orm::DatabaseConnection;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::{Component, Path, PathBuf};
use std::time::Instant;
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

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanMode {
    Executable,
    FirstLevelDirectory,
}

const VALID_EXE_EXTENSIONS: &[&str] = &["exe", "bat", "cmd"];
const MIN_SCAN_MAX_DEPTH: usize = 2;
const MAX_SCAN_MAX_DEPTH: usize = 5;

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
enum ImportPathComponent {
    Prefix(String),
    Root,
    Parent,
    Normal(String),
}

#[derive(Default)]
struct ImportPathIndex {
    paths: HashSet<Vec<ImportPathComponent>>,
}

impl ImportPathIndex {
    fn insert(&mut self, path: &Path) {
        let Some(components) = normalize_import_path(path) else {
            return;
        };

        self.paths.insert(components);
    }

    /// 已导入游戏目录本身及其后代都属于同一个游戏，不再作为扫描候选。
    fn is_imported_or_descendant(&self, path: &Path) -> bool {
        let Some(components) = normalize_import_path(path) else {
            return false;
        };

        (1..=components.len()).any(|length| self.paths.contains(&components[..length]))
    }

    fn len(&self) -> usize {
        self.paths.len()
    }
}

fn normalize_import_path(path: &Path) -> Option<Vec<ImportPathComponent>> {
    let mut normalized = Vec::new();

    for component in path.components() {
        match component {
            Component::Prefix(prefix) => normalized.push(ImportPathComponent::Prefix(
                normalize_import_component(prefix.as_os_str()),
            )),
            Component::RootDir => normalized.push(ImportPathComponent::Root),
            Component::CurDir => {}
            Component::ParentDir => {
                // components() 会保留 `..`；这里做纯词法折叠，确保手动修改的旧数据
                // 与 DTO 清洗后的新路径使用同一比较形式。
                if matches!(normalized.last(), Some(ImportPathComponent::Normal(_))) {
                    normalized.pop();
                } else if !matches!(normalized.last(), Some(ImportPathComponent::Root)) {
                    normalized.push(ImportPathComponent::Parent);
                }
            }
            Component::Normal(value) => normalized.push(ImportPathComponent::Normal(
                normalize_import_component(value),
            )),
        }
    }

    (!normalized.is_empty()).then_some(normalized)
}

#[cfg(windows)]
fn normalize_import_component(value: &std::ffi::OsStr) -> String {
    value.to_string_lossy().to_lowercase()
}

#[cfg(not(windows))]
fn normalize_import_component(value: &std::ffi::OsStr) -> String {
    value.to_string_lossy().into_owned()
}

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

fn is_han_character(character: char) -> bool {
    matches!(
        character,
        '\u{3400}'..='\u{4DBF}'
            | '\u{4E00}'..='\u{9FFF}'
            | '\u{F900}'..='\u{FAFF}'
            | '\u{20000}'..='\u{2EBEF}'
            | '\u{30000}'..='\u{323AF}'
    )
}

fn is_kana_character(character: char) -> bool {
    matches!(
        character,
        '\u{3040}'..='\u{30FF}'
            | '\u{31F0}'..='\u{31FF}'
            | '\u{FF65}'..='\u{FF9F}'
            | '\u{1AFF0}'..='\u{1AFFF}'
            | '\u{1B000}'..='\u{1B16F}'
    )
}

fn is_probably_chinese_executable(value: &str) -> bool {
    let file_name = Path::new(value)
        .file_name()
        .map(|name| name.to_string_lossy())
        .unwrap_or_else(|| value.into());
    let mut contains_han = false;

    for character in file_name.chars() {
        if is_kana_character(character) {
            return false;
        }
        contains_han |= is_han_character(character);
    }

    contains_han
}

fn sort_executables(executables: &mut [String], game_name: &str) {
    let lower_name = game_name.to_lowercase();
    executables.sort_by_cached_key(|executable| {
        let lower = executable.to_lowercase();
        (
            !(lower.contains("chs") || lower.contains("cn")),
            !is_probably_chinese_executable(executable),
            !lower.contains(&lower_name),
            executable.len(),
            lower,
        )
    });
}

#[command]
pub async fn scan_directory_for_games(
    db: State<'_, DatabaseConnection>,
    path: String,
    max_depth: usize,
    scan_mode: ScanMode,
) -> Result<Vec<ScanResult>, String> {
    // 先做路径预检查（一次 syscall，可在 async 上下文进行）
    if !Path::new(&path).is_dir() {
        return Err(format!("目录不存在或不是文件夹: {}", path));
    }

    // 异步查询 DB；去重索引只做路径组件运算，不访问文件系统。
    let existing_game_directories = GamesRepository::get_all_game_directories(&db)
        .await
        .map_err(|e| format!("查询已有路径失败: {}", e))?;

    let max_depth = max_depth.clamp(MIN_SCAN_MAX_DEPTH, MAX_SCAN_MAX_DEPTH);
    let started_at = Instant::now();
    let path_for_log = path.clone();

    // WalkDir 大量文件系统 I/O 属于阻塞操作，
    // 放入 Tokio 革层阻塞线程池，避免占用异步运行时线程。
    let results = tokio::task::spawn_blocking(move || {
        let mut existing_paths = ImportPathIndex::default();
        for game_directory in existing_game_directories {
            existing_paths.insert(Path::new(&game_directory));
        }
        log::debug!(
            "开始扫描游戏目录 path={} mode={:?} max_depth={} existing_paths={}",
            path,
            scan_mode,
            max_depth,
            existing_paths.len()
        );
        scan_games_blocking(path, existing_paths, max_depth, scan_mode)
    })
    .await
    .map_err(|e| {
        log::error!(
            "扫描任务异常 path={} mode={:?} max_depth={}: {}",
            path_for_log,
            scan_mode,
            max_depth,
            e
        );
        format!("扫描任务异常: {}", e)
    })??;

    log::info!(
        "游戏目录扫描完成 mode={:?} max_depth={} result_count={} elapsed_ms={}",
        scan_mode,
        max_depth,
        results.len(),
        started_at.elapsed().as_millis()
    );

    Ok(results)
}

/// 包含所有阻塞 I/O 和 CPU 密集计算的同步扫描逻辑
///
/// 由 [`scan_directory_for_games`] 通过 `tokio::task::spawn_blocking` 调用，
/// 运行在顶层阻塞线程池中而非异步运行时。
fn scan_games_blocking(
    path: String,
    existing_paths: ImportPathIndex,
    max_depth: usize,
    scan_mode: ScanMode,
) -> Result<Vec<ScanResult>, String> {
    match scan_mode {
        ScanMode::Executable => scan_executable_games_blocking(path, existing_paths, max_depth),
        ScanMode::FirstLevelDirectory => Ok(scan_direct_child_directories(path, existing_paths)),
    }
}

fn scan_direct_child_directories(path: String, existing_paths: ImportPathIndex) -> Vec<ScanResult> {
    let dir_path = PathBuf::from(path);
    let mut executables_by_dir: HashMap<PathBuf, Vec<String>> = HashMap::new();
    let mut walker = WalkDir::new(&dir_path)
        .min_depth(1)
        .max_depth(2)
        .follow_links(false)
        .into_iter();

    while let Some(entry) = walker.next() {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };

        let entry_path = entry.path();
        if entry.depth() == 1 {
            if !entry.file_type().is_dir()
                || is_excluded_dir(&entry.file_name().to_string_lossy())
                || existing_paths.is_imported_or_descendant(entry_path)
            {
                if entry.file_type().is_dir() {
                    walker.skip_current_dir();
                }
                continue;
            }

            executables_by_dir
                .entry(entry_path.to_path_buf())
                .or_default();
            continue;
        }

        if !entry.file_type().is_file() || is_excluded_exe(entry_path) {
            continue;
        }
        let Some(ext) = entry_path.extension() else {
            continue;
        };
        if !VALID_EXE_EXTENSIONS
            .iter()
            .any(|expected| ext.eq_ignore_ascii_case(expected))
        {
            continue;
        }

        let Some(parent) = entry_path.parent() else {
            continue;
        };
        let Some(executables) = executables_by_dir.get_mut(parent) else {
            continue;
        };
        if let Some(file_name) = entry_path.file_name() {
            executables.push(file_name.to_string_lossy().to_string());
        }
    }

    let mut results: Vec<ScanResult> = executables_by_dir
        .into_iter()
        .filter_map(|(game_dir, mut executables)| {
            let raw_name = game_dir.file_name()?.to_string_lossy();
            let name = trim_dirname_to_search_name(&raw_name);
            sort_executables(&mut executables, &name);
            Some(ScanResult {
                name,
                path: game_dir.to_string_lossy().to_string(),
                executables,
            })
        })
        .collect();

    results.sort_by(|a, b| a.name.cmp(&b.name));
    results
}

fn scan_executable_games_blocking(
    path: String,
    existing_paths: ImportPathIndex,
    max_depth: usize,
) -> Result<Vec<ScanResult>, String> {
    let dir_path = PathBuf::from(&path);

    // Phase 1: DFS 遍历，收集所有有效 exe，按其所在目录分组
    // 使用手动迭代器控制代替 filter_entry，以便调用 skip_current_dir() 实现真正的短路：
    //   - 遇到排除目录 / 已导入目录 → skip_current_dir，剪掉整棵子树
    //   - 当某目录已确认含有直属 exe 时，之后遇到其子目录立即 skip_current_dir，
    //   - 忽略直接位于扫描根目录下的文件（它们不属于任何子游戏文件夹）
    let mut exe_by_dir: HashMap<PathBuf, Vec<PathBuf>> = HashMap::new();
    // 已发现直属 exe 的目录集合，用于对其子目录执行 skip_current_dir
    let mut dirs_with_exe: HashSet<PathBuf> = HashSet::new();

    let mut walker = WalkDir::new(&dir_path)
        .min_depth(1)
        .max_depth(max_depth)
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
                || existing_paths.is_imported_or_descendant(entry_path)
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
            // 收集有效可执行文件，并标记该目录已有 exe
            if let Some(ext) = entry_path.extension()
                && VALID_EXE_EXTENSIONS
                    .iter()
                    .any(|&e| ext.eq_ignore_ascii_case(e))
                && !is_excluded_exe(entry_path)
            {
                // 已导入目录同样视为“已有直属 exe”，避免继续扫描其子目录。
                dirs_with_exe.insert(parent.to_path_buf());
                if !existing_paths.is_imported_or_descendant(parent) {
                    exe_by_dir
                        .entry(parent.to_path_buf())
                        .or_default()
                        .push(entry_path.to_path_buf());
                }
            }
        }
    }

    // Phase 2: 短路 —— 祖先目录优先
    //   按路径深度升序排列候选目录，若某目录的祖先已被选中则跳过，
    //   这等效于 DFS 找到可执行文件后不再向下扫描的短路行为。
    let mut dirs: Vec<PathBuf> = exe_by_dir.keys().cloned().collect();
    dirs.sort_by_key(|p| p.components().count());

    let mut selected: Vec<PathBuf> = Vec::new();
    let mut selected_dirs: HashSet<PathBuf> = HashSet::new();
    for dir in dirs {
        if !dir
            .ancestors()
            .skip(1)
            .any(|ancestor| selected_dirs.contains(ancestor))
        {
            selected_dirs.insert(dir.clone());
            selected.push(dir);
        }
    }

    // Phase 3: 构建结果。层级已由用户控制，这里只要求目录含有效启动程序。
    let mut results: Vec<ScanResult> = selected
        .into_iter()
        .filter_map(|game_dir| {
            let exes = exe_by_dir.get(&game_dir)?;
            let raw_name = game_dir.file_name()?.to_string_lossy().to_string();
            let name = trim_dirname_to_search_name(&raw_name);

            let mut executables: Vec<String> = exes
                .iter()
                .filter_map(|exe_path| {
                    exe_path
                        .strip_prefix(&game_dir)
                        .ok()
                        .map(|rel| rel.to_string_lossy().to_string())
                })
                .collect();
            sort_executables(&mut executables, &name);

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
    use super::{
        ImportPathIndex, scan_direct_child_directories, scan_executable_games_blocking,
        sort_executables, trim_dirname_to_search_name,
    };
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_path(parts: &[&str]) -> PathBuf {
        parts.iter().collect()
    }

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

    #[test]
    fn executable_sort_prioritizes_han_names_without_kana() {
        let mut executables = vec![
            "Game.exe".to_string(),
            "死に逝く君.exe".to_string(),
            "Game_chs.exe".to_string(),
            "游戏.exe".to_string(),
        ];

        sort_executables(&mut executables, "Game");

        assert_eq!(
            executables,
            ["Game_chs.exe", "游戏.exe", "Game.exe", "死に逝く君.exe"]
        );
    }

    #[test]
    fn import_index_matches_game_directory_and_descendants() {
        let game_dir = test_path(&["scan-root", "Games", "A"]);
        let sibling = test_path(&["scan-root", "Games", "AB"]);
        let mut index = ImportPathIndex::default();
        index.insert(&game_dir);
        index.insert(&game_dir);

        assert_eq!(index.len(), 1);
        assert!(index.is_imported_or_descendant(&game_dir));
        assert!(index.is_imported_or_descendant(&game_dir.join("Sub")));
        assert!(!index.is_imported_or_descendant(game_dir.parent().unwrap()));
        assert!(!index.is_imported_or_descendant(&sibling));
    }

    #[test]
    fn executable_scan_does_not_find_games_below_imported_scan_root() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("系统时间应晚于 Unix epoch")
            .as_nanos();
        let game_dir = std::env::temp_dir().join(format!(
            "reina-imported-scan-root-{}-{unique}",
            std::process::id()
        ));
        let deep_dir = game_dir.join("Sub").join("Deep");
        fs::create_dir_all(&deep_dir).expect("应能创建深层测试目录");
        fs::write(deep_dir.join("nested.exe"), []).expect("应能创建深层启动程序");

        let mut existing_paths = ImportPathIndex::default();
        existing_paths.insert(&game_dir);
        let results = scan_executable_games_blocking(
            game_dir.to_string_lossy().into_owned(),
            existing_paths,
            5,
        )
        .expect("扫描应成功");

        assert!(results.is_empty());
        fs::remove_dir_all(game_dir).expect("应能清理测试目录");
    }

    #[test]
    fn first_level_scan_imports_direct_children_and_executables() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("系统时间应晚于 Unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "reina-first-level-scan-{}-{unique}",
            std::process::id()
        ));
        let game_a = root.join("GameA");
        let game_b = root.join("GameB");
        let game_c = root.join("GameC");
        fs::create_dir_all(game_a.join("Deep")).expect("应能创建测试目录");
        fs::create_dir_all(&game_b).expect("应能创建测试目录");
        fs::create_dir_all(&game_c).expect("应能创建无启动程序的测试目录");
        fs::write(game_a.join("GameA.exe"), []).expect("应能创建直属启动程序");
        fs::write(game_a.join("Deep").join("ignored.exe"), []).expect("应能创建深层启动程序");

        let mut existing_paths = ImportPathIndex::default();
        existing_paths.insert(&game_b);
        let results =
            scan_direct_child_directories(root.to_string_lossy().into_owned(), existing_paths);

        assert_eq!(results.len(), 2);
        assert_eq!(results[0].name, "GameA");
        assert_eq!(PathBuf::from(&results[0].path), game_a);
        assert_eq!(results[0].executables, ["GameA.exe"]);
        assert_eq!(results[1].name, "GameC");
        assert_eq!(PathBuf::from(&results[1].path), game_c);
        assert!(results[1].executables.is_empty());

        fs::remove_dir_all(root).expect("应能清理测试目录");
    }
}
