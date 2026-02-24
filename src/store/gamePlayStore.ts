/**
 * @file gamePlayStore
 * @description 管理游戏运行状态、游玩统计、会话记录、实时状态等，支持 Tauri 桌面环境下的游戏启动与时间跟踪。
 * @module src/store/gamePlayStore
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - useGamePlayStore：Zustand 状态管理，包含游戏运行、统计、会话等方法
 * - initializeGamePlayTracking：初始化游戏时间跟踪
 *
 * 依赖：
 * - zustand
 * - @tauri-apps/api/core
 * - @/utils/gameStats
 * - @/store
 * - @/types
 * - @/utils
 */

import { create } from "zustand";
import { useStore } from "@/store";
import type { GameSession, GameStatistics, GameTimeStats } from "@/types";
import {
	type GameLaunchOptions,
	getErrorMessage,
	getLocalDateString,
	launchGameWithTracking,
	type StopGameResult,
	stopGameWithTracking,
} from "@/utils";
import {
	getAllGameStatistics,
	getFormattedGameStats,
	getGameSessions,
	initGameTimeTracking,
} from "@/utils/gameStats";

/**
 * 游戏启动结果类型
 */
interface LaunchGameResult {
	success: boolean;
	message: string;
	process_id?: number;
}

/**
 * 游戏实时状态接口
 */
interface GameRealTimeState {
	isRunning: boolean;
	currentSessionMinutes: number;
	currentSessionSeconds: number;
	startTime: number;
	processId?: number;
}

/**
 * 游戏游玩状态全局管理
 */
interface GamePlayState {
	runningGameIds: Set<number>; // 正在运行的游戏ID集合
	isTrackingInitialized: boolean; // 是否已初始化时间跟踪
	gameTimeStats: Record<string, GameTimeStats>; // 游戏统计缓存
	recentSessions: Record<string, GameSession[]>; // 最近会话缓存
	// trendData: Record<string, GameTimeChartData[]>; // 预留趋势数据
	gameRealTimeStates: Record<string, GameRealTimeState>; // 实时状态
	statsVersion: number; // 统计数据版本号，用于触发重新获取

	// 方法
	isGameRunning: (gameId?: number) => boolean;
	launchGame: (
		gamePath: string,
		gameId: number,
		launchOptions?: GameLaunchOptions,
		args?: string[],
	) => Promise<LaunchGameResult>;
	stopGame: (gameId: number) => Promise<StopGameResult>;
	loadGameStats: (
		gameId: number,
		forceRefresh?: boolean,
	) => Promise<GameTimeStats | null>;
	loadRecentSessions: (
		gameId: number,
		limit?: number,
	) => Promise<GameSession[] | null>;
	initTimeTracking: () => void;
	clearActiveGame: () => void;
	getGameRealTimeState: (gameId: number) => GameRealTimeState | null;
	getTotalPlayTime: () => Promise<number>;
	getWeekPlayTime: () => Promise<number>;
	getTodayPlayTime: () => Promise<number>;
}

// ====== 统计缓存优化：全局作用域 ======
let lastGamesSnapshot: number[] = [];
let lastTotalPlayTime = 0;
let lastWeekPlayTime = 0;
let lastTodayPlayTime = 0;
// 缓存所有游戏统计数据，一次获取多处使用
let allStatsCache: Map<number, GameStatistics> | null = null;
// Promise 锁，确保并行调用时只请求一次
let statsFetchPromise: Promise<Map<number, GameStatistics>> | null = null;

function getGamesIdSnapshot() {
	const { games } = useStore.getState();
	return games.map((g) => g.id ?? 0).sort();
}

/**
 * 获取所有游戏统计缓存（若缓存失效则重新获取）
 * 使用 Promise 锁确保并行调用时只请求一次
 */
