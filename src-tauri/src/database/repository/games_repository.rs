//! 游戏聚合仓库。

use crate::database::dto::{
    BatchOperationError, BatchOperationResult, FullGameData, GameSourceData, InsertGameData,
    UpdateGameData, UpsertGameSourceData,
};
use crate::entity::prelude::*;
use crate::entity::{game_sources, game_statistics, games, savedata};
use sea_orm::sea_query::{Expr, OnConflict};
use sea_orm::*;
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};

/// 游戏数据排序选项
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SortOption {
    Addtime,
    Datetime,
    LastPlayed,
    BGMRank,
    VNDBRank,
    UserRatingRank,
    Namesort,
}

/// 排序方向
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SortOrder {
    Asc,
    Desc,
}

/// 游戏类型筛选
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum GameType {
    All,
    Local,
    Online,
    IsCustom,
}

pub struct GamesRepository;

impl GamesRepository {
    const DEFAULT_PLAY_STATUS: i32 = 1;
    const MIXED_NAME_PRIORITY: [&str; 4] = ["bgm", "vndb", "ymgal", "kun"];
    const FULL_GAME_SELECT: &str = r#"
        SELECT
            g.id,
            g.id_type,
            g.date,
            g.localpath,
            g.savepath,
            g.autosave,
            g.maxbackups,
            g.clear,
            g.le_launch,
            g.magpie,
            g.custom_data,
            g.created_at,
            g.updated_at,
            (
                SELECT json_group_array(
                    json_object(
                        'source', source_rows.source,
                        'external_id', source_rows.external_id,
                        'data', json(source_rows.data)
                    )
                )
                FROM (
                    SELECT source, external_id, data
                    FROM game_sources
                    WHERE game_id = g.id
                    ORDER BY source
                ) AS source_rows
            ) AS sources_json
        FROM games AS g
    "#;

    fn build_batch_failure_result(total: usize, message: String) -> BatchOperationResult {
        BatchOperationResult {
            total,
            success: 0,
            failed: total,
            ids: Vec::new(),
            games: Vec::new(),
            errors: (0..total)
                .map(|index| BatchOperationError {
                    index,
                    message: message.clone(),
                })
                .collect(),
        }
    }

    fn validate_source(source: &UpsertGameSourceData) -> Result<(), DbErr> {
        if source.source.is_empty() {
            return Err(DbErr::Custom("source 不能为空".to_string()));
        }
        if source.external_id.is_none() && source.data.is_none() {
            return Err(DbErr::Custom(format!(
                "{} source 的 external_id 和 data 不能同时为空",
                source.source
            )));
        }
        Ok(())
    }

    fn validate_source_changes(
        upserts: &[UpsertGameSourceData],
        removes: &[String],
    ) -> Result<(), DbErr> {
        let mut seen = HashSet::new();
        for source in upserts {
            Self::validate_source(source)?;
            if !seen.insert(source.source.as_str()) {
                return Err(DbErr::Custom(format!(
                    "{} source 被重复提交",
                    source.source
                )));
            }
        }

        let mut removed = HashSet::new();
        for source in removes {
            if !removed.insert(source.as_str()) {
                return Err(DbErr::Custom(format!("{} source 被重复删除", source)));
            }
            if seen.contains(source.as_str()) {
                return Err(DbErr::Custom(format!(
                    "{} source 不能同时更新和删除",
                    source
                )));
            }
        }

        Ok(())
    }

    fn normalize_insert_date(game: &mut InsertGameData) {
        if game.date.is_some() {
            return;
        }

        game.date = game.sources.iter().find_map(|source| {
            source
                .data
                .as_ref()
                .and_then(|data| data.get("date"))
                .and_then(|date| date.as_str())
                .map(str::trim)
                .filter(|date| !date.is_empty())
                .map(ToOwned::to_owned)
        });
    }

