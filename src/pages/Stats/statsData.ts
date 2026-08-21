import type { GameData, GameStatistics } from "@/types";
import { PlayStatus } from "@/types/collection";

export type StatisticsRange = "7D" | "30D" | "1Y" | "CUSTOM";

export interface StatisticsDateRange {
	startDate: string;
	endDate: string;
	groupByMonth: boolean;
}

export interface StatisticsTrendPoint {
	date: string;
	playtime: number;
	[key: string]: string | number;
}

export interface StatisticsRankingItem {
	game: GameData;
	playtime: number;
}

export interface StatisticsOverviewData {
	totalPlayTime: number;
	playedGames: number;
	completedGames: number;
	newGames: number;
	activeDays: number;
	averageActiveDayPlayTime: number;
	ranking: StatisticsRankingItem[];
	trend: StatisticsTrendPoint[];
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function formatLocalDate(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatLocalMonth(date: Date): string {
	return formatLocalDate(date).slice(0, 7);
}

function getPresetRangeStart(
	range: Exclude<StatisticsRange, "CUSTOM">,
	today: Date,
): Date {
	const start = new Date(
		today.getFullYear(),
		today.getMonth(),
		today.getDate(),
	);

	if (range === "7D") {
		start.setDate(start.getDate() - 6);
	} else if (range === "30D") {
		start.setDate(start.getDate() - 29);
	} else {
		start.setDate(1);
		start.setMonth(start.getMonth() - 11);
	}

	return start;
}

function parseLocalDate(dateKey: string): Date | null {
	if (!DATE_PATTERN.test(dateKey)) return null;
	const date = new Date(`${dateKey}T00:00:00`);
	return Number.isNaN(date.getTime()) || formatLocalDate(date) !== dateKey
		? null
		: date;
}

export function resolveStatisticsDateRange(
	range: StatisticsRange,
	customStartDate?: string,
	customEndDate?: string,
	now = new Date(),
): StatisticsDateRange | null {
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	if (range !== "CUSTOM") {
		const start = getPresetRangeStart(range, today);
		return {
			startDate: formatLocalDate(start),
			endDate: formatLocalDate(today),
			groupByMonth: range === "1Y",
		};
	}

	const start = customStartDate ? parseLocalDate(customStartDate) : null;
	const end = customEndDate ? parseLocalDate(customEndDate) : null;
	if (!start || !end || start > end || end > today) return null;

	const spanDays =
		Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
	return {
		startDate: customStartDate as string,
		endDate: customEndDate as string,
		groupByMonth: spanDays > 90,
	};
}

function buildTrendKeys(dateRange: StatisticsDateRange): string[] {
	const keys: string[] = [];
	const start = parseLocalDate(dateRange.startDate) as Date;
	const end = parseLocalDate(dateRange.endDate) as Date;

	if (dateRange.groupByMonth) {
		const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
		const finalMonth = formatLocalMonth(end);
		while (formatLocalMonth(cursor) <= finalMonth) {
			keys.push(formatLocalMonth(cursor));
			cursor.setMonth(cursor.getMonth() + 1);
		}
		return keys;
	}

	const cursor = new Date(start);
	while (cursor <= end) {
		keys.push(formatLocalDate(cursor));
		cursor.setDate(cursor.getDate() + 1);
	}
	return keys;
}

export function buildStatisticsOverview(
	games: readonly GameData[],
	statistics: ReadonlyMap<number, GameStatistics>,
	dateRange: StatisticsDateRange,
): StatisticsOverviewData {
	const startKey = dateRange.startDate;
	const endKey = dateRange.endDate;
	const playtimeByDate = new Map<string, number>();
	const playtimeByGame = new Map<number, number>();
	const visibleGamesById = new Map(games.map((game) => [game.id, game]));

	for (const [gameId, stats] of statistics) {
		if (!visibleGamesById.has(gameId) || !Array.isArray(stats.daily_stats)) {
			continue;
		}

		for (const record of stats.daily_stats) {
			if (
				!DATE_PATTERN.test(record.date) ||
				record.date < startKey ||
				record.date > endKey ||
				!Number.isFinite(record.playtime) ||
				record.playtime <= 0
			) {
				continue;
			}

			playtimeByDate.set(
				record.date,
				(playtimeByDate.get(record.date) ?? 0) + record.playtime,
			);
			playtimeByGame.set(
				gameId,
				(playtimeByGame.get(gameId) ?? 0) + record.playtime,
			);
		}
	}

	let totalPlayTime = 0;
	for (const playtime of playtimeByDate.values()) {
		totalPlayTime += playtime;
	}

	const ranking = Array.from(playtimeByGame, ([gameId, playtime]) => ({
		game: visibleGamesById.get(gameId) as GameData,
		playtime,
	})).toSorted(
		(left, right) =>
			right.playtime - left.playtime || left.game.id - right.game.id,
	);

	const trendValues = new Map<string, number>();
	for (const [date, playtime] of playtimeByDate) {
		const trendKey = dateRange.groupByMonth ? date.slice(0, 7) : date;
		trendValues.set(trendKey, (trendValues.get(trendKey) ?? 0) + playtime);
	}

	const activeDays = playtimeByDate.size;
	let completedGames = 0;
	for (const gameId of playtimeByGame.keys()) {
		if (visibleGamesById.get(gameId)?.clear === PlayStatus.PLAYED) {
			completedGames += 1;
		}
	}
	let newGames = 0;
	for (const game of games) {
		if (typeof game.created_at !== "number") continue;
		const createdDate = formatLocalDate(new Date(game.created_at * 1000));
		if (createdDate >= startKey && createdDate <= endKey) {
			newGames += 1;
		}
	}

	return {
		totalPlayTime,
		playedGames: playtimeByGame.size,
		completedGames,
		newGames,
		activeDays,
		averageActiveDayPlayTime:
			activeDays === 0 ? 0 : Math.round(totalPlayTime / activeDays),
		ranking,
		trend: buildTrendKeys(dateRange).map((date) => ({
			date,
			playtime: trendValues.get(date) ?? 0,
		})),
	};
}
