use crate::entity::prelude::*;
use crate::entity::{game_sessions, game_statistics};
use sea_orm::*;
use serde::{Deserialize, Serialize};

/// 每日统计数据结构
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyStats {
    pub date: String,
    pub playtime: i32,
}

/// 游戏统计仓库
pub struct GameStatsRepository;

impl GameStatsRepository {
    // ==================== 游戏会话操作 ====================

    /// 记录游戏会话
    pub async fn record_session(
        db: &DatabaseConnection,
        game_id: i32,
        start_time: i32,
        end_time: i32,
        duration: i32,
        date: String,
    ) -> Result<i32, DbErr> {
        let session = game_sessions::ActiveModel {
            session_id: NotSet,
            game_id: Set(game_id),
            start_time: Set(start_time),
            end_time: Set(end_time),
            duration: Set(duration),
            date: Set(date),
            created_at: Set(Some(end_time)),
        };

        let result = session.insert(db).await?;
        Ok(result.session_id)
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

    /// 获取所有游戏的最近会话
    pub async fn get_recent_sessions_for_all(
        db: &DatabaseConnection,
        game_ids: Vec<i32>,
        limit: u64,
    ) -> Result<Vec<game_sessions::Model>, DbErr> {
        if game_ids.is_empty() {
            return Ok(Vec::new());
        }

        // 使用子查询获取每个游戏的最近会话
        let sessions = GameSessions::find()
            .filter(game_sessions::Column::GameId.is_in(game_ids))
            .order_by_desc(game_sessions::Column::StartTime)
            .limit(limit * 10) // 预留足够数据
            .all(db)
            .await?;

        Ok(sessions)
    }

    /// 删除游戏会话
    pub async fn delete_session(
        db: &DatabaseConnection,
        session_id: i32,
    ) -> Result<DeleteResult, DbErr> {
        GameSessions::delete_by_id(session_id).exec(db).await
    }

    // ==================== 游戏统计操作 ====================

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

        if let Some(stats) = stats {
            if let Some(daily_stats_json) = stats.daily_stats {
                let daily_stats =
                    Self::parse_daily_stats(&daily_stats_json).map_err(DbErr::Custom)?;

                for stat in daily_stats {
                    if stat.date == today {
                        return Ok(stat.playtime);
                    }
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
