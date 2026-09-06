use crate::install::protocol::validate_safe_relative_path;
use std::collections::HashSet;
use std::ffi::OsStr;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use tauri::Manager;
use walkdir::WalkDir;

pub fn extract_archive(
    app: &tauri::AppHandle,
    archive_path: &Path,
    archive_format: &str,
    archive_password: Option<&str>,
    staging: &Path,
) -> Result<(), ArchiveError> {
    let seven_zip = resolve_seven_zip(app)?;
    if archive_format.starts_with("tar.") {
        let wrapper = archive_wrapper_directory(staging);
        let extraction = (|| -> Result<(), ArchiveError> {
            create_clean_directory(&wrapper)?;
            preflight_archive(&seven_zip, archive_path, archive_password)?;
            run_extract(&seven_zip, archive_path, archive_password, &wrapper)?;
            audit_extracted_tree(&wrapper)?;

            let files = WalkDir::new(&wrapper)
                .follow_links(false)
                .into_iter()
                .filter_map(Result::ok)
                .filter(|entry| entry.file_type().is_file())
                .map(|entry| entry.into_path())
                .collect::<Vec<_>>();
            if files.len() != 1 {
                return Err(ArchiveError::Other(
                    "TAR 压缩变体的外层必须只包含一个 TAR 文件".to_string(),
                ));
            }

            create_clean_directory(staging)?;
            preflight_archive(&seven_zip, &files[0], archive_password)?;
            run_extract(&seven_zip, &files[0], archive_password, staging)
        })();
        let cleanup = remove_scoped_directory(
            wrapper
                .parent()
                .ok_or_else(|| "无法解析 TAR 临时目录".to_string())?,
            &wrapper,
        );
        extraction?;
        cleanup?;
    } else {
        create_clean_directory(staging)?;
        preflight_archive(&seven_zip, archive_path, archive_password)?;
        run_extract(&seven_zip, archive_path, archive_password, staging)?;
    }

    audit_extracted_tree(staging).map_err(ArchiveError::from)
}

#[derive(Debug)]
pub enum ArchiveError {
    PasswordRequired,
    InvalidPassword,
    Other(String),
}

impl From<String> for ArchiveError {
    fn from(message: String) -> Self {
        Self::Other(message)
    }
}

pub fn archive_wrapper_directory(staging: &Path) -> PathBuf {
    staging.with_extension("wrapper")
}

pub fn collapse_single_directory_layers(path: &Path) -> Result<PathBuf, String> {
    let mut current = path.to_path_buf();
    loop {
        let entries = fs::read_dir(&current)
            .map_err(|error| format!("读取解压目录失败 {}: {error}", current.display()))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("读取解压目录项失败: {error}"))?;
        if entries.len() != 1 {
            return Ok(current);
        }

        let entry = &entries[0];
        let metadata = fs::symlink_metadata(entry.path())
            .map_err(|error| format!("读取目录项属性失败: {error}"))?;
        if !metadata.is_dir() || metadata.file_type().is_symlink() {
            return Ok(current);
        }
        current = entry.path();
    }
}

pub fn move_game_root(
    source_root: &Path,
    install_root: &Path,
    directory_name: &str,
    task_id: i64,
) -> Result<PathBuf, String> {
    fs::create_dir_all(install_root)
        .map_err(|error| format!("创建游戏安装根目录失败 {}: {error}", install_root.display()))?;
    if !install_root.is_dir() {
        return Err("游戏安装根路径不是目录".to_string());
    }

    let base_name = sanitize_directory_name(directory_name, task_id);
    for suffix in 1..=10_000 {
        let name = if suffix == 1 {
            base_name.clone()
        } else {
            format!("{base_name} ({suffix})")
        };
        let destination = install_root.join(name);
        match fs::create_dir(&destination) {
            Ok(()) => match move_directory_contents(source_root, &destination) {
                Ok(()) => return Ok(destination),
                Err(error) => return Err(error),
            },
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => return Err(format!("创建正式游戏目录失败: {error}")),
        }
    }

    Err("无法生成不冲突的游戏目录名称".to_string())
}

