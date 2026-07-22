pub use sea_orm_migration::prelude::*;

mod backup;
mod m20250927_000001_baseline_migration;
mod m20250928_000002_split_games_table;
mod m20250930_000003_add_collections;
mod m20251229_000004_hybrid_single_table;
mod m20260104_000005_add_le_magpie_fields;
mod m20260131_000006_migrate_clear_to_play_status;
mod m20260201_000007_clean_empty_strings;
mod m20260318_000008_add_vndb_token_and_collection_sync;
mod m20260331_000009_add_kungal_support;
mod m20260505_000010_remove_redundant_created_at;
mod m20260508_000011_bgm_oauth;
mod m20260525_000012_move_custom_date_to_games;
mod m20260706_000013_reconcile_indexes;
mod m20260706_000014_migrate_game_sources;
mod m20260712_000015_split_game_local_path;
mod m20260722_000016_backfill_game_defaults;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20250927_000001_baseline_migration::Migration),
            Box::new(m20250928_000002_split_games_table::Migration),
            Box::new(m20250930_000003_add_collections::Migration),
            Box::new(m20251229_000004_hybrid_single_table::Migration),
            Box::new(m20260104_000005_add_le_magpie_fields::Migration),
            Box::new(m20260131_000006_migrate_clear_to_play_status::Migration),
            Box::new(m20260201_000007_clean_empty_strings::Migration),
            Box::new(m20260318_000008_add_vndb_token_and_collection_sync::Migration),
            Box::new(m20260331_000009_add_kungal_support::Migration),
            Box::new(m20260505_000010_remove_redundant_created_at::Migration),
            Box::new(m20260508_000011_bgm_oauth::Migration),
            Box::new(m20260525_000012_move_custom_date_to_games::Migration),
            Box::new(m20260706_000013_reconcile_indexes::Migration),
            Box::new(m20260706_000014_migrate_game_sources::Migration),
            Box::new(m20260712_000015_split_game_local_path::Migration),
            Box::new(m20260722_000016_backfill_game_defaults::Migration),
        ]
    }
}
