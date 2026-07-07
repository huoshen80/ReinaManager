/**
 * @file 游戏数据查询层
 * @description 使用 React Query 管理游戏列表、详情和增删改操作
 */

import {
	keepPreviousData,
	type QueryClient,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
	appendGamesToCaches,
	patchGameCaches,
	removeGamesFromCaches,
} from "@/hooks/queries/gameCachePatch";
import type { GameType, SortOption, SortOrder } from "@/services/invoke";
import { gameService } from "@/services/invoke";
import type {
	BatchOperationResult,
	InsertGameParams,
	UpdateGameParams,
} from "@/types";

const listRelevantUpdateFields = new Set<keyof UpdateGameParams>([
	"id_type",
	"date",
	"localpath",
	"clear",
	"custom_data",
	"upsert_sources",
	"remove_sources",
]);

function shouldInvalidateGameLists(updates: UpdateGameParams): boolean {
	return Object.keys(updates).some((field) =>
		listRelevantUpdateFields.has(field as keyof UpdateGameParams),
	);
}

function shouldInvalidateSourceIdCaches(updates: UpdateGameParams): boolean {
	return Boolean(
		updates.remove_sources?.some(
			(source) => source === "bgm" || source === "vndb",
		) ||
			updates.upsert_sources?.some(
				(record) => record.source === "bgm" || record.source === "vndb",
			),
	);
}

function invalidateSourceIdCaches(queryClient: QueryClient) {
	queryClient.invalidateQueries({ queryKey: gameKeys.bgmIds() });
	queryClient.invalidateQueries({ queryKey: gameKeys.vndbIds() });
}

export const gameKeys = {
	all: ["games"] as const,
	index: () => [...gameKeys.all, "index"] as const,
	idLists: () => [...gameKeys.all, "idList"] as const,
	idList: (params: {
		gameType: GameType;
		sortOption: SortOption;
		sortOrder: SortOrder;
		language: string;
	}) => [...gameKeys.idLists(), params] as const,
	vndbIds: () => [...gameKeys.all, "vndbIds"] as const,
	bgmIds: () => [...gameKeys.all, "bgmIds"] as const,
};

function useAllGames() {
	return useQuery({
		queryKey: gameKeys.all,
		queryFn: () => gameService.getAllGames("all"),
	});
}

/**
 * 查询排序/筛选后的游戏 ID 列表（轻量 IPC）
 *
 * 与 useAllGames（返回全量 FullGameData）不同：
 * 本函数通过后端 find_game_ids 命令只获取 ID 数组，
 * 前端已缓存完整数据，切换排序/筛选时 IPC 传输量从数 MB 降到数 KB。
 */
function useGameIdList(
	gameType: GameType,
	sortOption: SortOption,
	sortOrder: SortOrder,
) {
	const { i18n } = useTranslation();
	const language = i18n.language;

	return useQuery({
		queryKey: gameKeys.idList({ gameType, sortOption, sortOrder, language }),
		queryFn: () =>
			gameService.getGameIds(gameType, sortOption, sortOrder, language),
		placeholderData: keepPreviousData,
	});
}

function useAllVndbIds() {
	return useQuery({
		queryKey: gameKeys.vndbIds(),
		queryFn: () => gameService.getAllVndbIds(),
	});
}

function useAllBgmIds() {
	return useQuery({
		queryKey: gameKeys.bgmIds(),
		queryFn: () => gameService.getAllBgmIds(),
	});
}

function useAddGame() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (gameParams: InsertGameParams) =>
			gameService.insertGame(gameParams),
		onSuccess: async (insertedGame) => {
			const patched = appendGamesToCaches(queryClient, gameKeys, [
				insertedGame,
			]);
			if (!patched) {
				await queryClient.invalidateQueries({
					queryKey: gameKeys.all,
					exact: true,
				});
			}
			await queryClient.invalidateQueries({ queryKey: gameKeys.idLists() });
			invalidateSourceIdCaches(queryClient);
			await queryClient.invalidateQueries({ queryKey: ["collections"] });
		},
	});
}

function useBatchAddGames() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (games: InsertGameParams[]): Promise<BatchOperationResult> =>
			gameService.insertGamesBatch(games),
		onSuccess: (result) => {
			if (result.success === 0) {
				return;
			}
			const patched = appendGamesToCaches(
				queryClient,
				gameKeys,
				result.games ?? [],
			);
			if (!patched) {
				queryClient.invalidateQueries({
					queryKey: gameKeys.all,
					exact: true,
				});
			}
			queryClient.invalidateQueries({ queryKey: gameKeys.idLists() });
			invalidateSourceIdCaches(queryClient);
			queryClient.invalidateQueries({ queryKey: ["collections"] });
		},
	});
}

function useDeleteGame() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (gameId: number) => gameService.deleteGame(gameId),
		onSuccess: (_, gameId) => {
			// 乐观更新：立即从缓存中移除已删除的游戏
			removeGamesFromCaches(queryClient, gameKeys, [gameId]);
			queryClient.invalidateQueries({ queryKey: gameKeys.idLists() });
			queryClient.invalidateQueries({ queryKey: ["collections"] });
			queryClient.invalidateQueries({ queryKey: ["stats"] });
		},
	});
}

function useDeleteGames() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (gameIds: number[]) => gameService.deleteGames(gameIds),
		onSuccess: (_, gameIds) => {
			// 乐观更新：立即从缓存中移除已删除的游戏
			removeGamesFromCaches(queryClient, gameKeys, gameIds);
			queryClient.invalidateQueries({ queryKey: gameKeys.idLists() });
			queryClient.invalidateQueries({ queryKey: ["collections"] });
			queryClient.invalidateQueries({ queryKey: ["stats"] });
		},
	});
}

function useUpdateGame() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			gameId,
			updates,
		}: {
			gameId: number;
			updates: UpdateGameParams;
		}) => gameService.updateGame(gameId, updates),
		onSuccess: (updatedFullGame, { updates }) => {
			patchGameCaches(queryClient, gameKeys, updatedFullGame);

			if (shouldInvalidateGameLists(updates)) {
				queryClient.invalidateQueries({ queryKey: gameKeys.idLists() });
			}
			if (shouldInvalidateSourceIdCaches(updates)) {
				invalidateSourceIdCaches(queryClient);
			}
		},
	});
}

export {
	useAddGame,
	useAllBgmIds,
	useAllGames,
	useAllVndbIds,
	useBatchAddGames,
	useDeleteGame,
	useDeleteGames,
	useGameIdList,
	useUpdateGame,
};
