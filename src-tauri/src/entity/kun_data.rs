//! Kungal 数据结构
//!
//! 用于存储从 Kungal API 获取的元数据。
//! JSON 列嵌入 games 表。

use sea_orm::{entity::prelude::*, FromJsonQueryResult};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, FromJsonQueryResult)]
pub struct KunName {
    #[serde(rename = "en-us")]
    pub en_us: Option<String>,
    #[serde(rename = "ja-jp")]
    pub ja_jp: Option<String>,
    #[serde(rename = "zh-cn")]
    pub zh_cn: Option<String>,
    #[serde(rename = "zh-tw")]
    pub zh_tw: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize, FromJsonQueryResult)]
pub struct KunData {
    pub id: i32,
    pub name: KunName,
    pub banner: String,
    pub summary: Option<String>,
    pub tags: Option<Vec<String>>,
    pub developer: Option<String>,
    pub score: Option<f64>,
    pub nsfw: Option<bool>,
    pub date: Option<String>,
    pub alias: Option<Vec<String>>,
    pub platform: Option<Vec<String>>,
    pub language: Option<Vec<String>>,
    #[serde(rename = "ageLimit")]
    pub age_limit: Option<String>,
    #[serde(rename = "originalLanguage")]
    pub original_language: Option<String>,
}
