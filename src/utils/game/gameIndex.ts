import { REGISTERED_SOURCE_KEYS } from "@/metadata";
import { getDisplayGameData } from "@/metadata/data/dataTransform";
import { getSourceRecordMap } from "@/metadata/sourceRecord";
import type { FullGameData, GameData, SourceType } from "@/types";
import type { Category } from "@/types/collection";

export type SourceAvailability = Record<SourceType, boolean>;

export interface GameIndex {
	rawList: FullGameData[];
	rawById: Map<number, FullGameData>;
	displayList: GameData[];
	displayById: Map<number, GameData>;
	ids: number[];
	sourceAvailabilityById: Map<number, SourceAvailability>;
	developerCategories: Category[];
	developerGameIdsByName: Map<string, number[]>;
}

export const EMPTY_SOURCE_AVAILABILITY = Object.fromEntries(
	REGISTERED_SOURCE_KEYS.map((source) => [source, false]),
) as SourceAvailability;

export const EMPTY_GAME_INDEX: GameIndex = {
	rawList: [],
	rawById: new Map(),
	displayList: [],
	displayById: new Map(),
	ids: [],
	sourceAvailabilityById: new Map(),
	developerCategories: [],
	developerGameIdsByName: new Map(),
};

const gameIndexCache = new WeakMap<FullGameData[], GameIndex>();
export const UNKNOWN_DEVELOPER_KEY = "__unknown_developer__";
const DEVELOPER_CATEGORY_ID_START = -101;

export function setGameIndexCache(
	fullGames: FullGameData[],
	index: GameIndex,
): void {
	gameIndexCache.set(fullGames, index);
}

function buildSourceAvailability(game: FullGameData): SourceAvailability {
	const availability: SourceAvailability = { ...EMPTY_SOURCE_AVAILABILITY };
	const sourceMap = getSourceRecordMap(game);

	for (const source of REGISTERED_SOURCE_KEYS) {
		availability[source] = sourceMap.get(source)?.data != null;
	}

	return availability;
}

export function getDeveloperNames(
	developer: string | null | undefined,
	unknownDeveloper: string,
): string[] {
	const developerStr = developer || unknownDeveloper;
	const developers: string[] = [];
	for (const dev of developerStr.split("/")) {
		const trimmed = dev.trim();
		if (trimmed) {
			developers.push(trimmed);
		}
	}

	return developers.length > 0 ? developers : [unknownDeveloper];
}

function buildDeveloperIndex(games: GameData[], unknownDeveloper: string) {
	const developerGameIdsByName = new Map<string, number[]>();

	for (const game of games) {
		for (const developer of getDeveloperNames(
			game.developer,
			unknownDeveloper,
		)) {
			const ids = developerGameIdsByName.get(developer) ?? [];
			ids.push(game.id);
			developerGameIdsByName.set(developer, ids);
		}
	}

	const developerCategories = Array.from(developerGameIdsByName.entries())
		.toSorted((a, b) => b[1].length - a[1].length)
		.map(([name, gameIds], index) => ({
			id: DEVELOPER_CATEGORY_ID_START - index,
			name,
			sort_order: 0,
			game_count: gameIds.length,
		}));

	return {
		developerCategories,
		developerGameIdsByName,
	};
}

export function buildGameIndex(fullGames: FullGameData[]): GameIndex {
	if (fullGames.length === 0) {
		return EMPTY_GAME_INDEX;
	}

	const rawById = new Map<number, FullGameData>();
	const displayList: GameData[] = [];
	const displayById = new Map<number, GameData>();
	const ids: number[] = [];
	const sourceAvailabilityById = new Map<number, SourceAvailability>();

	for (const fullGame of fullGames) {
		const displayGame = getDisplayGameData(fullGame);

		rawById.set(fullGame.id, fullGame);
		displayList.push(displayGame);
		displayById.set(displayGame.id, displayGame);
		ids.push(displayGame.id);
		sourceAvailabilityById.set(fullGame.id, buildSourceAvailability(fullGame));
	}
	const developerIndex = buildDeveloperIndex(
		displayList,
		UNKNOWN_DEVELOPER_KEY,
	);

	return {
		rawList: fullGames,
		rawById,
		displayList,
		displayById,
		ids,
		sourceAvailabilityById,
		developerCategories: developerIndex.developerCategories,
		developerGameIdsByName: developerIndex.developerGameIdsByName,
	};
}

function replaceById<T extends { id: number }>(
	items: T[],
	id: number,
	nextItem: T,
): T[] {
	let replaced = false;
	const nextItems = items.map((item) => {
		if (item.id !== id) return item;
		replaced = true;
		return nextItem;
	});

	return replaced ? nextItems : [...items, nextItem];
}

function removeById<T extends { id: number }>(
	items: T[],
	ids: Set<number>,
): T[] {
	return items.filter((item) => !ids.has(item.id));
}

function withDeveloperIndex(
	index: GameIndex,
	displayList: GameData[],
): GameIndex {
	const developerIndex = buildDeveloperIndex(
		displayList,
		UNKNOWN_DEVELOPER_KEY,
	);
	return {
		...index,
		developerCategories: developerIndex.developerCategories,
		developerGameIdsByName: developerIndex.developerGameIdsByName,
	};
}

