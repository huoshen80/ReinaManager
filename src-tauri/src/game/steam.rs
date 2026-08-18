//! 本机 Steam 启动目标扫描。

use crate::database::repository::games_repository::GamesRepository;
use crate::game::scan::ImportPathIndex;
use sea_orm::DatabaseConnection;
use serde::Serialize;
use std::collections::{BTreeMap, HashSet};
use std::fs;
use std::path::Path;
use steamlocate::{Library, SteamDir};
use tauri::{State, command};

const IGNORED_STEAM_APP_IDS: &[u32] = &[
    228_980,   // Steamworks Common Redistributables
    1_070_560, // Steam Linux Runtime 1.0 (scout)
    1_391_110, // Steam Linux Runtime 2.0 (soldier)
    1_628_350, // Steam Linux Runtime 3.0 (sniper)
    4_183_110, // Steam Linux Runtime 4.0
    4_185_400, // Steam Linux Runtime 4.0 - Arm64
    4_690_330, // Legacy Steam Runtime
    858_280,   // Proton 3.7
    961_940,   // Proton 3.16
    1_054_830, // Proton 4.2
    1_113_280, // Proton 4.11
    1_245_040, // Proton 5.0
    1_420_170, // Proton 5.13
    1_493_710, // Proton Experimental
    1_580_130, // Proton 6.3
    1_887_720, // Proton 7.0
    2_188_100, // Proton Hotfix
    2_348_590, // Proton 8.0
    2_805_730, // Proton 9.0
    3_658_110, // Proton 10.0
    4_628_710, // Proton 11.0
    4_628_740, // Proton 11.0 (ARM64)
    1_161_040, // Proton BattlEye Runtime
    1_826_330, // Proton EasyAntiCheat Runtime
];
const STEAM_SHORTCUT_MARKER: u64 = 0x0200_0000;
const MAX_BINARY_VDF_DEPTH: usize = 64;

#[derive(Default)]
struct SteamImportFilter {
    paths: ImportPathIndex,
    launch_ids: HashSet<String>,
}

impl SteamImportFilter {
    fn contains(&self, candidate: &SteamLaunchTarget) -> bool {
        if self.launch_ids.contains(&candidate.steam_launch_id) {
            return true;
        }

        // SteamRoot 来自 manifest 的明确安装边界；已有路径位于其内部时属于同一安装。
        candidate
            .localpath
            .as_deref()
            .is_some_and(|localpath| self.paths.has_imported_path_within(Path::new(localpath)))
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct SteamLaunchTarget {
    pub steam_launch_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub localpath: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executable: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct SteamLaunchTargetScanResult {
    pub targets: Vec<SteamLaunchTarget>,
    pub warnings: Vec<String>,
}

fn normalized_path_key(path: &Path) -> String {
    let normalized = fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let key = normalized.to_string_lossy().replace('\\', "/");
    #[cfg(target_os = "windows")]
    return key.to_lowercase();
    #[cfg(not(target_os = "windows"))]
    key
}

fn locate_steam_dirs() -> Result<Vec<SteamDir>, String> {
    let dirs =
        steamlocate::locate_all().map_err(|error| format!("未找到 Steam 安装目录: {error}"))?;
    let dirs = dirs
        .into_iter()
        .filter(|dir| dir.path().join("steamapps").is_dir() || dir.path().join("userdata").is_dir())
        .collect::<Vec<_>>();
    if dirs.is_empty() {
        Err("未找到 Steam 安装目录".to_string())
    } else {
        Ok(dirs)
    }
}

fn steam_libraries(steam_dir: &SteamDir, warnings: &mut Vec<String>) -> Vec<Library> {
    let mut libraries = Vec::new();
    match steam_dir.libraries() {
        Ok(found) => {
            // libraryfolders.vdf 会保留已移除磁盘；无法访问的候选库直接忽略。
            libraries.extend(found.filter_map(Result::ok));
        }
        Err(error) => warnings.push(format!(
            "解析 {} 失败: {error}",
            steam_dir
                .path()
                .join("steamapps")
                .join("libraryfolders.vdf")
                .display()
        )),
    }

    if !libraries
        .iter()
        .any(|library| normalized_path_key(library.path()) == normalized_path_key(steam_dir.path()))
        && let Ok(default_library) = Library::from_dir(steam_dir.path())
    {
        libraries.push(default_library);
    }

    libraries.sort_by_cached_key(|library| normalized_path_key(library.path()));
    libraries.dedup_by(|left, right| {
        normalized_path_key(left.path()) == normalized_path_key(right.path())
    });
    libraries
}

fn app_target(app: &steamlocate::App, library: &Library) -> Result<SteamLaunchTarget, String> {
    if app.app_id == 0 {
        return Err("应用清单 appid 必须大于 0".to_string());
    }
    let name = app
        .name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "应用清单缺少游戏名称".to_string())?;
    if app.install_dir.trim().is_empty() {
        return Err("应用清单缺少 installdir".to_string());
    }

    Ok(SteamLaunchTarget {
        steam_launch_id: app.app_id.to_string(),
        name: name.to_string(),
        localpath: Some(library.resolve_app_dir(app).to_string_lossy().into_owned()),
        executable: None,
    })
}

#[derive(Clone, Debug)]
enum BinaryVdfValue {
    String(String),
    U32(u32),
    U64,
    Object(BTreeMap<String, BinaryVdfValue>),
}

struct BinaryVdfCursor<'a> {
    bytes: &'a [u8],
    position: usize,
}

impl<'a> BinaryVdfCursor<'a> {
    fn new(bytes: &'a [u8]) -> Self {
        Self { bytes, position: 0 }
    }

