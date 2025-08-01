use tauri_plugin_sql::{Migration, MigrationKind};

/// 获取所有数据库迁移
pub fn get_migrations() -> Vec<Migration> {
    vec![
        // 迁移 1: 备份和存档路径支持 (2025-08-01)
        Migration {
            version: 1,
            description: "backup_and_savedata_support",
            sql: include_str!("../migrations/001_backup_and_savedata_support.sql"),
            kind: MigrationKind::Up,
        },
    ]
}
