import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { patchGameCaches } from "@/hooks/queries/gameCachePatch";
import { gameKeys } from "@/hooks/queries/useGames";
import {
	type UpdatePlayStatusParams,
	useUpdatePlayStatus,
} from "@/hooks/queries/usePlayStatus";
import { getDisplayGameData } from "@/metadata/data/dataTransform";
import { getDisplayPreferences } from "@/metadata/data/displayPreferences";
import { getRuntimeSourceAdapter } from "@/metadata/sourceRegistry";
import { snackbar } from "@/providers/snackBar";
import { syncPlayStatusToCloud } from "@/services/cloudPlayStatus";
import { useStore } from "@/store/appStore";
import type { FullGameData, GameData } from "@/types";
import { getUserErrorMessage } from "@/utils/errors";
import type { GameIndex } from "@/utils/game/gameIndex";

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
		const previousGames = queryClient.getQueryData<FullGameData[]>(
			gameKeys.all,
		);
		const previousIndex = queryClient.getQueryData<GameIndex>(gameKeys.index());
		const currentGame = previousGames?.find(
			(game) => game.id === params.gameId,
		);

		if (currentGame) {
			patchGameCaches(queryClient, gameKeys, {
				...currentGame,
				clear: params.newStatus,
			});
		}

		updateMutation.mutate(
			{ ...params, invalidateScope },
			{
				onSuccess: async (updatedFullGame, variables) => {
					const updatedGame = getDisplayGameData(
						updatedFullGame,
						getDisplayPreferences(useStore.getState()),
					);
					const failedSources = await syncPlayStatusToCloud(
						updatedGame,
						variables.newStatus,
					);

					if (failedSources.length > 0) {
						const sourceLabel = failedSources
							.map((source) => getRuntimeSourceAdapter(source).label)
							.join(" / ");
						snackbar.warning(
							t(
								"pages.Settings.collectionSync.syncFailed",
								"本地状态已更新，但 {{source}} 云端同步失败",
								{ source: sourceLabel },
							),
						);
					}

					options?.onSuccess?.(updatedGame, variables);
				},
				onError: (error, variables) => {
					// 恢复回退乐观更新
					queryClient.setQueryData(gameKeys.all, previousGames);
					queryClient.setQueryData(gameKeys.index(), previousIndex);
					snackbar.error(
						`${t("errors.updatePlayStatusFailed", "更新游戏状态失败")}: ${getUserErrorMessage(error, t)}`,
					);
					options?.onError?.(error, variables);
				},
				onSettled: (updatedFullGame, error, variables) => {
					options?.onSettled?.(
						updatedFullGame
							? getDisplayGameData(
									updatedFullGame,
									getDisplayPreferences(useStore.getState()),
								)
							: undefined,
						error,
						variables,
					);
				},
			},
		);
	};

	return {
		updatePlayStatus,
		isUpdatingPlayStatus: updateMutation.isPending,
	};
}