    fn is_empty(&self) -> bool {
        self.position >= self.bytes.len()
    }

    fn read_u8(&mut self) -> Result<u8, String> {
        let value = *self
            .bytes
            .get(self.position)
            .ok_or_else(|| "二进制 VDF 意外结束".to_string())?;
        self.position += 1;
        Ok(value)
    }

    fn read_exact<const SIZE: usize>(&mut self) -> Result<[u8; SIZE], String> {
        let end = self
            .position
            .checked_add(SIZE)
            .ok_or_else(|| "二进制 VDF 偏移溢出".to_string())?;
        let bytes = self
            .bytes
            .get(self.position..end)
            .ok_or_else(|| "二进制 VDF 意外结束".to_string())?;
        self.position = end;
        bytes
            .try_into()
            .map_err(|_| "二进制 VDF 字段长度无效".to_string())
    }

    fn read_u32(&mut self) -> Result<u32, String> {
        Ok(u32::from_le_bytes(self.read_exact()?))
    }

    fn read_u64(&mut self) -> Result<u64, String> {
        Ok(u64::from_le_bytes(self.read_exact()?))
    }

    fn read_cstring(&mut self) -> Result<String, String> {
        let remaining = &self.bytes[self.position..];
        let length = remaining
            .iter()
            .position(|byte| *byte == 0)
            .ok_or_else(|| "二进制 VDF 字符串缺少终止符".to_string())?;
        let value = String::from_utf8_lossy(&remaining[..length]).into_owned();
        self.position += length + 1;
        Ok(value)
    }

    fn skip_wstring(&mut self) -> Result<(), String> {
        loop {
            if self.read_exact::<2>()? == [0, 0] {
                return Ok(());
            }
        }
    }

    fn skip(&mut self, length: usize) -> Result<(), String> {
        let end = self
            .position
            .checked_add(length)
            .ok_or_else(|| "二进制 VDF 偏移溢出".to_string())?;
        if end > self.bytes.len() {
            return Err("二进制 VDF 意外结束".to_string());
        }
        self.position = end;
        Ok(())
    }
}

fn parse_binary_vdf_object(
    cursor: &mut BinaryVdfCursor<'_>,
    depth: usize,
) -> Result<BTreeMap<String, BinaryVdfValue>, String> {
    if depth > MAX_BINARY_VDF_DEPTH {
        return Err("二进制 VDF 嵌套层级过深".to_string());
    }

    let mut values = BTreeMap::new();
    while !cursor.is_empty() {
        let value_type = cursor.read_u8()?;
        if value_type == 8 {
            return Ok(values);
        }
        let key = cursor.read_cstring()?;
        let value = match value_type {
            0 => BinaryVdfValue::Object(parse_binary_vdf_object(cursor, depth + 1)?),
            1 => BinaryVdfValue::String(cursor.read_cstring()?),
            2 => BinaryVdfValue::U32(cursor.read_u32()?),
            3 | 4 | 6 => {
                cursor.skip(4)?;
                continue;
            }
            5 => {
                cursor.skip_wstring()?;
                continue;
            }
            7 => {
                let _ = cursor.read_u64()?;
                BinaryVdfValue::U64
            }
            10 => {
                cursor.skip(8)?;
                continue;
            }
            other => return Err(format!("不支持的二进制 VDF 类型: {other}")),
        };
        values.insert(key, value);
    }
    Err("二进制 VDF 对象缺少结束标记".to_string())
}

fn parse_binary_vdf(bytes: &[u8]) -> Result<BTreeMap<String, BinaryVdfValue>, String> {
    if bytes.is_empty() {
        return Err("shortcuts.vdf 为空".to_string());
    }
    let mut cursor = BinaryVdfCursor::new(bytes);
    let root = parse_binary_vdf_object(&mut cursor, 0)?;
    if !cursor.is_empty() {
        return Err("二进制 VDF 根对象结束后存在多余数据".to_string());
    }
    Ok(root)
}

fn binary_value_at<'a>(
    object: &'a BTreeMap<String, BinaryVdfValue>,
    key: &str,
) -> Option<&'a BinaryVdfValue> {
    object
        .iter()
        .find(|(candidate, _)| candidate.eq_ignore_ascii_case(key))
        .map(|(_, value)| value)
}

