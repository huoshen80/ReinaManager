//! Theme assets, package import/export, and the safe local theme protocol.

use crate::database::dto::UpdateSettingsData;
use crate::database::repository::settings_repository::SettingsRepository;
use crate::entity::{theme_assets, theme_packages, user};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set,
    TransactionTrait,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};
use tauri::http::{Response, StatusCode};
use tauri::{State, command};
use zip::write::SimpleFileOptions;
use zip::{ZipArchive, ZipWriter};

const CUSTOM_PACKAGE_ID: &str = "custom";
const MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;
const MAX_IMAGE_DIMENSION: u32 = 8192;
const MANIFEST_MAX_BYTES: usize = 64 * 1024;
const THEME_MANIFEST_SCHEMA_VERSION: u32 = 2;

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeAssetInfo {
    pub relative_path: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub size_bytes: u64,
    pub sha256: String,
    pub updated_at: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemePackageInfo {
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: Option<String>,
    pub description: Option<String>,
    pub manifest_hash: String,
    pub installed_at: i64,
    pub updated_at: i64,
    pub assets: Vec<ThemeAssetInfo>,
    pub has_mui_config: bool,
    pub mui: Option<serde_json::Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeManifest {
    pub schema_version: u32,
    pub id: String,
    pub name: String,
    pub version: String,
    pub author: Option<String>,
    pub description: Option<String>,
    pub palette: Option<serde_json::Value>,
    pub appearance: ThemeAppearance,
    #[serde(default)]
    pub mui: Option<serde_json::Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeAppearance {
    pub background: Option<String>,
    pub overlay_opacity: f64,
    pub blur: f64,
    pub background_size: String,
    pub accent_color: String,
    pub apply_scope: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeCleanupResult {
    pub removed_files: u32,
    pub removed_directories: u32,
}

fn themes_dir() -> Result<PathBuf, String> {
    #[cfg(test)]
    {
        // 测试环境下重定向到稳定的临时目录，避免污染真实用户数据。
        static TEST_DIR: std::sync::OnceLock<PathBuf> = std::sync::OnceLock::new();
        return Ok(TEST_DIR
            .get_or_init(|| {
                let path =
                    std::env::temp_dir().join(format!("reina_theme_test_{}", now_ms()));
                fs::create_dir_all(&path).expect("创建主题测试目录失败");
                path
            })
            .clone());
    }
    let path = reina_path::get_base_data_dir()?.join("themes");
    fs::create_dir_all(&path).map_err(|e| format!("创建主题资源目录失败: {e}"))?;
    Ok(path)
}

fn safe_relative_path(value: &str) -> Result<PathBuf, String> {
    let normalized = value.replace('\\', "/");
    let path = Path::new(&normalized);
    log::debug!("path={}", path.display());
    if normalized.trim().is_empty() || path.is_absolute() {
        return Err("主题资源路径必须是非空相对路径".to_string());
    }
    if path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    }) {
        return Err("主题资源路径包含非法目录跳转".to_string());
    }
    Ok(path.to_path_buf())
}

fn safe_package_id(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 80
        || !value.chars().all(|character| {
            character.is_ascii_alphanumeric() || character == '-' || character == '_'
        })
    {
        return Err("主题包 ID 只能包含字母、数字、下划线和连字符".to_string());
    }
    Ok(())
}

fn package_dir(root: &Path, package_id: &str) -> Result<PathBuf, String> {
    safe_package_id(package_id)?;
    Ok(root.join(package_id))
}

fn image_metadata(path: &Path) -> Result<(String, u32, u32, u64, String), String> {
    let metadata = fs::metadata(path).map_err(|e| format!("读取主题图片失败: {e}"))?;
    if !metadata.is_file() || metadata.len() == 0 {
        return Err("主题资源不是有效文件".to_string());
    }
    if metadata.len() > MAX_IMAGE_BYTES {
        return Err("主题图片不能超过 20 MB".to_string());
    }

    let bytes = fs::read(path).map_err(|e| format!("读取主题图片失败: {e}"))?;
    let (mime, width, height) = detect_image_info(&bytes)?;
    if width == 0 || height == 0 || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION {
        return Err("主题图片尺寸不能超过 8192 × 8192".to_string());
    }

    let mut file = File::open(path).map_err(|e| format!("读取主题图片内容失败: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|e| format!("计算主题图片 hash 失败: {e}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok((
        mime.to_string(),
        width,
        height,
        metadata.len(),
        format!("{:x}", hasher.finalize()),
    ))
}

fn detect_image_info(bytes: &[u8]) -> Result<(&'static str, u32, u32), String> {
    if bytes.len() >= 24 && bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        return Ok((
            "image/png",
            u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]),
            u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]),
        ));
    }

    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return webp_dimensions(bytes).map(|(width, height)| ("image/webp", width, height));
    }

    if bytes.len() >= 4 && bytes[0] == 0xff && bytes[1] == 0xd8 {
        return jpeg_dimensions(bytes).map(|(width, height)| ("image/jpeg", width, height));
    }

    Err("主题图片仅支持 PNG、JPEG 和 WebP".to_string())
}

fn jpeg_dimensions(bytes: &[u8]) -> Result<(u32, u32), String> {
    let mut offset = 2;
    while offset + 9 < bytes.len() {
        if bytes[offset] != 0xff {
            offset += 1;
            continue;
        }
        while offset < bytes.len() && bytes[offset] == 0xff {
            offset += 1;
        }
        if offset >= bytes.len() {
            break;
        }
        let marker = bytes[offset];
        offset += 1;
        if matches!(marker, 0xd8 | 0xd9 | 0x01) {
            continue;
        }
        if offset + 2 > bytes.len() {
            break;
        }
        let length = u16::from_be_bytes([bytes[offset], bytes[offset + 1]]) as usize;
        if length < 2 || offset + length > bytes.len() {
            break;
        }
        if matches!(
            marker,
            0xc0 | 0xc1
                | 0xc2
                | 0xc3
                | 0xc5
                | 0xc6
                | 0xc7
                | 0xc9
                | 0xca
                | 0xcb
                | 0xcd
                | 0xce
                | 0xcf
        ) {
            let height = u16::from_be_bytes([bytes[offset + 3], bytes[offset + 4]]) as u32;
            let width = u16::from_be_bytes([bytes[offset + 5], bytes[offset + 6]]) as u32;
            return Ok((width, height));
        }
        offset += length;
    }
    Err("无法读取 JPEG 尺寸".to_string())
}

fn read_u24_le(bytes: &[u8]) -> u32 {
    bytes[0] as u32 | ((bytes[1] as u32) << 8) | ((bytes[2] as u32) << 16)
}

fn webp_dimensions(bytes: &[u8]) -> Result<(u32, u32), String> {
    if bytes.len() < 30 {
        return Err("无法读取 WebP 尺寸".to_string());
    }
    match &bytes[12..16] {
        b"VP8X" if bytes.len() >= 30 => Ok((
            read_u24_le(&bytes[24..27]) + 1,
            read_u24_le(&bytes[27..30]) + 1,
        )),
        b"VP8L" if bytes.len() >= 25 && bytes[20] == 0x2f => {
            let value = u32::from_le_bytes([bytes[21], bytes[22], bytes[23], bytes[24]]);
            Ok(((value & 0x3fff) + 1, ((value >> 14) & 0x3fff) + 1))
        }
        b"VP8 " if bytes.len() >= 30 => Ok((
            u16::from_le_bytes([bytes[26], bytes[27]]) as u32 & 0x3fff,
            u16::from_le_bytes([bytes[28], bytes[29]]) as u32 & 0x3fff,
        )),
        _ => Err("无法读取 WebP 尺寸".to_string()),
    }
}

fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn to_asset_info(asset: theme_assets::Model) -> ThemeAssetInfo {
    ThemeAssetInfo {
        relative_path: asset.relative_path,
        mime_type: asset.mime_type,
        width: asset.width as u32,
        height: asset.height as u32,
        size_bytes: asset.size_bytes as u64,
        sha256: asset.sha256,
        updated_at: asset.updated_at,
    }
}

async fn package_infos(db: &DatabaseConnection) -> Result<Vec<ThemePackageInfo>, String> {
    let packages = theme_packages::Entity::find()
        .all(db)
        .await
        .map_err(|e| format!("读取主题包失败: {e}"))?;
    let root = themes_dir()?;
    let mut result = Vec::with_capacity(packages.len());
    for package in packages {
        let assets = theme_assets::Entity::find()
            .filter(theme_assets::Column::PackageId.eq(&package.id))
            .all(db)
            .await
            .map_err(|e| format!("读取主题资源元数据失败: {e}"))?
            .into_iter()
            .map(to_asset_info)
            .collect();
        let mui = package_mui_config(&root, &package.id);
        let has_mui_config = mui.is_some();
        result.push(ThemePackageInfo {
            id: package.id,
            name: package.name,
            version: package.version,
            author: package.author,
            description: package.description,
            manifest_hash: package.manifest_hash,
            installed_at: package.installed_at,
            updated_at: package.updated_at,
            assets,
            has_mui_config,
            mui,
        });
    }
    Ok(result)
}

/// 读取磁盘 manifest，返回主题包携带的 MUI 样式配置（无则 None）。
fn package_mui_config(root: &Path, package_id: &str) -> Option<serde_json::Value> {
    let Ok(dir) = package_dir(root, package_id) else {
        return None;
    };
    let Ok(bytes) = fs::read(dir.join("manifest.json")) else {
        return None;
    };
    match parse_manifest(&bytes) {
        Ok(manifest) => manifest.mui,
        Err(_) => None,
    }
}

#[command]
pub async fn list_theme_packages(
    db: State<'_, DatabaseConnection>,
) -> Result<Vec<ThemePackageInfo>, String> {
    package_infos(&db).await
}

