import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getLocalDateString } from "@/utils";
import {
	getAllGameStatistics,
	getFormattedGameStats,
	getGameSessions,
} from "@/utils/gameStats";

export const statsKeys = {
	all: ["stats"] as const,
	gameStats: (gameId: number) => [...statsKeys.all, "game", gameId] as const,
	sessions: (gameId: number, limit: number) =>
		[...statsKeys.all, "sessions", gameId, limit] as const,
	playTimeSummary: () => [...statsKeys.all, "playTimeSummary"] as const,
	totalPlayTime: () => [...statsKeys.all, "totalPlayTime"] as const,
	weekPlayTime: () => [...statsKeys.all, "weekPlayTime"] as const,
	todayPlayTime: () => [...statsKeys.all, "todayPlayTime"] as const,
};

interface PlayTimeSummary {
	totalPlayTime: number;
	weekPlayTime: number;
	todayPlayTime: number;
}

async function getPlayTimeSummary(): Promise<PlayTimeSummary> {
	const statsMap = await getAllGameStatistics();
	let totalPlayTime = 0;
	let weekPlayTime = 0;
	let todayPlayTime = 0;
	const today = getLocalDateString();
	const now = new Date();

	const weekStart = new Date(now);
	const dayOfWeek = now.getDay();
	const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
	weekStart.setDate(now.getDate() - daysFromMonday);
	weekStart.setHours(0, 0, 0, 0);

	const weekStartDateStr = getLocalDateString(
		Math.floor(weekStart.getTime() / 1000),
	);

	for (const stats of statsMap.values()) {
		if (typeof stats.total_time === "number") {
			totalPlayTime += stats.total_time;
		}

		if (!Array.isArray(stats.daily_stats)) {
			continue;
		}

		for (const record of stats.daily_stats) {
			const playTime = record.playtime || 0;

			if (record.date && record.date >= weekStartDateStr) {
				weekPlayTime += playTime;
			}

			if (record.date === today) {
				todayPlayTime += playTime;
			}
		}
	}

	return {
		totalPlayTime,
		weekPlayTime,
		todayPlayTime,
	};
}

function usePlayTimeSummaryQuery() {
	return useQuery({
		queryKey: statsKeys.playTimeSummary(),
		queryFn: getPlayTimeSummary,
	});
}

function useGameStats(gameId: number | null) {
	return useQuery({
		queryKey: statsKeys.gameStats(gameId ?? 0),
		queryFn: async () => {
			if (!gameId) {
				return null;
			}

			return getFormattedGameStats(gameId);
		},
		enabled: gameId !== null,
	});
}

function useGameSessions(gameId: number | null, limit = 10) {
	return useQuery({
		queryKey: statsKeys.sessions(gameId ?? 0, limit),
		queryFn: async () => {
			if (!gameId) {
				return [];
			}

			return getGameSessions(gameId, limit);
		},
		enabled: gameId !== null,
	});
}

function useTotalPlayTime() {
	const playTimeSummaryQuery = usePlayTimeSummaryQuery();

	return useMemo(
		() => ({
			...playTimeSummaryQuery,
			data: playTimeSummaryQuery.data?.totalPlayTime ?? 0,
		}),
		[playTimeSummaryQuery],
	);
}

function useWeekPlayTime() {
	const playTimeSummaryQuery = usePlayTimeSummaryQuery();

	return useMemo(
		() => ({
			...playTimeSummaryQuery,
			data: playTimeSummaryQuery.data?.weekPlayTime ?? 0,
		}),
		[playTimeSummaryQuery],
	);
}

function useTodayPlayTime() {
	const playTimeSummaryQuery = usePlayTimeSummaryQuery();

	return useMemo(
		() => ({
			...playTimeSummaryQuery,
			data: playTimeSummaryQuery.data?.todayPlayTime ?? 0,
		}),
		[playTimeSummaryQuery],
	);
}

function usePlayTimeSummary() {
	const playTimeSummaryQuery = usePlayTimeSummaryQuery();

	const summary = useMemo(
		() => ({
			totalPlayTime: playTimeSummaryQuery.data?.totalPlayTime ?? 0,
			weekPlayTime: playTimeSummaryQuery.data?.weekPlayTime ?? 0,
			todayPlayTime: playTimeSummaryQuery.data?.todayPlayTime ?? 0,
			isLoading: playTimeSummaryQuery.isLoading,
		}),
		[playTimeSummaryQuery.data, playTimeSummaryQuery.isLoading],
	);

	return summary;
}

export {
	useGameSessions,
	useGameStats,
	usePlayTimeSummary,
	useTodayPlayTime,
	useTotalPlayTime,
	useWeekPlayTime,
};