fn binary_string_at<'a>(
    object: &'a BTreeMap<String, BinaryVdfValue>,
    key: &str,
) -> Option<&'a str> {
    match binary_value_at(object, key) {
        Some(BinaryVdfValue::String(value)) => Some(value),
        _ => None,
    }
}

fn strip_outer_quotes(value: &str) -> Option<String> {
    let value = value.trim();
    let value = value
        .strip_prefix('"')
        .and_then(|value| value.strip_suffix('"'))
        .unwrap_or(value)
        .trim();
    (!value.is_empty()).then(|| value.to_string())
}

fn lexical_file_name(path: &str) -> Option<String> {
    path.rsplit(['/', '\\'])
        .next()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned)
}

fn lexical_parent(path: &str) -> Option<String> {
    let (index, separator) = path
        .char_indices()
        .rev()
        .find(|(_, character)| matches!(character, '/' | '\\'))?;
    let end = if index == 0
        || index == 2
            && path.as_bytes().first().is_some_and(u8::is_ascii_alphabetic)
            && path.as_bytes().get(1) == Some(&b':')
    {
        index + separator.len_utf8()
    } else {
        index
    };
    let parent = path[..end].trim_end_matches([' ', '\t']);
    (!parent.is_empty()).then(|| parent.to_string())
}

fn shortcut_launch_id(shortcut_app_id: u32) -> String {
    ((u64::from(shortcut_app_id) << 32) | STEAM_SHORTCUT_MARKER).to_string()
}

fn parse_shortcuts_vdf(path: &Path) -> Result<(Vec<SteamLaunchTarget>, Vec<String>), String> {
    let bytes = fs::read(path).map_err(|error| format!("读取 {} 失败: {error}", path.display()))?;
    let root = parse_binary_vdf(&bytes)
        .map_err(|error| format!("解析 {} 失败: {error}", path.display()))?;
    let shortcuts = match binary_value_at(&root, "shortcuts") {
        Some(BinaryVdfValue::Object(shortcuts)) => shortcuts,
        _ => return Err(format!("{} 缺少 shortcuts 根节点", path.display())),
    };

    let mut entries = shortcuts.iter().collect::<Vec<_>>();
    entries.sort_by_cached_key(|(index, _)| index.parse::<u64>().unwrap_or(u64::MAX));
    let mut games = Vec::new();
    let mut warnings = Vec::new();
    for (index, value) in entries {
        let BinaryVdfValue::Object(shortcut) = value else {
            warnings.push(format!("{} 的快捷方式 {index} 不是对象", path.display()));
            continue;
        };
        let shortcut_app_id = match binary_value_at(shortcut, "appid") {
            Some(BinaryVdfValue::U32(app_id)) if *app_id != 0 => *app_id,
            _ => {
                warnings.push(format!(
                    "{} 的快捷方式 {index} 缺少有效 appid",
                    path.display()
                ));
                continue;
            }
        };
        let name = match binary_string_at(shortcut, "appname")
            .map(str::trim)
            .filter(|name| !name.is_empty())
        {
            Some(name) => name.to_string(),
            None => {
                warnings.push(format!(
                    "{} 的快捷方式 {index} 缺少游戏名称",
                    path.display()
                ));
                continue;
            }
        };
        let executable_path = binary_string_at(shortcut, "exe").and_then(strip_outer_quotes);
        let start_dir = binary_string_at(shortcut, "StartDir").and_then(strip_outer_quotes);
        let localpath = start_dir.or_else(|| executable_path.as_deref().and_then(lexical_parent));
        let executable = executable_path.as_deref().and_then(lexical_file_name);

        games.push(SteamLaunchTarget {
            steam_launch_id: shortcut_launch_id(shortcut_app_id),
            name,
            localpath,
            executable,
        });
    }
    Ok((games, warnings))
}

