//! Kungal 数据结构
//!
//! 用于存储从 Kungal API 获取的元数据。
//! JSON 列嵌入 games 表。

use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, FromJsonQueryResult)]
pub struct KunData {
    pub image: Option<String>,
    pub name: Option<String>,
    pub name_cn: Option<String>,
    pub all_titles: Option<Vec<String>>,
    pub aliases: Option<Vec<String>>,
    pub summary: Option<String>,
    pub tags: Option<Vec<String>>,
    pub developer: Option<String>,
    pub nsfw: Option<bool>,
}
