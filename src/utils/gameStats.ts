import { listen } from "@tauri-apps/api/event";
import { gameService, statsService } from "@/services";
import type { DailyStats } from "@/services/types";
import { useStore } from "@/store";
import {
	createGameSavedataBackup,
	formatPlayTime,
	getLocalDateString,
} from "@/utils";
import type { GameSession, GameStatistics, GameTimeStats } from "../types";

// 类型定义
export type TimeUpdateCallback = (
	gameId: number,
	minutes: number,
	seconds: number,
) => void;
export type SessionEndCallback = (gameId: number, minutes: number) => void;

// 记录游戏会话 - 使用后端统计服务
export async function recordGameSession(
	gameId: number,
	minutes: number,
	startTime: number,
	endTime: number,
): Promise<number> {
	// 当前日期，格式YYYY-MM-DD
	const date = getLocalDateString(endTime);

	try {
		// 通过后端服务记录游戏会话
		const sessionId = await statsService.recordGameSession(
			gameId,
			startTime,
			endTime,
			minutes,
			date,
		);

		// 更新统计信息
		await updateGameStatistics(gameId);

		return sessionId;
	} catch (error) {
		console.error("记录游戏会话失败:", error);
		throw error;
	}
}

// 更新游戏统计信息函数 - 使用后端服务
export async function updateGameStatistics(gameId: number): Promise<void> {
	try {
		// 1. 获取现有统计数据
		const existingStats = await statsService.getGameStatistics(gameId);

		// 2. 获取最新的会话数据
		const sessions = await statsService.getGameSessions(gameId, 1000, 0);

		// 3. 计算基础统计信息（总时间、会话数等）
		const stats = {
			total_time: sessions.reduce(
				(sum: number, session) => sum + (session.duration || 0),
				0,
			),
			session_count: sessions.length,
			last_played:
				sessions.length > 0
					? Math.max(...sessions.map((s) => s.end_time || 0))
					: null,
		};

		// 4. 处理每日统计数据 - 从会话数据中计算
		const sessionsStatsMap = new Map<string, number>();

		// 处理每个会话，正确分配跨天时间
		for (const session of sessions) {
			// 跳过没有必要数据的会话
			if (!session.start_time || !session.end_time || !session.duration) {
				continue;
			}

			// 使用本地日期字符串
			const startDateStr = getLocalDateString(session.start_time);
			const endDateStr = getLocalDateString(session.end_time);

			// 检测是否跨天
			const startDate = new Date(session.start_time * 1000);
			const endDate = new Date(session.end_time * 1000);
			const isSameDay =
				startDate.getFullYear() === endDate.getFullYear() &&
				startDate.getMonth() === endDate.getMonth() &&
				startDate.getDate() === endDate.getDate();

			if (isSameDay) {
				// 同一天，直接添加时间
				const currentValue = sessionsStatsMap.get(startDateStr) || 0;
				sessionsStatsMap.set(startDateStr, currentValue + session.duration);
			} else {
				// 跨天情况，按比例分配时间
				const totalSeconds = session.end_time - session.start_time;

				// 计算午夜时间点
				const midnight = new Date(
					endDate.getFullYear(),
					endDate.getMonth(),
					endDate.getDate(),
					0,
					0,
					0,
				);
				const midnightTimestamp = Math.floor(midnight.getTime() / 1000);

				// 计算第一天和第二天的秒数
				const firstDaySeconds = midnightTimestamp - session.start_time;

				// 按比例分配分钟数
				const firstDayMinutes = Math.round(
					(firstDaySeconds / totalSeconds) * session.duration,
				);
				const secondDayMinutes = session.duration - firstDayMinutes;

				// 添加到对应日期
				const firstDayValue = sessionsStatsMap.get(startDateStr) || 0;
				sessionsStatsMap.set(startDateStr, firstDayValue + firstDayMinutes);

				const secondDayValue = sessionsStatsMap.get(endDateStr) || 0;
				sessionsStatsMap.set(endDateStr, secondDayValue + secondDayMinutes);
			}
		}

		// 5. 合并现有统计和会话统计
		const today = getLocalDateString();
		let dailyStats: DailyStats[] = [];

		// 解析现有的每日统计数据
		if (existingStats?.daily_stats) {
			try {
				// 如果 daily_stats 是字符串，解析它；如果已经是数组，直接使用
				const parsed =
					typeof existingStats.daily_stats === "string"
						? JSON.parse(existingStats.daily_stats)
						: existingStats.daily_stats;

				if (Array.isArray(parsed)) {
					dailyStats = parsed;
				} else if (typeof parsed === "object") {
					dailyStats = Object.entries(parsed).map(([date, playtime]) => ({
						date,
						playtime: typeof playtime === "number" ? playtime : 0,
					}));
				}
			} catch (e) {
				console.error("解析游戏统计数据失败:", e);
				dailyStats = [];
			}
		}

		// 确保即使没有会话数据时，也能创建今天的记录
		if (
			sessionsStatsMap.size === 0 &&
			!dailyStats.some((item) => item.date === today)
		) {
			dailyStats.push({ date: today, playtime: 0 });
		}

		// 根据会话数据更新统计
		for (const [date, playtime] of sessionsStatsMap.entries()) {
			const existingIndex = dailyStats.findIndex((item) => item.date === date);

			if (existingIndex >= 0) {
				// 如果是今天的数据，保留现有数据中可能包含的实时更新记录
				if (date === today) {
					const realTimePlaytime = dailyStats[existingIndex].playtime;
					const sessionPlaytime = playtime;

					// 选择较大的值，确保不会减少已经记录的时间
					dailyStats[existingIndex].playtime = Math.max(
						realTimePlaytime,
						sessionPlaytime,
					);
				} else {
					// 非今天的数据使用从会话计算的时间
					dailyStats[existingIndex].playtime = playtime;
				}
			} else {
				// 不存在这一天的记录，添加新记录
				dailyStats.push({ date, playtime });
			}
		}

		// 6. 按日期降序排序
		dailyStats.sort((a, b) => b.date.localeCompare(a.date));

		// 7. 通过后端服务更新统计表
		await statsService.updateGameStatistics(
			gameId,
			stats.total_time || 0,
			stats.session_count || 0,
			stats.last_played || null,
			dailyStats,
		);
	} catch (error) {
		console.error("更新游戏统计失败:", error);
		throw error;
	}
}

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

