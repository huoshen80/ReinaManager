import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useGameDetail } from "@/hooks/queries/useGames";
import { gameService } from "@/services";
import type { GameData } from "@/types";
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

function useGameLookup() {
	const { i18n } = useTranslation();
	const displayAllGames = useAllGameListFacade();

	const getGameById = useCallback(
		async (gameId: number): Promise<GameData> => {
			const cachedGame = displayAllGames.find((game) => game.id === gameId);

			if (cachedGame) {
				return cachedGame;
			}

			const fullGame = await gameService.getGameById(gameId);

			if (!fullGame) {
				throw new Error("游戏不存在");
			}

			return getDisplayGameData(fullGame, i18n.language);
		},
		[displayAllGames, i18n.language],
	);

	return getGameById;
}

function useIsLocalGame() {
	const displayAllGames = useAllGameListFacade();

	const isLocalGame = useCallback(
		(gameId: number) => {
			return displayAllGames.some(
				(game) => game.id === gameId && !!game.localpath,
			);
		},
		[displayAllGames],
	);

	return isLocalGame;
}

export function useGameFacade() {
	const getGameById = useGameLookup();
	const isLocalGame = useIsLocalGame();

	return {
		getGameById,
		isLocalGame,
	};
}
