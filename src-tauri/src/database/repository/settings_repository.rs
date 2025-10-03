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
                save_root_path: Set(None),
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
        active.bgm_token = Set(Some(token));

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
        active.save_root_path = Set(Some(path));

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
    pub async fn update_settings(
        db: &DatabaseConnection,
        bgm_token: Option<String>,
        save_root_path: Option<String>,
    ) -> Result<(), DbErr> {
        Self::ensure_user_exists(db).await?;

        let user = User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;

        let mut active: user::ActiveModel = user.into();

        if let Some(token) = bgm_token {
            active.bgm_token = Set(Some(token));
        }

        if let Some(path) = save_root_path {
            active.save_root_path = Set(Some(path));
        }

        active.update(db).await?;
        Ok(())
    }

    /// 清除 BGM Token
    pub async fn clear_bgm_token(db: &DatabaseConnection) -> Result<(), DbErr> {
        Self::ensure_user_exists(db).await?;

        let user = User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;

        let mut active: user::ActiveModel = user.into();
        active.bgm_token = Set(None);

        active.update(db).await?;
        Ok(())
    }

    /// 清除存档根路径
    pub async fn clear_save_root_path(db: &DatabaseConnection) -> Result<(), DbErr> {
        Self::ensure_user_exists(db).await?;

        let user = User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;

        let mut active: user::ActiveModel = user.into();
        active.save_root_path = Set(None);

        active.update(db).await?;
        Ok(())
    }
}
