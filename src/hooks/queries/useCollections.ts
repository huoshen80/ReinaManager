import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { getDeveloperCategoryGameIds } from "@/hooks/common/useVirtualCollections";
import type { SortOrder } from "@/services/invoke";
import { collectionService } from "@/services/invoke";
import type { SelectedCategory } from "@/store/appStore";
import type { CollectionBackendSortField } from "@/types/collection";
import type { GameIndex } from "@/utils/game/gameIndex";

export const collectionKeys = {
	all: ["collections"] as const,
	groups: () => [...collectionKeys.all, "groups"] as const,
	groupList: (sortField?: CollectionBackendSortField, sortOrder?: SortOrder) =>
		[
			...collectionKeys.groups(),
			"with-count",
			...(sortField && sortOrder ? [{ sortField, sortOrder }] : []),
		] as const,
	categories: (groupId: string) =>
		[...collectionKeys.all, "categories", groupId] as const,
	categoryList: (
		groupId: string,
		sortField?: CollectionBackendSortField,
		sortOrder?: SortOrder,
	) =>
		[
			...collectionKeys.categories(groupId),
			...(sortField && sortOrder ? [{ sortField, sortOrder }] : []),
		] as const,
	games: (categoryId: number) =>
		[...collectionKeys.all, "games", categoryId] as const,
	gameCategories: (gameId: number) =>
		[...collectionKeys.all, "gameCategories", gameId] as const,
};

function isCategoryQueryForGroup(
	queryKey: readonly unknown[],
	groupId: string,
): boolean {
	const categoryPrefix = collectionKeys.categories(groupId);
	return categoryPrefix.every((segment, index) => queryKey[index] === segment);
}

function useGroups() {
	return useQuery({
		queryKey: collectionKeys.groups(),
		queryFn: () => collectionService.getGroups(),
	});
}

function useGroupsWithCount(
	sortField?: CollectionBackendSortField,
	sortOrder?: SortOrder,
) {
	return useQuery({
		queryKey: collectionKeys.groupList(sortField, sortOrder),
		queryFn: () => collectionService.getGroupsWithCount(sortField, sortOrder),
		placeholderData: keepPreviousData,
	});
}

function useCategories(
	groupId: string | null,
	sortField?: CollectionBackendSortField,
	sortOrder?: SortOrder,
) {
	const isEnabled = Boolean(groupId) && !groupId?.startsWith("default_");
	const queryGroupId = groupId ?? "none";

	return useQuery({
		queryKey: collectionKeys.categoryList(queryGroupId, sortField, sortOrder),
		queryFn: async () => {
			if (!groupId || groupId.startsWith("default_")) {
				return [];
			}

			const groupIdNum = Number.parseInt(groupId, 10);
			if (Number.isNaN(groupIdNum)) {
				return [];
			}

			return collectionService.getCategoriesWithCount(
				groupIdNum,
				sortField,
				sortOrder,
			);
		},
		enabled: isEnabled,
		placeholderData: (previousData, previousQuery) =>
			previousQuery &&
			isCategoryQueryForGroup(previousQuery.queryKey, queryGroupId)
				? previousData
				: undefined,
	});
}

function useCategoryGameIds(categoryId: number | null) {
	return useQuery({
		queryKey: collectionKeys.games(categoryId ?? 0),
		queryFn: async () => {
			if (!categoryId || categoryId < 0) {
				return [];
			}

			return collectionService.getGamesInCollection(categoryId);
		},
		enabled: categoryId !== null && categoryId > 0,
	});
}

function useGameCategoryIds(gameId: number | null) {
	return useQuery({
		queryKey: collectionKeys.gameCategories(gameId ?? 0),
		queryFn: async () => {
			if (!gameId) {
				return [];
			}

			return collectionService.getGameCollectionIds(gameId);
		},
		enabled: gameId !== null && gameId > 0,
	});
}

/**
 * 从收藏分类中获取游戏 ID 列表
 *
 * 支持虚拟分类（负数 ID）和真实分类（正数 ID）。
 * 返回原始 ID 列表，不做 NSFW 过滤（收藏夹显示全部内容）。
 */
function useCategoryGames(
	selectedCategory: SelectedCategory,
	gameIndex: Pick<GameIndex, "developerGameIdsByName">,
) {
	const realCategoryId =
		selectedCategory?.type === "real" ? selectedCategory.id : null;
	const categoryGameIdsQuery = useCategoryGameIds(realCategoryId);

	const data = useMemo((): number[] => {
		if (!selectedCategory) {
			return [];
		}

		if (selectedCategory.type === "developer") {
			// 虚拟分类：直接从 GameIndex 中读取预构建 ID 列表
			return getDeveloperCategoryGameIds(selectedCategory.key, gameIndex);
		}

		// 真实分类：直接返回 ID 列表
		return categoryGameIdsQuery.data ?? [];
	}, [categoryGameIdsQuery.data, gameIndex, selectedCategory]);

	return {
		data,
		isLoading: realCategoryId !== null && categoryGameIdsQuery.isLoading,
		isError: realCategoryId !== null && categoryGameIdsQuery.isError,
		error: categoryGameIdsQuery.error,
	};
}

