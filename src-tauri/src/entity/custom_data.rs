//! 自定义元数据 JSON 结构体
//!
//! 此文件定义了存储在 games.custom_data 列中的 JSON 数据结构。
//! 用于替代原有的 other_data 表和 custom_name/custom_cover 字段。

use sea_orm::FromJsonQueryResult;
use serde::{Deserialize, Serialize};

/// 外部数据源类型
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SourceType {
    Bgm,
    Vndb,
    Hikarinagi,
    Ymgal,
    Kun,
    // 只兼容开发原型的封面引用，不再注册为新的元数据来源；待映射迁移一并归回 Kun。
    Nextmoe,
    Dlsite,
    Erogamescape,
}

/// 自定义元数据结构（存储为 JSON）
///
/// 用于用户自定义的游戏数据，包括：
/// - 手动添加的游戏
/// - 从 Whitecloud、Playnite 等其他来源导入的游戏
/// - 用户自定义的名称和封面
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Default, FromJsonQueryResult)]
#[serde(default)]
pub struct CustomData {
    /// 自定义封面图片路径或 URL
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<String>,

    /// Mixed 模式下选定的封面数据源
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cover_source: Option<SourceType>,

    /// 自定义名称
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,

    /// 别名列表
    #[serde(skip_serializing_if = "Option::is_none")]
    pub aliases: Option<Vec<String>>,

    /// 简介/摘要
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<String>,

    /// 标签列表
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,

    /// 开发商
    #[serde(skip_serializing_if = "Option::is_none")]
    pub developer: Option<String>,

    /// 是否为成人内容
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nsfw: Option<bool>,

    /// 用户个人评分，范围 0-10，0 表示清空评分
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_rating: Option<f64>,

    /// 用户个人评价
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_review: Option<String>,
}
