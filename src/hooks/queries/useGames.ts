/**
 * @file 游戏数据查询层
 * @description 使用 React Query 管理游戏列表、详情和增删改操作
 */

import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import i18next from "i18next";
import type { GameType, SortOption, SortOrder } from "@/services";
import { gameService } from "@/services";
import type { InsertGameParams, UpdateGameParams } from "@/types";

const listRelevantUpdateFields = new Set<keyof UpdateGameParams>([
	"bgm_id",
	"vndb_id",
	"ymgal_id",
	"id_type",
	"date",
	"localpath",
	"clear",
	"bgm_data",
	"vndb_data",
	"ymgal_data",
	"custom_data",
]);

function shouldInvalidateGameLists(updates: UpdateGameParams): boolean {
	return Object.keys(updates).some((field) =>
		listRelevantUpdateFields.has(field as keyof UpdateGameParams),
	);
}

export const gameKeys = {
	all: ["games"] as const,
	lists: () => [...gameKeys.all, "list"] as const,
	list: (params: {
		gameType: GameType;
		sortOption: SortOption;
		sortOrder: SortOrder;
	}) => [...gameKeys.lists(), params] as const,
	details: () => [...gameKeys.all, "detail"] as const,
	detail: (id: number) => [...gameKeys.details(), id] as const,
	vndbIds: () => [...gameKeys.all, "vndbIds"] as const,
	bgmIds: () => [...gameKeys.all, "bgmIds"] as const,
};

function useAllGames() {
	return useQuery({
		queryKey: gameKeys.all,
		queryFn: () => gameService.getAllGames("all"),
		staleTime: 30_000,
	});
}

function useGameList(
	gameType: GameType,
	sortOption: SortOption,
	sortOrder: SortOrder,
) {
	return useQuery({
		queryKey: gameKeys.list({ gameType, sortOption, sortOrder }),
		queryFn: () =>
			gameService.getAllGames(
				gameType,
				sortOption,
				sortOrder,
				i18next.language,
			),
		placeholderData: keepPreviousData,
		staleTime: 30_000,
	});
}

function useGameDetail(gameId: number | null) {
	return useQuery({
		queryKey: gameKeys.detail(gameId ?? 0),
		queryFn: async () => {
			if (!gameId) return null;
			return gameService.getGameById(gameId);
		},
		enabled: gameId !== null,
		placeholderData: keepPreviousData,
		staleTime: 60_000,
	});
}

function useAllVndbIds() {
	return useQuery({
		queryKey: gameKeys.vndbIds(),
		queryFn: () => gameService.getAllVndbIds(),
		staleTime: 30_000,
	});
}

function useAllBgmIds() {
	return useQuery({
		queryKey: gameKeys.bgmIds(),
		queryFn: () => gameService.getAllBgmIds(),
		staleTime: 30_000,
	});
}

function useAddGame() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (gameParams: InsertGameParams) =>
			gameService.insertGame(gameParams),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: gameKeys.all,
				exact: true,
			});
			queryClient.invalidateQueries({ queryKey: gameKeys.lists() });
			queryClient.invalidateQueries({ queryKey: ["collections"] });
		},
	});
}

function useDeleteGame() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (gameId: number) => gameService.deleteGame(gameId),
		onSuccess: (_, gameId) => {
			queryClient.invalidateQueries({
				queryKey: gameKeys.all,
				exact: true,
			});
			queryClient.invalidateQueries({ queryKey: gameKeys.lists() });
			queryClient.invalidateQueries({
				queryKey: gameKeys.detail(gameId),
				exact: true,
			});
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
		onSuccess: (_, { gameId, updates }) => {
			queryClient.invalidateQueries({
				queryKey: gameKeys.detail(gameId),
				exact: true,
			});

			if (shouldInvalidateGameLists(updates)) {
				queryClient.invalidateQueries({ queryKey: gameKeys.lists() });
				queryClient.invalidateQueries({
					queryKey: gameKeys.all,
					exact: true,
				});
			}
		},
	});
}

function useBatchUpdateGames() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (updates: Array<[number, UpdateGameParams]>) =>
			gameService.updateBatch(updates),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: gameKeys.all,
				exact: true,
			});
			queryClient.invalidateQueries({ queryKey: gameKeys.lists() });
		},
	});
}

export {
	useAddGame,
	useAllBgmIds,
	useAllGames,
	useAllVndbIds,
	useBatchUpdateGames,
	useDeleteGame,
	useGameDetail,
	useGameList,
	useUpdateGame,
};
