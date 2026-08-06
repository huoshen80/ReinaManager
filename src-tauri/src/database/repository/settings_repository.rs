use crate::database::dto::UpdateSettingsData;
use crate::entity::prelude::*;
use crate::entity::user;
use crate::entity::user::Model;
use sea_orm::*;

/// 用户设置仓库
pub struct SettingsRepository;

pub trait DbSettingsExt {
    /// 获取设置模型，并自动处理好错误转换
    async fn get_settings(&self) -> Result<Model, String>;
}

impl DbSettingsExt for DatabaseConnection {
    async fn get_settings(&self) -> Result<Model, String> {
        SettingsRepository::get_all_settings(self)
            .await
            .map_err(|e| format!("获取设置失败: {}", e))
    }
}

impl SettingsRepository {
    /// 确保用户记录存在（ID 固定为 1）
    async fn ensure_user_exists(db: &DatabaseConnection) -> Result<(), DbErr> {
        let existing = User::find_by_id(1).one(db).await?;

        if existing.is_none() {
            let user = user::ActiveModel {
                id: Set(1),
                bgm_auth: Set(None),
                vndb_token: Set(None),
                save_root_path: Set(None),
                db_backup_path: Set(None),
                install_root_path: Set(None),
                le_path: Set(None),
                magpie_path: Set(None),
                theme_mode: Set("system".to_string()),
                active_theme_package_id: Set(None),
                custom_theme_light_palette: Set(None),
                custom_theme_dark_palette: Set(None),
                theme_apply_scope: Set("all".to_string()),
                theme_background_path: Set(None),
                theme_background_width: Set(None),
                theme_background_height: Set(None),
                theme_background_hash: Set(None),
                theme_background_updated_at: Set(None),
                theme_overlay_opacity: Set(0.35),
                theme_blur: Set(0.0),
                theme_background_size: Set("cover".to_string()),
                theme_accent_color: Set("#7c4dff".to_string()),
            };

            user.insert(db).await?;
        }

        Ok(())
    }

    /// 获取所有设置
    pub async fn get_all_settings(db: &DatabaseConnection) -> Result<user::Model, DbErr> {
        Self::ensure_user_exists(db).await?;

        User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))
    }

    /// 批量更新设置
    pub async fn update_settings(
        db: &DatabaseConnection,
        data: UpdateSettingsData,
    ) -> Result<(), DbErr> {
        let data = data.cleaned(); // 清洗空字符串

        Self::ensure_user_exists(db).await?;

        let user = User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;

        let mut active: user::ActiveModel = user.into();

        validate_theme_updates(&data)?;

        if let Some(auth) = data.bgm_auth {
            active.bgm_auth = Set(auth);
        }

        if let Some(token) = data.vndb_token {
            active.vndb_token = Set(token);
        }

        if let Some(path) = data.save_root_path {
            active.save_root_path = Set(path);
        }

        if let Some(path) = data.db_backup_path {
            active.db_backup_path = Set(path);
        }

        if let Some(path) = data.install_root_path {
            active.install_root_path = Set(path);
        }

        if let Some(path) = data.le_path {
            active.le_path = Set(path);
        }

        if let Some(path) = data.magpie_path {
            active.magpie_path = Set(path);
        }

        if let Some(mode) = data.theme_mode {
            active.theme_mode = Set(mode);
        }
        if let Some(package_id) = data.active_theme_package_id {
            active.active_theme_package_id = Set(package_id);
        }
        if let Some(palette) = data.custom_theme_light_palette {
            active.custom_theme_light_palette = Set(palette);
        }
        if let Some(palette) = data.custom_theme_dark_palette {
            active.custom_theme_dark_palette = Set(palette);
        }
        if let Some(scope) = data.theme_apply_scope {
            active.theme_apply_scope = Set(scope);
        }
        if let Some(path) = data.theme_background_path {
            if path.is_none() {
                active.theme_background_width = Set(None);
                active.theme_background_height = Set(None);
                active.theme_background_hash = Set(None);
                active.theme_background_updated_at = Set(None);
            }
            active.theme_background_path = Set(path);
        }
        if let Some(value) = data.theme_background_width {
            active.theme_background_width = Set(value);
        }
        if let Some(value) = data.theme_background_height {
            active.theme_background_height = Set(value);
        }
        if let Some(value) = data.theme_background_hash {
            active.theme_background_hash = Set(value);
        }
        if let Some(value) = data.theme_background_updated_at {
            active.theme_background_updated_at = Set(value);
        }
        if let Some(value) = data.theme_overlay_opacity {
            active.theme_overlay_opacity = Set(value);
        }
        if let Some(value) = data.theme_blur {
            active.theme_blur = Set(value);
        }
        if let Some(value) = data.theme_background_size {
            active.theme_background_size = Set(value);
        }
        if let Some(value) = data.theme_accent_color {
            active.theme_accent_color = Set(value);
        }

        active.update(db).await?;
        Ok(())
    }
}

