import { useMutation } from "@tanstack/react-query";
import { useCallback } from "react";
import { useAddGame, useAllGames } from "@/hooks/queries/useGames";
import { useBgmToken } from "@/hooks/queries/useSettings";
import type { FullGameData, InsertGameParams } from "@/types";
import i18n from "@/utils/i18n";
import { buildInsertGameData, ensureCompleteMetadata } from "@/utils/metadata";

export function useGameDuplicateChecker() {
	const { data: allGames = [] } = useAllGames();

	const checkGameExists = useCallback(
		(gameData: Pick<InsertGameParams, "bgm_id" | "vndb_id" | "ymgal_id">) => {
			return allGames.some(
				(game) =>
					(gameData.bgm_id && game.bgm_id === gameData.bgm_id) ||
					(gameData.vndb_id && game.vndb_id === gameData.vndb_id) ||
					(gameData.ymgal_id && game.ymgal_id === gameData.ymgal_id),
			);
		},
		[allGames],
	);

	return {
		checkGameExists,
	};
}

export function useSingleGameAddActions() {
	const { data: bgmToken = "" } = useBgmToken();
	const addGameMutation = useAddGame();
	const { checkGameExists } = useGameDuplicateChecker();
	const metadataAddActionMutation = useMutation({
		mutationFn: async ({
			gameData,
			options,
		}: {
			gameData: FullGameData;
			options?: {
				localpath?: string;
				fallbackIdType?: string;
				fallbackDate?: string;
			};
		}) => {
			const completeData = await ensureCompleteMetadata(gameData, bgmToken);
			const insertData = buildInsertGameData(
				completeData,
				options?.fallbackIdType,
				options?.fallbackDate,
			);
			insertData.localpath = options?.localpath ?? insertData.localpath;

			if (checkGameExists(insertData)) {
				throw new Error(i18n.t("components.AddModal.gameExists"));
			}

			return addGameMutation.mutateAsync(insertData);
		},
	});

	const addGameFromMetadata = useCallback(
		async (
			gameData: FullGameData,
			options?: {
				localpath?: string;
				fallbackIdType?: string;
				fallbackDate?: string;
			},
		) => {
			return metadataAddActionMutation.mutateAsync({
				gameData,
				options,
			});
		},
		[metadataAddActionMutation],
	);

	return {
		addGameFromMetadata,
		isAddingGame: metadataAddActionMutation.isPending,
	};
}