fn insert_candidate(
    games: &mut BTreeMap<String, (SteamLaunchTarget, String)>,
    conflicted_launch_ids: &mut HashSet<String>,
    candidate: SteamLaunchTarget,
    source: String,
    warnings: &mut Vec<String>,
) {
    if conflicted_launch_ids.contains(&candidate.steam_launch_id) {
        return;
    }
    if let Some((existing, existing_source)) = games.get(&candidate.steam_launch_id) {
        if existing != &candidate {
            warnings.push(format!(
                "Steam 启动项 {} 在 {} 与 {} 中信息冲突，已跳过",
                candidate.steam_launch_id, existing_source, source
            ));
            games.remove(&candidate.steam_launch_id);
            conflicted_launch_ids.insert(candidate.steam_launch_id);
        }
        return;
    }
    games.insert(candidate.steam_launch_id.clone(), (candidate, source));
}

fn has_monitor_directory(
    candidate: &SteamLaunchTarget,
    source: &Path,
    warnings: &mut Vec<String>,
) -> bool {
    let Some(localpath) = candidate
        .localpath
        .as_deref()
        .map(str::trim)
        .filter(|path| !path.is_empty())
    else {
        warnings.push(format!(
            "{} 的启动项 {} 缺少可监控目录，已跳过",
            source.display(),
            candidate.steam_launch_id
        ));
        return false;
    };
    if !Path::new(localpath).is_dir() {
        warnings.push(format!(
            "{} 的启动项 {} 对应目录不存在，已跳过: {}",
            source.display(),
            candidate.steam_launch_id,
            localpath
        ));
        return false;
    }
    true
}

fn scan_steam_dirs(
    steam_dirs: &[SteamDir],
    existing_games: &SteamImportFilter,
) -> SteamLaunchTargetScanResult {
    let mut warnings = Vec::new();
    let mut candidates = BTreeMap::new();
    let mut conflicted_launch_ids = HashSet::new();

    for steam_dir in steam_dirs {
        for library in steam_libraries(steam_dir, &mut warnings) {
            for app in library.apps() {
                match app {
                    Ok(app) => {
                        if IGNORED_STEAM_APP_IDS.contains(&app.app_id) {
                            continue;
                        }
                        let manifest = library
                            .path()
                            .join("steamapps")
                            .join(format!("appmanifest_{}.acf", app.app_id));
                        match app_target(&app, &library) {
                            Ok(candidate) => {
                                if !has_monitor_directory(&candidate, &manifest, &mut warnings) {
                                    continue;
                                }
                                if existing_games.contains(&candidate) {
                                    continue;
                                }
                                insert_candidate(
                                    &mut candidates,
                                    &mut conflicted_launch_ids,
                                    candidate,
                                    manifest.display().to_string(),
                                    &mut warnings,
                                );
                            }
                            Err(error) => warnings.push(format!(
                                "解析 Steam 应用清单 {} 失败: {error}",
                                manifest.display()
                            )),
                        }
                    }
                    Err(error) => warnings.push(format!(
                        "解析 {} 中的 Steam 应用清单失败: {error}",
                        library.path().join("steamapps").display()
                    )),
                }
            }
        }

        let userdata = steam_dir.path().join("userdata");
        match fs::read_dir(&userdata) {
            Ok(entries) => {
                let mut shortcut_files = entries
                    .filter_map(Result::ok)
                    .map(|entry| entry.path().join("config").join("shortcuts.vdf"))
                    .filter(|path| path.is_file())
                    .collect::<Vec<_>>();
                shortcut_files.sort_by_cached_key(|path| normalized_path_key(path));
                for shortcut_file in shortcut_files {
                    match parse_shortcuts_vdf(&shortcut_file) {
                        Ok((games, file_warnings)) => {
                            warnings.extend(file_warnings);
                            for game in games {
                                if !has_monitor_directory(&game, &shortcut_file, &mut warnings) {
                                    continue;
                                }
                                if existing_games.contains(&game) {
                                    continue;
                                }
                                insert_candidate(
                                    &mut candidates,
                                    &mut conflicted_launch_ids,
                                    game,
                                    shortcut_file.display().to_string(),
                                    &mut warnings,
                                );
                            }
                        }
                        Err(error) => warnings.push(error),
                    }
                }
            }
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
            Err(error) => warnings.push(format!("读取 {} 失败: {error}", userdata.display())),
        }
    }

    let mut games = candidates
        .into_values()
        .map(|(candidate, _)| candidate)
        .collect::<Vec<_>>();
    games.sort_by_cached_key(|game| (game.name.to_lowercase(), game.steam_launch_id.clone()));
    SteamLaunchTargetScanResult {
        targets: games,
        warnings,
    }
}

