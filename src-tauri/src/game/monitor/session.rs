use crate::database::repository::game_stats_repository::GameStatsRepository;
use log::{error, info, warn};
use sea_orm::DatabaseConnection;
use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, Runtime};

const MIN_SESSION_SECONDS: u64 = 60;

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TimeTrackingMode {
    Playtime,
    Elapsed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct SessionDuration {
    effective_seconds: u64,
    duration_minutes: u64,
}

fn round_seconds_to_minutes(seconds: u64) -> u64 {
    seconds / 60 + u64::from(seconds % 60 >= 30)
}

pub(crate) struct MonitoredSession {
    pub time_tracking_mode: TimeTrackingMode,
    pub game_id: u32,
    pub process_id: u32,
    pub start_time: u64,
    pub end_time: u64,
    pub accumulated_seconds: u64,
}

fn calculate_session_duration(
    mode: TimeTrackingMode,
    start_time: u64,
    end_time: u64,
    accumulated_seconds: u64,
) -> Result<Option<SessionDuration>, String> {
    let effective_seconds = match mode {
        TimeTrackingMode::Playtime => accumulated_seconds,
        TimeTrackingMode::Elapsed => end_time
            .checked_sub(start_time)
            .ok_or_else(|| "会话结束时间早于开始时间".to_string())?,
    };

    if effective_seconds < MIN_SESSION_SECONDS {
        return Ok(None);
    }

    Ok(Some(SessionDuration {
        effective_seconds,
        duration_minutes: round_seconds_to_minutes(effective_seconds),
    }))
}

pub(crate) async fn finalize_monitored_session<R: Runtime>(
    app_handle: &AppHandle<R>,
    db: &DatabaseConnection,
    session: MonitoredSession,
) {
    let foreground_minutes = round_seconds_to_minutes(session.accumulated_seconds);
    let session_duration = calculate_session_duration(
        session.time_tracking_mode,
        session.start_time,
        session.end_time,
        session.accumulated_seconds,
    );
    let mut recorded = false;
    let mut session_id = None;
    let mut duration_minutes = 0;
    let mut record_error = None;

    match session_duration {
        Ok(Some(session_duration)) => {
            duration_minutes = session_duration.duration_minutes;
            let session_data = (
                i32::try_from(session.game_id),
                i32::try_from(session.start_time),
                i32::try_from(session.end_time),
                i32::try_from(session_duration.duration_minutes),
            );

            match session_data {
                (Ok(game_id), Ok(start_time), Ok(end_time), Ok(stored_duration_minutes)) => {
                    match GameStatsRepository::record_session_with_statistics(
                        db,
                        game_id,
                        start_time,
                        end_time,
                        stored_duration_minutes,
                    )
                    .await
                    {
                        Ok(session) => {
                            recorded = true;
                            session_id = Some(session.session_id);
                            info!(
                                "游戏会话已记录: game_id={}, session_id={}, duration={}分钟",
                                game_id, session.session_id, stored_duration_minutes
                            );
                        }
                        Err(error) => {
                            let message = format!("记录游戏会话失败: {error}");
                            error!("{message}");
                            record_error = Some(message);
                        }
                    }
                }
                _ => {
                    let message = "游戏会话数据超出数据库整数范围".to_string();
                    error!("{message}");
                    record_error = Some(message);
                }
            }
        }
        Ok(None) => {
            info!(
                "游戏会话低于记录阈值: game_id={}, mode={:?}",
                session.game_id, session.time_tracking_mode
            );
        }
        Err(error) => {
            error!("计算游戏会话时长失败: {error}");
            record_error = Some(error);
        }
    }

    if let Err(error) = app_handle.emit(
        "game-session-ended",
        json!({
            "gameId": session.game_id,
            "startTime": session.start_time,
            "endTime": session.end_time,
            "totalMinutes": foreground_minutes,
            "totalSeconds": session.accumulated_seconds,
            "processId": session.process_id,
            "recorded": recorded,
            "sessionId": session_id,
            "durationMinutes": duration_minutes,
            "recordError": record_error,
        }),
    ) {
        warn!("无法发送 game-session-ended 事件: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn playtime_mode_uses_accumulated_foreground_time() {
        let duration = calculate_session_duration(TimeTrackingMode::Playtime, 100, 1000, 95)
            .expect("计算应成功")
            .expect("应达到记录阈值");

        assert_eq!(
            duration,
            SessionDuration {
                effective_seconds: 95,
                duration_minutes: 2,
            }
        );
    }

    #[test]
    fn elapsed_mode_uses_wall_clock_time() {
        let duration = calculate_session_duration(TimeTrackingMode::Elapsed, 100, 195, 10)
            .expect("计算应成功")
            .expect("应达到记录阈值");

        assert_eq!(
            duration,
            SessionDuration {
                effective_seconds: 95,
                duration_minutes: 2,
            }
        );
    }

    #[test]
    fn duration_below_threshold_is_not_recorded() {
        assert_eq!(
            calculate_session_duration(TimeTrackingMode::Playtime, 100, 159, 59)
                .expect("计算应成功"),
            None
        );
    }
}
