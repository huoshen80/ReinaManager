use crate::entity::{bgm_data, other_data, vndb_data};
use sea_orm::prelude::Decimal;
use sea_orm::Set;
use serde::{Deserialize, Deserializer, Serialize};

fn double_option<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Ok(Some(Option::deserialize(deserializer)?))
}

/// Trait：将 DTO 转换为 ActiveModel
pub trait IntoActiveModel<T> {
    fn into_active_model(self, game_id: i32) -> T;
}

/// 用于插入游戏的数据结构（不包含 id, created_at, updated_at）
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InsertGameData {
    pub bgm_id: Option<String>,
    pub vndb_id: Option<String>,
    pub id_type: String,
    pub date: Option<String>,
    pub localpath: Option<String>,
    pub savepath: Option<String>,
    pub autosave: Option<i32>,
    pub clear: Option<i32>,
    pub custom_name: Option<String>,
    pub custom_cover: Option<String>,
}

/// 用于更新游戏的数据结构（不包含 id, created_at, updated_at）
/// 所有字段均为 Option，允许部分更新
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpdateGameData {
    #[serde(default, deserialize_with = "double_option")]
    pub bgm_id: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub vndb_id: Option<Option<String>>,
    pub id_type: Option<String>,
    #[serde(default, deserialize_with = "double_option")]
    pub date: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub localpath: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub savepath: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub autosave: Option<Option<i32>>,
    #[serde(default, deserialize_with = "double_option")]
    pub clear: Option<Option<i32>>,
    #[serde(default, deserialize_with = "double_option")]
    pub custom_name: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub custom_cover: Option<Option<String>>,
}

/// BGM DTO
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BgmDataInput {
    pub image: Option<String>,
    pub name: Option<String>,
    pub name_cn: Option<String>,
    pub aliases: Option<String>,
    pub summary: Option<String>,
    pub tags: Option<String>,
    pub rank: Option<i32>,
    pub score: Option<Decimal>,
    pub developer: Option<String>,
}

impl IntoActiveModel<bgm_data::ActiveModel> for BgmDataInput {
    fn into_active_model(self, game_id: i32) -> bgm_data::ActiveModel {
        bgm_data::ActiveModel {
            game_id: Set(game_id),
            image: Set(self.image),
            name: Set(self.name),
            name_cn: Set(self.name_cn),
            aliases: Set(self.aliases),
            summary: Set(self.summary),
            tags: Set(self.tags),
            rank: Set(self.rank),
            score: Set(self.score),
            developer: Set(self.developer),
        }
    }
}

/// VNDB DTO
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VndbDataInput {
    pub image: Option<String>,
    pub name: Option<String>,
    pub name_cn: Option<String>,
    pub all_titles: Option<String>,
    pub aliases: Option<String>,
    pub summary: Option<String>,
    pub tags: Option<String>,
    pub average_hours: Option<Decimal>,
    pub developer: Option<String>,
    pub score: Option<Decimal>,
}

impl IntoActiveModel<vndb_data::ActiveModel> for VndbDataInput {
    fn into_active_model(self, game_id: i32) -> vndb_data::ActiveModel {
        vndb_data::ActiveModel {
            game_id: Set(game_id),
            image: Set(self.image),
            name: Set(self.name),
            name_cn: Set(self.name_cn),
            all_titles: Set(self.all_titles),
            aliases: Set(self.aliases),
            summary: Set(self.summary),
            tags: Set(self.tags),
            average_hours: Set(self.average_hours),
            developer: Set(self.developer),
            score: Set(self.score),
        }
    }
}

/// Other DTO
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OtherDataInput {
    pub image: Option<String>,
    pub name: Option<String>,
    pub summary: Option<String>,
    pub tags: Option<String>,
    pub developer: Option<String>,
}

impl IntoActiveModel<other_data::ActiveModel> for OtherDataInput {
    fn into_active_model(self, game_id: i32) -> other_data::ActiveModel {
        other_data::ActiveModel {
            game_id: Set(game_id),
            image: Set(self.image),
            name: Set(self.name),
            summary: Set(self.summary),
            tags: Set(self.tags),
            developer: Set(self.developer),
        }
    }
}

/// 批量更新数据传输对象
#[derive(Debug, Serialize, Deserialize)]
pub struct GameWithRelatedUpdate {
    pub game: Option<UpdateGameData>,
    pub bgm_data: Option<BgmDataInput>,
    pub vndb_data: Option<VndbDataInput>,
    pub other_data: Option<OtherDataInput>,
}
