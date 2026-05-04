import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { gameKeys, useGameDetail } from "@/hooks/queries/useGames";
import { gameService } from "@/services/invoke";
import type { FullGameData, GameData } from "@/types";
import { getDisplayGameData } from "@/utils/appUtils";
import { useAllGameListFacade } from "./useGameListFacade";

export function useSelectedGame(gameId: number | null) {
	const displayAllGames = useAllGameListFacade();
	const cachedGame = useMemo(
		() =>
			typeof gameId === "number"
				? (displayAllGames.find((game) => game.id === gameId) ?? null)
				: null,
		[displayAllGames, gameId],
	);
	const gameDetailQuery = useGameDetail(cachedGame ? null : gameId);

	const selectedGame = useMemo(() => {
		if (cachedGame) {
			return cachedGame;
		}
		return gameDetailQuery.data
			? getDisplayGameData(gameDetailQuery.data)
			: null;
	}, [cachedGame, gameDetailQuery.data]);

	return {
		selectedGame,
		gameDetail: gameDetailQuery.data ?? null,
		isLoadingSelectedGame: gameDetailQuery.isLoading,
	};
}

export function useGetGameById() {
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
				return getDisplayGameData(cachedDetail);
			}

			const fullGame = await queryClient.fetchQuery({
				queryKey: detailKey,
				queryFn: () => gameService.getGameById(gameId),
			});

			if (!fullGame) {
				throw new Error("游戏不存在");
			}

			return getDisplayGameData(fullGame);
		},
		[displayAllGames, queryClient],
	);

	return getGameById;
}
