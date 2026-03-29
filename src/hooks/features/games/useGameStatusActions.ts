import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { gameKeys } from "@/hooks/queries/useGames";
import {
	type UpdatePlayStatusParams,
	useUpdatePlayStatus,
} from "@/hooks/queries/usePlayStatus";
import { snackbar } from "@/providers/snackBar";
import type { FullGameData, GameData } from "@/types";
import { syncPlayStatusToCloud } from "@/utils/cloudCollectionSync";
import { getUserErrorMessage } from "@/utils/errors";

interface UpdatePlayStatusOptions {
	invalidateScope?: "game" | "all";
	onSuccess?: (
		updatedGame: GameData,
		variables: UpdatePlayStatusParams,
	) => void;
	onError?: (error: Error, variables: UpdatePlayStatusParams) => void;
	onSettled?: (
		updatedGame: GameData | undefined,
		error: Error | null,
		variables: UpdatePlayStatusParams,
	) => void;
}

/**
 * 游戏状态更新业务编排层
 *
 * 说明：
 * - 组合 Query Mutation 与 Query 缓存乐观更新
 * - 对外保持轻量动作调用体验
 * - 统一处理错误提示与回滚逻辑
 */
export function useGameStatusActions() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const updateMutation = useUpdatePlayStatus();

	const updatePlayStatus = (
		params: UpdatePlayStatusParams,
		options?: UpdatePlayStatusOptions,
	) => {
		const invalidateScope = options?.invalidateScope ?? "game";

		// 无论 invalidateScope 是什么，都统一进行乐观更新
		// 确保依赖数据缓存的组件能第一时间获得更新反馈，从而彻底消除派生状态（Derived State）
		const previousGame = queryClient.getQueryData(
			gameKeys.detail(params.gameId),
		) as FullGameData | null;

		queryClient.setQueryData<FullGameData | null>(
			gameKeys.detail(params.gameId),
			(currentGame) => {
				if (!currentGame) {
					return currentGame;
				}

				return {
					...currentGame,
					clear: params.newStatus,
				};
			},
		);

		updateMutation.mutate(
			{ ...params, invalidateScope },
			{
				onSuccess: async (updatedGame, variables) => {
					const failedSources = await syncPlayStatusToCloud(
						updatedGame,
						variables.newStatus,
					);

					if (failedSources.length > 0) {
						const sourceLabel = failedSources
							.map((source) => source.toUpperCase())
							.join(" / ");
						snackbar.warning(
							t(
								"pages.Settings.collectionSync.syncFailed",
								`本地状态已更新，但 ${sourceLabel} 云端同步失败`,
								{ source: sourceLabel },
							),
						);
					}

					options?.onSuccess?.(updatedGame, variables);
				},
				onError: (error, variables) => {
					// 恢复回退乐观更新
					queryClient.setQueryData<FullGameData | null>(
						gameKeys.detail(variables.gameId),
						previousGame,
					);
					snackbar.error(
						`${t("errors.updatePlayStatusFailed", "更新游戏状态失败")}: ${getUserErrorMessage(error, t)}`,
					);
					options?.onError?.(error, variables);
				},
				onSettled: (updatedGame, error, variables) => {
					options?.onSettled?.(updatedGame, error, variables);
				},
			},
		);
	};

	return {
		updatePlayStatus,
		isUpdatingPlayStatus: updateMutation.isPending,
	};
}