async function getAllStatsCached(): Promise<Map<number, GameStatistics>> {
	const gamesSnapshot = getGamesIdSnapshot();
	// 检查缓存是否有效
	if (
		allStatsCache !== null &&
		JSON.stringify(gamesSnapshot) === JSON.stringify(lastGamesSnapshot)
	) {
		return allStatsCache;
	}
	// 如果已经有请求在进行中，等待它完成
	if (statsFetchPromise !== null) {
		return statsFetchPromise;
	}
	// 创建新的请求并保存 Promise
	statsFetchPromise = getAllGameStatistics()
		.then((result) => {
			allStatsCache = result;
			lastGamesSnapshot = gamesSnapshot;
			statsFetchPromise = null; // 请求完成，清除锁
			return result;
		})
		.catch((error) => {
			statsFetchPromise = null; // 请求失败，清除锁
			throw error;
		});
	return statsFetchPromise;
}

/**
 * 清除统计缓存（在游戏会话结束后调用）
 */
function invalidateStatsCache() {
	allStatsCache = null;
	statsFetchPromise = null;
	lastTotalPlayTime = 0;
	lastWeekPlayTime = 0;
	lastTodayPlayTime = 0;
}
// ====== 统计缓存优化 END ======

/**
 * useGamePlayStore
 * 管理游戏运行、统计、会话、实时状态等，支持 Tauri 桌面环境。
 */
