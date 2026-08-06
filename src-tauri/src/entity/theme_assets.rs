use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "theme_assets")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub package_id: String,
    pub relative_path: String,
    pub mime_type: String,
    pub width: i32,
    pub height: i32,
    pub size_bytes: i64,
    pub sha256: String,
    pub updated_at: i64,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
