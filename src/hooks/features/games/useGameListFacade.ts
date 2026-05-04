import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAllGames, useGameList } from "@/hooks/queries/useGames";
import { useStore } from "@/store/appStore";
import { PlayStatus } from "@/types/collection";
import { applyNsfwFilter, getDisplayGameDataList } from "@/utils/appUtils";
import { createSearchIndex, searchWithIndex } from "@/utils/enhancedSearch";

export function useGameListFacade() {
	const {
		gameFilterType,
		playStatusFilter,
		sortOption,
		sortOrder,
		nsfwFilter,
		searchKeyword,
	} = useStore(
		useShallow((s) => ({
			gameFilterType: s.gameFilterType,
			playStatusFilter: s.playStatusFilter,
			sortOption: s.sortOption,
			sortOrder: s.sortOrder,
			nsfwFilter: s.nsfwFilter,
			searchKeyword: s.searchKeyword,
		})),
	);

	const gameListQuery = useGameList(gameFilterType, sortOption, sortOrder);

	const displayGames = useMemo(() => {
		return getDisplayGameDataList(gameListQuery.data ?? []);
	}, [gameListQuery.data]);

	const playStatusFilteredGames = useMemo(() => {
		if (playStatusFilter === "all") {
			return displayGames;
		}

		return displayGames.filter(
			(game) => (game.clear ?? PlayStatus.WISH) === playStatusFilter,
		);
	}, [displayGames, playStatusFilter]);

	const nsfwFilteredGames = useMemo(() => {
		return applyNsfwFilter(playStatusFilteredGames, nsfwFilter);
	}, [playStatusFilteredGames, nsfwFilter]);

	// 搜索索引只依赖游戏列表，搜索词变化时复用索引
	const searchIndex = useMemo(
		() => createSearchIndex(nsfwFilteredGames),
		[nsfwFilteredGames],
	);

	const searchedGames = useMemo(() => {
		if (!searchKeyword.trim()) {
			return nsfwFilteredGames;
		}

		return searchWithIndex(searchIndex, searchKeyword).map(
			(result) => result.item,
		);
	}, [searchIndex, searchKeyword, nsfwFilteredGames]);

	return {
		games: searchedGames,
		isLoading: gameListQuery.isLoading,
	};
}

export function useAllGameListFacade() {
	const allGamesQuery = useAllGames();

	const displayGames = useMemo(() => {
		return getDisplayGameDataList(allGamesQuery.data ?? []);
	}, [allGamesQuery.data]);

	return displayGames;
}