fn resolve_seven_zip(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|error| format!("无法定位应用资源目录: {error}"))?;

    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    let relative = Path::new("tools/7zip/7z.exe");
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    let relative = Path::new("tools/7zip/7z.exe");
    #[cfg(all(target_os = "windows", target_arch = "x86"))]
    let relative = Path::new("tools/7zip/7z.exe");
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    let relative = Path::new("tools/7zip/7zz");
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    let relative = Path::new("tools/7zip/7zz");
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    let relative = Path::new("tools/7zip/7zz");
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    let relative = Path::new("tools/7zip/7zz");
    #[cfg(not(any(
        all(target_os = "windows", target_arch = "x86_64"),
        all(target_os = "windows", target_arch = "aarch64"),
        all(target_os = "windows", target_arch = "x86"),
        all(target_os = "linux", target_arch = "x86_64"),
        all(target_os = "linux", target_arch = "aarch64"),
        all(target_os = "macos", target_arch = "x86_64"),
        all(target_os = "macos", target_arch = "aarch64")
    )))]
    return Err("当前平台没有内置 7-Zip 程序".to_string());

    let path = resource_dir.join(relative);
    if !path.is_file() {
        return Err(format!("内置 7-Zip 程序不存在: {}", path.display()));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let metadata =
            fs::metadata(&path).map_err(|error| format!("读取内置 7-Zip 权限失败: {error}"))?;
        if metadata.permissions().mode() & 0o111 == 0 {
            let mut permissions = metadata.permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&path, permissions)
                .map_err(|error| format!("设置内置 7-Zip 执行权限失败: {error}"))?;
        }
    }
    Ok(path)
}

fn preflight_archive(
    seven_zip: &Path,
    archive_path: &Path,
    archive_password: Option<&str>,
) -> Result<(), ArchiveError> {
    let output = run_command(
        seven_zip,
        [
            OsStr::new("l"),
            OsStr::new("-slt"),
            OsStr::new("-ba"),
            OsStr::new("-sccUTF-8"),
            archive_path.as_os_str(),
        ],
        archive_password,
    )?;
    ensure_success("读取压缩包目录", &output, archive_password.is_some())?;
    let listing =
        String::from_utf8(output.stdout).map_err(|_| "7-Zip 未返回 UTF-8 目录信息".to_string())?;
    let mut entry_count = 0_usize;
    let mut entry_paths = HashSet::new();
    for line in listing.lines() {
        if let Some(path) = line.strip_prefix("Path = ") {
            validate_archive_entry(path)?;
            let normalized = path
                .trim_end_matches(['/', '\\'])
                .replace('\\', "/")
                .to_lowercase();
            if !normalized.is_empty() && !entry_paths.insert(normalized) {
                return Err(ArchiveError::Other(
                    "压缩包包含会互相覆盖的重复路径".to_string(),
                ));
            }
            entry_count += 1;
        }
        if let Some(target) = line.strip_prefix("Symbolic Link =")
            && !target.trim().is_empty()
        {
            return Err(ArchiveError::Other(
                "压缩包包含符号链接，已拒绝解压".to_string(),
            ));
        }

        if let Some(target) = line.strip_prefix("Hard Link =")
            && !target.trim().is_empty()
        {
            return Err(ArchiveError::Other(
                "压缩包包含硬链接，已拒绝解压".to_string(),
            ));
        }

        if let Some(attributes) = line.strip_prefix("Attributes = ") {
            let attributes = attributes.trim_start();
            if attributes.starts_with('l') || attributes.contains(" Reparse ") {
                return Err(ArchiveError::Other(
                    "压缩包包含链接或重解析点，已拒绝解压".to_string(),
                ));
            }
        }
    }
    if entry_count == 0 {
        return Err(ArchiveError::Other("压缩包为空或无法读取目录".to_string()));
    }
    Ok(())
}

fn validate_archive_entry(value: &str) -> Result<(), String> {
    let value = value.trim_end_matches(['/', '\\']);
    if value.is_empty() {
        return Ok(());
    }
    validate_safe_relative_path(value).map_err(|_| format!("压缩包包含不安全路径: {value}"))
}

fn run_extract(
    seven_zip: &Path,
    archive_path: &Path,
    archive_password: Option<&str>,
    output_dir: &Path,
) -> Result<(), ArchiveError> {
    let output_arg = format!("-o{}", output_dir.display());
    let output = run_command(
        seven_zip,
        [
            OsStr::new("x"),
            OsStr::new("-y"),
            OsStr::new("-aoa"),
            OsStr::new("-bd"),
            OsStr::new("-bb0"),
            OsStr::new("-sccUTF-8"),
            OsStr::new(&output_arg),
            archive_path.as_os_str(),
        ],
        archive_password,
    )?;
    ensure_success("解压", &output, archive_password.is_some())
}

