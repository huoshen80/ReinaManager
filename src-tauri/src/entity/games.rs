//! 游戏数据实体
//!
//! games 表是核心表，包含游戏的基础信息和嵌入的 JSON 元数据列。

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

use super::bgm_data::BgmData;
use super::custom_data::CustomData;
use super::vndb_data::VndbData;
use super::ymgal_data::YmgalData;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "games")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,

    // === 外部 ID ===
    #[sea_orm(column_type = "Text", nullable)]
    pub bgm_id: Option<String>,
    #[sea_orm(column_type = "Text", nullable)]
    pub vndb_id: Option<String>,
    #[sea_orm(column_type = "Text", nullable)]
    pub ymgal_id: Option<String>,
    #[sea_orm(column_type = "Text")]
    pub id_type: String,

    // === 核心状态 ===
    #[sea_orm(column_type = "Text", nullable)]
    pub date: Option<String>,
    #[sea_orm(column_type = "Text", nullable)]
    pub localpath: Option<String>,
    #[sea_orm(column_type = "Text", nullable)]
    pub savepath: Option<String>,
    pub autosave: Option<i32>,
    pub maxbackups: Option<i32>,
    pub clear: Option<i32>,
    pub le_launch: Option<i32>,
    pub magpie: Option<i32>,
    pub bgm_sync_status: Option<i32>,
    pub vndb_sync_status: Option<i32>,

    // === JSON 元数据列 ===
    #[sea_orm(column_type = "Text", nullable)]
    pub vndb_data: Option<VndbData>,
    #[sea_orm(column_type = "Text", nullable)]
    pub bgm_data: Option<BgmData>,
    #[sea_orm(column_type = "Text", nullable)]
    pub ymgal_data: Option<YmgalData>,
    #[sea_orm(column_type = "Text", nullable)]
    pub custom_data: Option<CustomData>,

    // === 时间戳 ===
    pub created_at: Option<i32>,
    pub updated_at: Option<i32>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::game_collection_link::Entity")]
    GameCollectionLink,
    #[sea_orm(has_many = "super::game_sessions::Entity")]
    GameSessions,
    #[sea_orm(has_one = "super::game_statistics::Entity")]
    GameStatistics,
    #[sea_orm(has_many = "super::savedata::Entity")]
    Savedata,
}

impl Related<super::game_collection_link::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::GameCollectionLink.def()
    }
}

impl Related<super::game_sessions::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::GameSessions.def()
    }
}

impl Related<super::game_statistics::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::GameStatistics.def()
    }
}

impl Related<super::savedata::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Savedata.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
