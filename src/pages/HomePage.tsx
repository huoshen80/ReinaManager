/**
 * @file Home 页面
 * @description 应用首页，展示继续游戏、核心统计、动态与随机游戏。
 */

import AccessTimeIcon from "@mui/icons-material/AccessTime";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import CasinoOutlinedIcon from "@mui/icons-material/CasinoOutlined";
import HistoryIcon from "@mui/icons-material/History";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RefreshIcon from "@mui/icons-material/Refresh";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import StopIcon from "@mui/icons-material/Stop";
import SyncIcon from "@mui/icons-material/Sync";
import TimerIcon from "@mui/icons-material/Timer";
import TodayIcon from "@mui/icons-material/Today";
import {
	Avatar,
	Box,
	Button,
	ButtonBase,
	Chip,
	CircularProgress,
	IconButton,
	Paper,
	Skeleton,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography,
} from "@mui/material";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
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
import type { GameData, GameSession } from "@/types";
import { PlayStatus } from "@/types/collection";
import {
	formatDateLabel,
	formatPlayTime,
	formatRelativeTime,
	getLocalDateString,
	isRecentRelativeTime,
} from "@/utils/dateTime";
import { getUserErrorMessage } from "@/utils/errors";
import {
	applyNsfwFilter,
	getGameCover,
	getGameDisplayName,
	getGameNsfwStatus,
} from "@/utils/game";

const RANDOM_GAME_SESSION_KEY = "reina-home-random-game";
const NSFW_COVER = "/images/NR18.png";
const ACTIVITY_PAGE_SIZE = 12;
const EMPTY_LAST_PLAYED = new Map<number, number>();

type ActivityFilter = "all" | "play" | "add";

