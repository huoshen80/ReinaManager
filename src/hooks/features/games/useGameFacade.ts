import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { gameKeys, useGameDetail } from "@/hooks/queries/useGames";
import { gameService } from "@/services";
import type { FullGameData, GameData } from "@/types";
import { getDisplayGameData } from "@/utils";
import { useAllGameListFacade } from "./useGameListFacade";

export function useSelectedGame(gameId: number | null | undefined) {
	const { i18n } = useTranslation();
	const gameDetailQuery = useGameDetail(gameId ?? null);

	const selectedGame = useMemo(() => {
		return gameDetailQuery.data
			? getDisplayGameData(gameDetailQuery.data, i18n.language)
			: null;
	}, [gameDetailQuery.data, i18n.language]);

	return {
		selectedGame,
		gameDetail: gameDetailQuery.data ?? null,
		isLoadingSelectedGame: gameDetailQuery.isLoading,
	};
}

export function useGetGameById() {
	const { i18n } = useTranslation();
	const queryClient = useQueryClient();
	const displayAllGames = useAllGameListFacade();

	const getGameById = useCallback(
		async (gameId: number): Promise<GameData> => {
			const cachedGame = displayAllGames.find((game) => game.id === gameId);

			if (cachedGame) {
				return cachedGame;
			}

			const detailKey = gameKeys.detail(gameId);
			const cachedDetail = queryClient.getQueryData<FullGameData | null>(
				detailKey,
			);

			if (cachedDetail) {
				return getDisplayGameData(cachedDetail, i18n.language);
			}

			const fullGame = await queryClient.fetchQuery({
				queryKey: detailKey,
				queryFn: () => gameService.getGameById(gameId),
				staleTime: 60_000,
			});

			if (!fullGame) {
				throw new Error("游戏不存在");
			}

			return getDisplayGameData(fullGame, i18n.language);
		},
		[displayAllGames, i18n.language, queryClient],
	);

	return getGameById;
}
