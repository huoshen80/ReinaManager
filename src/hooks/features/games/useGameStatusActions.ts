import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { snackbar } from "@/components/Snackbar";
import { gameKeys } from "@/hooks/queries/useGames";
import {
	type UpdatePlayStatusParams,
	useUpdatePlayStatus,
} from "@/hooks/queries/usePlayStatus";
import { useStore } from "@/store";
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
 * - 组合 Query Mutation 与 Zustand UI 状态同步
 * - 对外保持接近 useStore 的动作调用体验
 * - 统一处理错误提示与回滚逻辑
 */
export function useGameStatusActions() {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { updateGamePlayStatusInStore } = useStore();
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
			updateGamePlayStatusInStore(params.gameId, params.newStatus, true);
		}

		updateMutation.mutate(
			{ ...params, invalidateScope },
			{
				onSuccess: (updatedGame, variables) => {
					if (useGlobalInvalidate) {
						updateGamePlayStatusInStore(
							variables.gameId,
							variables.newStatus,
							false,
						);
					}
					options?.onSuccess?.(updatedGame, variables);
				},
				onError: (error, variables) => {
					if (!useGlobalInvalidate && typeof previousGame?.clear === "number") {
						updateGamePlayStatusInStore(
							variables.gameId,
							previousGame.clear,
							true,
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
