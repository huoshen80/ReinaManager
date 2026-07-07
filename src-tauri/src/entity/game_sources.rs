//! 游戏外部元数据源实体。

use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "game_sources")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub game_id: i32,
    #[sea_orm(primary_key, auto_increment = false, column_type = "Text")]
    pub source: String,
    #[sea_orm(column_type = "Text", nullable)]
    pub external_id: Option<String>,
    #[sea_orm(column_type = "Json", nullable)]
    pub data: Option<Json>,
    /// SQLite 生成列，只读；写入 ActiveModel 时必须保持 NotSet。
    pub score: Option<f64>,
    /// SQLite 生成列，只读；写入 ActiveModel 时必须保持 NotSet。
    pub rank: Option<i32>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::games::Entity",
        from = "Column::GameId",
        to = "super::games::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    Games,
}

impl Related<super::games::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Games.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