    fn build_insert_active_model(game: &InsertGameData, now: i32) -> games::ActiveModel {
        games::ActiveModel {
            id: NotSet,
            id_type: Set(game.id_type.clone()),
            date: Set(game.date.clone()),
            localpath: Set(game.localpath.clone()),
            savepath: Set(game.savepath.clone()),
            autosave: Set(game.autosave),
            maxbackups: Set(game.maxbackups),
            clear: Set(Some(game.clear.unwrap_or(Self::DEFAULT_PLAY_STATUS))),
            le_launch: Set(game.le_launch),
            magpie: Set(game.magpie),
            custom_data: Set(game.custom_data.clone()),
            user_rating: NotSet,
            created_at: Set(Some(now)),
            updated_at: Set(Some(now)),
        }
    }

    fn build_update_active_model(
        game_id: i32,
        updates: &UpdateGameData,
        now: i32,
    ) -> games::ActiveModel {
        games::ActiveModel {
            id: Set(game_id),
            id_type: updates.id_type.clone().map_or(NotSet, Set),
            date: updates.date.clone().map_or(NotSet, Set),
            localpath: updates.localpath.clone().map_or(NotSet, Set),
            savepath: updates.savepath.clone().map_or(NotSet, Set),
            autosave: updates.autosave.map_or(NotSet, Set),
            maxbackups: updates.maxbackups.map_or(NotSet, Set),
            clear: updates.clear.map_or(NotSet, Set),
            le_launch: updates.le_launch.map_or(NotSet, Set),
            magpie: updates.magpie.map_or(NotSet, Set),
            custom_data: updates.custom_data.clone().map_or(NotSet, Set),
            user_rating: NotSet,
            updated_at: Set(Some(now)),
            ..Default::default()
        }
    }

    fn build_source_active_model(
        game_id: i32,
        source: &UpsertGameSourceData,
    ) -> game_sources::ActiveModel {
        game_sources::ActiveModel {
            game_id: Set(game_id),
            source: Set(source.source.clone()),
            external_id: Set(source.external_id.clone()),
            data: Set(source.data.clone()),
            score: NotSet,
            rank: NotSet,
        }
    }

    async fn upsert_sources<C>(
        db: &C,
        game_id: i32,
        sources: &[UpsertGameSourceData],
    ) -> Result<(), DbErr>
    where
        C: ConnectionTrait,
    {
        for source in sources {
            GameSources::insert(Self::build_source_active_model(game_id, source))
                .on_conflict(
                    OnConflict::columns([
                        game_sources::Column::GameId,
                        game_sources::Column::Source,
                    ])
                    .update_columns([game_sources::Column::ExternalId, game_sources::Column::Data])
                    .to_owned(),
                )
                .exec(db)
                .await?;
        }
        Ok(())
    }

    async fn remove_sources<C>(db: &C, game_id: i32, sources: &[String]) -> Result<(), DbErr>
    where
        C: ConnectionTrait,
    {
        if sources.is_empty() {
            return Ok(());
        }

        GameSources::delete_many()
            .filter(game_sources::Column::GameId.eq(game_id))
            .filter(game_sources::Column::Source.is_in(sources.iter().cloned()))
            .exec(db)
            .await?;
        Ok(())
    }

    async fn insert_aggregate<C>(
        db: &C,
        mut game: InsertGameData,
        now: i32,
    ) -> Result<FullGameData, DbErr>
    where
        C: ConnectionTrait,
    {
        Self::validate_source_changes(&game.sources, &[])?;
        Self::normalize_insert_date(&mut game);

        let model = Self::build_insert_active_model(&game, now)
            .insert(db)
            .await?;
        Self::upsert_sources(db, model.id, &game.sources).await?;

        Self::find_full_by_id(db, model.id)
            .await?
            .ok_or_else(|| DbErr::RecordNotFound(format!("game {} not found", model.id)))
    }

    pub async fn insert(
        db: &DatabaseConnection,
        game: InsertGameData,
    ) -> Result<FullGameData, DbErr> {
        let transaction = db.begin().await?;
        let result = Self::insert_aggregate(
            &transaction,
            game.cleaned(),
            chrono::Utc::now().timestamp() as i32,
        )
        .await?;
        transaction.commit().await?;
        Ok(result)
    }

