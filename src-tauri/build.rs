use std::{
    env,
    fs::{self, File},
    io::{self, BufReader, Read, Write},
    path::{Path, PathBuf},
};

use sha2::{Digest, Sha256};

const SEVEN_ZIP_VERSION: &str = "26.02";
const SEVEN_ZIP_SIGNATURE: &[u8] = b"7z\xBC\xAF'\x1C";

enum PackageFormat {
    WindowsInstaller,
    TarXz,
    Zip,
}

struct SevenZipPackage {
    platform: &'static str,
    // Windows 使用带 zstd 编解码器的 7-Zip-zstd 分支（Shionlib 上存在 zstd
    // 压制的 7z 包），Linux/macOS 分支无对应产物，维持官方构建。
    version: &'static str,
    file_name: &'static str,
    url: &'static str,
    sha256: &'static str,
    executable: &'static str,
    required_library: Option<&'static str>,
    format: PackageFormat,
    /// 压缩包内不含许可证时，从该地址下载（url, sha256）。
    license_download: Option<(&'static str, &'static str)>,
}

fn main() {
    let manifest_dir =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR is required"));
    let _ = dotenvy::from_path(manifest_dir.join("../.env"));
    forward_env("BGM_APP_SECRET");
    prepare_seven_zip(&manifest_dir).unwrap_or_else(|error| panic!("准备内置 7-Zip 失败: {error}"));
    #[cfg(target_os = "windows")]
    println!(
        "cargo:rustc-link-arg=/MANIFESTDEPENDENCY:type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'"
    );
    tauri_build::build()
}

fn prepare_seven_zip(manifest_dir: &Path) -> Result<(), String> {
    let package = current_seven_zip_package()?;
    // 该目录由 CI 单独缓存；缓存未命中时仍需从官方发布地址下载并校验 7-Zip。
    let resource_root = manifest_dir.join("target/7zip");
    let executable = resource_root.join(package.executable);

    println!("cargo:rerun-if-changed=build.rs");
    println!(
        "cargo:rerun-if-changed={}",
        resource_root.join(".build-info").display()
    );
    println!("cargo:rerun-if-env-changed=CARGO_CFG_TARGET_OS");
    println!("cargo:rerun-if-env-changed=CARGO_CFG_TARGET_ARCH");

    if seven_zip_is_cached(&resource_root, package, &executable) {
        ensure_executable_permission(&executable)?;
        return Ok(());
    }

    let target_dir = resource_root
        .parent()
        .ok_or_else(|| "无法定位 Cargo target 目录".to_string())?;
    let staging = target_dir.join(format!(".7zip-staging-{}", std::process::id()));
    remove_directory_if_exists(&staging)?;
    fs::create_dir_all(&staging).map_err(|error| format!("创建 7-Zip 暂存目录失败: {error}"))?;

    let result = prepare_seven_zip_files(package, &resource_root, &staging);
    let cleanup_result = remove_directory_if_exists(&staging);
    result?;
    cleanup_result
}

fn prepare_seven_zip_files(
    package: &SevenZipPackage,
    resource_root: &Path,
    staging: &Path,
) -> Result<(), String> {
    let archive_path = staging.join(package.file_name);
    download_file(package.url, &archive_path)?;
    verify_sha256(&archive_path, package.sha256)?;

    let extracted = staging.join("extracted");
    match package.format {
        PackageFormat::WindowsInstaller => extract_windows_installer(&archive_path, &extracted)?,
        PackageFormat::TarXz => extract_tar_xz(&archive_path, &extracted)?,
        PackageFormat::Zip => extract_zip(&archive_path, &extracted)?,
    }

    remove_directory_if_exists(resource_root)?;
    fs::create_dir_all(resource_root)
        .map_err(|error| format!("创建 7-Zip 输出目录失败: {error}"))?;

    copy_extracted_file(&extracted, package.executable, resource_root)?;
    if let Some(library) = package.required_library {
        copy_extracted_file(&extracted, library, resource_root)?;
    }
    match package.license_download {
        Some((url, sha256)) => {
            let license_path = resource_root.join("License.txt");
            download_file(url, &license_path)?;
            verify_sha256(&license_path, sha256)?;
        }
        None => copy_license(&extracted, resource_root)?,
    }
    fs::write(
        resource_root.join("NOTICE.md"),
        format!(
            "7-Zip {} is bundled at build time.\nSource: {}\nLicense: see License.txt.\n",
            package.version, package.url
        ),
    )
    .map_err(|error| format!("写入 7-Zip NOTICE 失败: {error}"))?;
    fs::write(
        resource_root.join(".build-info"),
        format!("{}\n{}\n", package.version, package.platform),
    )
    .map_err(|error| format!("写入 7-Zip 构建标记失败: {error}"))?;
    ensure_executable_permission(&resource_root.join(package.executable))
}

