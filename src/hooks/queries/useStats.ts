import {
	keepPreviousData,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";
import { gameKeys } from "@/hooks/queries/useGames";
import {
	getAllGameLastPlayed,
	getAllGameStatistics,
	getFormattedGameStats,
	getRecentSessionsForGames,
} from "@/services/game/gameStats";
import { statsService } from "@/services/invoke";
import { getLocalDateString } from "@/utils/dateTime";

export const statsKeys = {
	all: ["stats"] as const,
	gameStats: (gameId: number) => [...statsKeys.all, "game", gameId] as const,
	sessions: (gameId: number, limit: number) =>
		[...statsKeys.all, "sessions", gameId, limit] as const,
	allGameLastPlayed: () => [...statsKeys.all, "allGameLastPlayed"] as const,
	recentSessionsForGames: (gameIds: number[], limit: number) =>
		[...statsKeys.all, "recentSessionsForGames", gameIds, limit] as const,
	playTimeSummary: () => [...statsKeys.all, "playTimeSummary"] as const,
	totalPlayTime: () => [...statsKeys.all, "totalPlayTime"] as const,
	weekPlayTime: () => [...statsKeys.all, "weekPlayTime"] as const,
	todayPlayTime: () => [...statsKeys.all, "todayPlayTime"] as const,
};

interface PlayTimeSummary {
	totalPlayTime: number;
	weekPlayTime: number;
	monthPlayTime: number;
	todayPlayTime: number;
}

async function getPlayTimeSummary(): Promise<PlayTimeSummary> {
	const statsMap = await getAllGameStatistics();
	let totalPlayTime = 0;
	let weekPlayTime = 0;
	let monthPlayTime = 0;
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
	const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
	const monthStartDateStr = getLocalDateString(
		Math.floor(monthStart.getTime() / 1000),
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

			if (record.date && record.date >= monthStartDateStr) {
				monthPlayTime += playTime;
			}

			if (record.date === today) {
				todayPlayTime += playTime;
			}
		}
	}

	return {
		totalPlayTime,
		weekPlayTime,
		monthPlayTime,
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

			return statsService.getGameSessions(gameId, limit);
		},
		enabled: gameId !== null,
		placeholderData: keepPreviousData,
	});
}

function useAllGameLastPlayedMap({ enabled }: { enabled: boolean }) {
	return useQuery({
		queryKey: statsKeys.allGameLastPlayed(),
		queryFn: getAllGameLastPlayed,
		enabled,
	});
}

function useRecentSessionsForGames(gameIds: number[], limit = 10) {
	return useQuery({
		queryKey: statsKeys.recentSessionsForGames(gameIds, limit),
		queryFn: () => getRecentSessionsForGames(gameIds, limit),
		enabled: gameIds.length > 0,
	});
}

function useCreateManualGameSession() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			gameId,
			startTime,
			duration,
		}: {
			gameId: number;
			startTime: number;
			duration: number;
		}) => statsService.createManualGameSession(gameId, startTime, duration),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: statsKeys.all }),
				queryClient.invalidateQueries({ queryKey: gameKeys.idLists() }),
			]);
		},
	});
}

function useDeleteGameSession() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (sessionId: number) =>
			statsService.deleteGameSession(sessionId),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: statsKeys.all }),
				queryClient.invalidateQueries({ queryKey: gameKeys.idLists() }),
			]);
		},
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
			monthPlayTime: playTimeSummaryQuery.data?.monthPlayTime ?? 0,
			todayPlayTime: playTimeSummaryQuery.data?.todayPlayTime ?? 0,
			isLoading: playTimeSummaryQuery.isLoading,
		}),
		[playTimeSummaryQuery.data, playTimeSummaryQuery.isLoading],
	);

	return summary;
}

export {
	useAllGameLastPlayedMap,
	useCreateManualGameSession,
	useDeleteGameSession,
	useGameSessions,
	useGameStats,
	usePlayTimeSummary,
	useRecentSessionsForGames,
	useTodayPlayTime,
	useTotalPlayTime,
	useWeekPlayTime,
};