#[command]
pub async fn get_active_theme(db: State<'_, DatabaseConnection>) -> Result<user::Model, String> {
    SettingsRepository::get_all_settings(&db)
        .await
        .map_err(|e| format!("读取当前主题失败: {e}"))
}

#[command]
pub async fn set_active_theme_package(
    db: State<'_, DatabaseConnection>,
    package_id: Option<String>,
) -> Result<(), String> {
    if let Some(id) = package_id.as_deref() {
        safe_package_id(id)?;
        if theme_packages::Entity::find_by_id(id)
            .one(db.inner())
            .await
            .map_err(|e| format!("检查主题包失败: {e}"))?
            .is_none()
        {
            return Err("主题包不存在".to_string());
        }
    }
    let updates = match package_id.as_deref() {
        Some(CUSTOM_PACKAGE_ID) => UpdateSettingsData {
            active_theme_package_id: Some(Some(CUSTOM_PACKAGE_ID.to_string())),
            ..Default::default()
        },
        Some(id) => package_settings_update(id)?,
        None => UpdateSettingsData {
            active_theme_package_id: Some(None),
            theme_background_path: Some(None),
            ..Default::default()
        },
    };
    SettingsRepository::update_settings(&db, updates)
        .await
        .map_err(|e| format!("切换主题包失败: {e}"))
}

fn package_settings_update(package_id: &str) -> Result<UpdateSettingsData, String> {
    let manifest_path = package_dir(&themes_dir()?, package_id)?.join("manifest.json");
    let bytes = fs::read(&manifest_path).map_err(|e| format!("读取主题 manifest 失败: {e}"))?;
    let manifest = parse_manifest(&bytes)?;
    let background = manifest
        .appearance
        .background
        .as_deref()
        .map(safe_relative_path)
        .transpose()?
        .map(|path| {
            format!(
                "{}/{}",
                package_id,
                path.to_string_lossy().replace('\\', "/")
            )
        });
    let mut updates = UpdateSettingsData {
        active_theme_package_id: Some(Some(package_id.to_string())),
        theme_background_path: Some(background),
        theme_overlay_opacity: Some(manifest.appearance.overlay_opacity),
        theme_blur: Some(manifest.appearance.blur),
        theme_background_size: Some(manifest.appearance.background_size),
        theme_accent_color: Some(manifest.appearance.accent_color),
        theme_apply_scope: Some(manifest.appearance.apply_scope),
        ..Default::default()
    };
    // 主题包 palette 同步到自定义配色（浅色/深色分别写入），无 palette 时置 None。
    if let Some(palette) = &manifest.palette {
        updates.custom_theme_light_palette = Some(
            palette
                .get("light")
                .cloned()
                .map(|value| serde_json::from_value(value).unwrap_or_default()),
        );
        updates.custom_theme_dark_palette = Some(
            palette
                .get("dark")
                .cloned()
                .map(|value| serde_json::from_value(value).unwrap_or_default()),
        );
    } else {
        updates.custom_theme_light_palette = Some(None);
        updates.custom_theme_dark_palette = Some(None);
    }
    if let Some(background) = updates
        .theme_background_path
        .as_ref()
        .and_then(|path| path.as_ref())
    {
        let metadata = image_metadata(&themes_dir()?.join(safe_relative_path(background)?))?;
        updates.theme_background_width = Some(Some(metadata.1 as i32));
        updates.theme_background_height = Some(Some(metadata.2 as i32));
        updates.theme_background_hash = Some(Some(metadata.4));
        updates.theme_background_updated_at = Some(Some(now_ms()));
    }
    Ok(updates)
}

/// 自定义主题包缺省元数据。
fn custom_package_meta(
    existing: Option<&theme_packages::Model>,
) -> (String, String, Option<String>, Option<String>) {
    existing
        .map(|row| {
            (
                row.name.clone(),
                row.version.clone(),
                row.author.clone(),
                row.description.clone(),
            )
        })
        .unwrap_or_else(|| {
            (
                "自定义主题".to_string(),
                "1.0.0".to_string(),
                None,
                Some("ReinaManager 自定义外观".to_string()),
            )
        })
}

/// 按当前设置与主题包元数据构建自定义主题 manifest（background 为包内相对路径）。
fn custom_manifest_from_settings(
    settings: &user::Model,
    existing: Option<&theme_packages::Model>,
    metadata: Option<(&str, &str, Option<&str>, Option<&str>)>,
) -> ThemeManifest {
    let (default_name, default_version, default_author, default_description) =
        custom_package_meta(existing);
    let (name, version, author, description) = metadata.unwrap_or((
        default_name.as_str(),
        default_version.as_str(),
        default_author.as_deref(),
        default_description.as_deref(),
    ));
    ThemeManifest {
        schema_version: THEME_MANIFEST_SCHEMA_VERSION,
        id: CUSTOM_PACKAGE_ID.to_string(),
        name: name.to_string(),
        version: version.to_string(),
        author: author.map(str::to_string),
        description: description.map(str::to_string),
        palette: Some(serde_json::json!({
            "light": settings.custom_theme_light_palette,
            "dark": settings.custom_theme_dark_palette,
        })),
        appearance: ThemeAppearance {
            background: settings
                .theme_background_path
                .as_deref()
                .and_then(|path| path.strip_prefix(&format!("{CUSTOM_PACKAGE_ID}/")))
                .map(str::to_string),
            overlay_opacity: settings.theme_overlay_opacity,
            blur: settings.theme_blur,
            background_size: settings.theme_background_size.clone(),
            accent_color: settings.theme_accent_color.clone(),
            apply_scope: settings.theme_apply_scope.clone(),
        },
        mui: None,
    }
}

/// 清洗并校验主题包元数据（名称/版本非空且限长，作者/描述限长）。
fn normalize_theme_metadata(
    name: Option<String>,
    author: Option<Option<String>>,
    description: Option<Option<String>>,
    version: Option<String>,
) -> Result<
    (
        Option<String>,
        Option<Option<String>>,
        Option<Option<String>>,
        Option<String>,
    ),
    String,
> {
    let name = name.map(|value| value.trim().to_string());
    let author = author.map(|value| value.map(|value| value.trim().to_string()));
    let description = description.map(|value| value.map(|value| value.trim().to_string()));
    let version = version.map(|value| value.trim().to_string());
    if let Some(name) = &name {
        if name.is_empty() || name.len() > 100 {
            return Err("主题名称不能为空且不能超过 100 个字符".to_string());
        }
    }
    if let Some(version) = &version {
        if version.is_empty() || version.len() > 32 {
            return Err("主题版本不能为空且不能超过 32 个字符".to_string());
        }
    }
    if let Some(Some(author)) = &author {
        if author.len() > 100 {
            return Err("作者不能超过 100 个字符".to_string());
        }
    }
    if let Some(Some(description)) = &description {
        if description.len() > 500 {
            return Err("描述不能超过 500 个字符".to_string());
        }
    }
    Ok((name, author, description, version))
}

/// 将当前配置保存为自定义主题包（palette + 外观 + 元数据），并激活它。
#[command]
pub async fn save_custom_theme(
    db: State<'_, DatabaseConnection>,
    name: Option<String>,
    author: Option<Option<String>>,
    description: Option<Option<String>>,
    version: Option<String>,
) -> Result<ThemePackageInfo, String> {
    save_custom_theme_impl(&db, name, author, description, version).await
}