interface ActivityItem {
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

interface RunningGameTimerProps {
	currentSessionMinutes: number;
	currentSessionSeconds: number;
	startTime: number;
	timeTrackingMode: "playtime" | "elapsed";
}

function formatSessionTime(totalSeconds: number): string {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return hours > 0
		? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
		: `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function RunningGameTimer({
	currentSessionMinutes,
	currentSessionSeconds,
	startTime,
	timeTrackingMode,
}: RunningGameTimerProps) {
	const { t } = useTranslation();
	const [elapsedSeconds, setElapsedSeconds] = useState(() =>
		Math.max(0, Math.floor(Date.now() / 1000) - startTime),
	);

	useEffect(() => {
		if (timeTrackingMode !== "elapsed") return;
		const updateElapsed = () =>
			setElapsedSeconds(Math.max(0, Math.floor(Date.now() / 1000) - startTime));
		updateElapsed();
		const intervalId = window.setInterval(updateElapsed, 1000);
		return () => window.clearInterval(intervalId);
	}, [startTime, timeTrackingMode]);

	const totalSeconds =
		timeTrackingMode === "elapsed"
			? elapsedSeconds
			: currentSessionMinutes * 60 + currentSessionSeconds;

	return (
		<Box className="flex items-center gap-1.5">
			<TimerIcon fontSize="small" />
			<Typography className="text-[rgba(255,255,255,.78)] tabular-nums">
				{t("home.focus.currentSession", "本次游玩 {{time}}", {
					time: formatSessionTime(totalSeconds),
				})}
			</Typography>
		</Box>
	);
}

function getVisibleCover(game: GameData, replaceNsfwCover: boolean): string {
	return replaceNsfwCover && getGameNsfwStatus(game)
		? NSFW_COVER
		: getGameCover(game);
}

function buildActivities(
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

function getFocusGame(
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

function getRecentGames(
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

function pickRandomGame(
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

function getWeekPlayTime(
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

export const Home: React.FC = () => {
	const { t, i18n } = useTranslation();
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
		const groups: Array<{ date: string; items: ActivityItem[] }> = [];
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

	const getActivityDateLabel = (date: string) => {
		return formatDateLabel(date, {
			language: i18n.language,
			todayLabel: t("home.activity.today", "今天"),
			yesterdayLabel: t("home.activity.yesterday", "昨天"),
		});
	};

	const getActivityPlaySummary = (activity: ActivityItem) => {
		const relativeTime = formatRelativeTime(activity.time);
		const count = activity.count ?? 1;
		const duration = formatPlayTime(activity.duration ?? 0);
		const absoluteTime = new Date(activity.time * 1000).toLocaleDateString();

		if (relativeTime === absoluteTime) {
			return t(
				"home.activity.playSummaryCompact",
				"{{count}}次 · 共{{duration}}",
				{ count, duration },
			);
		}

		return t(
			"home.activity.playSummary",
			"{{time}} · {{count}}次 · 共{{duration}}",
			{ time: relativeTime, count, duration },
		);
	};

	const focusIsRunning = focusGame ? runningGameIds.has(focusGame.id) : false;
	const focusRealTimeState = focusGame
		? gameRealTimeStates[focusGame.id]
		: undefined;
	const focusLastPlayed = focusGame
		? lastPlayedMap.get(focusGame.id)
		: undefined;
	const focusHasPlayed = focusLastPlayed !== undefined;
	const focusWeekTime = getWeekPlayTime(focusStatsQuery.data?.daily_stats);
	const periodValue = playTimePeriod === "week" ? weekPlayTime : monthPlayTime;
	const stats = [
		{
			key: "games",
			label: t("home.stats.totalGames", "总游戏数"),
			value: visibleGames.length,
			icon: <SportsEsportsIcon />,
			loading: isGameIndexLoading,
		},
		{
			key: "total",
			label: t("home.stats.totalPlayTime", "总游戏时长"),
			value: formatPlayTime(totalPlayTime),
			icon: <AccessTimeIcon />,
			loading: isStatsLoading,
		},
		{
			key: "today",
			label: t("home.stats.todayPlayTime", "今日时长"),
			value: formatPlayTime(todayPlayTime),
			icon: <TodayIcon />,
			loading: isStatsLoading,
		},
		{
			key: "period",
			label:
				playTimePeriod === "week"
					? t("home.stats.weekPlayTime", "本周时长")
					: t("home.stats.monthPlayTime", "本月时长"),
			value: formatPlayTime(periodValue),
			icon: <CalendarMonthIcon />,
			loading: isStatsLoading,
		},
	];

	return (
		<Box className="box-border h-[calc(100dvh-64px)] max-h-[calc(100dvh-64px)] flex flex-col overflow-hidden bg-[var(--mui-palette-background-default)] p-4 min-[1200px]:p-5">
			<Paper
				variant="outlined"
				className="grid shrink-0 grid-cols-4 overflow-hidden"
			>
				{stats.map((stat, index) => (
					<Box
						key={stat.key}
						className="relative min-h-[88px] min-w-0 flex items-center gap-2 border-0 border-solid border-[var(--mui-palette-divider)] px-3 py-3.5 min-[1200px]:gap-3.5 min-[1200px]:px-4 min-[1536px]:px-6"
						sx={{
							"&::before": {
								content: '""',
								position: "absolute",
								left: 0,
								top: 18,
								bottom: 18,
								width: "1px",
								bgcolor: "divider",
								opacity: 0.55,
								display: index > 0 ? "block" : "none",
							},
						}}
					>
						<Box className="h-[42px] w-[42px] shrink-0 grid place-items-center min-[1200px]:h-12 min-[1200px]:w-12">
							{stat.icon}
						</Box>
						<Box className="min-w-0 flex-1">
							<Box className="flex w-full items-center gap-2">
								<Typography
									variant="body2"
									color="text.secondary"
									className="text-[13px] min-[1200px]:text-sm"
									noWrap
								>
									{stat.label}
								</Typography>
								{stat.key === "period" ? (
									<ToggleButtonGroup
										exclusive
										size="small"
										value={playTimePeriod}
										onChange={(_, value: "week" | "month" | null) => {
											if (value) setPlayTimePeriod(value);
										}}
										className="ml-auto shrink-0"
									>
										<ToggleButton
											value="week"
											className="!px-1.5 !py-0.5 !leading-6"
										>
											{t("home.stats.week", "周")}
										</ToggleButton>
										<ToggleButton
											value="month"
											className="!px-1.5 !py-0.5 !leading-6"
										>
											{t("home.stats.month", "月")}
										</ToggleButton>
									</ToggleButtonGroup>
								) : null}
							</Box>
							<Typography
								variant="h5"
								fontWeight={700}
								className="text-[22px] min-[1200px]:text-2xl"
								noWrap
								title={String(stat.value)}
							>
								{stat.loading ? <Skeleton width={90} /> : stat.value}
							</Typography>
						</Box>
					</Box>
				))}
			</Paper>

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
						<Paper
							variant="outlined"
							className="relative h-full min-h-0 overflow-hidden !bg-[var(--mui-palette-grey-900)] !text-white"
						>
							{focusGame ? (
								<>
									<Box
										component="img"
										src={getVisibleCover(focusGame, nsfwCoverReplace)}
										alt=""
										className="absolute inset-0 h-full w-full object-cover"
									/>
									<Box
										className="absolute inset-0"
										sx={{
											background:
												"linear-gradient(90deg, rgba(7, 13, 27, .94) 0%, rgba(7, 13, 27, .76) 42%, rgba(7, 13, 27, .18) 76%, rgba(7, 13, 27, .32) 100%)",
										}}
									/>
									<Box className="relative z-1 h-full flex flex-col p-5">
										<Chip
											label={
												focusIsRunning
													? t("home.focus.running", "正在运行")
													: focusHasPlayed
														? t("home.focus.continue", "继续游戏")
														: t("home.random.start", "启动游戏")
											}
											size="small"
											className="!self-start !bg-[rgba(37,99,235,.72)] !font-700 !text-white"
										/>
										<Typography
											component="h1"
											className="mt-3 max-w-[72%] line-clamp-2 text-[26px] leading-[1.2] font-800 min-[1200px]:text-[34px]"
											title={getGameDisplayName(focusGame)}
										>
											{getGameDisplayName(focusGame)}
										</Typography>
										<Box className="mt-2">
											{focusIsRunning && focusRealTimeState ? (
												<RunningGameTimer
													currentSessionMinutes={
														focusRealTimeState.currentSessionMinutes
													}
													currentSessionSeconds={
														focusRealTimeState.currentSessionSeconds
													}
													startTime={focusRealTimeState.startTime}
													timeTrackingMode={focusRealTimeState.timeTrackingMode}
												/>
											) : (
												<Typography className="text-[rgba(255,255,255,.78)]">
													{focusLastPlayed
														? t("home.focus.lastPlayed", "上次游玩：{{time}}", {
																time: formatRelativeTime(focusLastPlayed),
															})
														: t("home.focus.notPlayed", "还没有游玩记录")}
												</Typography>
											)}
										</Box>
										<Typography className="mt-1 text-[rgba(255,255,255,.78)]">
											{t(
												"home.focus.playTime",
												"本周 {{week}} · 总计 {{total}}",
												{
													week: formatPlayTime(focusWeekTime),
													total:
														focusStatsQuery.data?.totalPlayTime ??
														formatPlayTime(0),
												},
											)}
										</Typography>
										<Box className="mt-3 flex flex-wrap gap-2.5">
											{focusIsRunning ? (
												<Button
													variant="contained"
													color="error"
													startIcon={
														isStopping ? (
															<CircularProgress size={16} color="inherit" />
														) : (
															<StopIcon />
														)
													}
													disabled={isStopping}
													onClick={() => void handleStopFocusGame()}
												>
													{isStopping
														? t(
																"components.LaunchModal.stoppingGame",
																"停止游戏中...",
															)
														: t("components.LaunchModal.stopGame", "停止游戏")}
												</Button>
											) : (
												<Button
													variant="contained"
													startIcon={<PlayArrowIcon />}
													onClick={() => void launchGame(focusGame)}
												>
													{t("home.random.start", "启动游戏")}
												</Button>
											)}
											<Button
												component={Link}
												to={`/libraries/${focusGame.id}`}
												variant="outlined"
												startIcon={<InfoOutlinedIcon />}
												className="!border-[rgba(255,255,255,.55)] !text-white hover:!border-white hover:!bg-[rgba(255,255,255,.08)]"
											>
												{t("home.focus.details", "查看详情")}
											</Button>
										</Box>

										{recentGames.length > 0 ? (
											<Box className="mt-auto pt-2 [@media(max-height:705px)]:hidden">
												<Box className="mb-1.5 flex items-center gap-2">
													<HistoryIcon fontSize="small" />
													<Typography variant="body2" fontWeight={700}>
														{t("home.focus.recent", "最近玩过")}
													</Typography>
												</Box>
												<Box className="grid grid-cols-4 gap-2">
													{recentGames.map((game) => {
														const lastPlayed = lastPlayedMap.get(game.id);
														return (
															<ButtonBase
																key={game.id}
																onClick={() => setSelectedFocusGameId(game.id)}
																className="h-13 min-w-0 flex justify-start overflow-hidden rounded-2xl border border-solid bg-[rgba(7,13,27,.48)] text-left"
																sx={{
																	borderColor:
																		focusGame.id === game.id
																			? "primary.light"
																			: "rgba(255,255,255,.22)",
																}}
															>
																<Box
																	component="img"
																	src={getVisibleCover(game, nsfwCoverReplace)}
																	alt=""
																	className="h-full w-[50px] shrink-0 object-cover"
																/>
																<Box className="min-w-0 px-2">
																	<Typography
																		variant="body2"
																		fontWeight={700}
																		noWrap
																	>
																		{getGameDisplayName(game)}
																	</Typography>
																	<Typography
																		variant="caption"
																		className="text-[rgba(255,255,255,.66)]"
																		noWrap
																	>
																		{lastPlayed
																			? formatRelativeTime(lastPlayed)
																			: t(
																					"home.focus.notPlayedShort",
																					"未游玩",
																				)}
																	</Typography>
																</Box>
															</ButtonBase>
														);
													})}
												</Box>
											</Box>
										) : null}
									</Box>
								</>
							) : (
								<Skeleton variant="rectangular" width="100%" height="100%" />
							)}
						</Paper>

						<Paper
							variant="outlined"
							className="h-full min-h-0 overflow-hidden p-3"
						>
							<Box className="mb-4 flex items-center gap-2">
								<CasinoOutlinedIcon />
								<Typography variant="h6" fontWeight={700}>
									{t("home.random.title", "随机游戏")}
								</Typography>
								<Button
									size="small"
									startIcon={<RefreshIcon />}
									onClick={handleShuffle}
									className="ml-auto"
								>
									{t("home.random.shuffle", "换一个")}
								</Button>
							</Box>
							{randomGame ? (
								<Box className="grid grid-cols-[112px_minmax(0,1fr)_auto] items-center gap-4 min-[1200px]:grid-cols-[140px_minmax(0,1fr)_auto]">
									<Box
										component="img"
										src={getVisibleCover(randomGame, nsfwCoverReplace)}
										alt=""
										className="h-21 w-full rounded-2xl object-cover"
									/>
									<Box className="min-w-0">
										<Typography
											variant="h6"
											fontWeight={700}
											noWrap
											title={getGameDisplayName(randomGame)}
										>
											{getGameDisplayName(randomGame)}
										</Typography>
										{randomGame.developer ? (
											<Typography
												variant="body2"
												color="text.secondary"
												noWrap
												className="mt-0.5"
											>
												{randomGame.developer}
											</Typography>
										) : null}
										<Box className="mt-2 flex gap-1.5 overflow-hidden">
											{randomGame.tags?.slice(0, 3).map((tag) => (
												<Chip
													key={tag}
													label={tag}
													size="small"
													variant="outlined"
												/>
											))}
										</Box>
									</Box>
									<Box className="flex justify-end gap-2">
										<Tooltip title={t("home.focus.details", "查看详情")}>
											<IconButton
												component={Link}
												to={`/libraries/${randomGame.id}`}
												aria-label={t("home.focus.details", "查看详情")}
												className="!border border-solid border-[var(--mui-palette-divider)]"
											>
												<InfoOutlinedIcon />
											</IconButton>
										</Tooltip>
										<Button
											variant="contained"
											startIcon={
												randomGame.localpath ? <PlayArrowIcon /> : <SyncIcon />
											}
											disabled={runningGameIds.has(randomGame.id)}
											onClick={() =>
												void (randomGame.localpath
													? launchGame(randomGame)
													: syncLocalPath(randomGame))
											}
											className="flex-initial"
										>
											{runningGameIds.has(randomGame.id)
												? t("home.focus.running", "正在运行")
												: randomGame.localpath
													? t("home.random.start", "启动游戏")
													: t(
															"components.LaunchModal.syncLocalPath",
															"同步本地",
														)}
										</Button>
									</Box>
								</Box>
							) : (
								<Skeleton variant="rounded" height={104} />
							)}
						</Paper>
					</Box>

					<Paper
						variant="outlined"
						className="h-full min-h-0 flex flex-col overflow-hidden p-3 min-[1200px]:p-4"
					>
						<Box className="mb-4 flex items-center gap-2">
							<HistoryIcon color="primary" />
							<Typography variant="h6" fontWeight={700}>
								{t("home.activityTitle", "动态")}
							</Typography>
							<ToggleButtonGroup
								exclusive
								size="small"
								value={activityFilter}
								onChange={(_, value: ActivityFilter | null) => {
									if (!value) return;
									setActivityFilter(value);
									setVisibleActivityCount(ACTIVITY_PAGE_SIZE);
									activityScrollRef.current?.scrollTo({ top: 0 });
								}}
								className="ml-auto"
							>
								<ToggleButton value="all" className="!px-2.5 !py-0.5">
									{t("home.activity.filters.all", "全部")}
								</ToggleButton>
								<ToggleButton value="play" className="!px-2.5 !py-0.5">
									{t("home.activity.filters.play", "游玩")}
								</ToggleButton>
								<ToggleButton value="add" className="!px-2.5 !py-0.5">
									{t("home.activity.filters.add", "添加")}
								</ToggleButton>
							</ToggleButtonGroup>
						</Box>

						<Box
							ref={activityScrollRef}
							className="min-h-0 flex-1 overflow-y-auto pr-1"
						>
							{recentSessionsQuery.isLoading ? (
								<Box className="grid gap-4">
									{[1, 2, 3, 4, 5].map((item) => (
										<Skeleton key={item} variant="rounded" height={58} />
									))}
								</Box>
							) : activityGroups.length === 0 ? (
								<Box className="h-full min-h-60 grid place-items-center text-[var(--mui-palette-text-secondary)]">
									<Typography>
										{t("home.activity.empty", "暂无动态")}
									</Typography>
								</Box>
							) : (
								activityGroups.map((group) => (
									<Box key={group.date} className="mb-4.5">
										<Typography
											variant="body2"
											fontWeight={700}
											color="text.secondary"
											className="mb-2.5"
										>
											{getActivityDateLabel(group.date)}
										</Typography>
										<Box
											className="relative pl-7"
											sx={{
												"&::before": {
													content: '""',
													position: "absolute",
													left: 13,
													top: 7,
													bottom: 7,
													width: "2px",
													bgcolor: "divider",
												},
											}}
										>
											{group.items.map((activity) => (
												<Box key={activity.id} className="relative">
													<Box
														className={`pointer-events-none absolute -left-6 top-5 z-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--mui-palette-background-paper)] shadow-sm ${
															activity.type === "play"
																? "text-[var(--mui-palette-primary-main)]"
																: "text-[var(--mui-palette-success-main)]"
														}`}
													>
														{activity.type === "play" ? (
															<SportsEsportsIcon fontSize="small" />
														) : (
															<AddCircleOutlineIcon fontSize="small" />
														)}
													</Box>
													<ButtonBase
														component={Link}
														to={`/libraries/${activity.gameId}`}
														className="w-full justify-start rounded-2xl p-1.5 text-left hover:bg-[var(--mui-palette-action-hover)]"
													>
														<Avatar
															variant="rounded"
															src={activity.imageUrl}
															className="mr-3 h-12 w-12"
														/>
														<Box className="min-w-0">
															<Typography
																variant="body2"
																fontWeight={700}
																noWrap
															>
																{activity.type === "play"
																	? t(
																			"home.activity.played",
																			"游玩了 {{title}}",
																			{ title: activity.gameTitle },
																		)
																	: t(
																			"home.activity.added",
																			"添加了 {{title}}",
																			{ title: activity.gameTitle },
																		)}
															</Typography>
															{activity.type === "play" ||
															isRecentRelativeTime(activity.time) ? (
																<Typography
																	variant="caption"
																	color="text.secondary"
																	noWrap
																	className="block"
																>
																	{activity.type === "play"
																		? getActivityPlaySummary(activity)
																		: t(
																				"home.activity.addedAt",
																				"添加于 {{time}}",
																				{
																					time: formatRelativeTime(
																						activity.time,
																					),
																				},
																			)}
																</Typography>
															) : null}
														</Box>
													</ButtonBase>
												</Box>
											))}
										</Box>
									</Box>
								))
							)}
							<Box
								ref={activitySentinelRef}
								className="h-6 grid place-items-center"
							>
								{recentSessionsQuery.isFetchingNextPage ? (
									<CircularProgress size={18} />
								) : null}
							</Box>
						</Box>
					</Paper>
				</Box>
			)}
		</Box>
	);
};
