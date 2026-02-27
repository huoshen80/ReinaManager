use crate::database::dto::UpdateSettingsData;
use crate::entity::prelude::*;
use crate::entity::user;
use sea_orm::*;

/// 用户设置仓库
pub struct SettingsRepository;

impl SettingsRepository {
    /// 确保用户记录存在（ID 固定为 1）
    async fn ensure_user_exists(db: &DatabaseConnection) -> Result<(), DbErr> {
        let existing = User::find_by_id(1).one(db).await?;

        if existing.is_none() {
            let user = user::ActiveModel {
                id: Set(1),
                bgm_token: Set(None),
                bgm_username: Set(None),
                bgm_avatar: Set(None),
                save_root_path: Set(None),
                db_backup_path: Set(None),
                le_path: Set(None),
                magpie_path: Set(None),
            };

            user.insert(db).await?;
        }

        Ok(())
    }

    /// 获取 BGM Token
    pub async fn get_bgm_token(db: &DatabaseConnection) -> Result<String, DbErr> {
        Self::ensure_user_exists(db).await?;

        let user = User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;

        Ok(user.bgm_token.unwrap_or_default())
    }

    /// 设置 BGM Token
    pub async fn set_bgm_token(db: &DatabaseConnection, token: String) -> Result<(), DbErr> {
        Self::ensure_user_exists(db).await?;

        let user = User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;

        let mut active: user::ActiveModel = user.into();
        // 清洗空字符串为 NULL
        active.bgm_token = Set(Some(token).filter(|s| !s.trim().is_empty()));

        active.update(db).await?;
        Ok(())
    }

    /// 获取bgm用户信息
    pub async fn get_bgm_profile(db: &DatabaseConnection) -> Result<(String, String), DbErr> {
        Self::ensure_user_exists(db).await?;

        let user = User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;

        Ok((
            user.bgm_username.unwrap_or_default(),
            user.bgm_avatar.unwrap_or_default(),
        ))
    }

    /// 设置bgm用户信息
    pub async fn set_bgm_profile(
        db: &DatabaseConnection,
        username: Option<String>,
        avatar: Option<String>,
    ) -> Result<(), DbErr> {
        Self::ensure_user_exists(db).await?;

        let user = User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;

        let mut active: user::ActiveModel = user.into();
        active.bgm_username = Set(username.filter(|s| !s.trim().is_empty()));
        active.bgm_avatar = Set(avatar.filter(|s| !s.trim().is_empty()));

        active.update(db).await?;
        Ok(())
    }

    /// 获取存档根路径
    pub async fn get_save_root_path(db: &DatabaseConnection) -> Result<String, DbErr> {
        Self::ensure_user_exists(db).await?;

        let user = User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;

        Ok(user.save_root_path.unwrap_or_default())
    }

    /// 设置存档根路径
    pub async fn set_save_root_path(db: &DatabaseConnection, path: String) -> Result<(), DbErr> {
        Self::ensure_user_exists(db).await?;

        let user = User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;

        let mut active: user::ActiveModel = user.into();
        // 清洗空字符串为 NULL
        active.save_root_path = Set(Some(path).filter(|s| !s.trim().is_empty()));

        active.update(db).await?;
        Ok(())
    }

    /// 获取数据库备份保存路径
    pub async fn get_db_backup_path(db: &DatabaseConnection) -> Result<String, DbErr> {
        Self::ensure_user_exists(db).await?;

        let user = User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;

        Ok(user.db_backup_path.unwrap_or_default())
    }

    /// 设置数据库备份保存路径
    pub async fn set_db_backup_path(db: &DatabaseConnection, path: String) -> Result<(), DbErr> {
        Self::ensure_user_exists(db).await?;

        let user = User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;

        let mut active: user::ActiveModel = user.into();
        // 清洗空字符串为 NULL
        active.db_backup_path = Set(Some(path).filter(|s| !s.trim().is_empty()));

        active.update(db).await?;
        Ok(())
    }

    /// 获取LE转区软件路径
    pub async fn get_le_path(db: &DatabaseConnection) -> Result<String, DbErr> {
        Self::ensure_user_exists(db).await?;

        let user = User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;

        Ok(user.le_path.unwrap_or_default())
    }

    /// 设置LE转区软件路径
    pub async fn set_le_path(db: &DatabaseConnection, path: String) -> Result<(), DbErr> {
        Self::ensure_user_exists(db).await?;

        let user = User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;

        let mut active: user::ActiveModel = user.into();
        // 清洗空字符串为 NULL
        active.le_path = Set(Some(path).filter(|s| !s.trim().is_empty()));

        active.update(db).await?;
        Ok(())
    }

    /// 获取Magpie转区软件路径
    pub async fn get_magpie_path(db: &DatabaseConnection) -> Result<String, DbErr> {
        Self::ensure_user_exists(db).await?;

        let user = User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;

        Ok(user.magpie_path.unwrap_or_default())
    }

    /// 设置Magpie转区软件路径
    pub async fn set_magpie_path(db: &DatabaseConnection, path: String) -> Result<(), DbErr> {
        Self::ensure_user_exists(db).await?;

        let user = User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;

        let mut active: user::ActiveModel = user.into();
        // 清洗空字符串为 NULL
        active.magpie_path = Set(Some(path).filter(|s| !s.trim().is_empty()));

        active.update(db).await?;
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
    pub async fn update_settings(db: &DatabaseConnection, data: UpdateSettingsData) -> Result<(), DbErr> {
        let data = data.cleaned(); // 清洗空字符串

        Self::ensure_user_exists(db).await?;

        let user = User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;

        let mut active: user::ActiveModel = user.into();

        if let Some(token) = data.bgm_token {
            active.bgm_token = Set(Some(token));
        }

        if let Some(username) = data.bgm_username {
            active.bgm_username = Set(Some(username));
        }

        if let Some(avatar) = data.bgm_avatar {
            active.bgm_avatar = Set(Some(avatar));
        }

        if let Some(path) = data.save_root_path {
            active.save_root_path = Set(Some(path));
        }

        if let Some(path) = data.db_backup_path {
            active.db_backup_path = Set(Some(path));
        }

        if let Some(path) = data.le_path {
            active.le_path = Set(Some(path));
        }

        if let Some(path) = data.magpie_path {
            active.magpie_path = Set(Some(path));
        }

        active.update(db).await?;
        Ok(())
    }
}