export const useGamePlayStore = create<GamePlayState>((set, get) => ({
	runningGameIds: new Set<number>(),
	isTrackingInitialized: false,
	gameTimeStats: {},
	recentSessions: {},
	trendData: {},
	gameRealTimeStates: {},
	statsVersion: 0,

	/**
	 * 判断指定游戏是否正在运行
	 * @param gameId 游戏ID（可选，未传则判断是否有任意游戏在运行）
	 */
	isGameRunning: (gameId?: number) => {
		const runningGames = get().runningGameIds;
		if (!gameId) return runningGames.size > 0;
		return runningGames.has(gameId);
	},

	/**
	 * 获取指定游戏的实时状态
	 * @param gameId 游戏ID
	 */
	getGameRealTimeState: (gameId: number) => {
		const state = get().gameRealTimeStates[gameId];
		return state || null;
	},

	/**
	 * 启动游戏并跟踪运行状态
	 * @param gamePath 游戏路径
	 * @param gameId 游戏ID
	 * @param args 启动参数
	 * @param launchOptions 启动选项
	 */
	launchGame: async (
		gamePath: string,
		gameId: number,
		launchOptions?: GameLaunchOptions,
		args?: string[],
	): Promise<LaunchGameResult> => {
		try {
			if (get().isGameRunning(gameId)) {
				return { success: false, message: "该游戏已在运行中" };
			}

			// 添加到运行中游戏列表
			set((state) => {
				const newRunningGames = new Set(state.runningGameIds);
				newRunningGames.add(gameId);

				// 初始化游戏实时状态
				const newRealTimeStates = {
					...state.gameRealTimeStates,
					[gameId]: {
						isRunning: true,
						currentSessionMinutes: 0,
						currentSessionSeconds: 0,
						startTime: Math.floor(Date.now() / 1000),
					},
				};

				return {
					runningGameIds: newRunningGames,
					gameRealTimeStates: newRealTimeStates,
				};
			});

			// 确保初始化了事件监听
			if (!get().isTrackingInitialized) {
				get().initTimeTracking();
			}

			const result = await launchGameWithTracking(
				gamePath,
				gameId,
				args,
				launchOptions,
			);

			if (!result.success) {
				// 启动失败，恢复状态
				set((state) => {
					const newRunningGames = new Set(state.runningGameIds);
					newRunningGames.delete(gameId);

					const newRealTimeStates = { ...state.gameRealTimeStates };
					delete newRealTimeStates[gameId];

					return {
						runningGameIds: newRunningGames,
						gameRealTimeStates: newRealTimeStates,
					};
				});
			} else {
				// 启动成功，更新进程 ID
				set((state) => {
					const newRealTimeStates = {
						...state.gameRealTimeStates,
						[gameId]: {
							...state.gameRealTimeStates[gameId],
							processId: result.process_id,
						},
					};
					return { gameRealTimeStates: newRealTimeStates };
				});
			}

			return result;
		} catch (error) {
			// 启动异常，恢复状态
			set((state) => {
				const newRunningGames = new Set(state.runningGameIds);
				newRunningGames.delete(gameId);

				const newRealTimeStates = { ...state.gameRealTimeStates };
				delete newRealTimeStates[gameId];

				return {
					runningGameIds: newRunningGames,
					gameRealTimeStates: newRealTimeStates,
				};
			});

			const errorMessage = getErrorMessage(error);
			return { success: false, message: errorMessage };
		}
	},

	/**
	 * 停止游戏
	 * @param gameId 游戏ID
	 */
	stopGame: async (gameId: number): Promise<StopGameResult> => {
		try {
			if (!get().isGameRunning(gameId)) {
				return {
					success: false,
					message: "该游戏未在运行中",
					terminated_count: 0,
				};
			}

			// 调用工具函数停止游戏
			const result = await stopGameWithTracking(gameId);

			// 停止成功后，清除运行状态（后端会触发 game-session-ended 事件，前端自动处理）
			// 这里做一个保险的清理
			if (result.success) {
				set((state) => {
					const newRunningGames = new Set(state.runningGameIds);
					newRunningGames.delete(gameId);

					const newRealTimeStates = { ...state.gameRealTimeStates };
					delete newRealTimeStates[gameId];

					return {
						runningGameIds: newRunningGames,
						gameRealTimeStates: newRealTimeStates,
					};
				});
			}

			return result;
		} catch (error) {
			const errorMessage = getErrorMessage(error);
			return {
				success: false,
				message: errorMessage,
				terminated_count: 0,
			};
		}
	},

	/**
	 * 加载指定游戏的统计数据
	 * @param gameId 游戏ID
	 * @param forceRefresh 是否强制刷新
	 */
	loadGameStats: async (
		gameId: number,
		forceRefresh = false,
	): Promise<GameTimeStats | null> => {
		try {
			// 如果不强制刷新且已有缓存，则使用缓存
			const cached = get().gameTimeStats[gameId];
			if (!forceRefresh && cached) return cached;

			// 获取新数据
			const stats = await getFormattedGameStats(gameId);

			if (stats) {
				// 更新状态
				set((state) => ({
					gameTimeStats: {
						...state.gameTimeStats,
						[gameId]: stats,
					},
				}));
			}

			return stats;
		} catch (error) {
			console.error("加载游戏统计失败:", error);
			return null;
		}
	},

	// 暂时无用，未来用于实现游戏游玩时间线
	/**
	 * 加载指定游戏的最近会话
	 * @param gameId 游戏ID
	 * @param limit 数量限制
	 */
	loadRecentSessions: async (
		gameId: number,
		limit = 5,
	): Promise<GameSession[] | null> => {
		try {
			// 获取新数据
			const sessions = await getGameSessions(gameId, limit);

			// 更新状态
			set((state) => ({
				recentSessions: {
					...state.recentSessions,
					[gameId]: sessions,
				},
			}));

			return sessions;
		} catch (error) {
			console.error("加载游戏会话失败:", error);
			return null;
		}
	},

	/**
	 * 初始化游戏时间跟踪（仅限 Tauri 桌面环境）
	 * 设置事件监听，自动管理运行状态与实时时长
	 */
	initTimeTracking: () => {
		if (get().isTrackingInitialized) return;

		try {
			// 设置事件监听
			const cleanup = initGameTimeTracking(
				// 时间更新回调
				(gameId: number, _minutes: number, totalSeconds: number) => {
					// 更新实时游戏状态
					set((state) => {
						if (!state.gameRealTimeStates[gameId]) return state;

						const newMinutes = Math.floor(totalSeconds / 60);
						const newSeconds = totalSeconds % 60;

						return {
							gameRealTimeStates: {
								...state.gameRealTimeStates,
								[gameId]: {
									...state.gameRealTimeStates[gameId],
									currentSessionMinutes: newMinutes,
									currentSessionSeconds: newSeconds,
								},
							},
						};
					});
				},
				// 会话结束回调
				async (gameId: number, _minutes: number) => {
					// 只清除运行状态
					set((state) => {
						const newRunningGames = new Set(state.runningGameIds);
						newRunningGames.delete(gameId);
						// 移除对应游戏条目
						const newRealTimeStates = { ...state.gameRealTimeStates };
						delete newRealTimeStates[gameId];
						return {
							runningGameIds: newRunningGames,
							gameRealTimeStates: newRealTimeStates,
						};
					});
					// ====== 清除统计缓存并触发更新 ======
					invalidateStatsCache();
					// 递增版本号，触发依赖 statsVersion 的组件重新获取数据
					set((state) => ({ statsVersion: state.statsVersion + 1 }));
					// ====== END ======
					// ====== 游戏结束后刷新Cards组件 ======
					// 获取主store的状态，检查当前排序选项
					const store = useStore.getState();
					if (_minutes && store.sortOption === "lastplayed") {
						// 如果当前排序是"最近游玩"，刷新游戏数据以更新顺序
						await store.refreshGameData();
					}
					// ====== END ======
				},
			);

			// 设置初始化标志
			set({ isTrackingInitialized: true });

			// 添加全局事件清理函数
			window.addEventListener("beforeunload", cleanup);

			return cleanup;
		} catch (error) {
			console.error("初始化游戏时间跟踪失败:", getErrorMessage(error));
		}
	},

	/**
	 * 清除所有运行中游戏状态
	 */
	clearActiveGame: () => {
		set({
			runningGameIds: new Set<number>(),
			gameRealTimeStates: {},
		});
	},

	/**
	 * 获取所有游戏的总游玩时长（分钟）
	 */
	getTotalPlayTime: async () => {
		if (lastTotalPlayTime !== 0) {
			return lastTotalPlayTime;
		}
		const statsMap = await getAllStatsCached();
		let total = 0;
		for (const stats of statsMap.values()) {
			if (typeof stats.total_time === "number") {
				total += stats.total_time;
			}
		}
		lastTotalPlayTime = total;
		return total;
	},

	/**
	 * 获取本周所有游戏的总游玩时长（分钟）
	 * 本周定义：周一凌晨0点0分 到 周日23点59分59秒
	 */
	getWeekPlayTime: async () => {
		if (lastWeekPlayTime !== 0) {
			return lastWeekPlayTime;
		}
		const statsMap = await getAllStatsCached();
		let total = 0;
		const now = new Date();

		// 计算本周开始日期（周一为一周的开始）
		const weekStart = new Date(now);
		const dayOfWeek = now.getDay(); // 0 = 周日, 1 = 周一, ..., 6 = 周六

		// 计算距离本周周一的天数
		const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 周日时为6天前，其他为 dayOfWeek - 1
		weekStart.setDate(now.getDate() - daysFromMonday);
		weekStart.setHours(0, 0, 0, 0); // 设置为周一凌晨0点0分

		// 生成本周开始日期字符串用于比较
		const weekStartDateStr = getLocalDateString(
			Math.floor(weekStart.getTime() / 1000),
		);

		for (const stats of statsMap.values()) {
			if (Array.isArray(stats.daily_stats)) {
				for (const record of stats.daily_stats) {
					// 使用字符串比较，确保准确性
					if (record.date && record.date >= weekStartDateStr) {
						total += record.playtime || 0;
					}
				}
			}
		}
		lastWeekPlayTime = total;
		return total;
	},

	/**
	 * 获取今天所有游戏的总游玩时长（分钟）
	 */
	getTodayPlayTime: async () => {
		if (lastTodayPlayTime !== 0) {
			return lastTodayPlayTime;
		}
		const statsMap = await getAllStatsCached();
		let total = 0;
		const today = getLocalDateString();
		for (const stats of statsMap.values()) {
			if (Array.isArray(stats.daily_stats)) {
				const todayRecord = stats.daily_stats.find((r) => r.date === today);
				if (todayRecord) {
					total += todayRecord.playtime || 0;
				}
			}
		}
		lastTodayPlayTime = total;
		return total;
	},
}));

/**
 * initializeGamePlayTracking
 * 在应用启动时初始化时间跟踪（Tauri 环境下）
 */
export const initializeGamePlayTracking = (): void => {
	useGamePlayStore.getState().initTimeTracking();
};
