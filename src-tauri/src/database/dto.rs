//! 数据传输对象 (DTO)
//!
//! 用于前后端数据交互的结构定义。
//! 重构后采用单表架构，元数据以 JSON 列形式嵌入 games 表。

use crate::entity::bgm_data::BgmData;
use crate::entity::custom_data::CustomData;
use crate::entity::vndb_data::VndbData;
use crate::entity::ymgal_data::YmgalData;
use serde::{Deserialize, Deserializer, Serialize};

/// 辅助函数：支持 Option<Option<T>> 的反序列化
/// 用于区分"未提供字段"和"显式设为 null"
fn double_option<'de, D, T>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Ok(Some(Option::deserialize(deserializer)?))
}

/// 清洗空字符串为 None
///
/// 将 Option<String> 中的空字符串或仅包含空白字符的字符串转换为 None，
/// 使其符合 Rust 的 Option 语义：Some 代表有值，None 代表无值。
fn clean_option_string(s: Option<String>) -> Option<String> {
    s.filter(|v| !v.trim().is_empty())
}

/// 清洗 Option<Option<String>> 中的空字符串
///
/// 用于 UpdateGameData，将内层的 Some("") 转换为 None，
/// 保持外层的 Some 表示"用户提供了这个字段"。
fn clean_double_option_string(s: Option<Option<String>>) -> Option<Option<String>> {
    s.map(|inner| inner.filter(|v| !v.trim().is_empty()))
}

/// 清洗 InsertGameData 中的空字符串
impl InsertGameData {
    /// 返回清洗后的数据，将空字符串转换为 None
    pub fn cleaned(mut self) -> Self {
        self.bgm_id = clean_option_string(self.bgm_id);
        self.vndb_id = clean_option_string(self.vndb_id);
        self.ymgal_id = clean_option_string(self.ymgal_id);
        self.date = clean_option_string(self.date);
        self.localpath = clean_option_string(self.localpath);
        self.savepath = clean_option_string(self.savepath);
        self
    }
}

/// 清洗 UpdateGameData 中的空字符串
impl UpdateGameData {
    /// 返回清洗后的数据，将空字符串转换为 None
    pub fn cleaned(mut self) -> Self {
        self.bgm_id = clean_double_option_string(self.bgm_id);
        self.vndb_id = clean_double_option_string(self.vndb_id);
        self.ymgal_id = clean_double_option_string(self.ymgal_id);
        self.date = clean_double_option_string(self.date);
        self.localpath = clean_double_option_string(self.localpath);
        self.savepath = clean_double_option_string(self.savepath);
        self
    }
}

// ==================== 合集相关 DTO ====================

/// 用于插入合集的数据结构
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InsertCollectionData {
    pub name: String,
    pub parent_id: Option<i32>,
    pub sort_order: i32,
    pub icon: Option<String>,
}

/// 用于更新合集的数据结构
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpdateCollectionData {
    pub name: Option<String>,
    pub parent_id: Option<Option<i32>>,
    pub sort_order: Option<i32>,
    pub icon: Option<Option<String>>,
}

/// 清洗 InsertCollectionData 中的空字符串
impl InsertCollectionData {
    /// 返回清洗后的数据，将空字符串转换为 None
    pub fn cleaned(mut self) -> Self {
        self.name = self.name.trim().to_string();
        self.icon = self.icon.filter(|s| !s.trim().is_empty());
        self
    }
}

/// 清洗 UpdateCollectionData 中的空字符串
impl UpdateCollectionData {
    /// 返回清洗后的数据，将空字符串转换为 None
    pub fn cleaned(mut self) -> Self {
        if let Some(name) = self.name {
            self.name = Some(name.trim().to_string());
        }
        self.icon = self
            .icon
            .map(|inner| inner.filter(|s| !s.trim().is_empty()));
        self
    }
}

// ==================== 设置相关 DTO ====================

/// 用于更新设置的数据结构
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct UpdateSettingsData {
    pub bgm_token: Option<String>,
    pub save_root_path: Option<String>,
    pub db_backup_path: Option<String>,
    pub le_path: Option<String>,
    pub magpie_path: Option<String>,
}

/// 清洗 UpdateSettingsData 中的空字符串
impl UpdateSettingsData {
    /// 返回清洗后的数据，将空字符串转换为 None
    pub fn cleaned(mut self) -> Self {
        self.bgm_token = self.bgm_token.filter(|s| !s.trim().is_empty());
        self.save_root_path = self.save_root_path.filter(|s| !s.trim().is_empty());
        self.db_backup_path = self.db_backup_path.filter(|s| !s.trim().is_empty());
        self.le_path = self.le_path.filter(|s| !s.trim().is_empty());
        self.magpie_path = self.magpie_path.filter(|s| !s.trim().is_empty());
        self
    }
}

/// 用于插入游戏的数据结构（单表架构）
///
/// 包含所有需要插入的字段，元数据通过 JSON 结构体传入
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InsertGameData {
    // === 外部 ID ===
    pub bgm_id: Option<String>,
    pub vndb_id: Option<String>,
    pub ymgal_id: Option<String>,
    pub id_type: String,

    // === 核心状态 ===
    pub date: Option<String>,
    pub localpath: Option<String>,
    pub savepath: Option<String>,
    pub autosave: Option<i32>,
    pub maxbackups: Option<i32>,
    pub clear: Option<i32>,
    pub le_launch: Option<i32>,
    pub magpie: Option<i32>,

    // === JSON 元数据 ===
    pub vndb_data: Option<VndbData>,
    pub bgm_data: Option<BgmData>,
    pub ymgal_data: Option<YmgalData>,
    pub custom_data: Option<CustomData>,
}

/// 用于更新游戏的数据结构（单表架构）
///
/// 所有字段均为 Option，允许部分更新。
/// 使用 Option<Option<T>> 来区分"未提供"和"设为 null"。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpdateGameData {
    // === 外部 ID ===
    #[serde(default, deserialize_with = "double_option")]
    pub bgm_id: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub vndb_id: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub ymgal_id: Option<Option<String>>,
    pub id_type: Option<String>,

    // === 核心状态 ===
    #[serde(default, deserialize_with = "double_option")]
    pub date: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub localpath: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub savepath: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub autosave: Option<Option<i32>>,
    #[serde(default, deserialize_with = "double_option")]
    pub maxbackups: Option<Option<i32>>,
    #[serde(default, deserialize_with = "double_option")]
    pub clear: Option<Option<i32>>,
    #[serde(default, deserialize_with = "double_option")]
    pub le_launch: Option<Option<i32>>,
    #[serde(default, deserialize_with = "double_option")]
    pub magpie: Option<Option<i32>>,
    // === JSON 元数据 ===
    #[serde(default, deserialize_with = "double_option")]
    pub vndb_data: Option<Option<VndbData>>,
    #[serde(default, deserialize_with = "double_option")]
    pub bgm_data: Option<Option<BgmData>>,
    #[serde(default, deserialize_with = "double_option")]
    pub ymgal_data: Option<Option<YmgalData>>,
    #[serde(default, deserialize_with = "double_option")]
    pub custom_data: Option<Option<CustomData>>,
}

/// 游戏启动选项
///
/// 前端传递的启动参数，决定是否使用特殊启动方式
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GameLaunchOptions {
    pub le_launch: Option<bool>,
    pub magpie: Option<bool>,
}
