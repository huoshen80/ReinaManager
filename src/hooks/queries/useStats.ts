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
	totalPlayTime: () => [...statsKeys.all, "totalPlayTime"] as const,
	weekPlayTime: () => [...statsKeys.all, "weekPlayTime"] as const,
	todayPlayTime: () => [...statsKeys.all, "todayPlayTime"] as const,
};

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
		staleTime: 10_000,
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
		staleTime: 10_000,
	});
}

function useTotalPlayTime() {
	return useQuery({
		queryKey: statsKeys.totalPlayTime(),
		queryFn: async () => {
			const statsMap = await getAllGameStatistics();
			let total = 0;

			for (const stats of statsMap.values()) {
				if (typeof stats.total_time === "number") {
					total += stats.total_time;
				}
			}

			return total;
		},
		staleTime: 10_000,
	});
}

function useWeekPlayTime() {
	return useQuery({
		queryKey: statsKeys.weekPlayTime(),
		queryFn: async () => {
			const statsMap = await getAllGameStatistics();
			let total = 0;
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
				if (Array.isArray(stats.daily_stats)) {
					for (const record of stats.daily_stats) {
						if (record.date && record.date >= weekStartDateStr) {
							total += record.playtime || 0;
						}
					}
				}
			}

			return total;
		},
		staleTime: 10_000,
	});
}

function useTodayPlayTime() {
	return useQuery({
		queryKey: statsKeys.todayPlayTime(),
		queryFn: async () => {
			const statsMap = await getAllGameStatistics();
			let total = 0;
			const today = getLocalDateString();

			for (const stats of statsMap.values()) {
				if (Array.isArray(stats.daily_stats)) {
					const todayRecord = stats.daily_stats.find(
						(item) => item.date === today,
					);
					if (todayRecord) {
						total += todayRecord.playtime || 0;
					}
				}
			}

			return total;
		},
		staleTime: 10_000,
	});
}

function usePlayTimeSummary() {
	const totalPlayTimeQuery = useTotalPlayTime();
	const weekPlayTimeQuery = useWeekPlayTime();
	const todayPlayTimeQuery = useTodayPlayTime();

	const summary = useMemo(
		() => ({
			totalPlayTime: totalPlayTimeQuery.data ?? 0,
			weekPlayTime: weekPlayTimeQuery.data ?? 0,
			todayPlayTime: todayPlayTimeQuery.data ?? 0,
			isLoading:
				totalPlayTimeQuery.isLoading ||
				weekPlayTimeQuery.isLoading ||
				todayPlayTimeQuery.isLoading,
		}),
		[
			totalPlayTimeQuery.data,
			totalPlayTimeQuery.isLoading,
			weekPlayTimeQuery.data,
			weekPlayTimeQuery.isLoading,
			todayPlayTimeQuery.data,
			todayPlayTimeQuery.isLoading,
		],
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