fn run_command<'a>(
    executable: &Path,
    args: impl IntoIterator<Item = &'a OsStr>,
    archive_password: Option<&str>,
) -> Result<Output, String> {
    let mut command = Command::new(executable);
    command.args(args);
    command
        .env("LC_ALL", "C")
        .env("LANG", "C")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        use windows::Win32::System::Threading::CREATE_NO_WINDOW;
        command.creation_flags(CREATE_NO_WINDOW.0);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("启动内置 7-Zip 失败: {error}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(archive_password.unwrap_or_default().as_bytes());
        let _ = stdin.write_all(b"\n");
    }
    child
        .wait_with_output()
        .map_err(|error| format!("等待内置 7-Zip 结束失败: {error}"))
}

fn ensure_success(
    action: &str,
    output: &Output,
    supplied_password: bool,
) -> Result<(), ArchiveError> {
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    if is_password_failure(&stdout, &stderr) {
        return Err(if supplied_password {
            ArchiveError::InvalidPassword
        } else {
            ArchiveError::PasswordRequired
        });
    }
    // zstd 变体 7z 等非标准编解码器：字节完好但内置 7-Zip 解不开，重试无意义。
    if stderr.contains("Unsupported Method") || stdout.contains("Unsupported Method") {
        return Err(ArchiveError::Other(
            "压缩包使用了内置 7-Zip 不支持的压缩算法（常见于 zstd 变体 7z），请联系资源提供方改用标准压缩算法".to_string(),
        ));
    }
    // 任务错误里只放摘要，完整输出尾部进日志供排查。
    let tail: Vec<&str> = {
        let mut lines: Vec<&str> = stderr
            .lines()
            .chain(stdout.lines())
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .collect();
        lines.split_off(lines.len().saturating_sub(15))
    };
    log::error!(
        "7-Zip {action}失败（退出码 {}），输出尾部:\n{}",
        output.status.code().unwrap_or(-1),
        tail.join("\n")
    );
    // 末行往往只是错误计数汇总；一并带上前几条具体错误，便于区分磁盘空间、
    // 路径、数据损坏等不同原因。
    let mut details: Vec<&str> = stderr
        .lines()
        .chain(stdout.lines())
        .map(str::trim)
        .filter(|line| line.starts_with("ERROR"))
        .take(3)
        .collect();
    if let Some(summary) = stderr
        .lines()
        .chain(stdout.lines())
        .rev()
        .map(str::trim)
        .find(|line| !line.is_empty())
        && !details.contains(&summary)
    {
        details.push(summary);
    }
    let detail = if details.is_empty() {
        "未知错误".to_string()
    } else {
        details.join("；")
    };
    Err(ArchiveError::Other(format!(
        "7-Zip {action}失败（退出码 {}）: {detail}",
        output.status.code().unwrap_or(-1)
    )))
}

fn is_password_failure(stdout: &str, stderr: &str) -> bool {
    let output = format!("{stderr}\n{stdout}").to_ascii_lowercase();
    output.contains("wrong password")
        || output.contains("cannot open encrypted archive")
        || output.contains("can not open encrypted archive")
        || output.contains("data error in encrypted file")
}

fn audit_extracted_tree(root: &Path) -> Result<(), String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|error| format!("无法规范化 staging 路径: {error}"))?;
    for entry in WalkDir::new(root).follow_links(false) {
        let entry = entry.map_err(|error| format!("检查解压目录失败: {error}"))?;
        let metadata = fs::symlink_metadata(entry.path())
            .map_err(|error| format!("读取解压项属性失败: {error}"))?;
        if metadata.file_type().is_symlink() {
            return Err(format!("解压结果包含符号链接: {}", entry.path().display()));
        }
        let canonical = entry
            .path()
            .canonicalize()
            .map_err(|error| format!("无法规范化解压项路径: {error}"))?;
        if !canonical.starts_with(&canonical_root) {
            return Err("解压项逃逸 staging 目录".to_string());
        }
    }
    Ok(())
}

fn create_clean_directory(path: &Path) -> Result<(), String> {
    if path.exists() {
        let parent = path
            .parent()
            .ok_or_else(|| "拒绝清理无父目录的路径".to_string())?;
        remove_scoped_directory(parent, path)?;
    }
    fs::create_dir_all(path).map_err(|error| format!("创建 staging 目录失败: {error}"))
}