    pub async fn insert_batch(
        db: &DatabaseConnection,
        games: Vec<InsertGameData>,
    ) -> BatchOperationResult {
        let total = games.len();
        let transaction = match db.begin().await {
            Ok(transaction) => transaction,
            Err(error) => return Self::build_batch_failure_result(total, error.to_string()),
        };
        let now = chrono::Utc::now().timestamp() as i32;
        let mut ids = Vec::with_capacity(total);
        let mut inserted_games = Vec::with_capacity(total);
        let mut errors = Vec::new();

        for (index, game) in games.into_iter().enumerate() {
            let nested = match transaction.begin().await {
                Ok(nested) => nested,
                Err(error) => {
                    errors.push(BatchOperationError {
                        index,
                        message: error.to_string(),
                    });
                    continue;
                }
            };

            match Self::insert_aggregate(&nested, game.cleaned(), now).await {
                Ok(result) => {
                    if let Err(error) = nested.commit().await {
                        errors.push(BatchOperationError {
                            index,
                            message: error.to_string(),
                        });
                    } else {
                        ids.push(result.id);
                        inserted_games.push(result);
                    }
                }
                Err(error) => {
                    let _ = nested.rollback().await;
                    errors.push(BatchOperationError {
                        index,
                        message: error.to_string(),
                    });
                }
            }
        }

        if let Err(error) = transaction.commit().await {
            return Self::build_batch_failure_result(total, error.to_string());
        }

        BatchOperationResult {
            total,
            success: ids.len(),
            failed: errors.len(),
            ids,
            games: inserted_games,
            errors,
        }
    }

    async fn update_aggregate<C>(
        db: &C,
        game_id: i32,
        updates: UpdateGameData,
        now: i32,
    ) -> Result<FullGameData, DbErr>
    where
        C: ConnectionTrait,
    {
        let upserts = updates.upsert_sources.as_deref().unwrap_or_default();
        let removes = updates.remove_sources.as_deref().unwrap_or_default();
        Self::validate_source_changes(upserts, removes)?;

        Self::build_update_active_model(game_id, &updates, now)
            .update(db)
            .await?;
        Self::remove_sources(db, game_id, removes).await?;
        Self::upsert_sources(db, game_id, upserts).await?;

        Self::find_full_by_id(db, game_id)
            .await?
            .ok_or_else(|| DbErr::RecordNotFound(format!("game {} not found", game_id)))
    }

    pub async fn update(
        db: &DatabaseConnection,
        game_id: i32,
        updates: UpdateGameData,
    ) -> Result<FullGameData, DbErr> {
        let transaction = db.begin().await?;
        let result = Self::update_aggregate(
            &transaction,
            game_id,
            updates.cleaned(),
            chrono::Utc::now().timestamp() as i32,
        )
        .await?;
        transaction.commit().await?;
        Ok(result)
    }

    pub async fn update_batch(
        db: &DatabaseConnection,
        updates: Vec<(i32, UpdateGameData)>,
    ) -> Result<Vec<FullGameData>, DbErr> {
        if updates.is_empty() {
            return Ok(Vec::new());
        }

        let transaction = db.begin().await?;
        let now = chrono::Utc::now().timestamp() as i32;
        let mut updated_games = Vec::with_capacity(updates.len());

        for (game_id, update) in updates {
            updated_games
                .push(Self::update_aggregate(&transaction, game_id, update.cleaned(), now).await?);
        }

        transaction.commit().await?;
        Ok(updated_games)
    }

    async fn find_full_by_id<C>(db: &C, id: i32) -> Result<Option<FullGameData>, DbErr>
    where
        C: ConnectionTrait,
    {
        let sql = format!("{} WHERE g.id = {}", Self::FULL_GAME_SELECT, id);
        db.query_one(Statement::from_string(db.get_database_backend(), sql))
            .await?
            .map(Self::full_game_from_row)
            .transpose()
    }

    pub async fn find_by_id(
        db: &DatabaseConnection,
        id: i32,
    ) -> Result<Option<FullGameData>, DbErr> {
        Self::find_full_by_id(db, id).await
    }