async fn save_custom_theme_impl(
    db: &DatabaseConnection,
    name: Option<String>,
    author: Option<Option<String>>,
    description: Option<Option<String>>,
    version: Option<String>,
) -> Result<ThemePackageInfo, String> {
    let (name, author, description, version) =
        normalize_theme_metadata(name, author, description, version)?;
    let settings = SettingsRepository::get_all_settings(db)
        .await
        .map_err(|e| format!("读取主题设置失败: {e}"))?;
    let existing = theme_packages::Entity::find_by_id(CUSTOM_PACKAGE_ID)
        .one(db)
        .await
        .map_err(|e| format!("读取自定义主题包失败: {e}"))?;
    let (default_name, default_version, default_author, default_description) =
        custom_package_meta(existing.as_ref());
    let final_name = name.unwrap_or(default_name);
    let final_version = version.unwrap_or(default_version);
    let final_author = author.unwrap_or(default_author);
    let final_description = description.unwrap_or(default_description);

    let root = themes_dir()?;
    let custom_dir = package_dir(&root, CUSTOM_PACKAGE_ID)?;
    fs::create_dir_all(&custom_dir).map_err(|e| format!("创建自定义主题目录失败: {e}"))?;

    // 背景资源：custom 包内资源直接引用；其他主题包的背景复制进 custom 包。
    let mut background_relative: Option<String> = None;
    let mut asset: Option<ThemeAssetInfo> = None;
    if let Some(path) = settings.theme_background_path.as_deref() {
        if let Some(inner) = path.strip_prefix(&format!("{CUSTOM_PACKAGE_ID}/")) {
            background_relative = Some(inner.to_string());
        } else {
            let source = root.join(safe_relative_path(path)?);
            if source.exists() {
                let metadata = image_metadata(&source)?;
                let extension = source
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|value| value.to_ascii_lowercase())
                    .unwrap_or_default();
                let relative = format!("assets/background.{extension}");
                let target = custom_dir.join(&relative);
                if target.exists() {
                    fs::remove_file(&target).map_err(|e| format!("替换主题背景失败: {e}"))?;
                }
                fs::copy(&source, &target).map_err(|e| format!("复制主题背景失败: {e}"))?;
                background_relative = Some(relative.clone());
                asset = Some(ThemeAssetInfo {
                    relative_path: relative,
                    mime_type: metadata.0,
                    width: metadata.1,
                    height: metadata.2,
                    size_bytes: metadata.3,
                    sha256: metadata.4,
                    updated_at: now_ms(),
                });
            }
        }
    }

    let mut manifest = custom_manifest_from_settings(
        &settings,
        existing.as_ref(),
        Some((
            &final_name,
            &final_version,
            final_author.as_deref(),
            final_description.as_deref(),
        )),
    );
    manifest.appearance.background = background_relative;
    let manifest_bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|e| format!("序列化主题 manifest 失败: {e}"))?;
    let manifest_hash = format!("{:x}", Sha256::digest(&manifest_bytes));
    atomic_write(&custom_dir.join("manifest.json"), &manifest_bytes)?;

    let timestamp = now_ms();
    let transaction = db
        .begin()
        .await
        .map_err(|e| format!("开启主题事务失败: {e}"))?;
    let result = async {
        if existing.is_some() {
            theme_assets::Entity::delete_many()
                .filter(theme_assets::Column::PackageId.eq(CUSTOM_PACKAGE_ID))
                .exec(&transaction)
                .await?;
            theme_packages::ActiveModel {
                id: Set(CUSTOM_PACKAGE_ID.to_string()),
                name: Set(manifest.name.clone()),
                version: Set(manifest.version.clone()),
                author: Set(manifest.author.clone()),
                description: Set(manifest.description.clone()),
                manifest_hash: Set(manifest_hash.clone()),
                updated_at: Set(timestamp),
                ..Default::default()
            }
            .update(&transaction)
            .await?;
        } else {
            theme_packages::ActiveModel {
                id: Set(CUSTOM_PACKAGE_ID.to_string()),
                name: Set(manifest.name.clone()),
                version: Set(manifest.version.clone()),
                author: Set(manifest.author.clone()),
                description: Set(manifest.description.clone()),
                manifest_hash: Set(manifest_hash.clone()),
                installed_at: Set(timestamp),
                updated_at: Set(timestamp),
            }
            .insert(&transaction)
            .await?;
        }
        if let Some(asset) = &asset {
            theme_assets::ActiveModel {
                package_id: Set(CUSTOM_PACKAGE_ID.to_string()),
                relative_path: Set(asset.relative_path.clone()),
                mime_type: Set(asset.mime_type.clone()),
                width: Set(asset.width as i32),
                height: Set(asset.height as i32),
                size_bytes: Set(asset.size_bytes as i64),
                sha256: Set(asset.sha256.clone()),
                updated_at: Set(asset.updated_at),
                ..Default::default()
            }
            .insert(&transaction)
            .await?;
        }
        Ok::<(), sea_orm::DbErr>(())
    }
    .await;
    if let Err(error) = result {
        transaction.rollback().await.ok();
        return Err(format!("写入自定义主题包记录失败: {error}"));
    }
    transaction
        .commit()
        .await
        .map_err(|e| format!("提交主题事务失败: {e}"))?;

    // 激活自定义主题包，并同步 palette/外观到设置。
    SettingsRepository::update_settings(db, package_settings_update(CUSTOM_PACKAGE_ID)?)
        .await
        .map_err(|e| format!("保存自定义主题设置失败: {e}"))?;

    package_infos(db)
        .await?
        .into_iter()
        .find(|package| package.id == CUSTOM_PACKAGE_ID)
        .ok_or_else(|| "保存后读取自定义主题包失败".to_string())
}

#[command]
pub async fn upload_theme_background(
    db: State<'_, DatabaseConnection>,
    source_path: String,
) -> Result<ThemeAssetInfo, String> {
    let root = themes_dir()?;
    let custom_dir = package_dir(&root, CUSTOM_PACKAGE_ID)?.join("assets");
    fs::create_dir_all(&custom_dir).map_err(|e| format!("创建自定义主题目录失败: {e}"))?;
    let extension = Path::new(&source_path)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.to_ascii_lowercase())
        .ok_or_else(|| "主题图片缺少扩展名".to_string())?;
    if !matches!(extension.as_str(), "png" | "jpg" | "jpeg" | "webp") {
        return Err("主题图片仅支持 PNG、JPEG 和 WebP".to_string());
    }
    let temp = custom_dir.join(format!(".background.{extension}.tmp"));
    fs::copy(&source_path, &temp).map_err(|e| format!("复制主题图片失败: {e}"))?;
    let metadata = match image_metadata(&temp) {
        Ok(value) => value,
        Err(error) => {
            let _ = fs::remove_file(&temp);
            return Err(error);
        }
    };
    let relative_path = format!("{CUSTOM_PACKAGE_ID}/assets/background.{extension}");
    let target = root.join(&relative_path);
    let old = SettingsRepository::get_all_settings(&db)
        .await
        .map_err(|e| format!("读取旧主题背景失败: {e}"))?
        .theme_background_path;
    if target.exists() {
        fs::remove_file(&target).map_err(|e| format!("替换旧主题背景失败: {e}"))?;
    }
    fs::rename(&temp, &target).map_err(|e| format!("写入主题背景失败: {e}"))?;
    if let Some(old) = old {
        let old_path = root.join(safe_relative_path(&old)?);
        if old_path != target {
            let _ = fs::remove_file(old_path);
        }
    }

    let timestamp = now_ms();
    let transaction = db
        .begin()
        .await
        .map_err(|e| format!("开启主题事务失败: {e}"))?;
    if theme_packages::Entity::find_by_id(CUSTOM_PACKAGE_ID)
        .one(&transaction)
        .await
        .map_err(|e| format!("读取自定义主题包失败: {e}"))?
        .is_none()
    {
        theme_packages::ActiveModel {
            id: Set(CUSTOM_PACKAGE_ID.to_string()),
            name: Set("自定义主题".to_string()),
            version: Set("1.0.0".to_string()),
            author: Set(None),
            description: Set(Some("ReinaManager 自定义外观".to_string())),
            manifest_hash: Set("builtin".to_string()),
            installed_at: Set(timestamp),
            updated_at: Set(timestamp),
        }
        .insert(&transaction)
        .await
        .map_err(|e| format!("创建自定义主题包失败: {e}"))?;
    }
    theme_assets::Entity::delete_many()
        .filter(theme_assets::Column::PackageId.eq(CUSTOM_PACKAGE_ID))
        .exec(&transaction)
        .await
        .map_err(|e| format!("清理旧主题资源记录失败: {e}"))?;
    theme_assets::ActiveModel {
        package_id: Set(CUSTOM_PACKAGE_ID.to_string()),
        relative_path: Set("assets/background.".to_string() + &extension),
        mime_type: Set(metadata.0.clone()),
        width: Set(metadata.1 as i32),
        height: Set(metadata.2 as i32),
        size_bytes: Set(metadata.3 as i64),
        sha256: Set(metadata.4.clone()),
        updated_at: Set(timestamp),
        ..Default::default()
    }
    .insert(&transaction)
    .await
    .map_err(|e| format!("写入主题资源记录失败: {e}"))?;
    transaction
        .commit()
        .await
        .map_err(|e| format!("提交主题事务失败: {e}"))?;
    SettingsRepository::update_settings(
        &db,
        UpdateSettingsData {
            active_theme_package_id: Some(Some(CUSTOM_PACKAGE_ID.to_string())),
            theme_background_path: Some(Some(relative_path.clone())),
            theme_background_width: Some(Some(metadata.1 as i32)),
            theme_background_height: Some(Some(metadata.2 as i32)),
            theme_background_hash: Some(Some(metadata.4.clone())),
            theme_background_updated_at: Some(Some(timestamp)),
            ..Default::default()
        },
    )
    .await
    .map_err(|e| format!("保存主题背景设置失败: {e}"))?;
    Ok(ThemeAssetInfo {
        relative_path,
        mime_type: metadata.0,
        width: metadata.1,
        height: metadata.2,
        size_bytes: metadata.3,
        sha256: metadata.4,
        updated_at: timestamp,
    })
}

#[command]
pub async fn remove_theme_background(db: State<'_, DatabaseConnection>) -> Result<(), String> {
    let root = themes_dir()?;
    let settings = SettingsRepository::get_all_settings(&db)
        .await
        .map_err(|e| format!("读取主题设置失败: {e}"))?;
    if let Some(path) = settings.theme_background_path {
        let _ = fs::remove_file(root.join(safe_relative_path(&path)?));
    }
    SettingsRepository::update_settings(
        &db,
        UpdateSettingsData {
            theme_background_path: Some(None),
            ..Default::default()
        },
    )
    .await
    .map_err(|e| format!("移除主题背景失败: {e}"))
}

fn parse_manifest(bytes: &[u8]) -> Result<ThemeManifest, String> {
    if bytes.len() > MANIFEST_MAX_BYTES {
        return Err("主题 manifest 不能超过 64 KB".to_string());
    }
    let manifest: ThemeManifest =
        serde_json::from_slice(bytes).map_err(|e| format!("主题 manifest 无效: {e}"))?;
    if manifest.schema_version != THEME_MANIFEST_SCHEMA_VERSION {
        return Err(format!(
            "不支持的主题 manifest 版本: {}",
            manifest.schema_version
        ));
    }
    safe_package_id(&manifest.id)?;
    if manifest.name.trim().is_empty() || manifest.version.trim().is_empty() {
        return Err("主题名称和版本不能为空".to_string());
    }
    if !(0.0..=1.0).contains(&manifest.appearance.overlay_opacity)
        || !(0.0..=40.0).contains(&manifest.appearance.blur)
        || !matches!(
            manifest.appearance.background_size.as_str(),
            "cover" | "contain" | "fill"
        )
        || !matches!(
            manifest.appearance.apply_scope.as_str(),
            "light" | "dark" | "all"
        )
    {
        return Err("主题外观参数超出允许范围".to_string());
    }
    if let Some(mui) = &manifest.mui {
        validate_mui_config(mui)?;
    }
    Ok(manifest)
}

