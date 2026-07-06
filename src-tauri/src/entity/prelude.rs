//! 预导入模块
//!
//! 提供常用类型的快捷导入。

// === SeaORM 实体 ===
pub use super::collections::Entity as Collections;
pub use super::game_collection_link::Entity as GameCollectionLink;
pub use super::game_sessions::Entity as GameSessions;
pub use super::game_sources::Entity as GameSources;
pub use super::game_statistics::Entity as GameStatistics;
pub use super::games::Entity as Games;
pub use super::savedata::Entity as Savedata;
pub use super::user::Entity as User;
