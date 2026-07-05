use crate::entity::prelude::*;
use crate::entity::{game_sessions, game_statistics};
use chrono::{Local, LocalResult, NaiveTime, TimeZone};
use sea_orm::*;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// 每日统计数据结构
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DailyStats {
    pub date: String,
    pub playtime: i32,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct StatisticsProjection {
    total_time: i32,
    session_count: i32,
    last_played: Option<i32>,
    daily_stats: Vec<DailyStats>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct SessionStatisticsContribution {
    duration: i32,
    daily_stats: Vec<DailyStats>,
}

#[derive(Debug, Clone, Serialize, FromQueryResult)]
pub struct GameLastPlayed {
    pub game_id: i32,
    pub last_played: Option<i32>,
}

fn custom_error(message: impl Into<String>) -> DbErr {
    DbErr::Custom(message.into())
}

fn timestamp_in_timezone<Tz: TimeZone>(
    timezone: &Tz,
    timestamp: i32,
) -> Result<chrono::DateTime<Tz>, DbErr> {
    match timezone.timestamp_opt(i64::from(timestamp), 0) {
        LocalResult::Single(datetime) => Ok(datetime),
        _ => Err(custom_error(format!("无效时间戳: {timestamp}"))),
    }
}

fn next_midnight_timestamp<Tz: TimeZone>(
    timezone: &Tz,
    date: chrono::NaiveDate,
) -> Result<i64, DbErr> {
    let next_date = date
        .succ_opt()
        .ok_or_else(|| custom_error("计算下一日期时溢出"))?;
    let midnight = next_date.and_time(NaiveTime::MIN);

    timezone
        .from_local_datetime(&midnight)
        .earliest()
        .map(|datetime| datetime.timestamp())
        .ok_or_else(|| custom_error(format!("无法解析本地日期: {next_date}")))
}

fn round_positive_ratio(numerator: i128, denominator: i128) -> Result<i32, DbErr> {
    if numerator < 0 || denominator <= 0 {
        return Err(custom_error("取整参数必须为非负数且分母必须大于零"));
    }

    let rounded = (numerator * 2 + denominator) / (denominator * 2);
    i32::try_from(rounded).map_err(|_| custom_error("分钟数超出 i32 范围"))
}

fn session_statistics_contribution<Tz: TimeZone>(
    session: &game_sessions::Model,
    timezone: &Tz,
) -> Result<SessionStatisticsContribution, DbErr> {
    if session.start_time <= 0 || session.end_time <= session.start_time {
        return Err(custom_error("会话起止时间无效"));
    }
    if session.duration <= 0 {
        return Err(custom_error("会话时长必须大于零"));
    }

    let start = timestamp_in_timezone(timezone, session.start_time)?;
    let end = timestamp_in_timezone(timezone, session.end_time)?;
    let start_date = start.date_naive();
    let end_date = end.date_naive();

    if start_date == end_date {
        return Ok(SessionStatisticsContribution {
            duration: session.duration,
            daily_stats: vec![DailyStats {
                date: start_date.format("%Y-%m-%d").to_string(),
                playtime: session.duration,
            }],
        });
    }

    let total_seconds = i128::from(session.end_time - session.start_time);
    let mut current_date = start_date;
    let mut allocated_minutes = 0;
    let mut daily_stats = Vec::new();

    while current_date < end_date {
        let boundary =
            next_midnight_timestamp(timezone, current_date)?.min(i64::from(session.end_time));
        let elapsed_seconds = i128::from(boundary - i64::from(session.start_time));
        let cumulative_minutes = round_positive_ratio(
            elapsed_seconds * i128::from(session.duration),
            total_seconds,
        )?;
        let day_minutes = cumulative_minutes
            .checked_sub(allocated_minutes)
            .ok_or_else(|| custom_error("每日时长分配出现负数"))?;

        if day_minutes > 0 {
            daily_stats.push(DailyStats {
                date: current_date.format("%Y-%m-%d").to_string(),
                playtime: day_minutes,
            });
        }

        allocated_minutes = cumulative_minutes;
        current_date = current_date
            .succ_opt()
            .ok_or_else(|| custom_error("计算下一日期时溢出"))?;
    }

    let final_minutes = session
        .duration
        .checked_sub(allocated_minutes)
        .ok_or_else(|| custom_error("每日时长分配总和超过会话时长"))?;
    if final_minutes > 0 {
        daily_stats.push(DailyStats {
            date: end_date.format("%Y-%m-%d").to_string(),
            playtime: final_minutes,
        });
    }

    let distributed_minutes = daily_stats.iter().try_fold(0_i32, |total, item| {
        total
            .checked_add(item.playtime)
            .ok_or_else(|| custom_error("每日时长总和溢出"))
    })?;
    if distributed_minutes != session.duration {
        return Err(custom_error("每日时长分配总和与会话时长不一致"));
    }

    Ok(SessionStatisticsContribution {
        duration: session.duration,
        daily_stats,
    })
}

fn daily_stats_map(daily_stats: &[DailyStats]) -> Result<BTreeMap<String, i32>, DbErr> {
    let mut result = BTreeMap::new();

    for item in daily_stats {
        if item.playtime < 0 {
            return Err(custom_error("每日统计不能为负数"));
        }
        if result.insert(item.date.clone(), item.playtime).is_some() {
            return Err(custom_error(format!("每日统计包含重复日期: {}", item.date)));
        }
    }

    Ok(result)
}

fn sorted_daily_stats(daily_stats: BTreeMap<String, i32>) -> Vec<DailyStats> {
    daily_stats
        .into_iter()
        .rev()
        .filter_map(|(date, playtime)| (playtime > 0).then_some(DailyStats { date, playtime }))
        .collect()
}

fn calculate_statistics<Tz: TimeZone>(
    sessions: &[game_sessions::Model],
    timezone: &Tz,
) -> Result<StatisticsProjection, DbErr> {
    let mut projection = StatisticsProjection {
        total_time: 0,
        session_count: 0,
        last_played: None,
        daily_stats: Vec::new(),
    };

    for session in sessions {
        apply_session_insert(&mut projection, session, timezone)?;
    }

    Ok(projection)
}

fn apply_session_insert<Tz: TimeZone>(
    projection: &mut StatisticsProjection,
    session: &game_sessions::Model,
    timezone: &Tz,
) -> Result<(), DbErr> {
    let contribution = session_statistics_contribution(session, timezone)?;
    let mut daily_stats = daily_stats_map(&projection.daily_stats)?;

    projection.total_time = projection
        .total_time
        .checked_add(contribution.duration)
        .ok_or_else(|| custom_error("总游玩时长溢出"))?;
    projection.session_count = projection
        .session_count
        .checked_add(1)
        .ok_or_else(|| custom_error("会话次数溢出"))?;
    projection.last_played = Some(
        projection
            .last_played
            .map_or(session.end_time, |value| value.max(session.end_time)),
    );

    for item in contribution.daily_stats {
        let playtime = daily_stats.entry(item.date).or_default();
        *playtime = playtime
            .checked_add(item.playtime)
            .ok_or_else(|| custom_error("每日游玩时长溢出"))?;
    }

    projection.daily_stats = sorted_daily_stats(daily_stats);
    Ok(())
}

fn apply_session_delete<Tz: TimeZone>(
    projection: &mut StatisticsProjection,
    session: &game_sessions::Model,
    remaining_last_played: Option<i32>,
    timezone: &Tz,
) -> Result<(), DbErr> {
    let contribution = session_statistics_contribution(session, timezone)?;
    let mut daily_stats = daily_stats_map(&projection.daily_stats)?;

    projection.total_time = projection
        .total_time
        .checked_sub(contribution.duration)
        .filter(|value| *value >= 0)
        .ok_or_else(|| custom_error("总游玩时长与会话记录不一致"))?;
    projection.session_count = projection
        .session_count
        .checked_sub(1)
        .filter(|value| *value >= 0)
        .ok_or_else(|| custom_error("会话次数与会话记录不一致"))?;

    for item in contribution.daily_stats {
        let playtime = daily_stats
            .get_mut(&item.date)
            .ok_or_else(|| custom_error(format!("每日统计缺少日期: {}", item.date)))?;
        *playtime = playtime
            .checked_sub(item.playtime)
            .filter(|value| *value >= 0)
            .ok_or_else(|| custom_error(format!("每日统计与会话记录不一致: {}", item.date)))?;
    }

    projection.last_played = if projection.session_count == 0 {
        None
    } else if projection.last_played == Some(session.end_time) {
        remaining_last_played
            .map(Some)
            .ok_or_else(|| custom_error("无法确定剩余会话的最近游玩时间"))?
    } else {
        projection.last_played
    };
    projection.daily_stats = sorted_daily_stats(daily_stats);

    Ok(())
}

fn projection_from_model(
    statistics: game_statistics::Model,
) -> Result<StatisticsProjection, DbErr> {
    let total_time = statistics
        .total_time
        .ok_or_else(|| custom_error("统计记录缺少 total_time"))?;
    let session_count = statistics
        .session_count
        .ok_or_else(|| custom_error("统计记录缺少 session_count"))?;
    let daily_stats = statistics
        .daily_stats
        .as_deref()
        .map(GameStatsRepository::parse_daily_stats)
        .transpose()
        .map_err(custom_error)?
        .unwrap_or_default();

    if total_time < 0 || session_count < 0 {
        return Err(custom_error("统计记录包含负数"));
    }
    daily_stats_map(&daily_stats)?;

    Ok(StatisticsProjection {
        total_time,
        session_count,
        last_played: statistics.last_played,
        daily_stats,
    })
}

/// 游戏统计仓库
pub struct GameStatsRepository;

impl GameStatsRepository {
    // ==================== 游戏会话操作 ====================

    async fn insert_session<C>(
        db: &C,
        game_id: i32,
        start_time: i32,
        end_time: i32,
        duration: i32,
        date: String,
    ) -> Result<game_sessions::Model, DbErr>
    where
        C: ConnectionTrait,
    {
        game_sessions::ActiveModel {
            session_id: NotSet,
            game_id: Set(game_id),
            start_time: Set(start_time),
            end_time: Set(end_time),
            duration: Set(duration),
            date: Set(date),
        }
        .insert(db)
        .await
    }

    /// 在同一事务内写入会话并增量更新统计
    pub async fn record_session_with_statistics(
        db: &DatabaseConnection,
        game_id: i32,
        start_time: i32,
        end_time: i32,
        duration: i32,
        date: String,
    ) -> Result<game_sessions::Model, DbErr> {
        let transaction = db.begin().await?;
        let session =
            Self::insert_session(&transaction, game_id, start_time, end_time, duration, date)
                .await?;

        let projection = match Self::get_projection(&transaction, game_id).await {
            Ok(Some(mut projection)) => {
                if apply_session_insert(&mut projection, &session, &Local).is_ok() {
                    projection
                } else {
                    Self::calculate_projection(&transaction, game_id).await?
                }
            }
            Ok(None) | Err(_) => Self::calculate_projection(&transaction, game_id).await?,
        };

        Self::upsert_projection(&transaction, game_id, projection).await?;
        transaction.commit().await?;
        Ok(session)
    }

    /// 获取游戏会话历史
    pub async fn get_sessions(
        db: &DatabaseConnection,
        game_id: i32,
        limit: u64,
        offset: u64,
    ) -> Result<Vec<game_sessions::Model>, DbErr> {
        GameSessions::find()
            .filter(game_sessions::Column::GameId.eq(game_id))
            .order_by_desc(game_sessions::Column::StartTime)
            .limit(limit)
            .offset(offset)
            .all(db)
            .await
    }

    /// 获取指定游戏范围内的全局最近会话
    pub async fn get_recent_sessions_for_all(
        db: &DatabaseConnection,
        game_ids: Vec<i32>,
        limit: u64,
    ) -> Result<Vec<game_sessions::Model>, DbErr> {
        if game_ids.is_empty() {
            return Ok(Vec::new());
        }

        let sessions = GameSessions::find()
            .filter(game_sessions::Column::GameId.is_in(game_ids))
            .order_by_desc(game_sessions::Column::StartTime)
            .limit(limit)
            .all(db)
            .await?;

        Ok(sessions)
    }

    /// 在同一事务内删除会话并增量更新统计
    pub async fn delete_session_with_statistics(
        db: &DatabaseConnection,
        session_id: i32,
    ) -> Result<i32, DbErr> {
        let transaction = db.begin().await?;
        let session = GameSessions::find_by_id(session_id)
            .one(&transaction)
            .await?
            .ok_or_else(|| DbErr::RecordNotFound(format!("会话不存在: {session_id}")))?;
        let statistics = GameStatistics::find_by_id(session.game_id)
            .one(&transaction)
            .await?;

        GameSessions::delete_by_id(session_id)
            .exec(&transaction)
            .await?;

        let projection = match statistics.map(projection_from_model).transpose() {
            Ok(Some(mut projection)) => {
                let remaining_last_played = if projection.last_played == Some(session.end_time) {
                    Self::get_latest_session_end(&transaction, session.game_id).await?
                } else {
                    projection.last_played
                };

                if apply_session_delete(&mut projection, &session, remaining_last_played, &Local)
                    .is_ok()
                {
                    projection
                } else {
                    Self::calculate_projection(&transaction, session.game_id).await?
                }
            }
            Ok(None) | Err(_) => Self::calculate_projection(&transaction, session.game_id).await?,
        };

        Self::upsert_projection(&transaction, session.game_id, projection).await?;
        transaction.commit().await?;
        Ok(session.game_id)
    }

    // ==================== 游戏统计操作 ====================

    async fn get_projection<C>(db: &C, game_id: i32) -> Result<Option<StatisticsProjection>, DbErr>
    where
        C: ConnectionTrait,
    {
        GameStatistics::find_by_id(game_id)
            .one(db)
            .await?
            .map(projection_from_model)
            .transpose()
    }

    async fn calculate_projection<C>(db: &C, game_id: i32) -> Result<StatisticsProjection, DbErr>
    where
        C: ConnectionTrait,
    {
        let sessions = GameSessions::find()
            .filter(game_sessions::Column::GameId.eq(game_id))
            .all(db)
            .await?;

        calculate_statistics(&sessions, &Local)
    }

    async fn get_latest_session_end<C>(db: &C, game_id: i32) -> Result<Option<i32>, DbErr>
    where
        C: ConnectionTrait,
    {
        Ok(GameSessions::find()
            .filter(game_sessions::Column::GameId.eq(game_id))
            .order_by_desc(game_sessions::Column::EndTime)
            .one(db)
            .await?
            .map(|session| session.end_time))
    }

    async fn upsert_projection<C>(
        db: &C,
        game_id: i32,
        projection: StatisticsProjection,
    ) -> Result<(), DbErr>
    where
        C: ConnectionTrait,
    {
        let daily_stats = serde_json::to_string(&projection.daily_stats)
            .map_err(|error| custom_error(format!("序列化每日统计失败: {error}")))?;

        let statistics = game_statistics::ActiveModel {
            game_id: Set(game_id),
            total_time: Set(Some(projection.total_time)),
            session_count: Set(Some(projection.session_count)),
            last_played: Set(projection.last_played),
            daily_stats: Set(Some(daily_stats)),
        };

        if GameStatistics::find_by_id(game_id).one(db).await?.is_some() {
            statistics.update(db).await?;
        } else {
            statistics.insert(db).await?;
        }

        Ok(())
    }

    /// 更新游戏统计信息
    pub async fn update_statistics(
        db: &DatabaseConnection,
        game_id: i32,
        total_time: i32,
        session_count: i32,
        last_played: Option<i32>,
        daily_stats: Vec<DailyStats>,
    ) -> Result<(), DbErr> {
        // 序列化每日统计数据
        let daily_stats_json = serde_json::to_string(&daily_stats)
            .map_err(|e| DbErr::Custom(format!("Failed to serialize daily_stats: {}", e)))?;

        // 检查是否已存在统计记录
        let existing = GameStatistics::find_by_id(game_id).one(db).await?;

        if existing.is_some() {
            // 更新现有记录
            let mut stats: game_statistics::ActiveModel = GameStatistics::find_by_id(game_id)
                .one(db)
                .await?
                .ok_or(DbErr::RecordNotFound("Statistics not found".to_string()))?
                .into();

            stats.total_time = Set(Some(total_time));
            stats.session_count = Set(Some(session_count));
            stats.last_played = Set(last_played);
            stats.daily_stats = Set(Some(daily_stats_json));

            stats.update(db).await?;
        } else {
            // 插入新记录
            let stats = game_statistics::ActiveModel {
                game_id: Set(game_id),
                total_time: Set(Some(total_time)),
                session_count: Set(Some(session_count)),
                last_played: Set(last_played),
                daily_stats: Set(Some(daily_stats_json)),
            };

            stats.insert(db).await?;
        }

        Ok(())
    }

    /// 获取游戏统计信息
    pub async fn get_statistics(
        db: &DatabaseConnection,
        game_id: i32,
    ) -> Result<Option<game_statistics::Model>, DbErr> {
        GameStatistics::find_by_id(game_id).one(db).await
    }

    /// 解析每日统计数据
    pub fn parse_daily_stats(daily_stats_json: &str) -> Result<Vec<DailyStats>, String> {
        serde_json::from_str(daily_stats_json)
            .map_err(|e| format!("Failed to parse daily_stats: {}", e))
    }

    /// 获取今天的游戏时间
    pub async fn get_today_playtime(
        db: &DatabaseConnection,
        game_id: i32,
        today: &str,
    ) -> Result<i32, DbErr> {
        let stats = Self::get_statistics(db, game_id).await?;

        if let Some(stats) = stats
            && let Some(daily_stats_json) = stats.daily_stats
        {
            let daily_stats = Self::parse_daily_stats(&daily_stats_json).map_err(DbErr::Custom)?;

            for stat in daily_stats {
                if stat.date == today {
                    return Ok(stat.playtime);
                }
            }
        }

        Ok(0)
    }

    /// 批量获取游戏统计信息
    pub async fn get_statistics_batch(
        db: &DatabaseConnection,
        game_ids: Vec<i32>,
    ) -> Result<Vec<game_statistics::Model>, DbErr> {
        if game_ids.is_empty() {
            return Ok(Vec::new());
        }

        GameStatistics::find()
            .filter(game_statistics::Column::GameId.is_in(game_ids))
            .all(db)
            .await
    }

    /// 删除游戏统计
    pub async fn delete_statistics(
        db: &DatabaseConnection,
        game_id: i32,
    ) -> Result<DeleteResult, DbErr> {
        GameStatistics::delete_by_id(game_id).exec(db).await
    }

    /// 获取所有游戏统计数据
    pub async fn get_all_statistics(
        db: &DatabaseConnection,
    ) -> Result<Vec<game_statistics::Model>, DbErr> {
        GameStatistics::find().all(db).await
    }

    /// 获取所有游戏的最近游玩时间，不包含 daily_stats 大字段。
    pub async fn get_all_last_played(
        db: &DatabaseConnection,
    ) -> Result<Vec<GameLastPlayed>, DbErr> {
        GameStatistics::find()
            .select_only()
            .column(game_statistics::Column::GameId)
            .column(game_statistics::Column::LastPlayed)
            .into_model::<GameLastPlayed>()
            .all(db)
            .await
    }

    /// 初始化游戏统计记录（游戏启动时调用）
    pub async fn init_statistics_if_not_exists(
        db: &DatabaseConnection,
        game_id: i32,
    ) -> Result<(), DbErr> {
        let existing = GameStatistics::find_by_id(game_id).one(db).await?;

        if existing.is_none() {
            let stats = game_statistics::ActiveModel {
                game_id: Set(game_id),
                total_time: Set(Some(0)),
                session_count: Set(Some(0)),
                last_played: Set(None),
                daily_stats: Set(Some("[]".to_string())),
            };

            stats.insert(db).await?;
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{FixedOffset, TimeZone};

    fn timezone() -> FixedOffset {
        FixedOffset::east_opt(8 * 60 * 60).expect("固定时区应有效")
    }

    fn timestamp(day: u32, hour: u32) -> i32 {
        timezone()
            .with_ymd_and_hms(2026, 1, day, hour, 0, 0)
            .single()
            .expect("测试日期应有效")
            .timestamp()
            .try_into()
            .expect("测试时间戳应在 i32 范围内")
    }

    fn session(
        session_id: i32,
        start_time: i32,
        end_time: i32,
        duration: i32,
    ) -> game_sessions::Model {
        game_sessions::Model {
            session_id,
            game_id: 1,
            start_time,
            end_time,
            duration,
            date: "2026-01-01".to_string(),
        }
    }

    #[test]
    fn same_day_session_belongs_to_start_date() {
        let session = session(1, timestamp(1, 10), timestamp(1, 12), 90);

        let contribution =
            session_statistics_contribution(&session, &timezone()).expect("统计应成功");

        assert_eq!(
            contribution.daily_stats,
            vec![DailyStats {
                date: "2026-01-01".to_string(),
                playtime: 90,
            }]
        );
    }

    #[test]
    fn multi_day_distribution_preserves_total_duration() {
        let session = session(1, timestamp(1, 23), timestamp(3, 1), 120);

        let contribution =
            session_statistics_contribution(&session, &timezone()).expect("统计应成功");

        assert_eq!(
            contribution.daily_stats,
            vec![
                DailyStats {
                    date: "2026-01-01".to_string(),
                    playtime: 5,
                },
                DailyStats {
                    date: "2026-01-02".to_string(),
                    playtime: 110,
                },
                DailyStats {
                    date: "2026-01-03".to_string(),
                    playtime: 5,
                },
            ]
        );
        assert_eq!(
            contribution
                .daily_stats
                .iter()
                .map(|item| item.playtime)
                .sum::<i32>(),
            session.duration
        );
    }

    #[test]
    fn incremental_insert_matches_full_calculation() {
        let sessions = vec![
            session(1, timestamp(1, 10), timestamp(1, 12), 90),
            session(2, timestamp(1, 23), timestamp(3, 1), 120),
            session(3, timestamp(3, 9), timestamp(3, 10), 45),
        ];
        let mut incremental = StatisticsProjection {
            total_time: 0,
            session_count: 0,
            last_played: None,
            daily_stats: Vec::new(),
        };

        for session in &sessions {
            apply_session_insert(&mut incremental, session, &timezone()).expect("增量统计应成功");
        }

        let complete = calculate_statistics(&sessions, &timezone()).expect("完整统计应成功");
        assert_eq!(incremental, complete);
        assert_eq!(complete.total_time, 255);
        assert_eq!(complete.session_count, 3);
        assert_eq!(complete.last_played, Some(timestamp(3, 10)));
    }

    #[test]
    fn incremental_delete_matches_remaining_sessions() {
        let sessions = vec![
            session(1, timestamp(1, 10), timestamp(1, 12), 90),
            session(2, timestamp(1, 23), timestamp(3, 1), 120),
            session(3, timestamp(3, 9), timestamp(3, 10), 45),
        ];
        let mut projection = calculate_statistics(&sessions, &timezone()).expect("完整统计应成功");

        apply_session_delete(
            &mut projection,
            &sessions[2],
            Some(sessions[1].end_time),
            &timezone(),
        )
        .expect("删除统计应成功");

        let expected = calculate_statistics(&sessions[..2], &timezone()).expect("完整统计应成功");
        assert_eq!(projection, expected);
    }

    #[test]
    fn deleting_only_session_clears_projection() {
        let only_session = session(1, timestamp(1, 10), timestamp(1, 12), 90);
        let mut projection = calculate_statistics(std::slice::from_ref(&only_session), &timezone())
            .expect("完整统计应成功");

        apply_session_delete(&mut projection, &only_session, None, &timezone())
            .expect("删除统计应成功");

        assert_eq!(
            projection,
            StatisticsProjection {
                total_time: 0,
                session_count: 0,
                last_played: None,
                daily_stats: Vec::new(),
            }
        );
    }

    #[test]
    fn complete_calculation_has_no_session_limit() {
        let sessions = (1..=1001)
            .map(|session_id| session(session_id, timestamp(1, 10), timestamp(1, 11), 1))
            .collect::<Vec<_>>();

        let projection = calculate_statistics(&sessions, &timezone()).expect("完整统计应成功");

        assert_eq!(projection.total_time, 1001);
        assert_eq!(projection.session_count, 1001);
        assert_eq!(
            projection.daily_stats,
            vec![DailyStats {
                date: "2026-01-01".to_string(),
                playtime: 1001,
            }]
        );
    }

    #[test]
    fn invalid_projection_is_rejected_before_deletion() {
        let target = session(1, timestamp(1, 10), timestamp(1, 12), 90);
        let mut projection = StatisticsProjection {
            total_time: 10,
            session_count: 1,
            last_played: Some(target.end_time),
            daily_stats: vec![DailyStats {
                date: "2026-01-01".to_string(),
                playtime: 10,
            }],
        };

        assert!(apply_session_delete(&mut projection, &target, None, &timezone()).is_err());
    }
}
