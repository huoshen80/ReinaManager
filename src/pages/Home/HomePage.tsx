/**
 * @file Home 页面
 * @description 应用首页，展示继续游戏、核心统计、动态与随机游戏。
 */

import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import { Box, Button, Paper, Typography } from "@mui/material";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { useGameLaunchFlow } from "@/hooks/features/games/useGameLaunchFlow";
import { useGameIndex } from "@/hooks/features/games/useGameListFacade";
import {
	statsKeys,
	useAllGameLastPlayedMap,
	useGameStats,
	usePlayTimeSummary,
} from "@/hooks/queries/useStats";
import { snackbar } from "@/providers/snackBar";
import { statsService } from "@/services/invoke";
import { useStore } from "@/store/appStore";
import { useGamePlayStore } from "@/store/gamePlayStore";
import { getUserErrorMessage } from "@/utils/errors";
import { applyNsfwFilter } from "@/utils/game";
import { ActivityPanel } from "./ActivityPanel";
import { FocusGamePanel } from "./FocusGamePanel";
import { HomeStats } from "./HomeStats";
import {
	ACTIVITY_PAGE_SIZE,
	type ActivityFilter,
	type ActivityGroup,
	buildActivities,
	EMPTY_LAST_PLAYED,
	getFocusGame,
	getRecentGames,
	getWeekPlayTime,
	pickRandomGame,
	RANDOM_GAME_SESSION_KEY,
} from "./homeData";
import { RandomGamePanel } from "./RandomGamePanel";

