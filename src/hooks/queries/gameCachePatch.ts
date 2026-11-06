import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { getDisplayPreferences } from "@/metadata/data/displayPreferences";
import { useStore } from "@/store/appStore";
import type { FullGameData } from "@/types";
import type { GameIndex } from "@/utils/game/gameIndex";
import {
	getGameIndex,
	patchGameIndex,
	patchManyGameIndex,
	removeGamesFromIndex,
	setGameIndexCache,
} from "@/utils/game/gameIndex";

interface GameCacheKeys {
	all: QueryKey;
	index: () => QueryKey;
}

function getCurrentIndex(
	queryClient: QueryClient,
	keys: GameCacheKeys,
	currentGames: FullGameData[],
): GameIndex {
	const preferences = getDisplayPreferences(useStore.getState());
	const cached = queryClient.getQueryData<GameIndex>(keys.index());
	return cached?.rawList === currentGames &&
		cached.preferences.key === preferences.key
		? cached
		: getGameIndex(currentGames, preferences);
}

function commitGameCaches(
	queryClient: QueryClient,
	keys: GameCacheKeys,
	nextGames: FullGameData[],
	nextIndex: GameIndex,
): void {
	queryClient.setQueryData(keys.all, nextGames);
	const storedGames =
		queryClient.getQueryData<FullGameData[]>(keys.all) ?? nextGames;
	const storedIndex = { ...nextIndex, rawList: storedGames };
	setGameIndexCache(storedGames, storedIndex);
	queryClient.setQueryData(keys.index(), storedIndex);
}

export function patchGameCaches(
	queryClient: QueryClient,
	keys: GameCacheKeys,
	updatedFullGame: FullGameData,
): void {
	const currentGames = queryClient.getQueryData<FullGameData[]>(keys.all);
	if (!currentGames) return;

	const nextGames = currentGames.map((game) =>
		game.id === updatedFullGame.id ? updatedFullGame : game,
	);
	const nextIndex = patchGameIndex(
		getCurrentIndex(queryClient, keys, currentGames),
		updatedFullGame,
	);
	commitGameCaches(queryClient, keys, nextGames, nextIndex);
}

export function patchManyGameCaches(
	queryClient: QueryClient,
	keys: GameCacheKeys,
	updatedFullGames: FullGameData[],
): void {
	if (updatedFullGames.length === 0) return;
	const currentGames = queryClient.getQueryData<FullGameData[]>(keys.all);
	if (!currentGames) return;

	const updatesById = new Map(
		updatedFullGames.map((game) => [game.id, game] as const),
	);

	const nextGames = currentGames.map(
		(game) => updatesById.get(game.id) ?? game,
	);
	const nextIndex = patchManyGameIndex(
		getCurrentIndex(queryClient, keys, currentGames),
		updatedFullGames,
	);
	commitGameCaches(queryClient, keys, nextGames, nextIndex);
}

export function appendGamesToCaches(
	queryClient: QueryClient,
	keys: GameCacheKeys,
	insertedFullGames: FullGameData[],
): boolean {
	if (insertedFullGames.length === 0) return false;
	const currentGames = queryClient.getQueryData<FullGameData[]>(keys.all);
	if (!currentGames) return false;

	const currentIds = new Set(currentGames.map((game) => game.id));
	const newGames = insertedFullGames.filter((game) => !currentIds.has(game.id));
	if (newGames.length === 0) return true;

	const nextGames = [...currentGames, ...newGames];
	const nextIndex = patchManyGameIndex(
		getCurrentIndex(queryClient, keys, currentGames),
		newGames,
	);
	commitGameCaches(queryClient, keys, nextGames, nextIndex);

	return true;
}

export function removeGamesFromCaches(
	queryClient: QueryClient,
	keys: GameCacheKeys,
	gameIds: number[],
): void {
	if (gameIds.length === 0) return;
	const currentGames = queryClient.getQueryData<FullGameData[]>(keys.all);
	if (!currentGames) return;

	const removedIds = new Set(gameIds);

	const nextGames = currentGames.filter((game) => !removedIds.has(game.id));
	const nextIndex = removeGamesFromIndex(
		getCurrentIndex(queryClient, keys, currentGames),
		gameIds,
	);
	commitGameCaches(queryClient, keys, nextGames, nextIndex);
}
