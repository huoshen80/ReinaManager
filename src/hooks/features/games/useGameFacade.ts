import { useMemo } from "react";
import { useGameDetail } from "@/hooks/queries/useGames";

import { getDisplayGameData } from "@/utils/appUtils";

export function useGameById(gameId: number | null) {
	const gameDetailQuery = useGameDetail(gameId);

	const selectedGame = useMemo(() => {
		return gameDetailQuery.data
			? getDisplayGameData(gameDetailQuery.data)
			: null;
	}, [gameDetailQuery.data]);

	return {
		selectedGame,
		gameDetail: gameDetailQuery.data ?? null,
		isLoadingSelectedGame: gameDetailQuery.isLoading,
	};
}