/// 校验主题包 MUI 样式配置的结构。
///
/// 允许的顶层键：`components`（仅 `Mui*` 前缀且值为对象）、`typography`（对象）、
/// `shape`（对象）、`cssVariables`（仅 `--` 前缀且值为字符串或数字）。
fn validate_mui_config(value: &serde_json::Value) -> Result<(), String> {
    let object = value
        .as_object()
        .ok_or_else(|| "主题 mui 配置必须是对象".to_string())?;
    const ALLOWED_KEYS: [&str; 4] = ["components", "typography", "shape", "cssVariables"];
    for key in object.keys() {
        if !ALLOWED_KEYS.contains(&key.as_str()) {
            return Err(format!("主题 mui 配置包含未知字段: {key}"));
        }
    }
    if let Some(components) = object.get("components") {
        let components = components
            .as_object()
            .ok_or_else(|| "mui.components 必须是对象".to_string())?;
        for (key, value) in components {
            if !key.starts_with("Mui") {
                return Err(format!("mui.components 键必须以 Mui 开头: {key}"));
            }
            if !value.is_object() {
                return Err(format!("mui.components.{key} 必须是对象"));
            }
        }
    }
    if let Some(typography) = object.get("typography") {
        if !typography.is_object() {
            return Err("mui.typography 必须是对象".to_string());
        }
    }
    if let Some(shape) = object.get("shape") {
        if !shape.is_object() {
            return Err("mui.shape 必须是对象".to_string());
        }
    }
    if let Some(css) = object.get("cssVariables") {
        let css = css
            .as_object()
            .ok_or_else(|| "mui.cssVariables 必须是对象".to_string())?;
        for (key, value) in css {
            if !key.starts_with("--") {
                return Err(format!("mui.cssVariables 键必须以 -- 开头: {key}"));
            }
            if !(value.is_string() || value.is_number()) {
                return Err(format!(
                    "mui.cssVariables.{key} 的值必须是字符串或数字"
                ));
            }
        }
    }
    Ok(())
}

fn extract_package(
    source_path: &Path,
) -> Result<(PathBuf, ThemeManifest, String, Vec<ThemeAssetInfo>), String> {
    let mut archive =
        ZipArchive::new(File::open(source_path).map_err(|e| format!("打开主题包失败: {e}"))?)
            .map_err(|e| format!("读取主题 ZIP 失败: {e}"))?;
    let temp = std::env::temp_dir().join(format!("reina_theme_import_{}", now_ms()));
    fs::create_dir_all(&temp).map_err(|e| format!("创建主题临时目录失败: {e}"))?;
    let result = (|| {
        let mut manifest_bytes = None;
        for index in 0..archive.len() {
            let mut entry = archive
                .by_index(index)
                .map_err(|e| format!("读取主题包条目失败: {e}"))?;
            let name = entry.name().replace('\\', "/");
            if name == "manifest.json" {
                let mut bytes = Vec::new();
                entry
                    .read_to_end(&mut bytes)
                    .map_err(|e| format!("读取主题 manifest 失败: {e}"))?;
                fs::write(temp.join("manifest.json"), &bytes)
                    .map_err(|e| format!("写入主题 manifest 失败: {e}"))?;
                manifest_bytes = Some(bytes);
                continue;
            }
            if entry.is_dir() {
                continue;
            }
            let relative = safe_relative_path(&name)?;
            if !name.starts_with("assets/") {
                return Err("主题包只能包含 manifest.json 和 assets/ 下的资源".to_string());
            }
            let target = temp.join(&relative);
            if let Some(parent) = target.parent() {
                fs::create_dir_all(parent).map_err(|e| format!("创建主题资源目录失败: {e}"))?;
            }
            let mut output = File::create(&target).map_err(|e| format!("创建主题资源失败: {e}"))?;
            std::io::copy(&mut entry, &mut output).map_err(|e| format!("解压主题资源失败: {e}"))?;
        }
        let manifest_bytes =
            manifest_bytes.ok_or_else(|| "主题包缺少 manifest.json".to_string())?;
        let manifest = parse_manifest(&manifest_bytes)?;
        let assets_dir = temp.join("assets");
        let mut assets = Vec::new();
        if assets_dir.exists() {
            for entry in walkdir::WalkDir::new(&assets_dir)
                .into_iter()
                .filter_map(Result::ok)
            {
                if !entry.file_type().is_file() {
                    continue;
                }
                let relative = entry
                    .path()
                    .strip_prefix(&temp)
                    .map_err(|e| e.to_string())?
                    .to_string_lossy()
                    .replace('\\', "/");
                let metadata = image_metadata(entry.path())?;
                assets.push(ThemeAssetInfo {
                    relative_path: relative,
                    mime_type: metadata.0,
                    width: metadata.1,
                    height: metadata.2,
                    size_bytes: metadata.3,
                    sha256: metadata.4,
                    updated_at: now_ms(),
                });
            }
        }
        Ok((
            manifest,
            format!("{:x}", Sha256::digest(&manifest_bytes)),
            assets,
        ))
    })();
    match result {
        Ok((manifest, hash, assets)) => Ok((temp, manifest, hash, assets)),
        Err(error) => {
            let _ = fs::remove_dir_all(&temp);
            Err(error)
        }
    }
}

#[command]
pub async fn import_theme_package(
    db: State<'_, DatabaseConnection>,
    source_path: String,
    overwrite: bool,
) -> Result<ThemePackageInfo, String> {
    import_theme_package_impl(&db, Path::new(&source_path), overwrite).await
}

async fn import_theme_package_impl(
    db: &DatabaseConnection,
    source_path: &Path,
    overwrite: bool,
) -> Result<ThemePackageInfo, String> {
    let (temp, manifest, manifest_hash, assets) = extract_package(source_path)?;
    let root = themes_dir()?;
    let final_dir = package_dir(&root, &manifest.id)?;
    let exists = theme_packages::Entity::find_by_id(&manifest.id)
        .one(db)
        .await
        .map_err(|e| format!("检查主题包冲突失败: {e}"))?
        .is_some();
    if exists && !overwrite {
        let _ = fs::remove_dir_all(&temp);
        return Err("主题包已存在，需要确认覆盖".to_string());
    }
    let backup_dir = root.join(format!(".{}.old", manifest.id));
    if exists {
        let _ = fs::remove_dir_all(&backup_dir);
        fs::rename(&final_dir, &backup_dir).map_err(|e| format!("备份旧主题包失败: {e}"))?;
    }
    if let Err(error) = fs::rename(&temp, &final_dir) {
        if exists {
            let _ = fs::rename(&backup_dir, &final_dir);
        }
        let _ = fs::remove_dir_all(&temp);
        return Err(format!("安装主题包资源失败: {error}"));
    }

    let timestamp = now_ms();
    let transaction = db
        .begin()
        .await
        .map_err(|e| format!("开启主题导入事务失败: {e}"))?;
    let result = async {
        if exists {
            theme_assets::Entity::delete_many()
                .filter(theme_assets::Column::PackageId.eq(&manifest.id))
                .exec(&transaction)
                .await?;
            theme_packages::Entity::delete_by_id(&manifest.id)
                .exec(&transaction)
                .await?;
        }
        theme_packages::ActiveModel {
            id: Set(manifest.id.clone()),
            name: Set(manifest.name.clone()),
            version: Set(manifest.version.clone()),
            author: Set(manifest.author.clone()),
            description: Set(manifest.description.clone()),
            manifest_hash: Set(manifest_hash.clone()),
            installed_at: Set(timestamp),
            updated_at: Set(timestamp),
        }
        .insert(&transaction)
        .await?;
        for asset in &assets {
            theme_assets::ActiveModel {
                package_id: Set(manifest.id.clone()),
                relative_path: Set(asset.relative_path.clone()),
                mime_type: Set(asset.mime_type.clone()),
                width: Set(asset.width as i32),
                height: Set(asset.height as i32),
                size_bytes: Set(asset.size_bytes as i64),
                sha256: Set(asset.sha256.clone()),
                updated_at: Set(asset.updated_at),
                ..Default::default()
            }
            .insert(&transaction)
            .await?;
        }
        Ok::<(), sea_orm::DbErr>(())
    }
    .await;
    if let Err(error) = result {
        transaction.rollback().await.ok();
        let _ = fs::remove_dir_all(&final_dir);
        if exists {
            let _ = fs::rename(&backup_dir, &final_dir);
        }
        return Err(format!("写入主题包数据库记录失败: {error}"));
    }
    transaction
        .commit()
        .await
        .map_err(|e| format!("提交主题导入事务失败: {e}"))?;
    if exists {
        let _ = fs::remove_dir_all(&backup_dir);
    }
    package_infos(&db)
        .await?
        .into_iter()
        .find(|package| package.id == manifest.id)
        .ok_or_else(|| "导入后读取主题包失败".to_string())
}

#[command]
pub async fn delete_theme_package(
    db: State<'_, DatabaseConnection>,
    package_id: String,
) -> Result<(), String> {
    delete_theme_package_impl(&db, &package_id).await
}

async fn delete_theme_package_impl(
    db: &DatabaseConnection,
    package_id: &str,
) -> Result<(), String> {
    safe_package_id(package_id)?;
    if package_id == CUSTOM_PACKAGE_ID {
        return Err("自定义主题包不能删除".to_string());
    }
    let root = themes_dir()?;
    let transaction = db
        .begin()
        .await
        .map_err(|e| format!("开启删除主题事务失败: {e}"))?;
    theme_assets::Entity::delete_many()
        .filter(theme_assets::Column::PackageId.eq(package_id))
        .exec(&transaction)
        .await
        .map_err(|e| format!("删除主题资源记录失败: {e}"))?;
    theme_packages::Entity::delete_by_id(package_id)
        .exec(&transaction)
        .await
        .map_err(|e| format!("删除主题包记录失败: {e}"))?;
    transaction
        .commit()
        .await
        .map_err(|e| format!("提交删除主题事务失败: {e}"))?;
    let _ = fs::remove_dir_all(package_dir(&root, package_id)?);
    Ok(())
}