function useCreateGroup() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ name }: { name: string }) =>
			collectionService.createCollection(name, null, 0),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: collectionKeys.groups() });
		},
	});
}

function useDeleteGroup() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (groupId: number) =>
			collectionService.deleteCollection(groupId),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: collectionKeys.groups() });
			queryClient.invalidateQueries({ queryKey: collectionKeys.all });
		},
	});
}

function useRenameGroup() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ groupId, newName }: { groupId: number; newName: string }) =>
			collectionService.updateCollection(groupId, newName),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: collectionKeys.groups() });
		},
	});
}

function useCreateCategory() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ name, groupId }: { name: string; groupId: number }) =>
			collectionService.createCollection(name, groupId, 0),
		onSuccess: (_, { groupId }) => {
			queryClient.invalidateQueries({
				queryKey: collectionKeys.categories(groupId.toString()),
			});
		},
	});
}

function useDeleteCategory() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			categoryId,
			groupId: _groupId,
		}: {
			categoryId: number;
			groupId?: string | null;
		}) => collectionService.deleteCollection(categoryId),
		onSuccess: (_, { categoryId, groupId }) => {
			queryClient.invalidateQueries({
				queryKey: collectionKeys.games(categoryId),
				exact: true,
			});
			if (groupId) {
				queryClient.invalidateQueries({
					queryKey: collectionKeys.categories(groupId),
				});
				queryClient.invalidateQueries({
					queryKey: collectionKeys.groups(),
				});
			} else {
				queryClient.invalidateQueries({ queryKey: collectionKeys.all });
			}
		},
	});
}

function useRenameCategory() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			categoryId,
			newName,
		}: {
			categoryId: number;
			newName: string;
		}) => collectionService.updateCollection(categoryId, newName),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: collectionKeys.all });
		},
	});
}

function useAddGamesToCategories() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			gameIds,
			categoryIds,
		}: {
			gameIds: number[];
			categoryIds: number[];
		}) => collectionService.addGamesToCollections(gameIds, categoryIds),
		onSuccess: (_, { gameIds, categoryIds }) => {
			for (const categoryId of categoryIds) {
				queryClient.invalidateQueries({
					queryKey: collectionKeys.games(categoryId),
					exact: true,
				});
			}
			for (const gameId of gameIds) {
				queryClient.invalidateQueries({
					queryKey: collectionKeys.gameCategories(gameId),
					exact: true,
				});
			}
			queryClient.invalidateQueries({ queryKey: collectionKeys.all });
		},
	});
}

function useSetGameCategories() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			gameId,
			categoryIds,
		}: {
			gameId: number;
			categoryIds: number[];
		}) => collectionService.setGameCollections(gameId, categoryIds),
		onSuccess: (_, { gameId }) => {
			queryClient.invalidateQueries({
				queryKey: collectionKeys.gameCategories(gameId),
				exact: true,
			});
			queryClient.invalidateQueries({ queryKey: collectionKeys.all });
		},
	});
}

function useRemoveGamesFromCategory() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			categoryId,
			gameIds,
		}: {
			categoryId: number;
			gameIds: number[];
		}) => collectionService.removeGamesFromCollection(gameIds, categoryId),
		onSuccess: (_, { categoryId, gameIds }) => {
			queryClient.invalidateQueries({
				queryKey: collectionKeys.games(categoryId),
				exact: true,
			});
			for (const gameId of gameIds) {
				queryClient.invalidateQueries({
					queryKey: collectionKeys.gameCategories(gameId),
					exact: true,
				});
			}
			queryClient.invalidateQueries({ queryKey: collectionKeys.all });
		},
	});
}

function useUpdateCategoryGames() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			categoryId,
			gameIds,
		}: {
			categoryId: number;
			gameIds: number[];
		}) => collectionService.updateCategoryGames(gameIds, categoryId),
		onMutate: async ({ categoryId, gameIds }) => {
			await queryClient.cancelQueries({
				queryKey: collectionKeys.games(categoryId),
			});
			const previousGameIds = queryClient.getQueryData<number[]>(
				collectionKeys.games(categoryId),
			);
			queryClient.setQueryData(collectionKeys.games(categoryId), gameIds);
			return { previousGameIds };
		},
		onError: (_error, { categoryId }, context) => {
			if (context?.previousGameIds) {
				queryClient.setQueryData(
					collectionKeys.games(categoryId),
					context.previousGameIds,
				);
			}
		},
		onSuccess: (_, { categoryId }) => {
			queryClient.invalidateQueries({
				queryKey: collectionKeys.games(categoryId),
				exact: true,
			});
			queryClient.invalidateQueries({ queryKey: collectionKeys.all });
		},
	});
}

export {
	useAddGamesToCategories,
	useCategories,
	useCategoryGameIds,
	useCategoryGames,
	useCreateCategory,
	useCreateGroup,
	useDeleteCategory,
	useDeleteGroup,
	useGameCategoryIds,
	useGroups,
	useGroupsWithCount,
	useRemoveGamesFromCategory,
	useRenameCategory,
	useRenameGroup,
	useSetGameCategories,
	useUpdateCategoryGames,
};
