import type { GameData, GameSession } from "@/types";
import { PlayStatus } from "@/types/collection";
import { getLocalDateString } from "@/utils/dateTime";
import {
	getGameCover,
	getGameDisplayName,
	getGameNsfwStatus,
} from "@/utils/game";

export const RANDOM_GAME_SESSION_KEY = "reina-home-random-game";
export const ACTIVITY_PAGE_SIZE = 12;
export const EMPTY_LAST_PLAYED = new Map<number, number>();

const NSFW_COVER = "/images/NR18.png";

export type ActivityFilter = "all" | "play" | "add";

export interface ActivityItem {
	id: string;
	type: Exclude<ActivityFilter, "all">;
	gameId: number;
	gameTitle: string;
	imageUrl: string;
	time: number;
	date: string;
	duration?: number;
	count?: number;
}

export interface ActivityGroup {
	date: string;
	items: ActivityItem[];
}

export function getVisibleCover(
	game: GameData,
	replaceNsfwCover: boolean,
): string {
	return replaceNsfwCover && getGameNsfwStatus(game)
		? NSFW_COVER
		: getGameCover(game);
}

export function buildActivities(
	games: GameData[],
	sessions: GameSession[],
	replaceNsfwCover: boolean,
): ActivityItem[] {
	const gameById = new Map(games.map((game) => [game.id, game]));
	const activities = new Map<string, ActivityItem>();

	for (const session of sessions) {
		if (typeof session.end_time !== "number") continue;
		const game = gameById.get(session.game_id);
		if (!game) continue;

		const date = getLocalDateString(session.end_time);
		const key = `play-${game.id}-${date}`;
		const current = activities.get(key);
		if (current) {
			current.duration = (current.duration ?? 0) + (session.duration ?? 0);
			current.count = (current.count ?? 1) + 1;
			current.time = Math.max(current.time, session.end_time);
			continue;
		}

		activities.set(key, {
			id: key,
			type: "play",
			gameId: game.id,
			gameTitle: getGameDisplayName(game),
			imageUrl: getVisibleCover(game, replaceNsfwCover),
			time: session.end_time,
			date,
			duration: session.duration ?? 0,
			count: 1,
		});
	}

	for (const game of games) {
		if (!game.created_at) continue;
		activities.set(`add-${game.id}`, {
			id: `add-${game.id}`,
			type: "add",
			gameId: game.id,
			gameTitle: getGameDisplayName(game),
			imageUrl: getVisibleCover(game, replaceNsfwCover),
			time: game.created_at,
			date: getLocalDateString(game.created_at),
		});
	}

	return Array.from(activities.values()).toSorted((a, b) => b.time - a.time);
}

export function getFocusGame(
	games: GameData[],
	lastPlayedMap: ReadonlyMap<number, number>,
	runningGameIds: Set<number>,
): GameData | null {
	if (games.length === 0) return null;
	const gamesByLastPlayed = games.toSorted(
		(a, b) => (lastPlayedMap.get(b.id) ?? 0) - (lastPlayedMap.get(a.id) ?? 0),
	);
	const runningGame = gamesByLastPlayed.find((game) =>
		runningGameIds.has(game.id),
	);
	if (runningGame) return runningGame;
	const latestPlayedGame = gamesByLastPlayed.find((game) =>
		lastPlayedMap.has(game.id),
	);
	if (latestPlayedGame) return latestPlayedGame;

	return (
		games.find((game) => game.clear === PlayStatus.PLAYING) ??
		games.find((game) => Boolean(game.localpath)) ??
		games[0]
	);
}

export function getRecentGames(
	games: GameData[],
	lastPlayedMap: ReadonlyMap<number, number>,
): GameData[] {
	return games
		.filter((game) => lastPlayedMap.has(game.id))
		.toSorted(
			(a, b) => (lastPlayedMap.get(b.id) ?? 0) - (lastPlayedMap.get(a.id) ?? 0),
		)
		.slice(0, 4);
}

export function pickRandomGame(
	games: GameData[],
	excludedId?: number,
): GameData | null {
	const pool =
		games.length > 1 && excludedId !== undefined
			? games.filter((game) => game.id !== excludedId)
			: games;
	if (pool.length === 0) return null;
	return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

export function getWeekPlayTime(
	dailyStats: Array<{ date: string; playtime: number }> | undefined,
): number {
	if (!dailyStats) return 0;
	const now = new Date();
	const weekStart = new Date(now);
	const daysFromMonday = now.getDay() === 0 ? 6 : now.getDay() - 1;
	weekStart.setDate(now.getDate() - daysFromMonday);
	weekStart.setHours(0, 0, 0, 0);
	const startDate = getLocalDateString(Math.floor(weekStart.getTime() / 1000));
	return dailyStats.reduce(
		(total, item) => total + (item.date >= startDate ? item.playtime : 0),
		0,
	);
}
