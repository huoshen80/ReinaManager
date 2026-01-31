/**
 * @file 游戏状态查询层
 * @description 使用 React Query 管理游戏状态 (PlayStatus) 的更新操作
 * @module src/hooks/queries/usePlayStatus
 *
 * 包含：
 * - Key Factory：统一的 Query Key 前缀
 * - Mutations：数据操作 hooks
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { snackbar } from "@/components/Snackbar";
import { gameService } from "@/services";
import { useStore } from "@/store";
import type { GameData } from "@/types";
import type { PlayStatus } from "@/types/collection";
import { getDisplayGameData } from "@/utils/dataTransform";

// ============================================================================
// Key Factory - 统一的 Query Key 前缀
// ============================================================================

export const playStatusKeys = {
	all: ["playStatus"] as const,
	game: (gameId: number) => ["playStatus", "game", gameId] as const,
};

// ============================================================================
// Mutations - 数据操作 hooks
// ============================================================================

interface UpdatePlayStatusParams {
	gameId: number;
	newStatus: PlayStatus;
}

interface UpdatePlayStatusContext {
	previousGame?: GameData;
}

/**
 * 更新游戏状态的 mutation hook
 *
 * @example
 * const { mutate: updateStatus } = useUpdatePlayStatus();
 *
 * // 更新游戏状态
 * updateStatus({
 *   gameId: 123,
 *   newStatus: PlayStatus.PLAYED
 * });
 */
export function useUpdatePlayStatus() {
	const queryClient = useQueryClient();
	const { t } = useTranslation();
	const { updateGamePlayStatusInStore, setSelectedGame, selectedGame } =
		useStore();

	return useMutation<
		GameData,
		Error,
		UpdatePlayStatusParams,
		UpdatePlayStatusContext
	>({
		mutationFn: async ({ gameId, newStatus }) => {
			// 获取完整游戏数据
			const fullGame = await gameService.getGameById(gameId);
			if (!fullGame) {
				throw new Error(t("errors.gameNotFound", "游戏数据未找到"));
			}

			// 更新数据库
			await gameService.updateGame(gameId, {
				clear: newStatus,
			});

			// 返回更新后的游戏数据
			const game = getDisplayGameData(fullGame);
			return {
				...game,
				clear: newStatus,
			};
		},
		onMutate: async ({ gameId, newStatus }) => {
			// 乐观更新：立即更新 store 中的数据
			const previousGame =
				selectedGame?.id === gameId ? { ...selectedGame } : undefined;

			// 更新 store 中的游戏列表
			updateGamePlayStatusInStore(gameId, newStatus, true);

			return { previousGame };
		},
		onSuccess: (updatedGame, { gameId }) => {
			// 如果当前选中的游戏就是被更新的游戏，更新 selectedGame
			if (selectedGame?.id === gameId) {
				setSelectedGame(updatedGame);
			}

			// 使相关的查询失效，触发重新获取
			queryClient.invalidateQueries({
				queryKey: playStatusKeys.game(gameId),
			});
		},
		onError: (error, { gameId }, context) => {
			// 发生错误时回滚到之前的状态
			if (context?.previousGame) {
				updateGamePlayStatusInStore(
					gameId,
					context.previousGame.clear ?? 1,
					true,
				);
				if (selectedGame?.id === gameId) {
					setSelectedGame(context.previousGame);
				}
			}

			snackbar.error(
				`${t("errors.updatePlayStatusFailed", "更新游戏状态失败")}: ${error.message}`,
			);
		},
	});
}

/**
 * 更新游戏状态（用于右键菜单，需要刷新游戏列表）
 *
 * 与 useUpdatePlayStatus 的区别：
 * - 成功后会刷新游戏列表（skipRefresh = false）
 * - 适用于库列表页面的右键菜单
 */
export function useUpdatePlayStatusWithRefresh() {
	const queryClient = useQueryClient();
	const { t } = useTranslation();
	const { updateGamePlayStatusInStore } = useStore();

	return useMutation<GameData, Error, UpdatePlayStatusParams>({
		mutationFn: async ({ gameId, newStatus }) => {
			// 获取完整游戏数据
			const fullGame = await gameService.getGameById(gameId);
			if (!fullGame) {
				throw new Error(t("errors.gameNotFound", "游戏数据未找到"));
			}

			// 更新数据库
			await gameService.updateGame(gameId, {
				clear: newStatus,
			});

			// 返回更新后的游戏数据
			const game = getDisplayGameData(fullGame);
			return {
				...game,
				clear: newStatus,
			};
		},
		onSuccess: (_, { gameId, newStatus }) => {
			// 更新 store 并刷新游戏列表
			updateGamePlayStatusInStore(gameId, newStatus, false);

			// 使相关的查询失效
			queryClient.invalidateQueries({
				queryKey: playStatusKeys.game(gameId),
			});
		},
		onError: (error) => {
			snackbar.error(
				`${t("errors.updatePlayStatusFailed", "更新游戏状态失败")}: ${error.message}`,
			);
		},
	});
}