fn decode_shortcut_text(bytes: &[u8]) -> Result<String, String> {
    if let Some(bytes) = bytes.strip_prefix(&[0xEF, 0xBB, 0xBF]) {
        return String::from_utf8(bytes.to_vec())
            .map_err(|error| format!("快捷方式不是有效 UTF-8: {error}"));
    }
    if let Some(bytes) = bytes.strip_prefix(&[0xFF, 0xFE]) {
        if bytes.len() % 2 != 0 {
            return Err("UTF-16LE 快捷方式字节长度无效".to_string());
        }
        let words = bytes
            .chunks_exact(2)
            .map(|bytes| u16::from_le_bytes([bytes[0], bytes[1]]));
        return char::decode_utf16(words)
            .collect::<Result<String, _>>()
            .map_err(|error| format!("快捷方式不是有效 UTF-16LE: {error}"));
    }
    // Windows 也会生成无 BOM 的系统 ANSI `.url`；URL 键本身是 ASCII，
    // 因此损失替换其它本地化字段不会影响后续严格 URI 校验。
    Ok(String::from_utf8_lossy(bytes).into_owned())
}

fn parse_url_launch_id(text: &str) -> Result<String, String> {
    let mut in_internet_shortcut = false;
    let mut shortcut_url = None;
    for line in text.lines() {
        let line = line.trim();
        if line.starts_with('[') && line.ends_with(']') {
            in_internet_shortcut = line[1..line.len() - 1]
                .trim()
                .eq_ignore_ascii_case("InternetShortcut");
            continue;
        }
        if !in_internet_shortcut {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        if key.trim().eq_ignore_ascii_case("URL") {
            shortcut_url = Some(value.trim());
            break;
        }
    }
    let shortcut_url = shortcut_url.ok_or_else(|| "快捷方式缺少 URL".to_string())?;
    const PREFIX: &str = "steam://rungameid/";
    let Some(prefix) = shortcut_url.get(..PREFIX.len()) else {
        return Err("仅支持 steam://rungameid/<数字> 快捷方式".to_string());
    };
    if !prefix.eq_ignore_ascii_case(PREFIX) {
        return Err("仅支持 steam://rungameid/<数字> 快捷方式".to_string());
    }
    let id = &shortcut_url[PREFIX.len()..];
    if id.is_empty() || !id.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err("Steam 快捷方式 URL 格式无效".to_string());
    }
    let id = id
        .parse::<u64>()
        .map_err(|_| "Steam 启动 ID 超出 u64 范围".to_string())?;
    if id == 0 {
        return Err("Steam 启动 ID 必须大于 0".to_string());
    }
    Ok(id.to_string())
}

fn resolve_steam_shortcut_file_blocking(path: &Path) -> Result<SteamLaunchTarget, String> {
    if !path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("url"))
    {
        return Err("仅支持 .url Steam 快捷方式".to_string());
    }
    let bytes = fs::read(path).map_err(|error| format!("读取 {} 失败: {error}", path.display()))?;
    let launch_id = parse_url_launch_id(&decode_shortcut_text(&bytes)?)?;
    let steam_dirs = locate_steam_dirs()?;
    scan_steam_dirs(&steam_dirs, &SteamImportFilter::default())
        .targets
        .into_iter()
        .find(|candidate| candidate.steam_launch_id == launch_id)
        .ok_or_else(|| format!("本机 Steam 库中未找到启动项 {launch_id}"))
}

/// 批量解析 Steam `.url`，只扫描一次本机 Steam 库。
pub(crate) fn resolve_steam_shortcut_files_blocking(
    paths: &[&Path],
) -> Vec<Result<SteamLaunchTarget, String>> {
    let launch_ids = paths
        .iter()
        .map(|path| {
            if !path
                .extension()
                .is_some_and(|extension| extension.eq_ignore_ascii_case("url"))
            {
                return Err("仅支持 .url Steam 快捷方式".to_string());
            }
            let bytes =
                fs::read(path).map_err(|error| format!("读取 {} 失败: {error}", path.display()))?;
            parse_url_launch_id(&decode_shortcut_text(&bytes)?)
        })
        .collect::<Vec<_>>();

    if !launch_ids.iter().any(Result::is_ok) {
        return launch_ids
            .into_iter()
            .map(|result| match result {
                Err(error) => Err(error),
                Ok(_) => unreachable!("前置检查已确认没有成功解析的启动 ID"),
            })
            .collect();
    }

    let targets = locate_steam_dirs()
        .map(|dirs| scan_steam_dirs(&dirs, &SteamImportFilter::default()).targets)
        .map(|targets| {
            targets
                .into_iter()
                .map(|target| (target.steam_launch_id.clone(), target))
                .collect::<BTreeMap<_, _>>()
        });

    launch_ids
        .into_iter()
        .map(|launch_id| {
            let launch_id = launch_id?;
            let targets = targets.as_ref().map_err(Clone::clone)?;
            targets
                .get(&launch_id)
                .cloned()
                .ok_or_else(|| format!("本机 Steam 库中未找到启动项 {launch_id}"))
        })
        .collect()
}

