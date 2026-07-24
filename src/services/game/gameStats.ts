import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import i18n from "i18next";
import { createBackupAndSync } from "@/hooks/queries/useSavedata";
import { queryClient } from "@/providers/queryClient";
import { snackbar } from "@/providers/snackBar";
import { gameService, statsService } from "@/services/invoke";
import type { GameSession, GameStatistics, GameTimeStats } from "@/types";
import { formatPlayTime, getLocalDateString } from "@/utils/dateTime";

// 类型定义
export type TimeUpdateCallback = (
	gameId: number,
	minutes: number,
	seconds: number,
) => void;
export type SessionEndCallback = (gameId: number, minutes: number) => void;

// 获取游戏统计信息 - 使用后端服务
export async function getGameStatistics(
	gameId: number,
): Promise<GameStatistics | null> {
	const stats = await statsService.getGameStatistics(gameId);

	if (!stats) {
		return null;
	}

	// 解析JSON存储的每日统计数据
	if (stats.daily_stats && typeof stats.daily_stats === "string") {
		try {
			const parsedStats = JSON.parse(stats.daily_stats);
			stats.daily_stats = parsedStats;
		} catch (e) {
			console.error("解析游戏统计数据失败:", e);
			stats.daily_stats = [];
		}
	}

	return stats;
}

// 批量获取游戏统计信息 - 使用后端批量服务
export async function getAllGameStatistics(): Promise<
	Map<number, GameStatistics>
> {
	try {
		const statsList = await statsService.getAllGameStatistics();
		const statsMap = new Map<number, GameStatistics>();

		for (const stats of statsList) {
			// 解析JSON存储的每日统计数据
			if (stats.daily_stats && typeof stats.daily_stats === "string") {
				try {
					const parsedStats = JSON.parse(stats.daily_stats);
					stats.daily_stats = parsedStats;
				} catch (e) {
					console.error("解析游戏统计数据失败:", e);
					stats.daily_stats = [];
				}
			}
			statsMap.set(stats.game_id, stats);
		}

		return statsMap;
	} catch (error) {
		console.error("获取所有游戏统计失败:", error);
		return new Map();
	}
}

export async function getAllGameLastPlayed(): Promise<Map<number, number>> {
	try {
		const lastPlayedList = await statsService.getAllGameLastPlayed();
		const lastPlayedMap = new Map<number, number>();

		for (const item of lastPlayedList) {
			if (item.last_played) {
				lastPlayedMap.set(item.game_id, item.last_played);
			}
		}

		return lastPlayedMap;
	} catch (error) {
		console.error("获取所有游戏最近游玩时间失败:", error);
		return new Map();
	}
}

// 获取全局最近游玩会话记录
export async function getRecentSessionsForGames(
	gameIds: number[],
	limit = 10,
): Promise<GameSession[]> {
	if (gameIds.length === 0) {
		return [];
	}

	return statsService.getRecentSessionsForAll(gameIds, limit);
}

export async function getFormattedGameStats(
	gameId: number,
): Promise<GameTimeStats> {
	// 只调用一次 getGameStatistics
	const stats = await getGameStatistics(gameId);
	const today = getLocalDateString();

	// 确保 daily_stats 始终是有效数组
	let dailyStats = stats?.daily_stats || [];

	// 如果不是数组，进行转换
	if (!Array.isArray(dailyStats)) {
		if (typeof dailyStats === "object") {
			dailyStats = Object.entries(dailyStats).map(([date, playtime]) => ({
				date,
				playtime: typeof playtime === "number" ? playtime : 0,
			}));
		} else {
			dailyStats = [];
		}
	}

	// 从统计数据中查找今天的记录，避免重复调用
	const todayRecord = dailyStats.find((record) => record.date === today);
	const todayMinutes = todayRecord?.playtime || 0;

	// 确保今天有记录
	if (!todayRecord) {
		dailyStats.unshift({ date: today, playtime: 0 });
	}

	return {
		totalPlayTime: formatPlayTime(stats?.total_time || 0),
		totalMinutes: stats?.total_time || 0,
		todayPlayTime: formatPlayTime(todayMinutes),
		todayMinutes,
		sessionCount: stats?.session_count || 0,
		lastPlayed: stats?.last_played ? new Date(stats.last_played * 1000) : null,
		daily_stats: dailyStats,
	};
}

