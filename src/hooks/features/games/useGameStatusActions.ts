import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { updateUserCollection } from "@/api/bgm";
import { snackbar } from "@/components/Snackbar";
import { gameKeys } from "@/hooks/queries/useGames";
import {
	type UpdatePlayStatusParams,
	useUpdatePlayStatus,
} from "@/hooks/queries/usePlayStatus";
import { settingsService } from "@/services";
import type { FullGameData, GameData } from "@/types";
import { getErrorMessage } from "@/utils";

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
		const useGlobalInvalidate = invalidateScope === "all";

		const previousGame = !useGlobalInvalidate
			? (queryClient.getQueryData(
					gameKeys.detail(params.gameId),
				) as FullGameData | null)
			: null;

		if (!useGlobalInvalidate) {
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
		}

		updateMutation.mutate(
			{ ...params, invalidateScope },
			{
				onSuccess: (updatedGame, variables) => {
					options?.onSuccess?.(updatedGame, variables);

					const storeState = useStore.getState();
					if (storeState.autoSyncBgm && updatedGame.bgm_id) {
						Promise.all([
							settingsService.getBgmToken(),
							settingsService.getBgmProfile(),
						])
							.then(([token, [username, _]]) => {
								if (token && username) {
									const localToBgmTypeMap: Record<number, number> = {
										1: 1,
										3: 2,
										2: 3,
										4: 4,
										5: 5,
									};
									const mapped = localToBgmTypeMap[variables.newStatus];
									if (mapped) {
										updateUserCollection(
											username,
											updatedGame.bgm_id as string,
											mapped,
											token,
										)
											.then(() => {
												snackbar.success(
													t(
														"components.SyncBangumiModal.syncSuccess",
														"已同步到 Bangumi",
													),
												);
											})
											.catch((e) => {
												console.error("Auto sync to BGM failed", e);
											});
									}
								}
							})
							.catch(console.error);
					}
				},
				onError: (error, variables) => {
					if (!useGlobalInvalidate) {
						queryClient.setQueryData<FullGameData | null>(
							gameKeys.detail(variables.gameId),
							previousGame,
						);
					}
					snackbar.error(
						`${t("errors.updatePlayStatusFailed", "更新游戏状态失败")}: ${getErrorMessage(error)}`,
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