export function patchGameIndex(
	index: GameIndex,
	updatedFullGame: FullGameData,
): GameIndex {
	if (index === EMPTY_GAME_INDEX) {
		return buildGameIndex([updatedFullGame]);
	}

	const gameId = updatedFullGame.id;
	const previousDisplayGame = index.displayById.get(gameId);
	const updatedDisplayGame = getDisplayGameData(updatedFullGame);

	const rawList = replaceById(index.rawList, gameId, updatedFullGame);
	const displayList = replaceById(
		index.displayList,
		gameId,
		updatedDisplayGame,
	);

	const rawById = new Map(index.rawById);
	rawById.set(gameId, updatedFullGame);

	const displayById = new Map(index.displayById);
	displayById.set(gameId, updatedDisplayGame);

	const ids = index.rawById.has(gameId) ? index.ids : [...index.ids, gameId];

	const sourceAvailabilityById = new Map(index.sourceAvailabilityById);
	sourceAvailabilityById.set(gameId, buildSourceAvailability(updatedFullGame));

	const nextIndex: GameIndex = {
		...index,
		rawList,
		rawById,
		displayList,
		displayById,
		ids,
		sourceAvailabilityById,
	};

	if (
		!previousDisplayGame ||
		previousDisplayGame.developer !== updatedDisplayGame.developer
	) {
		return withDeveloperIndex(nextIndex, displayList);
	}

	return nextIndex;
}

export function patchManyGameIndex(
	index: GameIndex,
	updatedFullGames: FullGameData[],
): GameIndex {
	if (updatedFullGames.length === 0) return index;

	if (index === EMPTY_GAME_INDEX) {
		return buildGameIndex(updatedFullGames);
	}

	const updatedRawById = new Map(
		updatedFullGames.map((game) => [game.id, game] as const),
	);
	const updatedDisplayById = new Map<number, GameData>();
	const rawById = new Map(index.rawById);
	const displayById = new Map(index.displayById);
	const sourceAvailabilityById = new Map(index.sourceAvailabilityById);
	const newGames: FullGameData[] = [];
	const newGameIds = new Set<number>();
	let developerChanged = false;

	for (const fullGame of updatedFullGames) {
		const gameId = fullGame.id;
		const previousDisplayGame = index.displayById.get(gameId);
		const updatedDisplayGame = getDisplayGameData(fullGame);

		updatedDisplayById.set(gameId, updatedDisplayGame);
		rawById.set(gameId, fullGame);
		displayById.set(gameId, updatedDisplayGame);
		sourceAvailabilityById.set(gameId, buildSourceAvailability(fullGame));

		if (!index.rawById.has(gameId) && !newGameIds.has(gameId)) {
			newGames.push(fullGame);
			newGameIds.add(gameId);
		}

		if (
			!previousDisplayGame ||
			previousDisplayGame.developer !== updatedDisplayGame.developer
		) {
			developerChanged = true;
		}
	}

	const rawList = [
		...index.rawList.map((game) => updatedRawById.get(game.id) ?? game),
		...newGames,
	];
	const displayList = [
		...index.displayList.map((game) => updatedDisplayById.get(game.id) ?? game),
		...newGames.map((game) => updatedDisplayById.get(game.id) as GameData),
	];
	const ids =
		newGames.length === 0
			? index.ids
			: [...index.ids, ...newGames.map((game) => game.id)];

	const nextIndex: GameIndex = {
		...index,
		rawList,
		rawById,
		displayList,
		displayById,
		ids,
		sourceAvailabilityById,
	};

	return developerChanged
		? withDeveloperIndex(nextIndex, displayList)
		: nextIndex;
}

export function removeGamesFromIndex(
	index: GameIndex,
	gameIds: number[],
): GameIndex {
	if (index === EMPTY_GAME_INDEX || gameIds.length === 0) return index;

	const removedIds = new Set(gameIds);
	const rawList = removeById(index.rawList, removedIds);
	const displayList = removeById(index.displayList, removedIds);
	const ids = index.ids.filter((id) => !removedIds.has(id));

	const rawById = new Map(index.rawById);
	const displayById = new Map(index.displayById);
	const sourceAvailabilityById = new Map(index.sourceAvailabilityById);

	for (const id of removedIds) {
		rawById.delete(id);
		displayById.delete(id);
		sourceAvailabilityById.delete(id);
	}

	return withDeveloperIndex(
		{
			...index,
			rawList,
			rawById,
			displayList,
			displayById,
			ids,
			sourceAvailabilityById,
		},
		displayList,
	);
}

export function removeGameFromIndex(
	index: GameIndex,
	gameId: number,
): GameIndex {
	return removeGamesFromIndex(index, [gameId]);
}

export function getGameIndex(fullGames: FullGameData[] | undefined): GameIndex {
	if (!fullGames || fullGames.length === 0) {
		return EMPTY_GAME_INDEX;
	}

	const cached = gameIndexCache.get(fullGames);
	if (cached) {
		return cached;
	}

	const index = buildGameIndex(fullGames);
	gameIndexCache.set(fullGames, index);
	return index;
}
