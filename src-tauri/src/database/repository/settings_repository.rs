use crate::database::dto::UpdateSettingsData;
use crate::entity::prelude::*;
use crate::entity::user;
use crate::entity::user::Model;
use crate::utils::fs::validate_configured_user_path;
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
                hikarinagi_auth: Set(None),
                vndb_token: Set(None),
                save_root_path: Set(None),
                db_backup_path: Set(None),
                install_root_path: Set(None),
                le_path: Set(None),
                magpie_path: Set(None),
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
        if data.save_root_path.is_some() {
            return Err(DbErr::Custom(
                "存档备份根目录必须通过 change_savedata_backup_root 更新".to_string(),
            ));
        }
        let data = data.cleaned(); // 清洗空字符串

        for path in [
            data.save_root_path.as_ref().and_then(Option::as_deref),
            data.db_backup_path.as_ref().and_then(Option::as_deref),
            data.install_root_path.as_ref().and_then(Option::as_deref),
            data.le_path.as_ref().and_then(Option::as_deref),
            data.magpie_path.as_ref().and_then(Option::as_deref),
        ]
        .into_iter()
        .flatten()
        {
            validate_configured_user_path(path).map_err(DbErr::Custom)?;
        }

        Self::ensure_user_exists(db).await?;

        let user = User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;

        let mut active: user::ActiveModel = user.into();

        if let Some(auth) = data.bgm_auth {
            active.bgm_auth = Set(auth);
        }

        if let Some(auth) = data.hikarinagi_auth {
            active.hikarinagi_auth = Set(auth);
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

        active.update(db).await?;
        Ok(())
    }

    /// 在存档目录迁移完成后更新存档备份根目录。
    pub async fn update_save_root_path(
        db: &DatabaseConnection,
        path: Option<String>,
    ) -> Result<(), DbErr> {
        let path = path.and_then(|path| {
            let path = path.trim().to_string();
            (!path.is_empty()).then_some(path)
        });
        if let Some(path) = path.as_deref() {
            validate_configured_user_path(path).map_err(DbErr::Custom)?;
        }

        Self::ensure_user_exists(db).await?;
        let user = User::find_by_id(1)
            .one(db)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;
        let mut active: user::ActiveModel = user.into();
        active.save_root_path = Set(path);
        active.update(db).await?;
        Ok(())
    }

    /// 清理指定的失效存档备份记录并更新存档备份根目录。
    pub async fn update_save_root_path_and_delete_savedata_records(
        db: &DatabaseConnection,
        path: Option<String>,
        record_ids: &[i32],
    ) -> Result<(), DbErr> {
        let path = path.and_then(|path| {
            let path = path.trim().to_string();
            (!path.is_empty()).then_some(path)
        });
        if let Some(path) = path.as_deref() {
            validate_configured_user_path(path).map_err(DbErr::Custom)?;
        }

        Self::ensure_user_exists(db).await?;
        let transaction = db.begin().await?;
        let user = User::find_by_id(1)
            .one(&transaction)
            .await?
            .ok_or(DbErr::RecordNotFound("User record not found".to_string()))?;
        let mut active: user::ActiveModel = user.into();
        active.save_root_path = Set(path);
        active.update(&transaction).await?;
        for record_id in record_ids {
            Savedata::delete_by_id(*record_id)
                .exec(&transaction)
                .await?;
        }
        transaction.commit().await?;
        Ok(())
    }
}
