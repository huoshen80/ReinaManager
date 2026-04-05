import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAllGames, useGameList } from "@/hooks/queries/useGames";
import { useStore } from "@/store/appStore";
import { applyNsfwFilter, getDisplayGameDataList } from "@/utils/appUtils";
import { enhancedSearch } from "@/utils/enhancedSearch";

export function useGameListFacade() {
	const { gameFilterType, sortOption, sortOrder, nsfwFilter, searchKeyword } =
		useStore(
			useShallow((s) => ({
				gameFilterType: s.gameFilterType,
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

	const nsfwFilteredGames = useMemo(() => {
		return applyNsfwFilter(displayGames, nsfwFilter);
	}, [displayGames, nsfwFilter]);

	const searchedGames = useMemo(() => {
		if (!searchKeyword.trim()) {
			return nsfwFilteredGames;
		}

		return enhancedSearch(nsfwFilteredGames, searchKeyword).map(
			(result) => result.item,
		);
	}, [nsfwFilteredGames, searchKeyword]);

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