fn current_seven_zip_package() -> Result<&'static SevenZipPackage, String> {
    static WINDOWS_X64: SevenZipPackage = SevenZipPackage {
        version: "26.02-zstd-v1.5.7-R2",
        platform: "windows-x64",
        file_name: "7z26.02-zstd-x64.exe",
        url: "https://github.com/mcmilk/7-Zip-zstd/releases/download/v26.02-v1.5.7-R2/7z26.02-zstd-x64.exe",
        sha256: "22dc4608d911d7c831437b969db66a42d0477cd3f5d93987cae9f59774857fc1",
        executable: "7z.exe",
        required_library: Some("7z.dll"),
        format: PackageFormat::WindowsInstaller,
        license_download: None,
    };
    static WINDOWS_X86: SevenZipPackage = SevenZipPackage {
        version: "26.02-zstd-v1.5.7-R2",
        platform: "windows-x86",
        file_name: "7z26.02-zstd-x86.exe",
        url: "https://github.com/mcmilk/7-Zip-zstd/releases/download/v26.02-v1.5.7-R2/7z26.02-zstd-x86.exe",
        sha256: "9d509425fdbea2a85b77beaa246dfb63a71c0ac70dd443cf2ed3cddcf1b4992d",
        executable: "7z.exe",
        required_library: Some("7z.dll"),
        format: PackageFormat::WindowsInstaller,
        license_download: None,
    };
    static WINDOWS_ARM64: SevenZipPackage = SevenZipPackage {
        version: "26.02-zstd-v1.5.7-R2",
        platform: "windows-arm64",
        file_name: "7z26.02-zstd-arm64.exe",
        url: "https://github.com/mcmilk/7-Zip-zstd/releases/download/v26.02-v1.5.7-R2/7z26.02-zstd-arm64.exe",
        sha256: "9749af751056e203286175527e906acc1ad0ed7b0ccc1a22de05141d77170961",
        executable: "7z.exe",
        required_library: Some("7z.dll"),
        format: PackageFormat::WindowsInstaller,
        license_download: None,
    };
    static LINUX_X64: SevenZipPackage = SevenZipPackage {
        version: "26.02-zstd-v1.5.7-R2",
        platform: "linux-x64",
        file_name: "linux-gcc-x64.zip",
        url: "https://github.com/mcmilk/7-Zip-zstd/releases/download/v26.02-v1.5.7-R2/linux-gcc-x64.zip",
        sha256: "be246e5a284d3b5e738bad5cbb24c2662996ddb9776e09575b5099ab53fa0ba3",
        executable: "7zz",
        required_library: None,
        format: PackageFormat::Zip,
        license_download: Some(("https://raw.githubusercontent.com/mcmilk/7-Zip-zstd/v26.02-v1.5.7-R2/DOC/License.txt", "5b565f1591a5872cb163a17a06725c4ec010f60401c9068d1b5e1e8c89517f39")),
    };
    static LINUX_X86: SevenZipPackage = SevenZipPackage {
        version: "26.02",
        platform: "linux-x86",
        file_name: "7z2602-linux-x86.tar.xz",
        url: "https://github.com/ip7z/7zip/releases/download/26.02/7z2602-linux-x86.tar.xz",
        sha256: "ae0148515c4b708440b57960931234eb02b11a856479668044a6126adf4b1181",
        executable: "7zz",
        required_library: None,
        format: PackageFormat::TarXz,
        license_download: None,
    };
    static LINUX_ARM64: SevenZipPackage = SevenZipPackage {
        version: "26.02-zstd-v1.5.7-R2",
        platform: "linux-arm64",
        file_name: "linux-gcc-arm64.zip",
        url: "https://github.com/mcmilk/7-Zip-zstd/releases/download/v26.02-v1.5.7-R2/linux-gcc-arm64.zip",
        sha256: "64511f6ebc32d5257a535b33b21a5b6712c72aa91e28524f41e1ce92e803c909",
        executable: "7zz",
        required_library: None,
        format: PackageFormat::Zip,
        license_download: Some(("https://raw.githubusercontent.com/mcmilk/7-Zip-zstd/v26.02-v1.5.7-R2/DOC/License.txt", "5b565f1591a5872cb163a17a06725c4ec010f60401c9068d1b5e1e8c89517f39")),
    };
    static MACOS_X64: SevenZipPackage = SevenZipPackage {
        version: "26.02",
        platform: "macos-x64",
        file_name: "7z2602-mac.tar.xz",
        url: "https://github.com/ip7z/7zip/releases/download/26.02/7z2602-mac.tar.xz",
        sha256: "1cf6760579502f87e591ff5c73a005ec50b3e4d6f507e8b038382d563c3175b9",
        executable: "7zz",
        required_library: None,
        format: PackageFormat::TarXz,
        license_download: None,
    };
    static MACOS_ARM64: SevenZipPackage = SevenZipPackage {
        version: "26.02",
        platform: "macos-arm64",
        file_name: "7z2602-mac.tar.xz",
        url: "https://github.com/ip7z/7zip/releases/download/26.02/7z2602-mac.tar.xz",
        sha256: "1cf6760579502f87e591ff5c73a005ec50b3e4d6f507e8b038382d563c3175b9",
        executable: "7zz",
        required_library: None,
        format: PackageFormat::TarXz,
        license_download: None,
    };

    let target_os = env::var("CARGO_CFG_TARGET_OS")
        .map_err(|error| format!("读取目标操作系统失败: {error}"))?;
    let target_arch =
        env::var("CARGO_CFG_TARGET_ARCH").map_err(|error| format!("读取目标架构失败: {error}"))?;

    match (target_os.as_str(), target_arch.as_str()) {
        ("windows", "x86_64") => Ok(&WINDOWS_X64),
        ("windows", "x86") => Ok(&WINDOWS_X86),
        ("windows", "aarch64") => Ok(&WINDOWS_ARM64),
        ("linux", "x86_64") => Ok(&LINUX_X64),
        ("linux", "x86") => Ok(&LINUX_X86),
        ("linux", "aarch64") => Ok(&LINUX_ARM64),
        ("macos", "x86_64") => Ok(&MACOS_X64),
        ("macos", "aarch64") => Ok(&MACOS_ARM64),
        _ => Err(format!(
            "7-Zip {SEVEN_ZIP_VERSION} 不支持目标平台 {target_os}/{target_arch}"
        )),
    }
}

