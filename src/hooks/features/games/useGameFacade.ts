import { useContext } from "react";
import { useGameIndex } from "@/hooks/features/games/useGameListFacade";
import { GameDeletionContext } from "@/providers/GameDeletionProvider";

/**
 * 按 ID 获取单个游戏的展示数据
 *
 * 从统一 GameIndex.displayById 读取，避免维护单独的 detail 字典缓存。
 */
export function useGameById(gameId: number | null) {
	const deletion = useContext(GameDeletionContext);
	const gameIndexQuery = useGameIndex();
	const selectedGame =
		deletion?.game && deletion.game.id === gameId
			? deletion.game
			: gameId === null
				? null
				: (gameIndexQuery.index.displayById.get(gameId) ?? null);

	return {
		selectedGame,
		isLoadingSelectedGame: !selectedGame && gameIndexQuery.isLoading,
	};
}