/// 原子写入文件（先写临时文件再重命名，避免半写状态）。
fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let temp = path.with_extension("tmp");
    fs::write(&temp, bytes).map_err(|e| format!("写入临时文件失败: {e}"))?;
    fs::rename(&temp, path).map_err(|e| format!("替换文件失败: {e}"))?;
    Ok(())
}

#[command]
pub async fn update_theme_package_info(
    db: State<'_, DatabaseConnection>,
    package_id: String,
    name: Option<String>,
    author: Option<Option<String>>,
    description: Option<Option<String>>,
    version: Option<String>,
) -> Result<(), String> {
    update_theme_package_info_impl(&db, &package_id, name, author, description, version).await
}

async fn update_theme_package_info_impl(
    db: &DatabaseConnection,
    package_id: &str,
    name: Option<String>,
    author: Option<Option<String>>,
    description: Option<Option<String>>,
    version: Option<String>,
) -> Result<(), String> {
    safe_package_id(package_id)?;
    if name.is_none() && author.is_none() && description.is_none() && version.is_none() {
        return Err("没有需要更新的字段".to_string());
    }
    let (name, author, description, version) =
        normalize_theme_metadata(name, author, description, version)?;

    let existing = theme_packages::Entity::find_by_id(package_id)
        .one(db)
        .await
        .map_err(|e| format!("读取主题包失败: {e}"))?
        .ok_or_else(|| "主题包不存在".to_string())?;

    let root = themes_dir()?;
    let manifest_path = package_dir(&root, package_id)?.join("manifest.json");
    let old_manifest_bytes = match fs::read(&manifest_path) {
        Ok(bytes) => Some(bytes),
        Err(_) if package_id == CUSTOM_PACKAGE_ID => None,
        Err(error) => return Err(format!("读取主题 manifest 失败: {error}")),
    };
    let mut manifest = if let Some(bytes) = old_manifest_bytes.as_deref() {
        parse_manifest(bytes)?
    } else {
        // 自定义主题包从未保存过：按当前设置生成基础 manifest。
        let settings = SettingsRepository::get_all_settings(db)
            .await
            .map_err(|e| format!("读取主题设置失败: {e}"))?;
        custom_manifest_from_settings(&settings, Some(&existing), None)
    };
    if let Some(name) = name {
        manifest.name = name;
    }
    if let Some(author) = author {
        manifest.author = author.filter(|value| !value.is_empty());
    }
    if let Some(description) = description {
        manifest.description = description.filter(|value| !value.is_empty());
    }
    if let Some(version) = version {
        manifest.version = version;
    }
    let new_manifest_bytes = serde_json::to_vec_pretty(&manifest)
        .map_err(|e| format!("序列化主题 manifest 失败: {e}"))?;
    let new_hash = format!("{:x}", Sha256::digest(&new_manifest_bytes));

    // 先原子替换磁盘 manifest，再更新数据库；数据库失败时回滚文件。
    atomic_write(&manifest_path, &new_manifest_bytes)?;
    let transaction = db
        .begin()
        .await
        .map_err(|e| format!("开启主题编辑事务失败: {e}"))?;
    let mut active: theme_packages::ActiveModel = existing.into();
    active.name = Set(manifest.name);
    active.version = Set(manifest.version);
    active.author = Set(manifest.author);
    active.description = Set(manifest.description);
    active.manifest_hash = Set(new_hash);
    active.updated_at = Set(now_ms());
    if let Err(error) = active.update(&transaction).await {
        transaction.rollback().await.ok();
        if let Some(bytes) = old_manifest_bytes {
            let _ = atomic_write(&manifest_path, &bytes);
        } else {
            let _ = fs::remove_file(&manifest_path);
        }
        return Err(format!("更新主题包记录失败: {error}"));
    }
    transaction
        .commit()
        .await
        .map_err(|e| format!("提交主题编辑事务失败: {e}"))?;
    Ok(())
}

/// 计算文件的 SHA-256，用于导出前的完整性校验。
fn file_sha256(path: &Path) -> Result<String, String> {
    let mut file = File::open(path).map_err(|e| format!("读取文件失败: {e}"))?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|e| format!("计算文件 hash 失败: {e}"))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

#[command]
pub async fn export_theme_package(
    db: State<'_, DatabaseConnection>,
    package_id: String,
    destination_path: String,
) -> Result<(), String> {
    export_theme_package_impl(&db, &package_id, &destination_path).await
}

async fn export_theme_package_impl(
    db: &DatabaseConnection,
    package_id: &str,
    destination_path: &str,
) -> Result<(), String> {
    safe_package_id(package_id)?;
    let root = themes_dir()?;
    let package = package_infos(db)
        .await?
        .into_iter()
        .find(|package| package.id == package_id)
        .ok_or_else(|| "主题包不存在".to_string())?;
    let package_root = root.join(package_id);
    let manifest_path = package_root.join("manifest.json");
    let manifest =
        fs::read(&manifest_path).map_err(|e| format!("读取主题 manifest 失败: {e}"))?;
    // 导出前完整性校验：manifest 与数据库记录的 hash 一致。
    let actual_manifest_hash = format!("{:x}", Sha256::digest(&manifest));
    if actual_manifest_hash != package.manifest_hash {
        return Err(
            "主题包 manifest 与数据库记录不一致（文件可能被修改），请重新导入该主题包后重试"
                .to_string(),
        );
    }
    // 导出前完整性校验：每个资源文件存在且 hash 与数据库一致。
    for asset in &package.assets {
        let source = package_root.join(safe_relative_path(&asset.relative_path)?);
        if !source.exists() {
            return Err(format!("主题资源缺失，无法导出: {}", asset.relative_path));
        }
        let actual = file_sha256(&source)?;
        if actual != asset.sha256 {
            return Err(format!(
                "主题资源 hash 不一致，无法导出: {}",
                asset.relative_path
            ));
        }
    }
    let output = File::create(&destination_path).map_err(|e| format!("创建主题包文件失败: {e}"))?;
    let mut writer = ZipWriter::new(output);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    writer
        .start_file("manifest.json", options)
        .map_err(|e| e.to_string())?;
    writer.write_all(&manifest).map_err(|e| e.to_string())?;
    for asset in &package.assets {
        let source = package_root.join(safe_relative_path(&asset.relative_path)?);
        let archive_path = format!(
            "assets/{}",
            Path::new(&asset.relative_path)
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("background")
        );
        writer
            .start_file(archive_path, options)
            .map_err(|e| e.to_string())?;
        writer
            .write_all(&fs::read(source).map_err(|e| format!("读取主题资源失败: {e}"))?)
            .map_err(|e| e.to_string())?;
    }
    writer
        .finish()
        .map_err(|e| format!("完成主题包导出失败: {e}"))?;
    Ok(())
}