    pub async fn find_all(
        db: &DatabaseConnection,
        game_type: GameType,
        sort_option: SortOption,
        sort_order: SortOrder,
        language: Option<String>,
    ) -> Result<Vec<FullGameData>, DbErr> {
        let ids = Self::find_ids(db, game_type, sort_option, sort_order, language.clone()).await?;
        Self::find_full_games_in_order(db, &ids).await
    }

    pub async fn find_ids(
        db: &DatabaseConnection,
        game_type: GameType,
        sort_option: SortOption,
        sort_order: SortOrder,
        language: Option<String>,
    ) -> Result<Vec<i32>, DbErr> {
        if matches!(sort_option, SortOption::Namesort) {
            return Self::find_name_sorted_ids(db, game_type, sort_order, language).await;
        }

        Self::find_ids_sql(db, game_type, sort_option, sort_order).await
    }

    async fn find_full_games_in_order<C>(db: &C, ids: &[i32]) -> Result<Vec<FullGameData>, DbErr>
    where
        C: ConnectionTrait,
    {
        if ids.is_empty() {
            return Ok(Vec::new());
        }

        let id_list = ids
            .iter()
            .map(ToString::to_string)
            .collect::<Vec<_>>()
            .join(",");
        let sql = format!("{} WHERE g.id IN ({})", Self::FULL_GAME_SELECT, id_list);
        let mut by_id = HashMap::new();
        for row in db
            .query_all(Statement::from_string(db.get_database_backend(), sql))
            .await?
        {
            let game = Self::full_game_from_row(row)?;
            by_id.insert(game.id, game);
        }

        Ok(ids.iter().filter_map(|id| by_id.remove(id)).collect())
    }

    fn full_game_from_row(row: QueryResult) -> Result<FullGameData, DbErr> {
        let custom_data = row
            .try_get::<Option<String>>("", "custom_data")?
            .map(|data| {
                serde_json::from_str(&data)
                    .map_err(|error| DbErr::Custom(format!("custom_data 解析失败: {}", error)))
            })
            .transpose()?;
        let sources_json: String = row.try_get("", "sources_json")?;
        let sources = serde_json::from_str::<Vec<GameSourceData>>(&sources_json)
            .map_err(|error| DbErr::Custom(format!("sources 聚合结果解析失败: {}", error)))?;

        Ok(FullGameData {
            id: row.try_get("", "id")?,
            id_type: row.try_get("", "id_type")?,
            date: row.try_get("", "date")?,
            localpath: row.try_get("", "localpath")?,
            savepath: row.try_get("", "savepath")?,
            autosave: row.try_get("", "autosave")?,
            maxbackups: row.try_get("", "maxbackups")?,
            clear: row.try_get("", "clear")?,
            le_launch: row.try_get("", "le_launch")?,
            magpie: row.try_get("", "magpie")?,
            custom_data,
            sources,
            created_at: row.try_get("", "created_at")?,
            updated_at: row.try_get("", "updated_at")?,
        })
    }

    pub async fn delete(db: &DatabaseConnection, id: i32) -> Result<DeleteResult, DbErr> {
        Games::delete_by_id(id).exec(db).await
    }

    pub async fn delete_many(
        db: &DatabaseConnection,
        ids: Vec<i32>,
    ) -> Result<DeleteResult, DbErr> {
        Games::delete_many()
            .filter(games::Column::Id.is_in(ids))
            .exec(db)
            .await
    }

    pub async fn count(db: &DatabaseConnection) -> Result<u64, DbErr> {
        Games::find().count(db).await
    }

    pub async fn get_source_bindings(
        db: &DatabaseConnection,
        source: &str,
    ) -> Result<Vec<(i32, String)>, DbErr> {
        GameSources::find()
            .select_only()
            .column(game_sources::Column::GameId)
            .column(game_sources::Column::ExternalId)
            .filter(game_sources::Column::Source.eq(source))
            .filter(game_sources::Column::ExternalId.is_not_null())
            .into_tuple::<(i32, String)>()
            .all(db)
            .await
    }

    pub async fn get_all_localpaths(db: &DatabaseConnection) -> Result<HashSet<String>, DbErr> {
        Games::find()
            .select_only()
            .column(games::Column::Localpath)
            .filter(games::Column::Localpath.is_not_null())
            .into_tuple::<String>()
            .all(db)
            .await
            .map(|paths| paths.into_iter().collect())
    }

