pub use sea_orm_migration::prelude::*;

mod m20250927_000001_baseline_migration;
mod m20250928_000002_split_games_table;
mod m20250930_000003_add_collections;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(m20250927_000001_baseline_migration::Migration),
            Box::new(m20250928_000002_split_games_table::Migration),
            Box::new(m20250930_000003_add_collections::Migration),
        ]
    }
}