#[command]
pub async fn scan_steam_launch_targets(
    db: State<'_, DatabaseConnection>,
    exclude_existing: bool,
) -> Result<SteamLaunchTargetScanResult, String> {
    let existing_games = if exclude_existing {
        let existing_game_directories = GamesRepository::get_all_game_directories(&db)
            .await
            .map_err(|error| format!("查询已有路径失败: {error}"))?;
        let existing_steam_launch_ids = GamesRepository::get_all_steam_launch_ids(&db)
            .await
            .map_err(|error| format!("查询已有 Steam 启动 ID 失败: {error}"))?;
        SteamImportFilter {
            paths: ImportPathIndex::from_paths(existing_game_directories),
            launch_ids: existing_steam_launch_ids,
        }
    } else {
        SteamImportFilter::default()
    };

    tokio::task::spawn_blocking(move || {
        locate_steam_dirs().map(|dirs| scan_steam_dirs(&dirs, &existing_games))
    })
    .await
    .map_err(|error| format!("Steam 扫描任务异常: {error}"))?
}

#[command]
pub async fn resolve_steam_shortcut_file(path: String) -> Result<SteamLaunchTarget, String> {
    tokio::task::spawn_blocking(move || resolve_steam_shortcut_file_blocking(Path::new(&path)))
        .await
        .map_err(|error| format!("Steam 快捷方式解析任务异常: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn push_cstring(bytes: &mut Vec<u8>, value: &str) {
        bytes.extend_from_slice(value.as_bytes());
        bytes.push(0);
    }

    fn push_object(bytes: &mut Vec<u8>, key: &str) {
        bytes.push(0);
        push_cstring(bytes, key);
    }

    fn push_string(bytes: &mut Vec<u8>, key: &str, value: &str) {
        bytes.push(1);
        push_cstring(bytes, key);
        push_cstring(bytes, value);
    }

    fn push_u32(bytes: &mut Vec<u8>, key: &str, value: u32) {
        bytes.push(2);
        push_cstring(bytes, key);
        bytes.extend_from_slice(&value.to_le_bytes());
    }

    fn push_wstring(bytes: &mut Vec<u8>, key: &str, value: &str) {
        bytes.push(5);
        push_cstring(bytes, key);
        bytes.extend_from_slice(&[0xFF, 0xFE]);
        bytes.extend(value.encode_utf16().flat_map(u16::to_le_bytes));
        bytes.extend_from_slice(&[0, 0]);
    }

    fn shortcut_fixture(app_id: u32, name: &str, exe: &str, start_dir: &str) -> Vec<u8> {
        let mut bytes = Vec::new();
        push_object(&mut bytes, "shortcuts");
        push_object(&mut bytes, "0");
        push_wstring(&mut bytes, "WideIgnored", "测试");
        push_u32(&mut bytes, "appid", app_id);
        push_string(&mut bytes, "AppName", name);
        push_string(&mut bytes, "Exe", exe);
        push_string(&mut bytes, "StartDir", start_dir);
        push_object(&mut bytes, "tags");
        push_string(&mut bytes, "0", "视觉小说");
        bytes.extend_from_slice(&[8, 8, 8, 8]);
        bytes
    }

    fn extract_shortcut(bytes: &[u8]) -> SteamLaunchTarget {
        let root = parse_binary_vdf(bytes).unwrap();
        let BinaryVdfValue::Object(shortcuts) = binary_value_at(&root, "shortcuts").unwrap() else {
            panic!("shortcuts 根节点类型错误");
        };
        let BinaryVdfValue::Object(shortcut) = shortcuts.get("0").unwrap() else {
            panic!("快捷方式类型错误");
        };
        let BinaryVdfValue::U32(app_id) = binary_value_at(shortcut, "appid").unwrap() else {
            panic!("appid 类型错误");
        };
        let executable_path = binary_string_at(shortcut, "exe").and_then(strip_outer_quotes);
        SteamLaunchTarget {
            steam_launch_id: shortcut_launch_id(*app_id),
            name: binary_string_at(shortcut, "appname").unwrap().to_string(),
            localpath: binary_string_at(shortcut, "StartDir").and_then(strip_outer_quotes),
            executable: executable_path.as_deref().and_then(lexical_file_name),
        }
    }

    #[test]
    fn skips_library_entries_whose_steamapps_directory_is_missing() {
        let root = std::env::temp_dir().join(format!(
            "reina-steam-library-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let valid_library = root.join("valid-library");
        let stale_library = root.join("missing-library");
        fs::create_dir_all(root.join("steamapps")).unwrap();
        fs::create_dir_all(valid_library.join("steamapps")).unwrap();
        fs::create_dir_all(
            valid_library
                .join("steamapps")
                .join("common")
                .join("Test Game"),
        )
        .unwrap();
        let ignored_apps = [
            (
                228_980,
                "Steamworks Common Redistributables",
                "Steamworks Shared",
            ),
            (1_070_560, "Steam Linux Runtime 1.0 (scout)", "SteamLinuxRuntime"),
            (
                1_391_110,
                "Steam Linux Runtime 2.0 (soldier)",
                "SteamLinuxRuntime_soldier",
            ),
            (
                1_628_350,
                "Steam Linux Runtime 3.0 (sniper)",
                "SteamLinuxRuntime_sniper",
            ),
            (4_183_110, "Steam Linux Runtime 4.0", "SteamLinuxRuntime_4"),
            (
                4_185_400,
                "Steam Linux Runtime 4.0 - Arm64",
                "SteamLinuxRuntime_4_arm64",
            ),
            (4_690_330, "Legacy Steam Runtime", "LegacySteamRuntime"),
            (858_280, "Proton 3.7", "Proton 3.7"),
            (961_940, "Proton 3.16", "Proton 3.16"),
            (1_054_830, "Proton 4.2", "Proton 4.2"),
            (1_113_280, "Proton 4.11", "Proton 4.11"),
            (1_245_040, "Proton 5.0", "Proton 5.0"),
            (1_420_170, "Proton 5.13", "Proton 5.13"),
            (1_493_710, "Proton Experimental", "Proton - Experimental"),
            (1_580_130, "Proton 6.3", "Proton 6.3"),
            (1_887_720, "Proton 7.0", "Proton 7.0"),
            (2_188_100, "Proton Hotfix", "Proton Hotfix"),
            (2_348_590, "Proton 8.0", "Proton 8.0"),
            (2_805_730, "Proton 9.0", "Proton 9.0"),
            (3_658_110, "Proton 10.0", "Proton 10.0"),
            (4_628_710, "Proton 11.0", "Proton 11.0"),
            (4_628_740, "Proton 11.0 (ARM64)", "Proton 11.0 (ARM64)"),
            (
                1_161_040,
                "Proton BattlEye Runtime",
                "Proton BattlEye Runtime",
            ),
            (
                1_826_330,
                "Proton EasyAntiCheat Runtime",
                "Proton EasyAntiCheat Runtime",
            ),
        ];
        for (_, _, install_dir) in ignored_apps {
            fs::create_dir_all(
                valid_library
                    .join("steamapps")
                    .join("common")
                    .join(install_dir),
            )
            .unwrap();
        }

        let vdf_path = root.join("steamapps").join("libraryfolders.vdf");
        let valid_path = valid_library.to_string_lossy().replace('\\', "/");
        let stale_path = stale_library.to_string_lossy().replace('\\', "/");
        fs::write(
            vdf_path,
            format!(
                r#""libraryfolders"
                {{
                    "0" {{ "path" "{}" }}
                    "1" {{ "path" "{}" }}
                    "2" {{ "path" "{}" }}
                }}"#,
                root.to_string_lossy().replace('\\', "/"),
                valid_path,
                stale_path,
            ),
        )
        .unwrap();
        fs::write(
            valid_library.join("steamapps").join("appmanifest_730.acf"),
            r#""AppState"
            {
                "appid" "730"
                "name" "Test Game"
                "installdir" "Test Game"
            }"#,
        )
        .unwrap();
        for (app_id, name, install_dir) in ignored_apps {
            fs::write(
                valid_library
                    .join("steamapps")
                    .join(format!("appmanifest_{app_id}.acf")),
                format!(
                    r#""AppState"
            {{
                "appid" "{app_id}"
                "name" "{name}"
                "installdir" "{install_dir}"
            }}"#
                ),
            )
            .unwrap();
        }

        let steam_dir = SteamDir::from_dir(&root).unwrap();
        let result = scan_steam_dirs(&[steam_dir], &SteamImportFilter::default());
        assert_eq!(result.targets.len(), 1);
        assert_eq!(result.targets[0].steam_launch_id, "730");
        assert_eq!(result.targets[0].name, "Test Game");
        assert!(
            !result
                .warnings
                .iter()
                .any(|warning| warning.contains(&stale_path))
        );

        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn import_filter_matches_existing_steam_id_and_path() {
        let steam_root = std::env::temp_dir().join("reina-existing-steam-game");
        let existing_path = steam_root.join("Build").join("Game");
        let filter = SteamImportFilter {
            paths: ImportPathIndex::from_paths([existing_path.to_string_lossy().into_owned()]),
            launch_ids: HashSet::from(["730".to_string()]),
        };
        let same_id = SteamLaunchTarget {
            steam_launch_id: "730".to_string(),
            name: "Same ID".to_string(),
            localpath: Some("different-path".to_string()),
            executable: Some("game.exe".to_string()),
        };
        let same_path = SteamLaunchTarget {
            steam_launch_id: "440".to_string(),
            name: "Same Path".to_string(),
            localpath: Some(steam_root.to_string_lossy().into_owned()),
            executable: None,
        };
        let new_game = SteamLaunchTarget {
            steam_launch_id: "570".to_string(),
            name: "New Game".to_string(),
            localpath: Some("new-path".to_string()),
            executable: None,
        };

        assert!(filter.contains(&same_id));
        assert!(filter.contains(&same_path));
        assert!(!filter.contains(&new_game));
    }

    #[test]
    fn parses_binary_shortcut_with_unsigned_app_id_and_split_path() {
        let app_id = 0xF123_4567;
        let candidate = extract_shortcut(&shortcut_fixture(
            app_id,
            "测试游戏",
            r#""D:\Games\Test\game.exe""#,
            r#""D:\Games\Test""#,
        ));
        assert_eq!(
            candidate.steam_launch_id,
            ((u64::from(app_id) << 32) | STEAM_SHORTCUT_MARKER).to_string()
        );
        assert_eq!(candidate.name, "测试游戏");
        assert_eq!(candidate.localpath.as_deref(), Some(r"D:\Games\Test"));
        assert_eq!(candidate.executable.as_deref(), Some("game.exe"));
    }

    #[test]
    fn rejects_truncated_or_trailing_binary_vdf() {
        let fixture = shortcut_fixture(730, "Game", r#""D:\Game\game.exe""#, r#""D:\Game""#);
        assert!(parse_binary_vdf(&fixture[..fixture.len() - 1]).is_err());

        let mut trailing = fixture;
        trailing.push(0);
        assert!(parse_binary_vdf(&trailing).is_err());
    }

    #[test]
    fn derives_start_directory_from_executable_when_missing() {
        let executable = strip_outer_quotes(r#""D:\Games\Test\game.exe""#).unwrap();
        assert_eq!(
            lexical_parent(&executable).as_deref(),
            Some(r"D:\Games\Test")
        );
        assert_eq!(lexical_file_name(&executable).as_deref(), Some("game.exe"));
    }

    #[test]
    fn parses_utf8_bom_and_utf16le_shortcuts_strictly() {
        let content = "[InternetShortcut]\r\nURL=steam://rungameid/000730\r\n";
        let mut utf8 = vec![0xEF, 0xBB, 0xBF];
        utf8.extend_from_slice(content.as_bytes());
        assert_eq!(
            parse_url_launch_id(&decode_shortcut_text(&utf8).unwrap()).unwrap(),
            "730"
        );

        let mut utf16 = vec![0xFF, 0xFE];
        utf16.extend(
            content
                .encode_utf16()
                .flat_map(u16::to_le_bytes)
                .collect::<Vec<_>>(),
        );
        assert_eq!(
            parse_url_launch_id(&decode_shortcut_text(&utf16).unwrap()).unwrap(),
            "730"
        );

        let ansi =
            b"[InternetShortcut]\r\nURL=steam://rungameid/730\r\nIconFile=\xD3\xCE\xCF\xB7.ico\r\n";
        assert_eq!(
            parse_url_launch_id(&decode_shortcut_text(ansi).unwrap()).unwrap(),
            "730"
        );

        for invalid in [
            "steam://rungameid/0",
            "steam://rungameid/730/",
            "steam://rungameid/730?x=1",
            "https://example.com/730",
            "这不是一个 Steam 快捷方式地址",
        ] {
            let text = format!("[InternetShortcut]\nURL={invalid}\n");
            assert!(parse_url_launch_id(&text).is_err(), "{invalid}");
        }
    }

    #[test]
    fn removes_ambiguous_duplicate_and_reports_conflicting_path() {
        let mut games = BTreeMap::new();
        let mut conflicted_launch_ids = HashSet::new();
        let mut warnings = Vec::new();
        let first = SteamLaunchTarget {
            steam_launch_id: "730".to_string(),
            name: "Game".to_string(),
            localpath: Some("first".to_string()),
            executable: None,
        };
        let mut second = first.clone();
        second.localpath = Some("second".to_string());
        insert_candidate(
            &mut games,
            &mut conflicted_launch_ids,
            first,
            "first.acf".to_string(),
            &mut warnings,
        );
        insert_candidate(
            &mut games,
            &mut conflicted_launch_ids,
            second,
            "second.acf".to_string(),
            &mut warnings,
        );

        assert!(!games.contains_key("730"));
        assert!(conflicted_launch_ids.contains("730"));
        assert_eq!(warnings.len(), 1);
    }
}
