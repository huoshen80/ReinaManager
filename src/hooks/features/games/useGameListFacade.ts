import { useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { gameKeys, useAllGames, useGameIdList } from "@/hooks/queries/useGames";
import { useStore } from "@/store/appStore";
import type { FullGameData, GameData } from "@/types";
import { PlayStatus } from "@/types/collection";
import { applyNsfwFilter, getDisplayGameDataList } from "@/utils/appUtils";
import { createSearchIndex, searchWithIndex } from "@/utils/enhancedSearch";

/**
 * 将全量 FullGameData 转换为 GameData 并写入 React Query 缓存字典
 *
 * 供 CardItem 等组件通过 gameKeys.detail(id) 以 O(1) 读取。
 *
 * ⚠️ 缓存写入必须在 useMemo 中同步完成（而非 useEffect）：
 * CardItem 在同一 render 周期内通过 getQueryData 读取缓存，
 * getQueryData 不响应式，若异步写入则缓存未命中导致卡片永久渲染 null。
 */
export function useHydrateGameCache(
	fullData: FullGameData[] | undefined,
): GameData[] {
	const queryClient = useQueryClient();

	return useMemo(() => {
		if (!fullData || fullData.length === 0) return [];
		const transformed = getDisplayGameDataList(fullData);
		for (const game of transformed) {
			queryClient.setQueryData(gameKeys.detail(game.id), game);
		}
		return transformed;
	}, [fullData, queryClient]);
}

/**
 * 游戏列表门面 Hook（用于 LibrariesPage）
 *
 * 数据流：
 * 1. useAllGames → FullGameData[] → 转换 → 写入缓存字典 + 构建 Map（一次性）
 * 2. useGameIdList → number[]（排序/筛选后的 ID，IPC 仅传输几 KB）
 * 3. 从 Map 读取 GameData → 前端过滤（游玩状态/NSFW/搜索）
 * 4. 返回 number[]（最终 ID 列表）
 */
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

	// 1. 全量数据 → 写入缓存字典 + 构建 Map（staleTime: Infinity，仅首次加载时 IPC）
	const allGamesQuery = useAllGames();
	const transformedGames = useHydrateGameCache(allGamesQuery.data);
	const gameMap = useMemo(() => {
		const map = new Map<number, GameData>();
		for (const game of transformedGames) {
			map.set(game.id, game);
		}
		return map;
	}, [transformedGames]);

	// 2. 排序/筛选后的 ID 列表（轻量 IPC，切换排序时仅传输几 KB）
	const gameIdListQuery = useGameIdList(gameFilterType, sortOption, sortOrder);
	const sortedIds = gameIdListQuery.data ?? [];

	// 3. 从 Map 读取 GameData，应用前端过滤
	const filteredGames = useMemo(() => {
		if (sortedIds.length === 0 || gameMap.size === 0) return [];

		// 从 Map 读取（比 getQueryData 快）
		const games: GameData[] = [];
		for (const id of sortedIds) {
			const game = gameMap.get(id);
			if (game) games.push(game);
		}

		// 游玩状态过滤
		let result = games;
		if (playStatusFilter !== "all") {
			result = result.filter(
				(game) => (game.clear ?? PlayStatus.WISH) === playStatusFilter,
			);
		}

		// NSFW 过滤
		result = applyNsfwFilter(result, nsfwFilter);

		return result;
	}, [sortedIds, gameMap, playStatusFilter, nsfwFilter]);

	// 搜索过滤（搜索索引依赖过滤后的列表）
	const searchIndex = useMemo(
		() => createSearchIndex(filteredGames),
		[filteredGames],
	);

	const searchedGames = useMemo(() => {
		if (!searchKeyword.trim()) {
			return filteredGames;
		}
		return searchWithIndex(searchIndex, searchKeyword).map(
			(result) => result.item,
		);
	}, [searchIndex, searchKeyword, filteredGames]);

	// 4. 返回 ID 数组
	const gameIds = useMemo(
		() => searchedGames.map((g) => g.id),
		[searchedGames],
	);

	return {
		filteredGames,
		gameIds,
		isLoading: allGamesQuery.isLoading || gameIdListQuery.isLoading,
	};
}

/**
 * 获取全量游戏数据（展平后）
 *
 * 用于 HomePage / CollectionPage / DetailPage 等需要遍历完整数据的场景。
 * 同时将数据写入缓存字典，供 CardItem 等组件按需读取。
 */
export function useAllGameListFacade() {
	const allGamesQuery = useAllGames();
	return useHydrateGameCache(allGamesQuery.data);
}
