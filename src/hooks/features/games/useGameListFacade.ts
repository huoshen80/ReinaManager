import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { gameKeys, useAllGames, useGameIdList } from "@/hooks/queries/useGames";
import { useStore } from "@/store/appStore";
import type { GameData } from "@/types";
import { PlayStatus } from "@/types/collection";
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
	const index = useMemo(() => {
		const cachedIndex = queryClient.getQueryData<GameIndex>(gameKeys.index());
		if (cachedIndex && cachedIndex.rawList === allGamesQuery.data) {
			return cachedIndex;
		}

		const nextIndex = getGameIndex(allGamesQuery.data);
		queryClient.setQueryData(gameKeys.index(), nextIndex);
		return nextIndex;
	}, [allGamesQuery.data, queryClient]);

	return {
		index,
		isLoading: allGamesQuery.isLoading,
		isError: allGamesQuery.isError,
		error: allGamesQuery.error,
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
}: GameListScopeOptions = {}) {
	const {
		gameFilterType,
		playStatusFilter,
		tagFilters,
		sortOption,
		sortOrder,
		nsfwFilter,
	} = useStore(
		useShallow((s) => ({
			gameFilterType: s.gameFilterType,
			playStatusFilter: s.playStatusFilter,
			tagFilters: s.tagFilters,
			sortOption: s.sortOption,
			sortOrder: s.sortOrder,
			nsfwFilter: s.nsfwFilter,
		})),
	);

	const gameIndexQuery = useGameIndex();
	const { index } = gameIndexQuery;

	// 2. 排序/筛选后的 ID 列表（轻量 IPC，切换排序时仅传输几 KB）
	const gameIdListQuery = useGameIdList(gameFilterType, sortOption, sortOrder);
	const sortedIds = gameIdListQuery.data ?? EMPTY_IDS;
	const scopedGameIdSet = useMemo(
		() => (scopeGameIds ? new Set(scopeGameIds) : null),
		[scopeGameIds],
	);

	// 3. 从 Map 读取 GameData，应用前端过滤
	const baseFilteredGames = useMemo(() => {
		if (sortedIds.length === 0 || index.displayById.size === 0) {
			return EMPTY_GAMES;
		}

		const games: GameData[] = [];
		for (const id of sortedIds) {
			if (scopedGameIdSet && !scopedGameIdSet.has(id)) continue;

			const game = index.displayById.get(id);
			if (!game) continue;

			if (
				playStatusFilter !== "all" &&
				(game.clear ?? PlayStatus.WISH) !== playStatusFilter
			) {
				continue;
			}

			if (applyNsfwFilter && nsfwFilter && getGameNsfwStatus(game)) {
				continue;
			}

			games.push(game);
		}

		return games;
	}, [
		sortedIds,
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
		isLoading: gameIndexQuery.isLoading || gameIdListQuery.isLoading,
		isError: gameIndexQuery.isError || gameIdListQuery.isError,
		error: gameIndexQuery.error ?? gameIdListQuery.error,
	};
}

/**
 * 游戏列表门面 Hook
 *
 * 在基础筛选结果上应用搜索关键词，返回最终卡片 ID 列表。
 * 只有实际展示游戏列表的页面才应使用这个 Hook。
 */
export function useGameListFacade(options: GameListScopeOptions = {}) {
	const searchKeyword = useStore((s) => s.searchKeyword);
	const { index, filteredGames, isLoading, isError, error } =
		useFilteredGamesFacade(options);
	const trimmedSearchKeyword = searchKeyword.trim();
	const shouldBuildSearchIndex = trimmedSearchKeyword.length > 0;

	const searchIndex = useMemo(() => {
		if (!shouldBuildSearchIndex) return null;
		return createSearchIndex(filteredGames);
	}, [filteredGames, shouldBuildSearchIndex]);

	const searchedGames = useMemo(() => {
		if (!trimmedSearchKeyword || !searchIndex) {
			return filteredGames;
		}
		return searchWithIndex(searchIndex, trimmedSearchKeyword, {
			limit: filteredGames.length,
		}).map((result) => result.item);
	}, [searchIndex, trimmedSearchKeyword, filteredGames]);

	// 4. 返回 ID 数组
	const gameIds = useMemo(
		() => searchedGames.map((g) => g.id),
		[searchedGames],
	);

	return {
		displayById: index.displayById,
		filteredGames,
		gameIds,
		isLoading,
		isError,
		error,
	};
}
