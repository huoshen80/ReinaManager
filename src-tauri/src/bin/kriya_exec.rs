//! kriya-exec — a headless executor that exposes ReinaManager's data layer as governed JSON
//! actions over stdin/stdout (one JSON line in, one JSON line out). It is the process the external
//! `kriya-mcp` governor drives; see `kriya-mcp/README.md`.
//!
//! It reuses the app's OWN data layer instead of re-implementing it:
//!   * opens the same database via `database::db::establish_connection` (identical path logic to
//!     the app — `reina-path::get_db_path`), and runs the same `migration::Migrator`;
//!   * dispatches each action straight to the `*Repository` methods that the Tauri commands in
//!     `database::service` call, so an agent action runs the identical code a human action does.
//! Only the Tauri `State` wrapper (service.rs) is bypassed, because it can't run outside the app.
//! No GUI, no rewrite, and no `kriya` dependency is added to the app.

use migration::{Migrator, MigratorTrait};
use reina_manager_lib::database::db;
use reina_manager_lib::database::dto::{
    InsertCollectionData, InsertGameData, UpdateCollectionData, UpdateGameData,
};
use reina_manager_lib::database::repository::{
    collections_repository::CollectionsRepository,
    game_stats_repository::GameStatsRepository,
    games_repository::{GameType, GamesRepository, SortOption, SortOrder},
};
use sea_orm::DatabaseConnection;
use serde::Deserialize;
use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};

#[tokio::main]
async fn main() {
    let conn = match db::establish_connection().await {
        Ok(c) => c,
        Err(e) => {
            eprintln!("kriya-exec: failed to open database: {e}");
            std::process::exit(1);
        }
    };
    // Ensure the schema exists (idempotent — a no-op against the app's already-migrated DB).
    if let Err(e) = Migrator::up(&conn, None).await {
        eprintln!("kriya-exec: migration failed: {e}");
        std::process::exit(1);
    }

    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    let mut stdout = tokio::io::stdout();
    while let Ok(Some(line)) = lines.next_line().await {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let reply = handle_line(&conn, trimmed).await;
        let mut buf = serde_json::to_vec(&reply)
            .unwrap_or_else(|_| br#"{"success":false,"error":"serialize error"}"#.to_vec());
        buf.push(b'\n');
        if stdout.write_all(&buf).await.is_err() {
            break;
        }
        let _ = stdout.flush().await;
    }
}

async fn handle_line(conn: &DatabaseConnection, line: &str) -> Value {
    let msg: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(e) => return json!({"success": false, "error": format!("bad request: {e}")}),
    };
    let action = msg.get("action").and_then(Value::as_str).unwrap_or("");
    let params = msg.get("params").cloned().unwrap_or(Value::Null);
    match dispatch(conn, action, params).await {
        Ok(data) => json!({"success": true, "data": data}),
        Err(e) => json!({"success": false, "error": e}),
    }
}

fn ok<T: serde::Serialize>(v: T) -> Result<Value, String> {
    serde_json::to_value(v).map_err(|e| format!("serialize error: {e}"))
}
fn parse<T: serde::de::DeserializeOwned>(params: Value) -> Result<T, String> {
    serde_json::from_value(params).map_err(|e| format!("invalid params: {e}"))
}
fn dbx<T>(r: Result<T, sea_orm::DbErr>) -> Result<T, String> {
    r.map_err(|e| e.to_string())
}