    fn build_base_query(game_type: GameType) -> Select<Games> {
        let query = Games::find();
        match game_type {
            GameType::All => query,
            GameType::Local => query.filter(games::Column::Localpath.is_not_null()),
            GameType::Online => query.filter(games::Column::Localpath.is_null()),
            GameType::IsCustom => query.filter(
                Condition::any()
                    .add(games::Column::IdType.eq("custom"))
                    .add(games::Column::IdType.eq("Whitecloud")),
            ),
        }
    }

    fn apply_date_order(query: Select<Games>, sort_order: SortOrder) -> Select<Games> {
        let query = query.order_by(Expr::col(games::Column::Date).is_null(), Order::Asc);
        match sort_order {
            SortOrder::Asc => query.order_by_asc(games::Column::Date),
            SortOrder::Desc => query.order_by_desc(games::Column::Date),
        }
        .order_by_asc(games::Column::Id)
    }

    fn apply_last_played_order(query: Select<Games>, sort_order: SortOrder) -> Select<Games> {
        let query = query.left_join(game_statistics::Entity).order_by(
            Expr::col(game_statistics::Column::LastPlayed).is_null(),
            Order::Asc,
        );
        match sort_order {
            SortOrder::Asc => query.order_by_desc(game_statistics::Column::LastPlayed),
            SortOrder::Desc => query.order_by_asc(game_statistics::Column::LastPlayed),
        }
        .order_by_asc(games::Column::Id)
    }

    fn apply_optional_expression_order(
        query: Select<Games>,
        expression: &str,
        direction: Order,
    ) -> Select<Games> {
        query
            .order_by(Expr::cust(format!("({expression}) IS NULL")), Order::Asc)
            .order_by(Expr::cust(format!("({expression})")), direction)
    }

    async fn find_ids_sql(
        db: &DatabaseConnection,
        game_type: GameType,
        sort_option: SortOption,
        sort_order: SortOrder,
    ) -> Result<Vec<i32>, DbErr> {
        let query = Self::build_base_query(game_type)
            .select_only()
            .column(games::Column::Id);

        let query = match sort_option {
            SortOption::Addtime => match sort_order {
                SortOrder::Asc => query.order_by_asc(games::Column::Id),
                SortOrder::Desc => query.order_by_desc(games::Column::Id),
            },
            SortOption::Datetime => Self::apply_date_order(query, sort_order),
            SortOption::LastPlayed => Self::apply_last_played_order(query, sort_order),
            SortOption::BGMRank => {
                let score = "SELECT NULLIF(score, 0) FROM game_sources \
                             WHERE game_id = games.id AND source = 'bgm'";
                let rank = "SELECT NULLIF(rank, 0) FROM game_sources \
                            WHERE game_id = games.id AND source = 'bgm'";
                let (score_order, rank_order) = match sort_order {
                    SortOrder::Asc => (Order::Desc, Order::Asc),
                    SortOrder::Desc => (Order::Asc, Order::Desc),
                };
                let query = Self::apply_optional_expression_order(query, score, score_order);
                Self::apply_optional_expression_order(query, rank, rank_order)
                    .order_by_asc(games::Column::Id)
            }
            SortOption::VNDBRank => {
                let score = "SELECT NULLIF(score, 0) FROM game_sources \
                             WHERE game_id = games.id AND source = 'vndb'";
                let direction = match sort_order {
                    SortOrder::Asc => Order::Desc,
                    SortOrder::Desc => Order::Asc,
                };
                Self::apply_optional_expression_order(query, score, direction)
                    .order_by_asc(games::Column::Id)
            }
            SortOption::UserRatingRank => {
                let direction = match sort_order {
                    SortOrder::Asc => Order::Desc,
                    SortOrder::Desc => Order::Asc,
                };
                query
                    .order_by(
                        Expr::cust("(games.user_rating IS NULL OR games.user_rating <= 0)"),
                        Order::Asc,
                    )
                    .order_by(games::Column::UserRating, direction)
                    .order_by_asc(games::Column::Id)
            }
            SortOption::Namesort => unreachable!(),
        };

        query.into_tuple::<i32>().all(db).await
    }