fn validate_theme_updates(data: &UpdateSettingsData) -> Result<(), DbErr> {
    if let Some(mode) = data.theme_mode.as_deref()
        && !matches!(mode, "light" | "dark" | "system")
    {
        return Err(DbErr::Custom(format!("无效主题模式: {mode}")));
    }
    if let Some(scope) = data.theme_apply_scope.as_deref()
        && !matches!(scope, "light" | "dark" | "all")
    {
        return Err(DbErr::Custom(format!("无效主题应用范围: {scope}")));
    }
    if let Some(size) = data.theme_background_size.as_deref()
        && !matches!(size, "cover" | "contain" | "fill")
    {
        return Err(DbErr::Custom(format!("无效背景填充方式: {size}")));
    }
    if let Some(value) = data.theme_overlay_opacity
        && (!value.is_finite() || !(0.0..=1.0).contains(&value))
    {
        return Err(DbErr::Custom("遮罩强度必须在 0 到 1 之间".to_string()));
    }
    if let Some(value) = data.theme_blur
        && (!value.is_finite() || !(0.0..=40.0).contains(&value))
    {
        return Err(DbErr::Custom("背景模糊必须在 0 到 40 之间".to_string()));
    }
    if let Some(color) = data.theme_accent_color.as_deref()
        && !(color.len() == 7
            && color.starts_with('#')
            && color[1..]
                .chars()
                .all(|character| character.is_ascii_hexdigit()))
    {
        return Err(DbErr::Custom("强调色必须是 #RRGGBB 格式".to_string()));
    }
    if let Some(Some(path)) = data.theme_background_path.as_ref() {
        let path = std::path::Path::new(path);
        if path.is_absolute()
            || path.components().any(|component| {
                matches!(
                    component,
                    std::path::Component::ParentDir
                        | std::path::Component::RootDir
                        | std::path::Component::Prefix(_)
                )
            })
        {
            return Err(DbErr::Custom("主题背景必须是安全的相对路径".to_string()));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn data_with_mode(mode: &str) -> UpdateSettingsData {
        UpdateSettingsData {
            theme_mode: Some(mode.to_string()),
            ..Default::default()
        }
    }

    #[test]
    fn validate_theme_updates_accepts_three_modes_only() {
        for mode in ["light", "dark", "system"] {
            assert!(validate_theme_updates(&data_with_mode(mode)).is_ok(), "{mode}");
        }
        for mode in ["custom", "auto", ""] {
            assert!(
                validate_theme_updates(&data_with_mode(mode)).is_err(),
                "{mode} 应被拒绝"
            );
        }
    }

    #[test]
    fn validate_theme_updates_rejects_invalid_scope_and_size() {
        let invalid_scope = UpdateSettingsData {
            theme_apply_scope: Some("both".to_string()),
            ..Default::default()
        };
        assert!(validate_theme_updates(&invalid_scope).is_err());

        let invalid_size = UpdateSettingsData {
            theme_background_size: Some("stretch".to_string()),
            ..Default::default()
        };
        assert!(validate_theme_updates(&invalid_size).is_err());

        let valid_scope = UpdateSettingsData {
            theme_apply_scope: Some("all".to_string()),
            theme_background_size: Some("contain".to_string()),
            ..Default::default()
        };
        assert!(validate_theme_updates(&valid_scope).is_ok());
    }

    #[test]
    fn validate_theme_updates_rejects_bad_ranges_and_colors() {
        let bad_opacity = UpdateSettingsData {
            theme_overlay_opacity: Some(1.5),
            ..Default::default()
        };
        assert!(validate_theme_updates(&bad_opacity).is_err());

        let bad_blur = UpdateSettingsData {
            theme_blur: Some(-1.0),
            ..Default::default()
        };
        assert!(validate_theme_updates(&bad_blur).is_err());

        let bad_color = UpdateSettingsData {
            theme_accent_color: Some("red".to_string()),
            ..Default::default()
        };
        assert!(validate_theme_updates(&bad_color).is_err());

        let good_color = UpdateSettingsData {
            theme_accent_color: Some("#7c4dff".to_string()),
            ..Default::default()
        };
        assert!(validate_theme_updates(&good_color).is_ok());
    }

    #[test]
    fn validate_theme_updates_rejects_unsafe_background_path() {
        let traversal = UpdateSettingsData {
            theme_background_path: Some(Some("../escape.png".to_string())),
            ..Default::default()
        };
        assert!(validate_theme_updates(&traversal).is_err());

        let absolute = UpdateSettingsData {
            theme_background_path: Some(Some("C:\\windows\\x.png".to_string())),
            ..Default::default()
        };
        assert!(validate_theme_updates(&absolute).is_err());

        let safe = UpdateSettingsData {
            theme_background_path: Some(Some("custom/assets/background.png".to_string())),
            ..Default::default()
        };
        assert!(validate_theme_updates(&safe).is_ok());
    }
}
