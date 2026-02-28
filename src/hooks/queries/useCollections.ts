import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { getVirtualCategoryGames } from "@/hooks/common/useVirtualCollections";
import { collectionService } from "@/services";
import type { GameData } from "@/types";
import { applyNsfwFilter } from "@/utils";

export const collectionKeys = {
	all: ["collections"] as const,
	groups: () => [...collectionKeys.all, "groups"] as const,
	categories: (groupId: string) =>
		[...collectionKeys.all, "categories", groupId] as const,
	games: (categoryId: number) =>
		[...collectionKeys.all, "games", categoryId] as const,
	groupCounts: (groupIds: number[]) =>
		[...collectionKeys.all, "groupCounts", groupIds] as const,
};

function useGroups() {
	return useQuery({
		queryKey: collectionKeys.groups(),
		queryFn: () => collectionService.getGroups(),
	});
}

function useGroupGameCounts(groupIds: number[]) {
	return useQuery({
		queryKey: collectionKeys.groupCounts(groupIds),
		queryFn: () => collectionService.batchCountGamesInGroups(groupIds),
		enabled: groupIds.length > 0,
	});
}

function useCategories(groupId: string | null) {
	const isEnabled = Boolean(groupId) && !groupId?.startsWith("default_");

	return useQuery({
		queryKey: collectionKeys.categories(groupId ?? "none"),
		queryFn: async () => {
			if (!groupId || groupId.startsWith("default_")) {
				return [];
			}

			const groupIdNum = Number.parseInt(groupId, 10);
			if (Number.isNaN(groupIdNum)) {
				return [];
			}

			return collectionService.getCategoriesWithCount(groupIdNum);
		},
		enabled: isEnabled,
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

function useCategoryGames(
	categoryId: number | null,
	categoryName: string | null,
	allGames: GameData[],
	nsfwFilter: boolean,
) {
	const { t } = useTranslation();
	const categoryGameIdsQuery = useCategoryGameIds(categoryId);

	const data = useMemo(() => {
		if (categoryId === null) {
			return [];
		}

		if (categoryId < 0) {
			const virtualGames = getVirtualCategoryGames(
				categoryId,
				categoryName,
				allGames,
				t,
			);
			return applyNsfwFilter(virtualGames, nsfwFilter);
		}

		const ids = categoryGameIdsQuery.data ?? [];
		const games = ids
			.map((id) => allGames.find((game) => game.id === id))
			.filter((game): game is GameData => Boolean(game));

		return applyNsfwFilter(games, nsfwFilter);
	}, [
		allGames,
		categoryGameIdsQuery.data,
		categoryId,
		categoryName,
		nsfwFilter,
		t,
	]);

	return {
		data,
		isLoading:
			categoryId !== null && categoryId > 0 && categoryGameIdsQuery.isLoading,
	};
}

function useCreateGroup() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({ name, icon }: { name: string; icon?: string }) =>
			collectionService.createCollection(name, null, 0, icon ?? null),
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
		mutationFn: ({
			name,
			groupId,
			icon,
		}: {
			name: string;
			groupId: number;
			icon?: string;
		}) => collectionService.createCollection(name, groupId, 0, icon ?? null),
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
	useCategories,
	useCategoryGameIds,
	useCategoryGames,
	useCreateCategory,
	useCreateGroup,
	useDeleteCategory,
	useDeleteGroup,
	useGroupGameCounts,
	useGroups,
	useRenameCategory,
	useRenameGroup,
	useUpdateCategoryGames,
};