export const Home: React.FC = () => {
	const { t } = useTranslation();
	const { index, isLoading: isGameIndexLoading } = useGameIndex();
	const { launchGame, syncLocalPath } = useGameLaunchFlow();
	const { nsfwFilter, nsfwCoverReplace, openAddModal } = useStore(
		useShallow((state) => ({
			nsfwFilter: state.nsfwFilter,
			nsfwCoverReplace: state.nsfwCoverReplace,
			openAddModal: state.openAddModal,
		})),
	);
	const { gameRealTimeStates, runningGameIds, stopGame } = useGamePlayStore(
		useShallow((state) => ({
			gameRealTimeStates: state.gameRealTimeStates,
			runningGameIds: state.runningGameIds,
			stopGame: state.stopGame,
		})),
	);
	const {
		totalPlayTime,
		weekPlayTime,
		monthPlayTime,
		todayPlayTime,
		isLoading: isStatsLoading,
	} = usePlayTimeSummary();
	const [playTimePeriod, setPlayTimePeriod] = useState<"week" | "month">(
		"week",
	);
	const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
	const [visibleActivityCount, setVisibleActivityCount] =
		useState(ACTIVITY_PAGE_SIZE);
	const [selectedFocusGameId, setSelectedFocusGameId] = useState<number | null>(
		null,
	);
	const [randomGameId, setRandomGameId] = useState<number | null>(() => {
		if (typeof window === "undefined") return null;
		const stored = Number.parseInt(
			window.sessionStorage.getItem(RANDOM_GAME_SESSION_KEY) ?? "",
			10,
		);
		return Number.isFinite(stored) ? stored : null;
	});
	const [isStopping, setIsStopping] = useState(false);
	const activityScrollRef = useRef<HTMLDivElement>(null);
	const activitySentinelRef = useRef<HTMLDivElement>(null);

	const visibleGames = useMemo(
		() => applyNsfwFilter(index.displayList, nsfwFilter),
		[index.displayList, nsfwFilter],
	);
	const gameIds = useMemo(
		() => visibleGames.map((game) => game.id),
		[visibleGames],
	);
	const recentSessionsQuery = useInfiniteQuery({
		queryKey: [...statsKeys.all, "homeActivity", gameIds],
		queryFn: ({ pageParam }) =>
			statsService.getRecentSessionsForAll(
				gameIds,
				ACTIVITY_PAGE_SIZE,
				pageParam,
			),
		initialPageParam: 0,
		getNextPageParam: (lastPage, pages) =>
			lastPage.length < ACTIVITY_PAGE_SIZE
				? undefined
				: pages.length * ACTIVITY_PAGE_SIZE,
		enabled: gameIds.length > 0,
	});
	const sessions = useMemo(
		() => recentSessionsQuery.data?.pages.flat() ?? [],
		[recentSessionsQuery.data],
	);
	const lastPlayedQuery = useAllGameLastPlayedMap({
		enabled: visibleGames.length > 0,
	});
	const lastPlayedMap = lastPlayedQuery.data ?? EMPTY_LAST_PLAYED;
	const automaticFocusGame = useMemo(() => {
		if (lastPlayedQuery.isLoading && runningGameIds.size === 0) return null;
		return getFocusGame(visibleGames, lastPlayedMap, runningGameIds);
	}, [visibleGames, lastPlayedMap, lastPlayedQuery.isLoading, runningGameIds]);
	const focusGame = useMemo(
		() =>
			visibleGames.find((game) => game.id === selectedFocusGameId) ??
			automaticFocusGame,
		[visibleGames, selectedFocusGameId, automaticFocusGame],
	);
	const focusStatsQuery = useGameStats(focusGame?.id ?? null);
	const recentGames = useMemo(
		() => getRecentGames(visibleGames, lastPlayedMap),
		[visibleGames, lastPlayedMap],
	);
	const activities = useMemo(
		() => buildActivities(visibleGames, sessions, nsfwCoverReplace),
		[visibleGames, sessions, nsfwCoverReplace],
	);
	const filteredActivities = useMemo(
		() =>
			activityFilter === "all"
				? activities
				: activities.filter((activity) => activity.type === activityFilter),
		[activities, activityFilter],
	);
	const visibleActivities = useMemo(
		() => filteredActivities.slice(0, visibleActivityCount),
		[filteredActivities, visibleActivityCount],
	);
	const activityGroups = useMemo(() => {
		const groups: ActivityGroup[] = [];
		for (const activity of visibleActivities) {
			const lastGroup = groups.at(-1);
			if (lastGroup?.date === activity.date) {
				lastGroup.items.push(activity);
			} else {
				groups.push({ date: activity.date, items: [activity] });
			}
		}
		return groups;
	}, [visibleActivities]);
	const randomGame = useMemo(
		() => visibleGames.find((game) => game.id === randomGameId) ?? null,
		[visibleGames, randomGameId],
	);

	useEffect(() => {
		if (visibleGames.length === 0 || randomGame) return;
		const nextGame = pickRandomGame(visibleGames);
		if (!nextGame) return;
		setRandomGameId(nextGame.id);
		window.sessionStorage.setItem(RANDOM_GAME_SESSION_KEY, String(nextGame.id));
	}, [visibleGames, randomGame]);

	useEffect(() => {
		const root = activityScrollRef.current;
		const sentinel = activitySentinelRef.current;
		const canRevealLoadedItems =
			visibleActivityCount < filteredActivities.length;
		const canFetchSessions =
			activityFilter !== "add" &&
			recentSessionsQuery.hasNextPage &&
			!recentSessionsQuery.isFetchingNextPage;
		if (!root || !sentinel || (!canRevealLoadedItems && !canFetchSessions)) {
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries[0]?.isIntersecting) return;
				if (canRevealLoadedItems || canFetchSessions) {
					setVisibleActivityCount((count) => count + ACTIVITY_PAGE_SIZE);
				}
				if (canFetchSessions) {
					void recentSessionsQuery.fetchNextPage();
				}
			},
			{ root, rootMargin: "120px 0px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [
		activityFilter,
		filteredActivities.length,
		visibleActivityCount,
		recentSessionsQuery.fetchNextPage,
		recentSessionsQuery.hasNextPage,
		recentSessionsQuery.isFetchingNextPage,
	]);

	const handleShuffle = useCallback(() => {
		const nextGame = pickRandomGame(visibleGames, randomGameId ?? undefined);
		if (!nextGame) return;
		setRandomGameId(nextGame.id);
		window.sessionStorage.setItem(RANDOM_GAME_SESSION_KEY, String(nextGame.id));
	}, [visibleGames, randomGameId]);

	const handleActivityFilterChange = useCallback((filter: ActivityFilter) => {
		setActivityFilter(filter);
		setVisibleActivityCount(ACTIVITY_PAGE_SIZE);
	}, []);

	const handleStopFocusGame = useCallback(async () => {
		if (!focusGame) return;
		setIsStopping(true);
		try {
			const result = await stopGame(focusGame.id);
			if (!result.success) snackbar.error(result.message);
		} catch (error) {
			snackbar.error(
				`${t("components.LaunchModal.stopFailed", "游戏停止失败:")}: ${getUserErrorMessage(error, t)}`,
			);
		} finally {
			setIsStopping(false);
		}
	}, [focusGame, stopGame, t]);

	const focusIsRunning = focusGame ? runningGameIds.has(focusGame.id) : false;
	const focusRealTimeState = focusGame
		? gameRealTimeStates[focusGame.id]
		: undefined;
	const focusLastPlayed = focusGame
		? lastPlayedMap.get(focusGame.id)
		: undefined;
	const focusWeekTime = getWeekPlayTime(focusStatsQuery.data?.daily_stats);

	return (
		<Box className="box-border h-[calc(100dvh-64px)] max-h-[calc(100dvh-64px)] flex flex-col overflow-hidden bg-[var(--mui-palette-background-default)] p-4 min-[1200px]:p-5">
			<HomeStats
				totalGames={visibleGames.length}
				totalPlayTime={totalPlayTime}
				todayPlayTime={todayPlayTime}
				weekPlayTime={weekPlayTime}
				monthPlayTime={monthPlayTime}
				playTimePeriod={playTimePeriod}
				onPlayTimePeriodChange={setPlayTimePeriod}
				gamesLoading={isGameIndexLoading}
				statsLoading={isStatsLoading}
			/>

			{!isGameIndexLoading && visibleGames.length === 0 ? (
				<Paper
					variant="outlined"
					className="mt-4 min-h-0 flex flex-1 flex-col items-center justify-center gap-4"
				>
					<SportsEsportsIcon className="!text-[52px] text-[var(--mui-palette-text-disabled)]" />
					<Typography variant="h6" fontWeight={700}>
						{t("components.Toolbar.Category.noGames", "暂无游戏")}
					</Typography>
					<Button
						variant="contained"
						startIcon={<AddCircleOutlineIcon />}
						onClick={() => openAddModal("")}
					>
						{t("components.AddModal.addGame", "添加游戏")}
					</Button>
				</Paper>
			) : (
				<Box className="mt-4 min-h-0 flex-1 grid grid-cols-[minmax(0,1.7fr)_minmax(300px,0.9fr)] items-stretch gap-4">
					<Box className="min-h-0 min-w-0 grid grid-rows-[minmax(0,1fr)_150px] gap-4">
						<FocusGamePanel
							game={focusGame}
							isRunning={focusIsRunning}
							realTimeState={focusRealTimeState}
							lastPlayed={focusLastPlayed}
							weekPlayTime={focusWeekTime}
							totalPlayTime={focusStatsQuery.data?.totalPlayTime}
							recentGames={recentGames}
							lastPlayedMap={lastPlayedMap}
							replaceNsfwCover={nsfwCoverReplace}
							isStopping={isStopping}
							onLaunch={(game) => void launchGame(game)}
							onStop={() => void handleStopFocusGame()}
							onSelectRecent={setSelectedFocusGameId}
						/>
						<RandomGamePanel
							game={randomGame}
							replaceNsfwCover={nsfwCoverReplace}
							isRunning={randomGame ? runningGameIds.has(randomGame.id) : false}
							onShuffle={handleShuffle}
							onLaunch={(game) => void launchGame(game)}
							onSyncLocalPath={(game) => void syncLocalPath(game)}
						/>
					</Box>
					<ActivityPanel
						filter={activityFilter}
						groups={activityGroups}
						loading={recentSessionsQuery.isLoading}
						fetchingMore={recentSessionsQuery.isFetchingNextPage}
						scrollRef={activityScrollRef}
						sentinelRef={activitySentinelRef}
						onFilterChange={handleActivityFilterChange}
					/>
				</Box>
			)}
		</Box>
	);
};
