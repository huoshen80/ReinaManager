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
import { gameKeys } from "@/hooks/queries/useGames";
import { queryClient } from "@/lib/queryClient";
import { useStore } from "@/store";
import {
	type GameLaunchOptions,
	getErrorMessage,
	launchGameWithTracking,
	type StopGameResult,
	stopGameWithTracking,
} from "@/utils";
import { initGameTimeTracking } from "@/utils/gameStats";

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
	gameRealTimeStates: Record<string, GameRealTimeState>; // 实时状态

	// 方法
	isGameRunning: (gameId?: number) => boolean;
	launchGame: (
		gamePath: string,
		gameId: number,
		launchOptions?: GameLaunchOptions,
		args?: string[],
	) => Promise<LaunchGameResult>;
	stopGame: (gameId: number) => Promise<StopGameResult>;
	initTimeTracking: () => void;
	clearActiveGame: () => void;
	getGameRealTimeState: (gameId: number) => GameRealTimeState | null;
}

/**
 * useGamePlayStore
 * 管理游戏运行、统计、会话、实时状态等，支持 Tauri 桌面环境。
 */
export const useGamePlayStore = create<GamePlayState>((set, get) => ({
	runningGameIds: new Set<number>(),
	isTrackingInitialized: false,
	gameRealTimeStates: {},

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
					await queryClient.invalidateQueries({ queryKey: ["stats"] });
					// ====== 游戏结束后刷新Cards组件 ======
					// 获取主store的状态，检查当前排序选项
					const store = useStore.getState();
					if (_minutes && store.sortOption === "lastplayed") {
						// 如果当前排序是"最近游玩"，刷新游戏列表查询以更新顺序
						await queryClient.invalidateQueries({ queryKey: gameKeys.lists() });
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
}));

/**
 * initializeGamePlayTracking
 * 在应用启动时初始化时间跟踪（Tauri 环境下）
 */
export const initializeGamePlayTracking = (): void => {
	useGamePlayStore.getState().initTimeTracking();
};