fn remove_scoped_directory(parent: &Path, path: &Path) -> Result<(), String> {
    if path.parent() != Some(parent) || path.file_name().is_none() {
        return Err("拒绝清理非任务专属目录".to_string());
    }
    fs::remove_dir_all(path).map_err(|error| format!("清理任务目录失败: {error}"))
}

fn move_directory_contents(source: &Path, destination: &Path) -> Result<(), String> {
    let entries = match fs::read_dir(source)
        .map_err(|error| format!("读取解压后的游戏目录失败: {error}"))
        .and_then(|entries| {
            entries
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| format!("读取游戏目录项失败: {error}"))
        }) {
        Ok(entries) => entries,
        Err(error) => {
            let _ = fs::remove_dir(destination);
            return Err(error);
        }
    };
    if entries.is_empty() {
        let _ = fs::remove_dir(destination);
        return Err("解压后的游戏目录为空".to_string());
    }

    let mut moved_names = Vec::with_capacity(entries.len());
    for entry in entries {
        let name = entry.file_name();
        if let Err(error) = fs::rename(entry.path(), destination.join(&name)) {
            let mut rollback_failed = false;
            for moved_name in moved_names.iter().rev() {
                if fs::rename(destination.join(moved_name), source.join(moved_name)).is_err() {
                    rollback_failed = true;
                }
            }
            if !rollback_failed {
                let _ = fs::remove_dir(destination);
                return Err(format!("提交游戏目录项失败: {error}"));
            }
            return Err(format!(
                "提交游戏目录项失败且无法完整回滚，请保留目录 {} 和 {}: {error}",
                source.display(),
                destination.display()
            ));
        }
        moved_names.push(name);
    }
    let _ = fs::remove_dir(source);
    Ok(())
}

fn sanitize_directory_name(title: &str, task_id: i64) -> String {
    let mut result = title
        .chars()
        .map(|character| {
            if character.is_control() || r#"<>:"/\|?*"#.contains(character) {
                '_'
            } else {
                character
            }
        })
        .collect::<String>();
    result = result.trim().trim_end_matches(['.', ' ']).to_string();
    if result.is_empty() || matches!(result.as_str(), "." | "..") {
        format!("game-{task_id}")
    } else {
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn unique_temp(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("reina-install-{name}-{}", std::process::id()))
    }

    #[test]
    fn collapses_multiple_single_directory_layers() {
        let root = unique_temp("collapse");
        let game_root = root.join("archive").join("game");
        fs::create_dir_all(&game_root).unwrap();
        fs::write(game_root.join("Game.exe"), b"test").unwrap();

        assert_eq!(collapse_single_directory_layers(&root).unwrap(), game_root);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn stops_when_current_layer_contains_multiple_items() {
        let root = unique_temp("stop");
        fs::create_dir_all(root.join("game")).unwrap();
        fs::write(root.join("readme.txt"), b"test").unwrap();

        assert_eq!(collapse_single_directory_layers(&root).unwrap(), root);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_unsafe_archive_paths() {
        assert!(validate_archive_entry("Game/data.bin").is_ok());
        assert!(validate_archive_entry("../outside.exe").is_err());
        assert!(validate_archive_entry("C:\\outside.exe").is_err());
        assert!(validate_archive_entry("/outside.exe").is_err());
    }

    #[test]
    fn commits_to_a_new_directory_without_overwriting_existing_names() {
        let root = unique_temp("move");
        let source = root.join("source");
        let install_root = root.join("games");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(install_root.join("Game")).unwrap();
        fs::write(source.join("Game.exe"), b"test").unwrap();

        let destination = move_game_root(&source, &install_root, "Game", 7).unwrap();

        assert_eq!(destination, install_root.join("Game (2)"));
        assert!(destination.join("Game.exe").is_file());
        assert!(install_root.join("Game").is_dir());
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn sanitizes_windows_directory_names() {
        assert_eq!(sanitize_directory_name("A:B?C. ", 1), "A_B_C");
        assert_eq!(sanitize_directory_name("...", 9), "game-9");
    }

    #[test]
    fn recognizes_common_seven_zip_password_failures() {
        assert!(is_password_failure(
            "Cannot open encrypted archive. Wrong password?",
            ""
        ));
        assert!(is_password_failure(
            "",
            "Data Error in encrypted file. Wrong password?"
        ));
        assert!(!is_password_failure(
            "Headers Error",
            "Unexpected end of data"
        ));
    }
}