fn seven_zip_is_cached(resource_root: &Path, package: &SevenZipPackage, executable: &Path) -> bool {
    let build_info = format!("{}\n{}\n", package.version, package.platform);
    let library_exists = package
        .required_library
        .is_none_or(|library| resource_root.join(library).is_file());

    fs::read_to_string(resource_root.join(".build-info")).is_ok_and(|value| value == build_info)
        && executable.is_file()
        && library_exists
        && resource_root.join("License.txt").is_file()
}

fn download_file(url: &str, destination: &Path) -> Result<(), String> {
    println!("cargo:warning=正在下载内置 7-Zip: {url}");
    let mut response = ureq::get(url)
        .call()
        .map_err(|error| format!("下载 7-Zip 失败: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("下载 7-Zip 返回异常状态: {}", response.status()));
    }

    let temporary = destination.with_extension("part");
    let mut output =
        File::create(&temporary).map_err(|error| format!("创建 7-Zip 下载文件失败: {error}"))?;
    let mut reader = response.body_mut().as_reader();
    io::copy(&mut reader, &mut output)
        .map_err(|error| format!("写入 7-Zip 下载文件失败: {error}"))?;
    output
        .flush()
        .map_err(|error| format!("刷新 7-Zip 下载文件失败: {error}"))?;
    fs::rename(&temporary, destination)
        .map_err(|error| format!("完成 7-Zip 下载文件失败: {error}"))?;
    Ok(())
}

fn verify_sha256(path: &Path, expected: &str) -> Result<(), String> {
    let mut file = File::open(path).map_err(|error| format!("读取 7-Zip 下载文件失败: {error}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 32 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|error| format!("校验 7-Zip 下载文件失败: {error}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    let actual = hasher
        .finalize()
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    if actual == expected {
        Ok(())
    } else {
        Err(format!(
            "7-Zip SHA-256 校验失败，期望 {expected}，实际 {actual}"
        ))
    }
}

fn extract_windows_installer(package: &Path, destination: &Path) -> Result<(), String> {
    if extract_7z(package, destination).is_ok() {
        return Ok(());
    }

    let bytes =
        fs::read(package).map_err(|error| format!("读取 7-Zip Windows 安装包失败: {error}"))?;
    for (offset, window) in bytes.windows(SEVEN_ZIP_SIGNATURE.len()).enumerate() {
        if window != SEVEN_ZIP_SIGNATURE {
            continue;
        }

        remove_directory_if_exists(destination)?;
        let embedded_archive = destination.with_extension("7z");
        fs::write(&embedded_archive, &bytes[offset..])
            .map_err(|error| format!("写入 7-Zip Windows 内嵌归档失败: {error}"))?;
        let extracted = extract_7z(&embedded_archive, destination).is_ok();
        let _ = fs::remove_file(&embedded_archive);
        if extracted {
            return Ok(());
        }
    }

    Err("无法从 Windows 7-Zip 安装包中提取归档内容".to_string())
}

fn extract_7z(archive: &Path, destination: &Path) -> Result<(), String> {
    remove_directory_if_exists(destination)?;
    fs::create_dir_all(destination).map_err(|error| format!("创建 7-Zip 解压目录失败: {error}"))?;
    sevenz_rust2::decompress_file(archive, destination)
        .map_err(|error| format!("解压 7-Zip 安装包失败: {error}"))
}

fn extract_tar_xz(archive: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| format!("创建 7-Zip 解压目录失败: {error}"))?;
    let file = File::open(archive).map_err(|error| format!("读取 7-Zip 压缩包失败: {error}"))?;
    let decoder = xz2::read::XzDecoder::new(BufReader::new(file));
    tar::Archive::new(decoder)
        .unpack(destination)
        .map_err(|error| format!("解压 7-Zip 压缩包失败: {error}"))
}

fn extract_zip(archive: &Path, destination: &Path) -> Result<(), String> {
    fs::create_dir_all(destination).map_err(|error| format!("创建 7-Zip 解压目录失败: {error}"))?;
    let file = File::open(archive).map_err(|error| format!("读取 7-Zip 压缩包失败: {error}"))?;
    let mut zip = zip::ZipArchive::new(BufReader::new(file))
        .map_err(|error| format!("解析 7-Zip 压缩包失败: {error}"))?;
    zip.extract(destination)
        .map_err(|error| format!("解压 7-Zip 压缩包失败: {error}"))
}

fn copy_extracted_file(
    extracted: &Path,
    file_name: &str,
    destination_dir: &Path,
) -> Result<(), String> {
    let source = find_file(extracted, file_name)?;
    fs::copy(&source, destination_dir.join(file_name))
        .map_err(|error| format!("复制内置 7-Zip 文件 {file_name} 失败: {error}"))?;
    Ok(())
}

fn copy_license(extracted: &Path, resource_root: &Path) -> Result<(), String> {
    let source =
        find_file(extracted, "License.txt").or_else(|_| find_file(extracted, "license.txt"))?;
    fs::copy(source, resource_root.join("License.txt"))
        .map_err(|error| format!("复制 7-Zip 许可证失败: {error}"))?;
    Ok(())
}

fn find_file(directory: &Path, file_name: &str) -> Result<PathBuf, String> {
    let entries =
        fs::read_dir(directory).map_err(|error| format!("读取 7-Zip 解压目录失败: {error}"))?;
    for entry in entries {
        let entry = entry.map_err(|error| format!("读取 7-Zip 解压目录条目失败: {error}"))?;
        let path = entry.path();
        if path.is_file() && entry.file_name() == file_name {
            return Ok(path);
        }
        if path.is_dir()
            && let Ok(path) = find_file(&path, file_name)
        {
            return Ok(path);
        }
    }

    Err(format!("7-Zip 解压内容中缺少 {file_name}"))
}

fn remove_directory_if_exists(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_dir_all(path)
            .map_err(|error| format!("清理目录 {} 失败: {error}", path.display()))?;
    }
    Ok(())
}

#[cfg(unix)]
fn ensure_executable_permission(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    let metadata = fs::metadata(path).map_err(|error| format!("读取 7-Zip 权限失败: {error}"))?;
    let mut permissions = metadata.permissions();
    permissions.set_mode(0o755);
    fs::set_permissions(path, permissions)
        .map_err(|error| format!("设置 7-Zip 执行权限失败: {error}"))
}

#[cfg(not(unix))]
fn ensure_executable_permission(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn forward_env(name: &str) {
    println!("cargo:rerun-if-env-changed={}", name);
    println!("cargo:rerun-if-changed=../.env");

    if let Ok(value) = env::var(name) {
        let value = value.trim();
        if !value.is_empty() {
            println!("cargo:rustc-env={name}={value}");
        }
    }
}