// 初始化游戏时间跟踪
export async function initGameTimeTracking(
	onTimeUpdate?: TimeUpdateCallback,
	onSessionEnd?: SessionEndCallback,
): Promise<() => void> {
	// 游戏会话开始
	const unlistenStart = listen<{
		gameId: number;
		processId: number;
		startTime: number;
	}>("game-session-started", (event) => {
		const { gameId } = event.payload;
		console.log(`游戏 ${gameId} 开始运行`);
	});

	// 游戏时间更新事件监听
	const unlistenUpdate = listen<{
		gameId: number;
		totalSeconds: number;
		processId: number;
	}>("game-time-update", async (event) => {
		const { gameId, totalSeconds } = event.payload;
		const totalMinutes = Math.floor(totalSeconds / 60);

		try {
			// 调用回调函数通知前端，传递分钟数和秒数
			if (onTimeUpdate) {
				onTimeUpdate(gameId, totalMinutes, totalSeconds);
			}
		} catch (error) {
			console.error("处理游戏时间更新失败:", error);
		}
	});

	// 修改游戏会话结束事件监听器
	const unlistenEnd = listen<{
		gameId: number;
		totalMinutes: number;
		totalSeconds: number;
		startTime: number;
		endTime: number;
		processId: number;
		recorded: boolean;
		sessionId: number | null;
		durationMinutes: number;
		recordError: string | null;
	}>("game-session-ended", async (event) => {
		const { gameId, recorded, durationMinutes, recordError } = event.payload;

		try {
			console.log("收到游戏会话结束事件:", event.payload);

			if (onSessionEnd) {
				onSessionEnd(gameId, recorded ? durationMinutes : 0);
			}

			if (recordError) {
				console.error("后端记录游戏会话失败:", recordError);
				snackbar.error(
					i18n.t(
						"pages.Detail.sessionRecordFailed",
						"游玩记录保存失败，请稍后重试",
					),
				);
			}

			if (!recorded) {
				return;
			}

			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["stats"] }),
				queryClient.invalidateQueries({ queryKey: ["games", "idList"] }),
			]);

			void (async () => {
				try {
					const fullgame = await gameService.getGameById(gameId);
					if (!fullgame) {
						console.error("游戏数据未找到，无法进行自动备份");
						return;
					}
					if (fullgame.autosave === 1 && fullgame.savepath) {
						console.log(
							`开始自动备份游戏 ${gameId}，存档路径: ${fullgame.savepath}`,
						);
						await createBackupAndSync(queryClient, {
							gameId,
							savePath: fullgame.savepath,
						});
						console.log(`游戏 ${gameId} 自动备份完成`);
					}
				} catch (backupError) {
					console.error("自动备份失败:", backupError);
				}
			})();
		} catch (error) {
			console.error("处理游戏结束事件失败:", error);

			if (onSessionEnd) {
				onSessionEnd(gameId, 0);
			}
		}
	});

	const registrationResults = await Promise.allSettled([
		unlistenStart,
		unlistenUpdate,
		unlistenEnd,
	]);
	const unlisteners: UnlistenFn[] = [];
	let registrationFailed = false;
	let registrationError: unknown;

	for (const result of registrationResults) {
		if (result.status === "fulfilled") {
			unlisteners.push(result.value);
		} else {
			registrationFailed = true;
			registrationError ??= result.reason;
		}
	}

	if (registrationFailed) {
		for (const unlisten of unlisteners) {
			unlisten();
		}
		throw registrationError;
	}

	// 返回可重复安全调用的清理函数
	return () => {
		for (const unlisten of unlisteners.splice(0)) {
			unlisten();
		}
	};
}
