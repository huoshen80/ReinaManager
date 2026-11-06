import { useQueryClient } from "@tanstack/react-query";
import { useDeferredValue, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { gameKeys, useAllGames, useGameIdList } from "@/hooks/queries/useGames";
import { getDisplayPreferences } from "@/metadata/data/displayPreferences";
import {
	type CollectionGameFilterSortConfig,
	useStore,
} from "@/store/appStore";
import type { GameData } from "@/types";
import { ALL_PLAY_STATUSES, PlayStatus } from "@/types/collection";
import { getGameNsfwStatus } from "@/utils/game";
import {
	createSearchIndex,
	searchWithIndex,
} from "@/utils/game/enhancedSearch";
import { type GameIndex, getGameIndex } from "@/utils/game/gameIndex";
import {
	buildNormalizedTagSet,
	matchesAllNormalizedTagFilters,
} from "@/utils/game/tagFilter";

const EMPTY_IDS: number[] = [];
const EMPTY_GAMES: GameData[] = [];

export interface GameListScopeOptions {
	scopeGameIds?: readonly number[];
	applyNsfwFilter?: boolean;
	preferencesScope?: "library" | "collection";
}

/** 自定义收藏分类使用独立偏好，避免与游戏库的搜索、筛选和排序互相覆盖。 */
export function useGameListPreferences(
	preferencesScope: GameListScopeOptions["preferencesScope"] = "library",
): CollectionGameFilterSortConfig {
	return useStore(
		useShallow((state) =>
			preferencesScope === "collection"
				? state.collectionGameFilterSort
				: {
						gameFilterType: state.gameFilterType,
						playStatusFilter: state.playStatusFilter,
						tagFilters: state.tagFilters,
						sortOption: state.sortOption,
						sortOrder: state.sortOrder,
						showCardSortFieldOverlay: state.showCardSortFieldOverlay,
					},
		),
	);
}

export function getActiveGameFilterCount({
	gameFilterType,
	playStatusFilter,
	tagFilters,
}: Pick<
	CollectionGameFilterSortConfig,
	"gameFilterType" | "playStatusFilter" | "tagFilters"
>): number {
	return (
		Number(gameFilterType !== "all") +
		Number(
			Array.isArray(playStatusFilter)
				? playStatusFilter.length > 0 &&
						playStatusFilter.length < ALL_PLAY_STATUSES.length
				: playStatusFilter !== "all",
		) +
		Number(tagFilters.length > 0)
	);
}

function gameMatchesTagFilters(
	game: GameData,
	normalizedTagFilters: ReadonlySet<string>,
): boolean {
	if (normalizedTagFilters.size === 0) {
		return true;
	}

	const gameTags = game.tags;
	if (!gameTags || gameTags.length === 0) {
		return false;
	}

	return matchesAllNormalizedTagFilters(gameTags, normalizedTagFilters);
}

export function useGameIndex() {
	const queryClient = useQueryClient();
	const allGamesQuery = useAllGames();
	const preferences = useStore(getDisplayPreferences);
	const index = useMemo(() => {
		const cachedIndex = queryClient.getQueryData<GameIndex>(gameKeys.index());
		if (
			cachedIndex &&
			cachedIndex.rawList === allGamesQuery.data &&
			cachedIndex.preferences.key === preferences.key
		) {
			return cachedIndex;
		}

		const nextIndex = getGameIndex(allGamesQuery.data, preferences);
		queryClient.setQueryData(gameKeys.index(), nextIndex);
		return nextIndex;
	}, [allGamesQuery.data, queryClient, preferences]);

	return {
		index,
		isLoading: allGamesQuery.isLoading,
		isError: allGamesQuery.isError,
		error: allGamesQuery.error,
		refetch: allGamesQuery.refetch,
	};
}

/**
 * 基础游戏筛选门面 Hook
 *
 * 数据流：
 * 1. useAllGames → FullGameData[] → GameIndex（一次性派生）
 * 2. useGameIdList → number[]（排序/筛选后的 ID，IPC 仅传输几 KB）
 * 3. 从 GameIndex.displayById 读取 GameData → 前端过滤（作用域/游玩状态/NSFW）
 *
 * 不处理搜索关键词，供 SearchBox 复用基础筛选结果生成建议，
 * 避免搜索框为建议列表重复执行完整搜索。
 */
export function useFilteredGamesFacade({
	scopeGameIds,
	applyNsfwFilter = true,
	preferencesScope,
}: GameListScopeOptions = {}) {
	const {
		gameFilterType,
		playStatusFilter,
		tagFilters,
		sortOption,
		sortOrder,
	} = useGameListPreferences(preferencesScope);
	const nsfwFilter = useStore((s) => s.nsfwFilter);

	const gameIndexQuery = useGameIndex();
	const { index } = gameIndexQuery;

	// 2. 排序/筛选后的 ID 列表（轻量 IPC，切换排序时仅传输几 KB）
	const isManualSort = sortOption === "manual";
	const needsIdQuery = !isManualSort || gameFilterType !== "all";
	const gameIdListQuery = useGameIdList(
		gameFilterType,
		isManualSort ? "addtime" : sortOption,
		sortOrder,
		needsIdQuery,
	);
	const sortedIds = gameIdListQuery.data ?? EMPTY_IDS;
	const orderedIds = isManualSort ? (scopeGameIds ?? EMPTY_IDS) : sortedIds;
	const matchingTypeIds = useMemo(
		() =>
			isManualSort && gameFilterType !== "all" ? new Set(sortedIds) : null,
		[isManualSort, gameFilterType, sortedIds],
	);
	const scopedGameIdSet = useMemo(
		() => (scopeGameIds ? new Set(scopeGameIds) : null),
		[scopeGameIds],
	);

	// 3. 从 Map 读取 GameData，应用前端过滤
	const baseFilteredGames = useMemo(() => {
		if (orderedIds.length === 0 || index.displayById.size === 0) {
			return EMPTY_GAMES;
		}

		const games: GameData[] = [];
		for (const id of orderedIds) {
			if (scopedGameIdSet && !scopedGameIdSet.has(id)) continue;
			if (matchingTypeIds && !matchingTypeIds.has(id)) continue;

			const game = index.displayById.get(id);
			if (!game) continue;

			const status = game.clear ?? PlayStatus.WISH;
			if (Array.isArray(playStatusFilter)) {
				if (
					playStatusFilter.length > 0 &&
					playStatusFilter.length < ALL_PLAY_STATUSES.length &&
					!playStatusFilter.includes(status)
				) {
					continue;
				}
			} else if (playStatusFilter !== "all" && status !== playStatusFilter) {
				continue;
			}

			if (applyNsfwFilter && nsfwFilter && getGameNsfwStatus(game)) {
				continue;
			}

			games.push(game);
		}

		return games;
	}, [
		orderedIds,
		matchingTypeIds,
		index.displayById,
		scopedGameIdSet,
		playStatusFilter,
		applyNsfwFilter,
		nsfwFilter,
	]);

	const normalizedTagFilters = useMemo(() => {
		return buildNormalizedTagSet(tagFilters);
	}, [tagFilters]);

	const filteredGames = useMemo(() => {
		if (normalizedTagFilters.size === 0 || baseFilteredGames.length === 0) {
			return baseFilteredGames;
		}

		return baseFilteredGames.filter((game) =>
			gameMatchesTagFilters(game, normalizedTagFilters),
		);
	}, [baseFilteredGames, normalizedTagFilters]);

	return {
		index,
		baseFilteredGames,
		filteredGames,
		isLoading:
			gameIndexQuery.isLoading || (needsIdQuery && gameIdListQuery.isLoading),
		isError:
			gameIndexQuery.isError || (needsIdQuery && gameIdListQuery.isError),
		error:
			gameIndexQuery.error ?? (needsIdQuery ? gameIdListQuery.error : null),
	};
}

/**
 * 游戏列表门面 Hook
 *
 * 在基础筛选结果上应用搜索关键词，返回最终卡片 ID 列表。
 * 只有实际展示游戏列表的页面才应使用这个 Hook。
 */
export function useGameListFacade(options: GameListScopeOptions = {}) {
	const searchKeyword = useStore((s) =>
		options.preferencesScope === "collection"
			? s.collectionGameSearch
			: s.searchKeyword,
	);
	const deferredSearchKeyword = useDeferredValue(searchKeyword);
	const { index, filteredGames, isLoading, isError, error } =
		useFilteredGamesFacade(options);
	const trimmedSearchKeyword = deferredSearchKeyword.trim();
	const shouldBuildSearchIndex = trimmedSearchKeyword.length > 0;

	const searchIndex = useMemo(() => {
		if (!shouldBuildSearchIndex) return null;
		return createSearchIndex(filteredGames);
	}, [filteredGames, shouldBuildSearchIndex]);

	const searchedGames = useMemo(() => {
		if (!trimmedSearchKeyword || !searchIndex) {
			return filteredGames;
		}
		const matchedGameIds = new Set(
			searchWithIndex(searchIndex, trimmedSearchKeyword, {
				limit: filteredGames.length,
			}).map((result) => result.item.id),
		);

		return filteredGames.filter((game) => matchedGameIds.has(game.id));
	}, [searchIndex, trimmedSearchKeyword, filteredGames]);

	// 4. 返回 ID 数组
	const gameIds = useMemo(
		() => searchedGames.map((g) => g.id),
		[searchedGames],
	);

	return {
		displayById: index.displayById,
		isSearchPending: searchKeyword !== deferredSearchKeyword,
		filteredGames,
		gameIds,
		isLoading,
		isError,
		error,
	};
}