// 获取游戏会话历史 - 使用后端服务
export async function getGameSessions(
	gameId: number,
	limit = 10,
	offset = 0,
): Promise<GameSession[]> {
	return statsService.getGameSessions(gameId, limit, offset);
}

// 优化：一次性获取所有游戏的最近会话记录 - 使用后端服务
export async function getRecentSessionsForAllGames(
	gameIds: number[],
	limit = 10,
): Promise<Map<number, GameSession[]>> {
	if (gameIds.length === 0) {
		return new Map();
	}

	const sessions = await statsService.getRecentSessionsForAll(gameIds, limit);

	// 将结果按game_id分组
	const sessionMap = new Map<number, GameSession[]>();

	for (const session of sessions) {
		const gameId = session.game_id;
		if (!sessionMap.has(gameId)) {
			sessionMap.set(gameId, []);
		}
		sessionMap.get(gameId)?.push(session);
	}

	return sessionMap;
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
export function initGameTimeTracking(
	onTimeUpdate?: TimeUpdateCallback,
	onSessionEnd?: SessionEndCallback,
): () => void {
	// 游戏会话开始
	const unlistenStart = listen<{
		gameId: number;
		processId: number;
		startTime: number;
	}>("game-session-started", async (event) => {
		const { gameId } = event.payload;

		try {
			// 只记录游戏启动，通过后端服务初始化统计记录
			console.log(`游戏 ${gameId} 开始运行`);

			await statsService.initGameStatistics(gameId);
		} catch (error) {
			console.error("游戏启动记录失败:", error);
		}
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
	}>("game-session-ended", async (event) => {
		const { gameId, totalMinutes, totalSeconds, startTime, endTime } =
			event.payload;

		try {
			console.log("收到游戏会话结束事件:", event.payload);

			// 获取当前计时模式
			const timeTrackingMode = useStore.getState().timeTrackingMode;

			// 根据计时模式计算实际使用的时间
			let effectiveSeconds: number;
			let effectiveMinutes: number;

			if (timeTrackingMode === "elapsed") {
				// 游戏启动时间模式：使用 endTime - startTime
				effectiveSeconds = endTime - startTime;
				effectiveMinutes = Math.round(effectiveSeconds / 60);
				console.log(
					`使用游戏启动时间模式: ${effectiveSeconds}秒 (${effectiveMinutes}分钟)`,
				);
			} else {
				// 真实游戏时间模式（默认）：使用后端统计的前台时间
				effectiveSeconds = totalSeconds;
				effectiveMinutes = totalMinutes;
				console.log(
					`使用真实游戏时间模式: ${effectiveSeconds}秒 (${effectiveMinutes}分钟)`,
				);
			}

			// 设置最低阈值为60秒，避免意外点击记录游戏时间
			const minThresholdSeconds = 60;

			if (effectiveSeconds < minThresholdSeconds) {
				console.log(`游戏会话时间过短(${effectiveSeconds}秒)，不记录统计数据`);

				// 虽然不记录统计数据，但仍然需要通知前端游戏已结束
				if (onSessionEnd) {
					onSessionEnd(gameId, 0);
				}

				return; // 不记录时间太短的会话
			}

			// 使用计算后的时间
			const minutesToRecord = effectiveMinutes;

			// 记录游戏会话
			await recordGameSession(gameId, minutesToRecord, startTime, endTime);

			// 检查是否需要自动备份
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
					await createGameSavedataBackup(gameId, fullgame.savepath, true);
					console.log(`游戏 ${gameId} 自动备份完成`);
				}
			} catch (backupError) {
				console.error("自动备份失败:", backupError);
				// 备份失败不应影响会话记录
			}

			// 调用回调函数
			if (onSessionEnd) {
				onSessionEnd(gameId, minutesToRecord);
			}
		} catch (error) {
			console.error("处理游戏结束事件失败:", error);

			if (onSessionEnd) {
				onSessionEnd(gameId, 0);
			}
		}
	});

	// 返回清理函数
	return () => {
		unlistenStart.then((fn) => fn());
		unlistenUpdate.then((fn) => fn());
		unlistenEnd.then((fn) => fn());
	};
}
