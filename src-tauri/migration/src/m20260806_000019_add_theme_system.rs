//! Add persistent theme settings and the local theme package catalog.

use sea_orm_migration::prelude::*;
use sea_orm_migration::sea_orm::{ConnectionTrait, TransactionTrait};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let transaction = manager.get_connection().begin().await?;
        transaction
            .execute_unprepared(
                r#"
                ALTER TABLE user ADD COLUMN theme_mode TEXT NOT NULL DEFAULT 'system'
                    CHECK (theme_mode IN ('light', 'dark', 'system'));
                ALTER TABLE user ADD COLUMN active_theme_package_id TEXT;
                ALTER TABLE user ADD COLUMN custom_theme_light_palette TEXT
                    CHECK (custom_theme_light_palette IS NULL OR json_valid(custom_theme_light_palette));
                ALTER TABLE user ADD COLUMN custom_theme_dark_palette TEXT
                    CHECK (custom_theme_dark_palette IS NULL OR json_valid(custom_theme_dark_palette));
                ALTER TABLE user ADD COLUMN theme_apply_scope TEXT NOT NULL DEFAULT 'all'
                    CHECK (theme_apply_scope IN ('light', 'dark', 'all'));
                ALTER TABLE user ADD COLUMN theme_background_path TEXT;
                ALTER TABLE user ADD COLUMN theme_background_width INTEGER
                    CHECK (theme_background_width IS NULL OR theme_background_width > 0);
                ALTER TABLE user ADD COLUMN theme_background_height INTEGER
                    CHECK (theme_background_height IS NULL OR theme_background_height > 0);
                ALTER TABLE user ADD COLUMN theme_background_hash TEXT;
                ALTER TABLE user ADD COLUMN theme_background_updated_at INTEGER;
                ALTER TABLE user ADD COLUMN theme_overlay_opacity REAL NOT NULL DEFAULT 0.35
                    CHECK (theme_overlay_opacity >= 0 AND theme_overlay_opacity <= 1);
                ALTER TABLE user ADD COLUMN theme_blur REAL NOT NULL DEFAULT 0
                    CHECK (theme_blur >= 0 AND theme_blur <= 40);
                ALTER TABLE user ADD COLUMN theme_background_size TEXT NOT NULL DEFAULT 'cover'
                    CHECK (theme_background_size IN ('cover', 'contain', 'fill'));
                ALTER TABLE user ADD COLUMN theme_accent_color TEXT NOT NULL DEFAULT '#7c4dff';

                CREATE TABLE theme_packages (
                    id TEXT PRIMARY KEY NOT NULL CHECK (trim(id) <> ''),
                    name TEXT NOT NULL CHECK (trim(name) <> ''),
                    version TEXT NOT NULL CHECK (trim(version) <> ''),
                    author TEXT,
                    description TEXT,
                    manifest_hash TEXT NOT NULL CHECK (trim(manifest_hash) <> ''),
                    installed_at INTEGER NOT NULL,
                    updated_at INTEGER NOT NULL
                );

                CREATE TABLE theme_assets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    package_id TEXT NOT NULL,
                    relative_path TEXT NOT NULL CHECK (trim(relative_path) <> ''),
                    mime_type TEXT NOT NULL CHECK (mime_type IN ('image/png', 'image/jpeg', 'image/webp')),
                    width INTEGER NOT NULL CHECK (width > 0),
                    height INTEGER NOT NULL CHECK (height > 0),
                    size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
                    sha256 TEXT NOT NULL CHECK (trim(sha256) <> ''),
                    updated_at INTEGER NOT NULL,
                    FOREIGN KEY (package_id) REFERENCES theme_packages(id) ON DELETE CASCADE,
                    UNIQUE (package_id, relative_path)
                );

                CREATE INDEX idx_theme_assets_package_id ON theme_assets(package_id);
                "#,
            )
            .await?;
        transaction.commit().await
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let transaction = manager.get_connection().begin().await?;
        transaction
            .execute_unprepared(
                r#"
                DROP TABLE IF EXISTS theme_assets;
                DROP TABLE IF EXISTS theme_packages;
                ALTER TABLE user DROP COLUMN theme_accent_color;
                ALTER TABLE user DROP COLUMN theme_background_size;
                ALTER TABLE user DROP COLUMN theme_blur;
                ALTER TABLE user DROP COLUMN theme_overlay_opacity;
                ALTER TABLE user DROP COLUMN theme_background_updated_at;
                ALTER TABLE user DROP COLUMN theme_background_hash;
                ALTER TABLE user DROP COLUMN theme_background_height;
                ALTER TABLE user DROP COLUMN theme_background_width;
                ALTER TABLE user DROP COLUMN theme_background_path;
                ALTER TABLE user DROP COLUMN theme_apply_scope;
                ALTER TABLE user DROP COLUMN custom_theme_dark_palette;
                ALTER TABLE user DROP COLUMN custom_theme_light_palette;
                ALTER TABLE user DROP COLUMN active_theme_package_id;
                ALTER TABLE user DROP COLUMN theme_mode;
                "#,
            )
            .await?;
        transaction.commit().await
    }
}
