//! 数据实体模块
//!
//! 包含所有 SeaORM 实体定义和 JSON 数据结构。

pub mod prelude;

// === JSON 数据结构（嵌入 games 表的 JSON 列）===
pub mod bgm_data;
pub mod custom_data;
pub mod vndb_data;
pub mod ymgal_data;
pub mod kun_data;

// === SeaORM 实体（对应数据库表）===
pub mod collections;
pub mod game_collection_link;
pub mod game_sessions;
pub mod game_statistics;
pub mod games;
pub mod savedata;
pub mod user;