    async fn find_name_sorted_ids(
        db: &DatabaseConnection,
        game_type: GameType,
        sort_order: SortOrder,
        language: Option<String>,
    ) -> Result<Vec<i32>, DbErr> {
        let where_clause = match game_type {
            GameType::All => "",
            GameType::Local => "WHERE g.localpath IS NOT NULL",
            GameType::Online => "WHERE g.localpath IS NULL",
            GameType::IsCustom => "WHERE g.id_type IN ('custom', 'Whitecloud')",
        };
        let sql = format!(
            r#"
            SELECT
                g.id,
                g.id_type,
                json_extract(g.custom_data, '$.name') AS custom_name,
                s.source,
                json_extract(s.data, '$.name') AS source_name,
                json_extract(s.data, '$.name_cn') AS source_name_cn
            FROM games AS g
            LEFT JOIN game_sources AS s ON s.game_id = g.id
            {where_clause}
            ORDER BY g.id, s.source
            "#
        );

        let rows = db
            .query_all(Statement::from_string(DatabaseBackend::Sqlite, sql))
            .await?;
        let mut entries: Vec<NameSortEntry> = Vec::new();

        for row in rows {
            let game_id = row.try_get::<i32>("", "id")?;
            let entry = match entries.last_mut() {
                Some(entry) if entry.id == game_id => entry,
                _ => {
                    entries.push(NameSortEntry {
                        id: game_id,
                        id_type: row.try_get("", "id_type")?,
                        custom_name: row.try_get("", "custom_name")?,
                        sources: HashMap::new(),
                    });
                    entries.last_mut().expect("刚插入的名称排序项应存在")
                }
            };

            if let Some(source) = row.try_get::<Option<String>>("", "source")? {
                entry.sources.insert(
                    source,
                    (
                        row.try_get("", "source_name")?,
                        row.try_get("", "source_name_cn")?,
                    ),
                );
            }
        }

        let use_cn = language.as_deref() == Some("zh-CN");
        let descending = matches!(sort_order, SortOrder::Desc);
        entries.sort_by(|left, right| {
            let left_key = Self::name_sort_key(left, use_cn);
            let right_key = Self::name_sort_key(right, use_cn);
            match (left_key, right_key) {
                (None, None) => left.id.cmp(&right.id),
                (None, Some(_)) => Ordering::Greater,
                (Some(_), None) => Ordering::Less,
                (Some(left_key), Some(right_key)) => {
                    let order = left_key.cmp(&right_key);
                    let order = if descending { order.reverse() } else { order };
                    order.then_with(|| left.id.cmp(&right.id))
                }
            }
        });

        Ok(entries.into_iter().map(|entry| entry.id).collect())
    }

    fn name_sort_key(entry: &NameSortEntry, use_cn: bool) -> Option<String> {
        if let Some(custom_name) = non_empty(entry.custom_name.as_deref()) {
            return Some(Self::to_sort_key(custom_name, use_cn));
        }

        let source_name = |source: &str| {
            entry.sources.get(source).and_then(|(name, name_cn)| {
                if use_cn {
                    non_empty(name_cn.as_deref()).or_else(|| non_empty(name.as_deref()))
                } else {
                    non_empty(name.as_deref())
                }
            })
        };

        let name = if entry.sources.contains_key(entry.id_type.as_str())
            && !matches!(entry.id_type.as_str(), "mixed" | "custom" | "Whitecloud")
        {
            source_name(&entry.id_type)
        } else {
            Self::MIXED_NAME_PRIORITY
                .iter()
                .find_map(|source| source_name(source))
        };

        name.map(|name| Self::to_sort_key(name, use_cn))
    }

    fn to_sort_key(value: &str, use_cn: bool) -> String {
        if !use_cn {
            return value.to_lowercase();
        }

        use pinyin::ToPinyin;
        let mut result = String::with_capacity(value.len() * 2);
        for (character, pinyin) in value.chars().zip(value.to_pinyin()) {
            match pinyin {
                Some(pinyin) => result.push_str(pinyin.plain()),
                None => result.extend(character.to_lowercase()),
            }
        }
        result
    }

