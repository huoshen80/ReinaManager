//! 数据传输对象 (DTO)
//!
//! 用于前后端数据交互的结构定义。
//! 重构后采用单表架构，元数据以 JSON 列形式嵌入 games 表。

use crate::entity::custom_data::CustomData;
use crate::entity::user::BgmAuth;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

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

fn clean_bgm_auth(mut auth: BgmAuth) -> Option<BgmAuth> {
    auth.access_token = auth.access_token.trim().to_string();
    if auth.access_token.is_empty() {
        None
    } else {
        Some(auth)
    }
}

/// 清洗 InsertGameData 中的空字符串
impl InsertGameData {
    /// 返回清洗后的数据，将空字符串转换为 None
    pub fn cleaned(mut self) -> Self {
        self.date = clean_option_string(self.date);
        self.localpath = clean_option_string(self.localpath);
        self.savepath = clean_option_string(self.savepath);
        self.sources = self
            .sources
            .into_iter()
            .map(UpsertGameSourceData::cleaned)
            .collect();
        self
    }
}

/// 清洗 UpdateGameData 中的空字符串
impl UpdateGameData {
    /// 返回清洗后的数据，将空字符串转换为 None
    pub fn cleaned(mut self) -> Self {
        self.date = clean_double_option_string(self.date);
        self.localpath = clean_double_option_string(self.localpath);
        self.savepath = clean_double_option_string(self.savepath);
        self.upsert_sources = self.upsert_sources.map(|sources| {
            sources
                .into_iter()
                .map(UpsertGameSourceData::cleaned)
                .collect()
        });
        self.remove_sources = self.remove_sources.map(|sources| {
            sources
                .into_iter()
                .map(|source| source.trim().to_string())
                .filter(|source| !source.is_empty())
                .collect()
        });
        self
    }
}

impl UpsertGameSourceData {
    fn cleaned(mut self) -> Self {
        self.source = self.source.trim().to_string();
        self.external_id = clean_option_string(self.external_id);
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
#[serde(default, rename_all = "camelCase")]
pub struct UpdateSettingsData {
    #[serde(default, deserialize_with = "double_option")]
    pub bgm_auth: Option<Option<BgmAuth>>,
    #[serde(default, deserialize_with = "double_option")]
    pub vndb_token: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub save_root_path: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub db_backup_path: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub le_path: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub magpie_path: Option<Option<String>>,
}

/// 清洗 UpdateSettingsData 中的空字符串
impl UpdateSettingsData {
    /// 返回清洗后的数据，将空字符串转换为 None
    pub fn cleaned(mut self) -> Self {
        self.bgm_auth = self.bgm_auth.map(|inner| inner.and_then(clean_bgm_auth));
        self.vndb_token = clean_double_option_string(self.vndb_token);
        self.save_root_path = clean_double_option_string(self.save_root_path);
        self.db_backup_path = clean_double_option_string(self.db_backup_path);
        self.le_path = clean_double_option_string(self.le_path);
        self.magpie_path = clean_double_option_string(self.magpie_path);
        self
    }
}

/// 单个外部元数据源。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GameSourceData {
    pub source: String,
    pub external_id: Option<String>,
    pub data: Option<Value>,
}

/// 外部元数据源写入参数。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct UpsertGameSourceData {
    pub source: String,
    pub external_id: Option<String>,
    pub data: Option<Value>,
}

/// 完整游戏聚合读取 DTO。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct FullGameData {
    pub id: i32,
    pub id_type: String,
    pub date: Option<String>,
    pub localpath: Option<String>,
    pub savepath: Option<String>,
    pub autosave: Option<i32>,
    pub maxbackups: Option<i32>,
    pub clear: Option<i32>,
    pub le_launch: Option<i32>,
    pub magpie: Option<i32>,
    pub custom_data: Option<CustomData>,
    pub sources: Vec<GameSourceData>,
    pub created_at: Option<i32>,
    pub updated_at: Option<i32>,
}

/// 用于插入游戏聚合的数据结构。
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct InsertGameData {
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

    pub custom_data: Option<CustomData>,
    #[serde(default)]
    pub sources: Vec<UpsertGameSourceData>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BatchOperationError {
    pub index: usize,
    pub message: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct BatchOperationResult {
    pub total: usize,
    pub success: usize,
    pub failed: usize,
    pub ids: Vec<i32>,
    pub games: Vec<FullGameData>,
    pub errors: Vec<BatchOperationError>,
}

/// 用于更新游戏聚合的数据结构。
///
/// 所有字段均为 Option，允许部分更新。
/// 使用 Option<Option<T>> 来区分"未提供"和"设为 null"。
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct UpdateGameData {
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
    #[serde(default, deserialize_with = "double_option")]
    pub custom_data: Option<Option<CustomData>>,
    pub upsert_sources: Option<Vec<UpsertGameSourceData>>,
    pub remove_sources: Option<Vec<String>>,
}
