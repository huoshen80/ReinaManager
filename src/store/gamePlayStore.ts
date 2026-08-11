/**
 * @file gamePlayStore
 * @description 管理游戏运行状态、游玩统计、会话记录、实时状态等，支持游戏启动与时间跟踪。
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
 * - @/services/game/gameStats
 * - @/store
 * - @/types
 * - @/utils
 */

import { create } from "zustand";
import { gameKeys } from "@/hooks/queries/useGames";
import { settingsKeys } from "@/hooks/queries/useSettings";
import { queryClient } from "@/providers/queryClient";
import {
	launchGameWithTracking,
	stopGameWithTracking,
} from "@/services/game/gameRuntime";
import { initGameTimeTracking } from "@/services/game/gameStats";
import type { LaunchGameResult } from "@/services/invoke/statsService";
import { useStore } from "@/store/appStore";
import type { StopGameResult, TimeTrackingMode } from "@/types";
import { toError } from "@/utils/errors";

/**
 * 游戏实时状态接口
 */
interface GameRealTimeState {
	isRunning: boolean;
	currentSessionMinutes: number;
	currentSessionSeconds: number;
	startTime: number;
	timeTrackingMode: TimeTrackingMode;
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
	launchGame: (gameId: number, args?: string[]) => Promise<LaunchGameResult>;
	stopGame: (gameId: number) => Promise<StopGameResult>;
	initTimeTracking: () => Promise<void>;
	clearActiveGame: () => void;
	getGameRealTimeState: (gameId: number) => GameRealTimeState | null;
}

const removeGameRuntimeState = (state: GamePlayState, gameId: number) => {
	const runningGameIds = new Set(state.runningGameIds);
	runningGameIds.delete(gameId);

	const gameRealTimeStates = { ...state.gameRealTimeStates };
	delete gameRealTimeStates[gameId];

	return { runningGameIds, gameRealTimeStates };
};

let trackingInitialization: Promise<() => void> | null = null;

/**
 * useGamePlayStore
 * 管理游戏运行、统计、会话、实时状态等
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
	 * @param gameId 游戏ID
	 * @param args 启动参数
	 */
	launchGame: async (
		gameId: number,
		args?: string[],
	): Promise<LaunchGameResult> => {
		try {
			if (get().isGameRunning(gameId)) {
				return {
					status: "failed",
					message: "该游戏已在运行中",
				};
			}

			const timeTrackingMode = useStore.getState().timeTrackingMode;

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
						timeTrackingMode,
					},
				};

				return {
					runningGameIds: newRunningGames,
					gameRealTimeStates: newRealTimeStates,
				};
			});

			// 确保初始化了事件监听
			if (!get().isTrackingInitialized) {
				await get().initTimeTracking();
			}

			const result = await launchGameWithTracking(
				gameId,
				timeTrackingMode,
				args,
			);

			switch (result.status) {
				case "tracking":
					set((state) => {
						const currentState = state.gameRealTimeStates[gameId];
						if (!currentState) return state;
						return {
							gameRealTimeStates: {
								...state.gameRealTimeStates,
								[gameId]: {
									...currentState,
									processId: result.process_id,
								},
							},
						};
					});
					break;
				case "delegated":
				case "failed":
					set((state) => removeGameRuntimeState(state, gameId));
					break;
			}

			return result;
		} catch (error) {
			await queryClient.invalidateQueries({
				queryKey: settingsKeys.allSettings(),
			});

			// 启动异常，恢复状态
			set((state) => removeGameRuntimeState(state, gameId));

			const errorMessage = toError(error, "Failed to launch game").message;
			return {
				status: "failed",
				message: errorMessage,
			};
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
			if (result.success) {
				set((state) => removeGameRuntimeState(state, gameId));
			}

			return result;
		} catch (error) {
			const errorMessage = toError(error, "Failed to stop game").message;
			return {
				success: false,
				message: errorMessage,
				terminated_count: 0,
			};
		}
	},

	/**
	 * 初始化游戏时间跟踪
	 * 设置事件监听，自动管理运行状态与实时时长
	 */
	initTimeTracking: async () => {
		if (get().isTrackingInitialized) return;
		if (trackingInitialization) {
			await trackingInitialization;
			return;
		}

		try {
			// 设置事件监听
			const initialization = initGameTimeTracking(
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
				async (gameId, { recorded }) => {
					// 先清除运行状态；只有最近游玩排序依赖本次结算结果。
					set((state) => removeGameRuntimeState(state, gameId));

					if (recorded && useStore.getState().sortOption === "lastplayed") {
						await queryClient.invalidateQueries({
							queryKey: gameKeys.idLists(),
						});
					}
				},
			);

			trackingInitialization = initialization;

			try {
				const cleanup = await initialization;

				// 全部监听注册成功后才设置初始化标志
				set({ isTrackingInitialized: true });

				// 添加全局事件清理函数
				window.addEventListener("beforeunload", cleanup, { once: true });
			} finally {
				if (trackingInitialization === initialization) {
					trackingInitialization = null;
				}
			}
		} catch (error) {
			set({ isTrackingInitialized: false });
			throw toError(error, "Failed to initialize game time tracking");
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
 * 在应用启动时初始化时间跟踪
 */
export const initializeGamePlayTracking = async (): Promise<void> => {
	await useGamePlayStore.getState().initTimeTracking();
};