    // ==================== 存档备份相关操作 ====================

    pub async fn save_savedata_record(
        db: &DatabaseConnection,
        game_id: i32,
        file_name: &str,
        backup_time: i32,
        file_size: i32,
    ) -> Result<i32, DbErr> {
        let savedata_record = savedata::ActiveModel {
            id: NotSet,
            game_id: Set(game_id),
            file: Set(file_name.to_string()),
            backup_time: Set(backup_time),
            file_size: Set(file_size),
        };
        let result = savedata_record.insert(db).await?;
        Ok(result.id)
    }

    pub async fn get_savedata_count(db: &DatabaseConnection, game_id: i32) -> Result<u64, DbErr> {
        Savedata::find()
            .filter(savedata::Column::GameId.eq(game_id))
            .count(db)
            .await
    }

    pub async fn get_savedata_records(
        db: &DatabaseConnection,
        game_id: i32,
    ) -> Result<Vec<savedata::Model>, DbErr> {
        Savedata::find()
            .filter(savedata::Column::GameId.eq(game_id))
            .order_by_desc(savedata::Column::BackupTime)
            .all(db)
            .await
    }

    pub async fn get_savedata_record_by_id(
        db: &DatabaseConnection,
        backup_id: i32,
    ) -> Result<Option<savedata::Model>, DbErr> {
        Savedata::find_by_id(backup_id).one(db).await
    }

    pub async fn delete_savedata_record(
        db: &DatabaseConnection,
        backup_id: i32,
    ) -> Result<DeleteResult, DbErr> {
        Savedata::delete_by_id(backup_id).exec(db).await
    }
}

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

struct NameSortEntry {
    id: i32,
    id_type: String,
    custom_name: Option<String>,
    sources: HashMap<String, (Option<String>, Option<String>)>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::entity::custom_data::CustomData;
    use sea_orm::Database;
    use serde_json::json;

    async fn setup_database() -> DatabaseConnection {
        let database = Database::connect("sqlite::memory:").await.unwrap();
        database
            .execute_unprepared(
                r#"
                PRAGMA foreign_keys = ON;
                CREATE TABLE games (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    id_type TEXT NOT NULL,
                    date TEXT,
                    localpath TEXT,
                    savepath TEXT,
                    autosave INTEGER,
                    maxbackups INTEGER,
                    clear INTEGER,
                    le_launch INTEGER,
                    magpie INTEGER,
                    custom_data TEXT,
                    user_rating REAL GENERATED ALWAYS AS (
                        CAST(json_extract(custom_data, '$.user_rating') AS REAL)
                    ) VIRTUAL,
                    created_at INTEGER,
                    updated_at INTEGER
                );
                CREATE TABLE game_sources (
                    game_id INTEGER NOT NULL,
                    source TEXT NOT NULL,
                    external_id TEXT,
                    data TEXT,
                    score REAL GENERATED ALWAYS AS (
                        CAST(json_extract(data, '$.score') AS REAL)
                    ) VIRTUAL,
                    rank INTEGER GENERATED ALWAYS AS (
                        CAST(json_extract(data, '$.rank') AS INTEGER)
                    ) VIRTUAL,
                    PRIMARY KEY (game_id, source),
                    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
                    CHECK (external_id IS NOT NULL OR data IS NOT NULL),
                    CHECK (data IS NULL OR json_valid(data))
                );
                CREATE TABLE game_statistics (
                    game_id INTEGER PRIMARY KEY,
                    total_time INTEGER NOT NULL DEFAULT 0,
                    session_count INTEGER NOT NULL DEFAULT 0,
                    last_played INTEGER,
                    daily_stats TEXT,
                    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
                );
                CREATE TABLE savedata (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    game_id INTEGER NOT NULL,
                    file TEXT NOT NULL,
                    backup_time INTEGER NOT NULL,
                    file_size INTEGER NOT NULL,
                    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
                );
                "#,
            )
            .await
            .unwrap();
        database
    }