async fn dispatch(conn: &DatabaseConnection, action: &str, params: Value) -> Result<Value, String> {
    match action {
        // ----------------------------- reads -----------------------------
        "count_games" => ok(dbx(GamesRepository::count(conn).await)?),
        "list_games" => {
            #[derive(Deserialize)]
            struct P {
                game_type: Option<GameType>,
                sort_option: Option<SortOption>,
                sort_order: Option<SortOrder>,
                language: Option<String>,
            }
            let p: P = parse(params)?;
            ok(dbx(GamesRepository::find_all(
                conn,
                p.game_type.unwrap_or(GameType::All),
                p.sort_option.unwrap_or(SortOption::Addtime),
                p.sort_order.unwrap_or(SortOrder::Desc),
                p.language,
            )
            .await)?)
        }
        "get_game" => {
            #[derive(Deserialize)]
            struct P {
                id: i32,
            }
            let p: P = parse(params)?;
            match dbx(GamesRepository::find_by_id(conn, p.id).await)? {
                Some(g) => ok(g),
                None => Err("game not found".into()),
            }
        }
        "list_collections" => ok(dbx(CollectionsRepository::find_root_collections(conn).await)?),
        "get_games_in_collection" => {
            #[derive(Deserialize)]
            struct P {
                collection_id: i32,
            }
            let p: P = parse(params)?;
            ok(dbx(CollectionsRepository::get_games_in_collection(conn, p.collection_id).await)?)
        }
        "get_game_collection_ids" => {
            #[derive(Deserialize)]
            struct P {
                game_id: i32,
            }
            let p: P = parse(params)?;
            ok(dbx(CollectionsRepository::get_game_collection_ids(conn, p.game_id).await)?)
        }
        "get_game_statistics" => {
            #[derive(Deserialize)]
            struct P {
                game_id: i32,
            }
            let p: P = parse(params)?;
            ok(dbx(GameStatsRepository::get_statistics(conn, p.game_id).await)?)
        }
        "get_all_game_statistics" => ok(dbx(GameStatsRepository::get_all_statistics(conn).await)?),
        "get_game_sessions" => {
            #[derive(Deserialize)]
            struct P {
                game_id: i32,
                limit: Option<u64>,
                offset: Option<u64>,
            }
            let p: P = parse(params)?;
            ok(dbx(GameStatsRepository::get_sessions(
                conn,
                p.game_id,
                p.limit.unwrap_or(50),
                p.offset.unwrap_or(0),
            )
            .await)?)
        }

        // ------------------- create / edit / organize --------------------
        "add_game" => {
            let data: InsertGameData = parse(params)?;
            ok(dbx(GamesRepository::insert(conn, data.cleaned()).await)?)
        }
        "update_game" => {
            #[derive(Deserialize)]
            struct P {
                game_id: i32,
                updates: Value,
            }
            let p: P = parse(params)?;
            let updates: UpdateGameData =
                serde_json::from_value(p.updates).map_err(|e| format!("invalid updates: {e}"))?;
            ok(dbx(GamesRepository::update(conn, p.game_id, updates.cleaned()).await)?)
        }
        "create_collection" => {
            #[derive(Deserialize)]
            struct P {
                name: String,
                parent_id: Option<i32>,
                #[serde(default)]
                sort_order: i32,
                icon: Option<String>,
            }
            let p: P = parse(params)?;
            if p.name.trim().is_empty() {
                return Err("name required".into());
            }
            let data = InsertCollectionData {
                name: p.name,
                parent_id: p.parent_id,
                sort_order: p.sort_order,
                icon: p.icon,
            }
            .cleaned();
            ok(dbx(CollectionsRepository::create(conn, data).await)?)
        }
        "update_collection" => {
            #[derive(Deserialize)]
            struct P {
                id: i32,
                name: Option<String>,
                parent_id: Option<i32>,
                sort_order: Option<i32>,
                icon: Option<String>,
            }
            let p: P = parse(params)?;
            // Note: this exposes setting a value or leaving a field unchanged; clearing parent_id /
            // icon to null is intentionally not exposed (the app uses Option<Option<T>> for that).
            let data = UpdateCollectionData {
                name: p.name,
                parent_id: p.parent_id.map(Some),
                sort_order: p.sort_order,
                icon: p.icon.map(Some),
            }
            .cleaned();
            ok(dbx(CollectionsRepository::update(conn, p.id, data).await)?)
        }
        "add_games_to_collections" => {
            #[derive(Deserialize)]
            struct P {
                game_ids: Vec<i32>,
                collection_ids: Vec<i32>,
            }
            let p: P = parse(params)?;
            dbx(CollectionsRepository::add_games_to_collections(conn, p.game_ids, p.collection_ids).await)?;
            Ok(json!({"ok": true}))
        }
        "set_game_collections" => {
            #[derive(Deserialize)]
            struct P {
                game_id: i32,
                collection_ids: Vec<i32>,
            }
            let p: P = parse(params)?;
            dbx(CollectionsRepository::set_game_collections(conn, p.game_id, p.collection_ids).await)?;
            Ok(json!({"ok": true}))
        }
        "remove_games_from_collection" => {
            #[derive(Deserialize)]
            struct P {
                game_ids: Vec<i32>,
                collection_id: i32,
            }
            let p: P = parse(params)?;
            let r = dbx(
                CollectionsRepository::remove_games_from_collection(conn, p.game_ids, p.collection_id)
                    .await,
            )?;
            Ok(json!({"rows_affected": r.rows_affected}))
        }
        "record_session" => {
            #[derive(Deserialize)]
            struct P {
                game_id: i32,
                start_time: i32,
                end_time: i32,
                duration: i32,
                date: String,
            }
            let p: P = parse(params)?;
            let id = dbx(
                GameStatsRepository::record_session(
                    conn, p.game_id, p.start_time, p.end_time, p.duration, p.date,
                )
                .await,
            )?;
            Ok(json!({"session_id": id}))
        }
        "init_game_statistics" => {
            #[derive(Deserialize)]
            struct P {
                game_id: i32,
            }
            let p: P = parse(params)?;
            dbx(GameStatsRepository::init_statistics_if_not_exists(conn, p.game_id).await)?;
            Ok(json!({"ok": true}))
        }

        // --------- destructive: the governor gates these on approval ----------
        "delete_game" => {
            #[derive(Deserialize)]
            struct P {
                id: i32,
            }
            let p: P = parse(params)?;
            // NB: removes the DB row only; the GUI's delete also clears the cover-cache dir.
            let r = dbx(GamesRepository::delete(conn, p.id).await)?;
            Ok(json!({"rows_affected": r.rows_affected}))
        }
        "delete_games_batch" => {
            #[derive(Deserialize)]
            struct P {
                ids: Vec<i32>,
            }
            let p: P = parse(params)?;
            let r = dbx(GamesRepository::delete_many(conn, p.ids).await)?;
            Ok(json!({"rows_affected": r.rows_affected}))
        }
        "delete_collection" => {
            #[derive(Deserialize)]
            struct P {
                id: i32,
            }
            let p: P = parse(params)?;
            let r = dbx(CollectionsRepository::delete(conn, p.id).await)?;
            Ok(json!({"rows_affected": r.rows_affected}))
        }
        "delete_game_session" => {
            #[derive(Deserialize)]
            struct P {
                session_id: i32,
            }
            let p: P = parse(params)?;
            let r = dbx(GameStatsRepository::delete_session(conn, p.session_id).await)?;
            Ok(json!({"rows_affected": r.rows_affected}))
        }
        "delete_game_statistics" => {
            #[derive(Deserialize)]
            struct P {
                game_id: i32,
            }
            let p: P = parse(params)?;
            let r = dbx(GameStatsRepository::delete_statistics(conn, p.game_id).await)?;
            Ok(json!({"rows_affected": r.rows_affected}))
        }

        other => Err(format!("unknown action: {other}")),
    }
}