#[command]
pub fn resolve_theme_asset_url(relative_path: String) -> Result<String, String> {
    safe_relative_path(&relative_path)?;
    log::debug!("input={}", relative_path);
    let encoded: String =
        url::form_urlencoded::byte_serialize(relative_path.as_bytes()).collect();
    // Windows/Android 的 WebView2 不支持自定义 scheme，wry 用 http://<scheme>.localhost
    // 作为 workaround（见 wry custom_protocol_workaround），其他平台直接用 <scheme>://localhost。
    #[cfg(target_os = "windows")]
    {
        Ok(format!("http://reina-theme.localhost/asset?path={encoded}"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(format!("reina-theme://localhost/asset?path={encoded}"))
    }
}

#[command]
pub async fn cleanup_theme_assets(
    db: State<'_, DatabaseConnection>,
) -> Result<ThemeCleanupResult, String> {
    let root = themes_dir()?;
    let packages = theme_packages::Entity::find()
        .all(db.inner())
        .await
        .map_err(|e| format!("读取主题包失败: {e}"))?;
    let mut removed_files = 0;
    let mut removed_directories = 0;
    for package in packages {
        let package_root = package_dir(&root, &package.id)?;
        let assets = theme_assets::Entity::find()
            .filter(theme_assets::Column::PackageId.eq(&package.id))
            .all(db.inner())
            .await
            .map_err(|e| format!("读取主题资源失败: {e}"))?;
        let known: std::collections::HashSet<String> = assets
            .into_iter()
            .map(|asset| asset.relative_path)
            .collect();
        let assets_root = package_root.join("assets");
        if assets_root.exists() {
            for entry in walkdir::WalkDir::new(&assets_root)
                .into_iter()
                .filter_map(Result::ok)
            {
                if entry.file_type().is_file() {
                    let relative = entry
                        .path()
                        .strip_prefix(&package_root)
                        .map_err(|e| e.to_string())?
                        .to_string_lossy()
                        .replace('\\', "/");
                    if !known.contains(&relative) {
                        fs::remove_file(entry.path())
                            .map_err(|e| format!("清理主题孤儿文件失败: {e}"))?;
                        removed_files += 1;
                    }
                }
            }
        }
        let manifest = package_root.join("manifest.json");
        if !manifest.exists() && package.id != CUSTOM_PACKAGE_ID {
            let _ = fs::remove_dir_all(&package_root);
            removed_directories += 1;
        }
    }
    Ok(ThemeCleanupResult {
        removed_files,
        removed_directories,
    })
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeAssetsStatus {
    /// 数据库有记录但文件缺失的资源（格式 `package_id/relative_path`）。
    pub missing: Vec<String>,
    /// 文件存在但数据库无记录的资源（格式 `package_id/relative_path`）。
    pub orphans: Vec<String>,
}

/// 扫描主题资源一致性：缺失（DB 有、文件无）与孤儿（文件有、DB 无）。
pub async fn scan_theme_assets(
    db: &DatabaseConnection,
) -> Result<ThemeAssetsStatus, String> {
    let root = themes_dir()?;
    let packages = theme_packages::Entity::find()
        .all(db)
        .await
        .map_err(|e| format!("读取主题包失败: {e}"))?;
    let mut missing = Vec::new();
    let mut orphans = Vec::new();
    for package in packages {
        let package_root = package_dir(&root, &package.id)?;
        let assets = theme_assets::Entity::find()
            .filter(theme_assets::Column::PackageId.eq(&package.id))
            .all(db)
            .await
            .map_err(|e| format!("读取主题资源元数据失败: {e}"))?;
        let known: std::collections::HashSet<String> =
            assets.iter().map(|asset| asset.relative_path.clone()).collect();
        for asset in assets {
            let path = package_root.join(safe_relative_path(&asset.relative_path)?);
            if !path.exists() {
                missing.push(format!("{}/{}", package.id, asset.relative_path));
            }
        }
        let assets_root = package_root.join("assets");
        if assets_root.exists() {
            for entry in walkdir::WalkDir::new(&assets_root)
                .into_iter()
                .filter_map(Result::ok)
            {
                if entry.file_type().is_file() {
                    let relative = entry
                        .path()
                        .strip_prefix(&package_root)
                        .map_err(|e| e.to_string())?
                        .to_string_lossy()
                        .replace('\\', "/");
                    if !known.contains(&relative) {
                        orphans.push(format!("{}/{}", package.id, relative));
                    }
                }
            }
        }
    }
    Ok(ThemeAssetsStatus { missing, orphans })
}

#[command]
pub async fn get_theme_assets_status(
    db: State<'_, DatabaseConnection>,
) -> Result<ThemeAssetsStatus, String> {
    scan_theme_assets(&db).await
}

pub fn register_theme_protocol<R: tauri::Runtime>(builder: tauri::Builder<R>) -> tauri::Builder<R> {
    builder.register_asynchronous_uri_scheme_protocol("reina-theme", |_app, request, responder| {
        let request_uri = request.uri().to_string();
        tauri::async_runtime::spawn(async move {
            let parsed = match url::Url::parse(&request_uri) {
                Ok(value) => value,
                Err(_) => {
                    responder.respond(
                        Response::builder()
                            .status(StatusCode::BAD_REQUEST)
                            .body(Vec::new())
                            .unwrap(),
                    );
                    return;
                }
            };
            let relative = parsed
                .query_pairs()
                .find(|(key, _)| key == "path")
                .map(|(_, value)| value.into_owned());
            let Some(relative) = relative else {
                responder.respond(
                    Response::builder()
                        .status(StatusCode::BAD_REQUEST)
                        .body(Vec::new())
                        .unwrap(),
                );
                return;
            };
            let result = (|| {
                let path = themes_dir()
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
                    .join(safe_relative_path(&relative).map_err(|_| StatusCode::BAD_REQUEST)?);
                let bytes = fs::read(&path).map_err(|_| StatusCode::NOT_FOUND)?;
                let content_type = detect_image_info(&bytes)
                    .map(|(mime, _, _)| mime)
                    .unwrap_or("application/octet-stream");
                Ok::<_, StatusCode>(
                    Response::builder()
                        .status(StatusCode::OK)
                        .header("Content-Type", content_type)
                        .header("Cache-Control", "private, max-age=3600")
                        .body(bytes)
                        .unwrap(),
                )
            })();
            responder.respond(result.unwrap_or_else(|status| {
                Response::builder().status(status).body(Vec::new()).unwrap()
            }));
        });
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn unique_path(file_name: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        std::env::temp_dir().join(format!("reina_theme_test_{unique}_{file_name}"))
    }

    #[test]
    fn safe_relative_path_rejects_path_traversal() {
        assert!(safe_relative_path("assets/background.png").is_ok());
        assert!(safe_relative_path("../background.png").is_err());
        assert!(safe_relative_path("assets/../../background.png").is_err());
    }

    #[test]
    fn parse_manifest_rejects_invalid_values() {
        let valid = br##"{
            "schemaVersion": 2,
            "id": "theme_one",
            "name": "Theme One",
            "version": "1.0.0",
            "appearance": {
                "background": "assets/background.png",
                "overlayOpacity": 0.35,
                "blur": 8,
                "backgroundSize": "cover",
                "accentColor": "#7c4dff",
                "applyScope": "all"
            }
        }"##;
        assert_eq!(parse_manifest(valid).unwrap().id, "theme_one");

        let invalid = br##"{
            "schemaVersion": 2,
            "id": "bad/theme",
            "name": "Theme One",
            "version": "1.0.0",
            "appearance": {
                "background": "assets/background.png",
                "overlayOpacity": 2,
                "blur": 8,
                "backgroundSize": "cover",
                "accentColor": "#7c4dff",
                "applyScope": "all"
            }
        }"##;
        assert!(parse_manifest(invalid).is_err());
    }

    #[test]
    fn parse_manifest_rejects_old_schema_version() {
        let old = br##"{
            "schemaVersion": 1,
            "id": "theme_one",
            "name": "Theme One",
            "version": "1.0.0",
            "appearance": {
                "overlayOpacity": 0.35,
                "blur": 8,
                "backgroundSize": "cover",
                "accentColor": "#7c4dff",
                "applyScope": "all"
            }
        }"##;
        assert!(parse_manifest(old).is_err());
    }

    #[test]
    fn validate_mui_config_accepts_valid_and_rejects_invalid() {
        let valid = serde_json::json!({
            "components": {
                "MuiButton": { "styleOverrides": { "root": { "textTransform": "none" } } }
            },
            "typography": { "fontSize": 14 },
            "shape": { "borderRadius": 8 },
            "cssVariables": { "--reina-accent": "#7c4dff", "--reina-radius": 8 }
        });
        assert!(validate_mui_config(&valid).is_ok());

        let unknown_top = serde_json::json!({ "palette": {} });
        assert!(validate_mui_config(&unknown_top).is_err());

        let non_mui_component = serde_json::json!({ "components": { "Button": {} } });
        assert!(validate_mui_config(&non_mui_component).is_err());

        let non_object_component = serde_json::json!({ "components": { "MuiButton": 1 } });
        assert!(validate_mui_config(&non_object_component).is_err());

        let bad_css_key = serde_json::json!({ "cssVariables": { "accent": "#fff" } });
        assert!(validate_mui_config(&bad_css_key).is_err());

        let bad_css_value = serde_json::json!({ "cssVariables": { "--accent": true } });
        assert!(validate_mui_config(&bad_css_value).is_err());

        let non_object_typography = serde_json::json!({ "typography": 1 });
        assert!(validate_mui_config(&non_object_typography).is_err());
    }

    #[test]
    fn parse_manifest_rejects_oversized_manifest() {
        let mut manifest = serde_json::json!({
            "schemaVersion": 2,
            "id": "theme_one",
            "name": "Theme One",
            "version": "1.0.0",
            "appearance": {
                "overlayOpacity": 0.35,
                "blur": 8,
                "backgroundSize": "cover",
                "accentColor": "#7c4dff",
                "applyScope": "all"
            }
        })
        .to_string()
        .into_bytes();
        manifest.resize(MANIFEST_MAX_BYTES + 1, b' ');
        assert!(parse_manifest(&manifest).is_err());
    }

    #[test]
    fn parse_manifest_accepts_mui_config() {
        let with_mui = br##"{
            "schemaVersion": 2,
            "id": "theme_mui",
            "name": "MUI Theme",
            "version": "1.0.0",
            "appearance": {
                "overlayOpacity": 0.35,
                "blur": 8,
                "backgroundSize": "cover",
                "accentColor": "#7c4dff",
                "applyScope": "all"
            },
            "mui": {
                "components": { "MuiButton": { "defaultProps": { "disableRipple": true } } },
                "cssVariables": { "--reina-accent": "#7c4dff" }
            }
        }"##;
        let manifest = parse_manifest(with_mui).unwrap();
        assert!(manifest.mui.is_some());
    }

    #[test]
    fn detects_png_jpeg_and_webp_dimensions() {
        let png = [
            0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, b'I', b'H', b'D', b'R',
            0, 0, 0, 2, 0, 0, 0, 3,
        ];
        assert_eq!(detect_image_info(&png).unwrap(), ("image/png", 2, 3));

        let jpeg = [
            0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, 0, 4, 0, 5, 3, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0,
        ];
        assert_eq!(detect_image_info(&jpeg).unwrap(), ("image/jpeg", 5, 4));

        let mut webp = Vec::new();
        webp.extend_from_slice(b"RIFF");
        webp.extend_from_slice(&[22, 0, 0, 0]);
        webp.extend_from_slice(b"WEBPVP8X");
        webp.extend_from_slice(&[10, 0, 0, 0, 0, 0, 0, 0]);
        webp.extend_from_slice(&[1, 0, 0, 2, 0, 0]);
        assert_eq!(detect_image_info(&webp).unwrap(), ("image/webp", 2, 3));
    }

    #[test]
    fn image_metadata_allows_extension_mismatch() {
        let path = unique_path("background.jpg");
        let png = [
            0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, b'I', b'H', b'D', b'R',
            0, 0, 0, 2, 0, 0, 0, 3,
        ];
        fs::write(&path, png).unwrap();
        let metadata = image_metadata(&path).unwrap();
        assert_eq!(metadata.0, "image/png");
        assert_eq!(metadata.1, 2);
        assert_eq!(metadata.2, 3);
        fs::remove_file(path).unwrap();
    }

    #[test]
    fn image_metadata_rejects_oversized_and_corrupt() {
        // 宽度 8193（0x2001）超出 8192 上限。
        let mut png = vec![
            0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, b'I', b'H', b'D', b'R',
        ];
        png.extend_from_slice(&[0, 0x20, 0x01, 0]);
        png.extend_from_slice(&[0, 0, 0, 3]);
        let oversize = unique_path("oversize.png");
        fs::write(&oversize, &png).unwrap();
        let error = image_metadata(&oversize).unwrap_err();
        assert!(error.contains("8192"), "错误信息: {error}");
        fs::remove_file(oversize).unwrap();

        // 损坏图片：不是任何受支持格式。
        let corrupt = unique_path("corrupt.png");
        fs::write(&corrupt, b"this is not an image").unwrap();
        assert!(image_metadata(&corrupt).is_err());
        fs::remove_file(corrupt).unwrap();
    }

    // ── 集成测试（内存数据库 + 临时主题目录）──────────────────────────

    /// 串行化集成测试，避免共享临时目录并行干扰。
    static TEST_LOCK: std::sync::Mutex<()> = std::sync::Mutex::new(());

    fn test_png() -> Vec<u8> {
        vec![
            0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, b'I', b'H', b'D', b'R',
            0, 0, 0, 2, 0, 0, 0, 3,
        ]
    }

    fn unique_package_id(prefix: &str) -> String {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        format!("{prefix}_{unique}")
    }

    async fn test_db() -> DatabaseConnection {
        use migration::MigratorTrait;
        let conn = sea_orm::Database::connect("sqlite::memory:")
            .await
            .expect("连接测试数据库失败");
        migration::Migrator::up(&conn, None)
            .await
            .expect("执行测试迁移失败");
        conn
    }

    fn make_theme_zip(path: &Path, manifest: &serde_json::Value, background: &[u8]) {
        let file = File::create(path).expect("创建测试 ZIP 失败");
        let mut writer = ZipWriter::new(file);
        let options = SimpleFileOptions::default();
        writer
            .start_file("manifest.json", options)
            .expect("写入 manifest 条目失败");
        writer
            .write_all(&serde_json::to_vec_pretty(manifest).unwrap())
            .unwrap();
        writer
            .start_file("assets/background.png", options)
            .expect("写入资源条目失败");
        writer.write_all(background).unwrap();
        writer.finish().expect("完成测试 ZIP 失败");
    }

    fn base_manifest(package_id: &str, name: &str) -> serde_json::Value {
        serde_json::json!({
            "schemaVersion": 2,
            "id": package_id,
            "name": name,
            "version": "1.0.0",
            "author": "tester",
            "description": "integration test",
            "appearance": {
                "background": "assets/background.png",
                "overlayOpacity": 0.4,
                "blur": 4,
                "backgroundSize": "cover",
                "accentColor": "#7c4dff",
                "applyScope": "all"
            }
        })
    }

    #[test]
    fn import_export_roundtrip_with_mui_preserves_hashes() {
        let _guard = TEST_LOCK.lock().unwrap();
        tauri::async_runtime::block_on(async {
            let db = test_db().await;
            let package_id = unique_package_id("roundtrip");
            let mut manifest = base_manifest(&package_id, "Roundtrip Theme");
            manifest["palette"] = serde_json::json!({
                "light": { "primary": "#112233" },
                "dark": { "primary": "#445566" }
            });
            manifest["mui"] = serde_json::json!({
                "components": { "MuiButton": { "defaultProps": { "disableRipple": true } } },
                "cssVariables": { "--reina-accent": "#7c4dff" }
            });
            let zip_path = unique_path("roundtrip.zip");
            make_theme_zip(&zip_path, &manifest, &test_png());

            let imported = import_theme_package_impl(&db, &zip_path, false)
                .await
                .expect("导入失败");
            assert_eq!(imported.name, "Roundtrip Theme");
            assert!(imported.has_mui_config);
            assert!(imported.mui.is_some());
            assert_eq!(imported.assets.len(), 1);

            // 磁盘 manifest 与数据库 hash 一致。
            let root = themes_dir().unwrap();
            let manifest_bytes = fs::read(root.join(&package_id).join("manifest.json")).unwrap();
            assert_eq!(
                format!("{:x}", Sha256::digest(&manifest_bytes)),
                imported.manifest_hash
            );

            // 导出并校验 manifest 原样一致、资源完整。
            let out_path = unique_path("roundtrip-export.zip");
            export_theme_package_impl(&db, &package_id, &out_path.to_string_lossy())
                .await
                .expect("导出失败");
            let mut archive = ZipArchive::new(File::open(&out_path).unwrap()).unwrap();
            let mut exported_manifest = Vec::new();
            archive
                .by_name("manifest.json")
                .unwrap()
                .read_to_end(&mut exported_manifest)
                .unwrap();
            assert_eq!(
                format!("{:x}", Sha256::digest(&exported_manifest)),
                imported.manifest_hash
            );
            let parsed: serde_json::Value = serde_json::from_slice(&exported_manifest).unwrap();
            assert_eq!(
                parsed["mui"]["components"]["MuiButton"]["defaultProps"]["disableRipple"],
                true
            );
            let mut exported_bg = Vec::new();
            archive
                .by_name("assets/background.png")
                .unwrap()
                .read_to_end(&mut exported_bg)
                .unwrap();
            assert_eq!(exported_bg, test_png());

            fs::remove_file(&zip_path).ok();
            fs::remove_file(&out_path).ok();
            delete_theme_package_impl(&db, &package_id).await.ok();
        });
    }

    #[test]
    fn import_rejects_missing_manifest() {
        let _guard = TEST_LOCK.lock().unwrap();
        tauri::async_runtime::block_on(async {
            let db = test_db().await;
            let zip_path = unique_path("no-manifest.zip");
            let file = File::create(&zip_path).unwrap();
            let mut writer = ZipWriter::new(file);
            writer
                .start_file("assets/background.png", SimpleFileOptions::default())
                .unwrap();
            writer.write_all(&test_png()).unwrap();
            writer.finish().unwrap();

            let error = import_theme_package_impl(&db, &zip_path, false)
                .await
                .unwrap_err();
            assert!(error.contains("manifest"), "错误信息: {error}");
            fs::remove_file(&zip_path).ok();
        });
    }

    #[test]
    fn import_overwrite_same_id() {
        let _guard = TEST_LOCK.lock().unwrap();
        tauri::async_runtime::block_on(async {
            let db = test_db().await;
            let package_id = unique_package_id("overwrite");
            let manifest = base_manifest(&package_id, "Overwrite Theme");
            let zip_path = unique_path("overwrite.zip");
            make_theme_zip(&zip_path, &manifest, &test_png());

            import_theme_package_impl(&db, &zip_path, false)
                .await
                .expect("首次导入失败");
            // 不覆盖时拒绝。
            let error = import_theme_package_impl(&db, &zip_path, false)
                .await
                .unwrap_err();
            assert!(error.contains("已存在"), "错误信息: {error}");
            // 覆盖时成功且仍只有一条记录。
            import_theme_package_impl(&db, &zip_path, true)
                .await
                .expect("覆盖导入失败");
            let packages = package_infos(&db).await.unwrap();
            assert_eq!(
                packages.iter().filter(|p| p.id == package_id).count(),
                1
            );

            fs::remove_file(&zip_path).ok();
            delete_theme_package_impl(&db, &package_id).await.ok();
        });
    }

    #[test]
    fn delete_package_removes_records_and_directory() {
        let _guard = TEST_LOCK.lock().unwrap();
        tauri::async_runtime::block_on(async {
            let db = test_db().await;
            let package_id = unique_package_id("delete");
            let manifest = base_manifest(&package_id, "Delete Theme");
            let zip_path = unique_path("delete.zip");
            make_theme_zip(&zip_path, &manifest, &test_png());
            import_theme_package_impl(&db, &zip_path, false)
                .await
                .expect("导入失败");
            fs::remove_file(&zip_path).ok();

            delete_theme_package_impl(&db, &package_id)
                .await
                .expect("删除失败");
            assert!(
                theme_packages::Entity::find_by_id(&package_id)
                    .one(&db)
                    .await
                    .unwrap()
                    .is_none()
            );
            assert!(!themes_dir().unwrap().join(&package_id).exists());
        });
    }

    #[test]
    fn scan_detects_missing_and_orphans() {
        let _guard = TEST_LOCK.lock().unwrap();
        tauri::async_runtime::block_on(async {
            let db = test_db().await;
            let package_id = unique_package_id("scan");
            let manifest = base_manifest(&package_id, "Scan Theme");
            let zip_path = unique_path("scan.zip");
            make_theme_zip(&zip_path, &manifest, &test_png());
            import_theme_package_impl(&db, &zip_path, false)
                .await
                .expect("导入失败");
            fs::remove_file(&zip_path).ok();

            let package_root = themes_dir().unwrap().join(&package_id);
            // 删除资源文件 → 缺失。
            fs::remove_file(package_root.join("assets/background.png")).unwrap();
            // 添加多余文件 → 孤儿。
            fs::write(package_root.join("assets/orphan.txt"), b"x").unwrap();

            let status = scan_theme_assets(&db).await.unwrap();
            assert!(
                status.missing.iter().any(|m| m.contains("background.png")),
                "缺失列表: {:?}",
                status.missing
            );
            assert!(
                status.orphans.iter().any(|o| o.contains("orphan.txt")),
                "孤儿列表: {:?}",
                status.orphans
            );

            delete_theme_package_impl(&db, &package_id).await.ok();
        });
    }

    #[test]
    fn update_package_info_syncs_db_and_manifest() {
        let _guard = TEST_LOCK.lock().unwrap();
        tauri::async_runtime::block_on(async {
            let db = test_db().await;
            let package_id = unique_package_id("edit");
            let manifest = base_manifest(&package_id, "Original Name");
            let zip_path = unique_path("edit.zip");
            make_theme_zip(&zip_path, &manifest, &test_png());
            import_theme_package_impl(&db, &zip_path, false)
                .await
                .expect("导入失败");
            fs::remove_file(&zip_path).ok();

            update_theme_package_info_impl(
                &db,
                &package_id,
                Some("Edited Name".to_string()),
                Some(Some("new author".to_string())),
                None,
                Some("2.0.0".to_string()),
            )
            .await
            .expect("编辑失败");

            let package = package_infos(&db)
                .await
                .unwrap()
                .into_iter()
                .find(|p| p.id == package_id)
                .unwrap();
            assert_eq!(package.name, "Edited Name");
            assert_eq!(package.author.as_deref(), Some("new author"));
            assert_eq!(package.version, "2.0.0");

            // 磁盘 manifest 同步更新且 hash 重算。
            let manifest_bytes =
                fs::read(themes_dir().unwrap().join(&package_id).join("manifest.json")).unwrap();
            let parsed: serde_json::Value = serde_json::from_slice(&manifest_bytes).unwrap();
            assert_eq!(parsed["name"], "Edited Name");
            assert_eq!(parsed["version"], "2.0.0");
            assert_eq!(
                format!("{:x}", Sha256::digest(&manifest_bytes)),
                package.manifest_hash
            );

            // 编辑后导出仍通过完整性校验。
            let out_path = unique_path("edit-export.zip");
            export_theme_package_impl(&db, &package_id, &out_path.to_string_lossy())
                .await
                .expect("编辑后导出失败");
            fs::remove_file(&out_path).ok();
            delete_theme_package_impl(&db, &package_id).await.ok();
        });
    }

    #[test]
    fn package_settings_update_syncs_palette() {
        let _guard = TEST_LOCK.lock().unwrap();
        let package_id = unique_package_id("palette");
        let root = themes_dir().unwrap();
        let dir = package_dir(&root, &package_id).unwrap();
        fs::create_dir_all(dir.join("assets")).unwrap();
        let with_palette = serde_json::json!({
            "schemaVersion": 2,
            "id": package_id,
            "name": "Palette Theme",
            "version": "1.0.0",
            "palette": {
                "light": { "primary": "#111111" },
                "dark": { "primary": "#222222" }
            },
            "appearance": {
                "background": "assets/background.png",
                "overlayOpacity": 0.35,
                "blur": 0,
                "backgroundSize": "cover",
                "accentColor": "#7c4dff",
                "applyScope": "all"
            }
        });
        fs::write(
            dir.join("manifest.json"),
            serde_json::to_vec_pretty(&with_palette).unwrap(),
        )
        .unwrap();
        fs::write(dir.join("assets/background.png"), test_png()).unwrap();

        let updates = package_settings_update(&package_id).unwrap();
        let light = updates.custom_theme_light_palette.unwrap().unwrap();
        assert_eq!(light.primary.as_deref(), Some("#111111"));
        let dark = updates.custom_theme_dark_palette.unwrap().unwrap();
        assert_eq!(dark.primary.as_deref(), Some("#222222"));

        // 无 palette 时置 None。
        let without_palette = serde_json::json!({
            "schemaVersion": 2,
            "id": package_id,
            "name": "Palette Theme",
            "version": "1.0.0",
            "appearance": {
                "background": "assets/background.png",
                "overlayOpacity": 0.35,
                "blur": 0,
                "backgroundSize": "cover",
                "accentColor": "#7c4dff",
                "applyScope": "all"
            }
        });
        fs::write(
            dir.join("manifest.json"),
            serde_json::to_vec_pretty(&without_palette).unwrap(),
        )
        .unwrap();
        let updates = package_settings_update(&package_id).unwrap();
        assert!(updates.custom_theme_light_palette.unwrap().is_none());
        assert!(updates.custom_theme_dark_palette.unwrap().is_none());

        fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn normalize_theme_metadata_validates_and_trims() {
        let (name, author, description, version) = normalize_theme_metadata(
            Some("  名称  ".to_string()),
            Some(Some("  作者  ".to_string())),
            Some(Some("  描述  ".to_string())),
            Some(" 1.2.0 ".to_string()),
        )
        .unwrap();
        assert_eq!(name.as_deref(), Some("名称"));
        assert_eq!(author.unwrap().as_deref(), Some("作者"));
        assert_eq!(description.unwrap().as_deref(), Some("描述"));
        assert_eq!(version.as_deref(), Some("1.2.0"));

        assert!(normalize_theme_metadata(Some("   ".to_string()), None, None, None).is_err());
        assert!(normalize_theme_metadata(None, None, None, Some("".to_string())).is_err());
        assert!(normalize_theme_metadata(None, None, None, Some("x".repeat(33))).is_err());
        assert!(normalize_theme_metadata(None, Some(Some("x".repeat(101))), None, None).is_err());
        assert!(normalize_theme_metadata(None, None, Some(Some("x".repeat(501))), None).is_err());
    }

    #[test]
    fn save_custom_theme_persists_config_and_activates() {
        let _guard = TEST_LOCK.lock().unwrap();
        tauri::async_runtime::block_on(async {
            let db = test_db().await;
            SettingsRepository::update_settings(
                &db,
                UpdateSettingsData {
                    custom_theme_light_palette: Some(Some(user::ThemePalette {
                        primary: Some("#111111".to_string()),
                        ..Default::default()
                    })),
                    custom_theme_dark_palette: Some(Some(user::ThemePalette {
                        primary: Some("#222222".to_string()),
                        ..Default::default()
                    })),
                    theme_accent_color: Some("#ff0000".to_string()),
                    ..Default::default()
                },
            )
            .await
            .expect("预置配色失败");

            let saved = save_custom_theme_impl(
                &db,
                Some("我的主题".to_string()),
                Some(Some("作者".to_string())),
                Some(Some("描述".to_string())),
                Some("1.2.0".to_string()),
            )
            .await
            .expect("保存自定义主题失败");
            assert_eq!(saved.id, CUSTOM_PACKAGE_ID);
            assert_eq!(saved.name, "我的主题");
            assert_eq!(saved.author.as_deref(), Some("作者"));
            assert_eq!(saved.version, "1.2.0");

            // 已激活且设置回写 palette/外观。
            let settings = SettingsRepository::get_all_settings(&db).await.unwrap();
            assert_eq!(
                settings.active_theme_package_id.as_deref(),
                Some(CUSTOM_PACKAGE_ID)
            );
            assert_eq!(
                settings.custom_theme_light_palette.unwrap().primary.as_deref(),
                Some("#111111")
            );
            assert_eq!(
                settings.custom_theme_dark_palette.unwrap().primary.as_deref(),
                Some("#222222")
            );
            assert_eq!(settings.theme_accent_color, "#ff0000");

            // 磁盘 manifest 可解析且包含 palette。
            let manifest_bytes = fs::read(
                themes_dir()
                    .unwrap()
                    .join(CUSTOM_PACKAGE_ID)
                    .join("manifest.json"),
            )
            .unwrap();
            let parsed: serde_json::Value = serde_json::from_slice(&manifest_bytes).unwrap();
            assert_eq!(parsed["name"], "我的主题");
            assert_eq!(parsed["palette"]["light"]["primary"], "#111111");
            assert_eq!(parsed["appearance"]["accentColor"], "#ff0000");

            // 元数据编辑允许自定义主题包。
            update_theme_package_info_impl(
                &db,
                CUSTOM_PACKAGE_ID,
                Some("改名".to_string()),
                None,
                None,
                None,
            )
            .await
            .expect("编辑自定义主题失败");
            let updated = package_infos(&db)
                .await
                .unwrap()
                .into_iter()
                .find(|p| p.id == CUSTOM_PACKAGE_ID)
                .unwrap();
            assert_eq!(updated.name, "改名");
        });
    }

    #[test]
    fn update_custom_theme_creates_manifest_when_missing() {
        let _guard = TEST_LOCK.lock().unwrap();
        tauri::async_runtime::block_on(async {
            let db = test_db().await;
            // 模拟仅上传背景（无 manifest）的自定义主题包记录。
            let timestamp = now_ms();
            theme_packages::ActiveModel {
                id: Set(CUSTOM_PACKAGE_ID.to_string()),
                name: Set("自定义主题".to_string()),
                version: Set("1.0.0".to_string()),
                author: Set(None),
                description: Set(None),
                manifest_hash: Set("builtin".to_string()),
                installed_at: Set(timestamp),
                updated_at: Set(timestamp),
            }
            .insert(&db)
            .await
            .expect("插入自定义主题包失败");

            update_theme_package_info_impl(
                &db,
                CUSTOM_PACKAGE_ID,
                Some("自定义外观".to_string()),
                Some(Some("reina".to_string())),
                None,
                None,
            )
            .await
            .expect("编辑缺失 manifest 的自定义主题失败");

            let package = package_infos(&db)
                .await
                .unwrap()
                .into_iter()
                .find(|p| p.id == CUSTOM_PACKAGE_ID)
                .unwrap();
            assert_eq!(package.name, "自定义外观");
            assert_eq!(package.author.as_deref(), Some("reina"));
            assert_ne!(package.manifest_hash, "builtin");

            let manifest_bytes = fs::read(
                themes_dir()
                    .unwrap()
                    .join(CUSTOM_PACKAGE_ID)
                    .join("manifest.json"),
            )
            .unwrap();
            let parsed: serde_json::Value = serde_json::from_slice(&manifest_bytes).unwrap();
            assert_eq!(parsed["id"], CUSTOM_PACKAGE_ID);
            assert_eq!(parsed["name"], "自定义外观");
        });
    }
}