    fn insert_data(
        id_type: &str,
        custom_data: Option<CustomData>,
        sources: Vec<UpsertGameSourceData>,
    ) -> InsertGameData {
        InsertGameData {
            id_type: id_type.to_string(),
            date: None,
            localpath: None,
            savepath: None,
            autosave: None,
            maxbackups: None,
            clear: None,
            le_launch: None,
            magpie: None,
            custom_data,
            sources,
        }
    }

    fn source(source: &str, id: &str, data: serde_json::Value) -> UpsertGameSourceData {
        UpsertGameSourceData {
            source: source.to_string(),
            external_id: Some(id.to_string()),
            data: Some(data),
        }
    }

    #[tokio::test]
    async fn writes_and_updates_game_aggregate_transactionally() {
        let database = setup_database().await;
        let inserted = GamesRepository::insert(
            &database,
            insert_data(
                "mixed",
                None,
                vec![
                    source("bgm", "1", json!({"name": "标题", "date": "2024-01-02"})),
                    source("vndb", "v1", json!({"name": "Title"})),
                ],
            ),
        )
        .await
        .unwrap();

        assert_eq!(inserted.date.as_deref(), Some("2024-01-02"));
        assert_eq!(inserted.sources.len(), 2);

        let updated = GamesRepository::update(
            &database,
            inserted.id,
            UpdateGameData {
                upsert_sources: Some(vec![source(
                    "bgm",
                    "1",
                    json!({"name": "新标题", "date": "2025-01-01"}),
                )]),
                ..Default::default()
            },
        )
        .await
        .unwrap();

        assert_eq!(updated.date.as_deref(), Some("2024-01-02"));
        assert_eq!(updated.sources.len(), 2);
        assert_eq!(
            updated
                .sources
                .iter()
                .find(|source| source.source == "bgm")
                .unwrap()
                .data
                .as_ref()
                .and_then(|data| data.get("name"))
                .and_then(|name| name.as_str()),
            Some("新标题")
        );

        let switched = GamesRepository::update(
            &database,
            inserted.id,
            UpdateGameData {
                id_type: Some("vndb".to_string()),
                ..Default::default()
            },
        )
        .await
        .unwrap();
        assert_eq!(switched.id_type, "vndb");
        assert_eq!(switched.sources.len(), 2);
    }

    #[tokio::test]
    async fn sorts_names_with_custom_override_and_stable_id_tie_breaker() {
        let database = setup_database().await;
        let first = GamesRepository::insert(
            &database,
            insert_data(
                "bgm",
                None,
                vec![source("bgm", "1", json!({"name": "Beta", "name_cn": "乙"}))],
            ),
        )
        .await
        .unwrap();
        let second = GamesRepository::insert(
            &database,
            insert_data(
                "bgm",
                Some(CustomData {
                    name: Some("Alpha".to_string()),
                    ..Default::default()
                }),
                vec![source("bgm", "2", json!({"name": "Zulu", "name_cn": "甲"}))],
            ),
        )
        .await
        .unwrap();

        let ids = GamesRepository::find_ids(
            &database,
            GameType::All,
            SortOption::Namesort,
            SortOrder::Asc,
            Some("en-US".to_string()),
        )
        .await
        .unwrap();
        assert_eq!(ids, vec![second.id, first.id]);
    }

    #[tokio::test]
    async fn sorts_user_rating_from_generated_column() {
        let database = setup_database().await;
        let low = GamesRepository::insert(
            &database,
            insert_data(
                "custom",
                Some(CustomData {
                    name: Some("Low".to_string()),
                    user_rating: Some(4.0),
                    ..Default::default()
                }),
                Vec::new(),
            ),
        )
        .await
        .unwrap();
        let high = GamesRepository::insert(
            &database,
            insert_data(
                "custom",
                Some(CustomData {
                    name: Some("High".to_string()),
                    user_rating: Some(9.0),
                    ..Default::default()
                }),
                Vec::new(),
            ),
        )
        .await
        .unwrap();

        let ids = GamesRepository::find_ids(
            &database,
            GameType::All,
            SortOption::UserRatingRank,
            SortOrder::Asc,
            None,
        )
        .await
        .unwrap();
        assert_eq!(ids, vec![high.id, low.id]);
    }
}
