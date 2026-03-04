pub use sea_orm_migration::prelude::*;

mod backup;
mod m20250927_000001_baseline_migration;
mod m20250928_000002_split_games_table;
mod m20250930_000003_add_collections;
mod m20251229_000004_hybrid_single_table;
mod m20260104_000005_add_le_magpie_fields;
mod m20260131_000006_migrate_clear_to_play_status;
mod m20260201_000007_clean_empty_strings;

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
        ]
    }
}
