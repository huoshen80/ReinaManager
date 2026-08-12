use crate::database::repository::games_repository::GamesRepository;
use crate::game::scan::{ImportPathIndex, scan_executable_candidates, trim_dirname_to_search_name};
use crate::game::steam::{SteamLaunchTarget, resolve_steam_shortcut_files_blocking};
use sea_orm::DatabaseConnection;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{State, command};

const LOCAL_EXECUTABLE_EXTENSIONS: &[&str] = &["exe", "bat", "cmd"];

#[derive(Debug, Serialize)]
pub struct BulkImportPathCandidate {
    pub name: String,
    pub path: Option<String>,
    pub executables: Vec<String>,
    pub selected_exe: Option<String>,
    pub launch_type: Option<String>,
    pub steam_launch_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BulkImportPathIssue {
    pub path: String,
    pub code: BulkImportPathIssueCode,
    pub message: String,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BulkImportPathIssueCode {
    UnsupportedPath,
    ReadFailed,
    InvalidSteamShortcut,
    SteamTargetNotFound,
    AlreadyInLibrary,
    DuplicateInBatch,
}

#[derive(Debug, Serialize)]
pub struct BulkImportPathResult {
    pub candidates: Vec<BulkImportPathCandidate>,
    pub issues: Vec<BulkImportPathIssue>,
}

fn normalized_path_key(path: &Path) -> String {
    let normalized = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let key = normalized.to_string_lossy().replace('\\', "/");
    #[cfg(target_os = "windows")]
    return key.to_lowercase();
    #[cfg(not(target_os = "windows"))]
    key
}

fn path_display_name(path: &Path) -> String {
    let raw_name = path
        .file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .unwrap_or_else(|| path.to_string_lossy().into_owned());
    trim_dirname_to_search_name(&raw_name)
}

fn issue(
    path: &Path,
    code: BulkImportPathIssueCode,
    message: impl Into<String>,
) -> BulkImportPathIssue {
    BulkImportPathIssue {
        path: path.to_string_lossy().into_owned(),
        code,
        message: message.into(),
    }
}

fn is_supported_executable(path: &Path) -> bool {
    path.extension().is_some_and(|extension| {
        LOCAL_EXECUTABLE_EXTENSIONS
            .iter()
            .any(|expected| extension.eq_ignore_ascii_case(expected))
    })
}

fn local_candidate(path: &Path) -> Result<BulkImportPathCandidate, BulkImportPathIssue> {
    let metadata = fs::metadata(path).map_err(|error| {
        issue(
            path,
            BulkImportPathIssueCode::ReadFailed,
            format!("无法读取路径：{error}"),
        )
    })?;

    if metadata.is_dir() {
        let executables = scan_executable_candidates(path)
            .map_err(|message| issue(path, BulkImportPathIssueCode::ReadFailed, message))?;
        return Ok(BulkImportPathCandidate {
            name: path_display_name(path),
            path: Some(path.to_string_lossy().into_owned()),
            selected_exe: executables.first().cloned(),
            executables,
            launch_type: None,
            steam_launch_id: None,
        });
    }

    if metadata.is_file() && is_supported_executable(path) {
        let Some(parent) = path
            .parent()
            .filter(|parent| !parent.as_os_str().is_empty())
        else {
            return Err(issue(
                path,
                BulkImportPathIssueCode::UnsupportedPath,
                "启动文件缺少父目录",
            ));
        };
        let Some(file_name) = path.file_name() else {
            return Err(issue(
                path,
                BulkImportPathIssueCode::UnsupportedPath,
                "启动文件缺少文件名",
            ));
        };
        let executable = file_name.to_string_lossy().into_owned();
        return Ok(BulkImportPathCandidate {
            name: path_display_name(parent),
            path: Some(parent.to_string_lossy().into_owned()),
            executables: vec![executable.clone()],
            selected_exe: Some(executable),
            launch_type: None,
            steam_launch_id: None,
        });
    }

    Err(issue(
        path,
        BulkImportPathIssueCode::UnsupportedPath,
        "仅支持文件夹、exe/bat/cmd 启动文件或 Steam .url 快捷方式",
    ))
}

fn steam_candidate(target: SteamLaunchTarget) -> BulkImportPathCandidate {
    let executables = target.executable.clone().into_iter().collect();
    BulkImportPathCandidate {
        name: target.name,
        path: target.localpath,
        executables,
        selected_exe: target.executable,
        launch_type: Some("steam".to_string()),
        steam_launch_id: Some(target.steam_launch_id),
    }
}

fn resolve_paths_blocking(
    paths: Vec<String>,
    existing_directories: HashSet<String>,
    existing_steam_ids: HashSet<String>,
) -> BulkImportPathResult {
    let path_bufs = paths.into_iter().map(PathBuf::from).collect::<Vec<_>>();
    let shortcut_paths = path_bufs
        .iter()
        .filter(|path| {
            path.extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("url"))
        })
        .map(PathBuf::as_path)
        .collect::<Vec<_>>();
    let mut shortcut_results = resolve_steam_shortcut_files_blocking(&shortcut_paths).into_iter();
    let existing_paths = ImportPathIndex::from_paths(existing_directories);
    let mut seen_paths = HashSet::new();
    let mut seen_steam_ids = HashSet::new();
    let mut candidates = Vec::new();
    let mut issues = Vec::new();

    for path in path_bufs {
        let is_shortcut = path
            .extension()
            .is_some_and(|extension| extension.eq_ignore_ascii_case("url"));
        let candidate = if is_shortcut {
            match shortcut_results
                .next()
                .expect("快捷方式解析结果数量必须一致")
            {
                Ok(target) => Ok(steam_candidate(target)),
                Err(message) => {
                    let code = if message.starts_with("读取 ") {
                        BulkImportPathIssueCode::ReadFailed
                    } else if message.contains("未找到启动项")
                        || message.contains("未找到 Steam 安装目录")
                    {
                        BulkImportPathIssueCode::SteamTargetNotFound
                    } else {
                        BulkImportPathIssueCode::InvalidSteamShortcut
                    };
                    Err(issue(&path, code, message))
                }
            }
        } else {
            local_candidate(&path)
        };

        let candidate = match candidate {
            Ok(candidate) => candidate,
            Err(candidate_issue) => {
                issues.push(candidate_issue);
                continue;
            }
        };

        if let Some(steam_id) = candidate.steam_launch_id.as_ref() {
            if existing_steam_ids.contains(steam_id)
                || candidate.path.as_deref().is_some_and(|localpath| {
                    existing_paths.has_imported_path_within(Path::new(localpath))
                        || existing_paths.is_imported_or_descendant(Path::new(localpath))
                })
            {
                issues.push(issue(
                    &path,
                    BulkImportPathIssueCode::AlreadyInLibrary,
                    "该游戏已存在于游戏库中",
                ));
                continue;
            }
            if !seen_steam_ids.insert(steam_id.clone()) {
                issues.push(issue(
                    &path,
                    BulkImportPathIssueCode::DuplicateInBatch,
                    "该 Steam 游戏在本次拖拽中重复",
                ));
                continue;
            }
        }

        if let Some(localpath) = candidate.path.as_deref() {
            let localpath = Path::new(localpath);
            if candidate.steam_launch_id.is_none()
                && (existing_paths.is_imported_or_descendant(localpath)
                    || existing_paths.has_imported_path_within(localpath))
            {
                issues.push(issue(
                    &path,
                    BulkImportPathIssueCode::AlreadyInLibrary,
                    "该游戏目录已存在于游戏库中",
                ));
                continue;
            }
            if !seen_paths.insert(normalized_path_key(localpath)) {
                issues.push(issue(
                    &path,
                    BulkImportPathIssueCode::DuplicateInBatch,
                    "该游戏目录在本次拖拽中重复",
                ));
                continue;
            }
        }

        candidates.push(candidate);
    }

    BulkImportPathResult { candidates, issues }
}

#[command]
pub async fn resolve_bulk_import_paths(
    db: State<'_, DatabaseConnection>,
    paths: Vec<String>,
) -> Result<BulkImportPathResult, String> {
    let existing_directories = GamesRepository::get_all_game_directories(&db)
        .await
        .map_err(|error| format!("查询已有路径失败: {error}"))?;
    let existing_steam_ids = GamesRepository::get_all_steam_launch_ids(&db)
        .await
        .map_err(|error| format!("查询已有 Steam 启动 ID 失败: {error}"))?;

    tokio::task::spawn_blocking(move || {
        resolve_paths_blocking(paths, existing_directories, existing_steam_ids)
    })
    .await
    .map_err(|error| format!("批量解析拖拽路径任务异常: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_root(test_name: &str) -> PathBuf {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("系统时间应晚于 Unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "reina_bulk_drop_{test_name}_{}_{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("应能创建测试目录");
        root
    }

    #[test]
    fn folder_and_executable_become_one_candidate() {
        let root = temp_root("folder_and_executable");
        let game = root.join("[社团] 游戏名 (Ver1.0)");
        fs::create_dir_all(&game).expect("应能创建游戏目录");
        fs::write(game.join("game.exe"), []).expect("应能创建启动文件");

        let result = resolve_paths_blocking(
            vec![
                game.to_string_lossy().into_owned(),
                game.join("game.exe").to_string_lossy().into_owned(),
            ],
            HashSet::new(),
            HashSet::new(),
        );

        assert_eq!(result.candidates.len(), 1);
        assert_eq!(result.candidates[0].name, "游戏名");
        assert_eq!(
            result.candidates[0].selected_exe.as_deref(),
            Some("game.exe")
        );
        assert_eq!(result.issues.len(), 1);
        assert_eq!(
            result.issues[0].code,
            BulkImportPathIssueCode::DuplicateInBatch
        );
        fs::remove_dir_all(root).expect("应能清理测试目录");
    }

    #[test]
    fn folder_without_executable_is_still_a_candidate() {
        let root = temp_root("empty_folder");
        let game = root.join("目录游戏");
        fs::create_dir_all(&game).expect("应能创建游戏目录");

        let result = resolve_paths_blocking(
            vec![game.to_string_lossy().into_owned()],
            HashSet::new(),
            HashSet::new(),
        );

        assert_eq!(result.candidates.len(), 1);
        assert!(result.candidates[0].executables.is_empty());
        assert!(result.issues.is_empty());
        fs::remove_dir_all(root).expect("应能清理测试目录");
    }

    #[test]
    fn existing_and_unsupported_paths_are_reported_individually() {
        let root = temp_root("issues");
        let game = root.join("已有游戏");
        fs::create_dir_all(&game).expect("应能创建游戏目录");
        let unsupported = root.join("readme.txt");
        fs::write(&unsupported, []).expect("应能创建普通文件");
        let existing = HashSet::from([game.to_string_lossy().into_owned()]);

        let result = resolve_paths_blocking(
            vec![
                game.to_string_lossy().into_owned(),
                unsupported.to_string_lossy().into_owned(),
            ],
            existing,
            HashSet::new(),
        );

        assert!(result.candidates.is_empty());
        assert_eq!(result.issues.len(), 2);
        assert_eq!(
            result.issues[0].code,
            BulkImportPathIssueCode::AlreadyInLibrary
        );
        assert_eq!(
            result.issues[1].code,
            BulkImportPathIssueCode::UnsupportedPath
        );
        fs::remove_dir_all(root).expect("应能清理测试目录");
    }
}
