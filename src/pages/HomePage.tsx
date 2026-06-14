/**
 * @file Home 页面
 * @description 应用首页，展示游戏统计信息、动态、最近游玩、最近添加等内容，支持国际化。
 * @module src/pages/Home/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - Home：主页主组件
 *
 * 依赖：
 * - @mui/material
 * - @mui/icons-material
 * - @/store
 * - @/store/gamePlayStore
 * - @/utils/game/gameStats
 * - @/utils
 * - @/types
 * - react-i18next
 * - react-router
 */

import {
	Notifications as ActivityIcon,
	EmojiEvents as CompletedIcon,
	SportsEsports as GamesIcon,
	Storage as LocalIcon,
	CalendarMonth as MonthIcon,
	AddCircle as RecentlyAddedIcon,
	Gamepad as RecentlyPlayedIcon,
	Inventory as RepositoryIcon,
	SwapHoriz as SwitchIcon,
	AccessTime as TimeIcon,
	Today as TodayIcon,
	DateRange as WeekIcon,
} from "@mui/icons-material";
import {
	Avatar,
	Box,
	Button,
	Card,
	CardContent,
	Divider,
	IconButton,
	List,
	ListItem,
	ListItemAvatar,
	ListItemText,
	Skeleton,
	Tooltip,
	Typography,
} from "@mui/material";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Virtuoso } from "react-virtuoso";
import { useGameIndex } from "@/hooks/features/games/useGameListFacade";
import {
	usePlayTimeSummary,
	useRecentSessionsForGames,
} from "@/hooks/queries/useStats";
import { useStore } from "@/store/appStore";
import type { GameData, GameSession } from "@/types";
import { PlayStatus } from "@/types/collection";
import { formatPlayTime, formatRelativeTime } from "@/utils/dateTime";
import { getGameCover, getGameDisplayName } from "@/utils/game";

/**
 * 最近游玩会话类型
 */
interface RecentSession {
	session_id: number;
	game_id: number;
	end_time: number;
	gameTitle: string;
	imageUrl: string;
}
/**
 * 最近添加游戏类型
 */
interface RecentGame {
	id: number;
	title: string;
	imageUrl: string;
	time: Date;
}
/**
 * 动态项类型
 */
interface ActivityItem {
	id: string;
	type: "add" | "play";
	gameId: number;
	gameTitle: string;
	imageUrl: string;
	time: number;
	duration?: number; // 仅游玩记录有
}

/**
 * 根据游戏列表和最近会话派生活动数据。
 */
function buildGameActivities(
	games: GameData[],
	recentSessions: GameSession[],
): {
	sessions: RecentSession[];
	added: RecentGame[];
	activities: ActivityItem[];
} {
	const playItems: ActivityItem[] = [];
	const sessions: RecentSession[] = [];
	const gameById = new Map(games.map((game) => [game.id, game]));

	for (const s of recentSessions) {
		if (typeof s.end_time !== "number") continue;

		const game = gameById.get(s.game_id);
		if (!game) continue;

		const gameTitle = getGameDisplayName(game);
		const imageUrl = getGameCover(game);

		const item: ActivityItem = {
			id: `play-${s.session_id || game.id}-${s.end_time}`,
			type: "play",
			gameId: game.id,
			gameTitle,
			imageUrl,
			time: s.end_time,
			duration: s.duration,
		};
		playItems.push(item);

		sessions.push({
			session_id: s.session_id,
			game_id: game.id,
			end_time: s.end_time,
			gameTitle,
			imageUrl,
		});
	}

	// 处理添加记录
	const addItems: ActivityItem[] = [];
	const added: RecentGame[] = [];

	for (const game of games.filter((game) => game.created_at)) {
		const timestamp = game.created_at as number;
		const addedDate = new Date(timestamp * 1000);
		const gameTitle = getGameDisplayName(game);
		const imageUrl = getGameCover(game);

		const item: ActivityItem = {
			id: `add-${game.id}`,
			type: "add",
			gameId: game.id,
			gameTitle,
			imageUrl,
			time: timestamp,
		};
		addItems.push(item);

		added.push({
			id: game.id,
			title: gameTitle,
			imageUrl,
			time: addedDate,
		});
	}

	const allActivities = [...playItems, ...addItems].toSorted(
		(a, b) => b.time - a.time,
	);

	const sortedSessions = sessions.toSorted((a, b) => b.end_time - a.end_time);
	const sortedAdded = added.toSorted(
		(a, b) => b.time.getTime() - a.time.getTime(),
	);

	return {
		sessions: sortedSessions.slice(0, 10),
		added: sortedAdded.slice(0, 10),
		activities: allActivities.slice(0, 15),
	};
}

export const Home: React.FC = () => {
	const { index, isLoading: isGameIndexLoading } = useGameIndex();
	const displayAllGames = index.displayList;
	const openAddModal = useStore((state) => state.openAddModal);
	const {
		totalPlayTime,
		weekPlayTime,
		monthPlayTime,
		todayPlayTime,
		isLoading,
	} = usePlayTimeSummary();
	const [playTimePeriod, setPlayTimePeriod] = useState<"week" | "month">(
		"week",
	);
	const gameIds = useMemo(
		() => displayAllGames.map((game) => game.id),
		[displayAllGames],
	);
	const recentSessionsQuery = useRecentSessionsForGames(gameIds, 10);
	const activityData = useMemo(
		() => buildGameActivities(displayAllGames, recentSessionsQuery.data ?? []),
		[displayAllGames, recentSessionsQuery.data],
	);
	const isActivityLoading = recentSessionsQuery.isLoading;

	const { t } = useTranslation();

	// 同步计算的数据 - 立即显示，无需 loading 状态
	const gamesList = useMemo(
		() =>
			displayAllGames.map((game) => ({
				title: getGameDisplayName(game),
				id: game.id,
				isLocal: !!game.localpath,
				imageUrl: getGameCover(game),
			})),
		[displayAllGames],
	);
	const gamesLocalCount = useMemo(
		() => gamesList.filter((game) => game.isLocal).length,
		[gamesList],
	);
	const completedGamesCount = useMemo(
		() =>
			displayAllGames.filter((game) => game.clear === PlayStatus.PLAYED).length,
		[displayAllGames],
	);
	const isLibraryEmpty = !isGameIndexLoading && displayAllGames.length === 0;
	const isWeekPlayTime = playTimePeriod === "week";

	// 统计卡片数据 - 区分同步和异步数据
	const statsCards = useMemo(
		() => [
			// 同步数据 - 立即显示
			{
				title: t("home.stats.totalGames", "总游戏数"),
				value: displayAllGames.length,
				icon: <GamesIcon />,
				isAsync: false,
			},
			{
				title: t("home.stats.localGames", "本地游戏数"),
				value: gamesLocalCount,
				icon: <LocalIcon />,
				isAsync: false,
			},
			{
				title: t("home.stats.completedGames", "通关游戏数"),
				value: completedGamesCount,
				icon: <CompletedIcon />,
				isAsync: false,
			},
			// 异步数据 - 可能需要 loading
			{
				title: t("home.stats.totalPlayTime", "总游戏时长"),
				value: formatPlayTime(totalPlayTime),
				icon: <TimeIcon />,
				isAsync: true,
			},
			{
				title: isWeekPlayTime
					? t("home.stats.weekPlayTime", "本周游戏时长")
					: t("home.stats.monthPlayTime", "本月游戏时长"),
				value: formatPlayTime(isWeekPlayTime ? weekPlayTime : monthPlayTime),
				icon: isWeekPlayTime ? <WeekIcon /> : <MonthIcon />,
				isAsync: true,
				action: (
					<Tooltip
						title={
							isWeekPlayTime
								? t("home.stats.switchToMonth", "切换到本月")
								: t("home.stats.switchToWeek", "切换到本周")
						}
					>
						<IconButton
							size="small"
							aria-label={
								isWeekPlayTime
									? t("home.stats.switchToMonth", "切换到本月")
									: t("home.stats.switchToWeek", "切换到本周")
							}
							onClick={() =>
								setPlayTimePeriod(isWeekPlayTime ? "month" : "week")
							}
							className="absolute right-1 top-1"
						>
							<SwitchIcon fontSize="small" />
						</IconButton>
					</Tooltip>
				),
			},
			{
				title: t("home.stats.todayPlayTime", "今日游戏时长"),
				value: formatPlayTime(todayPlayTime),
				icon: <TodayIcon />,
				isAsync: true,
			},
		],
		[
			t,
			displayAllGames.length,
			gamesLocalCount,
			completedGamesCount,
			totalPlayTime,
			weekPlayTime,
			monthPlayTime,
			todayPlayTime,
			isWeekPlayTime,
		],
	);

	return (
		<Box className="min-h-[calc(100dvh-64px)] p-6 pt-4 flex flex-col gap-4">
			<Typography variant="h4">{t("home.title", "主页")}</Typography>

			{/* 数据统计卡片 */}
			<Box className="grid grid-cols-12 gap-6">
				{statsCards.map((card) => (
					<Box
						key={card.title}
						className="col-span-12 sm:col-span-6 md:col-span-4 lg:col-span-2"
					>
						<Card className="h-full shadow-md hover:shadow-lg transition-shadow">
							<CardContent className="relative flex flex-col items-center text-center">
								{"action" in card ? card.action : null}
								{card.icon}
								<Typography
									title={String(card.value)}
									variant="h6"
									className="font-bold mb-1 w-full whitespace-nowrap overflow-hidden text-ellipsis"
								>
									{/* 异步数据显示 loading，同步数据直接显示 */}
									{card.isAsync && isLoading ? (
										<Skeleton width={60} />
									) : (
										card.value
									)}
								</Typography>
								<Typography variant="body2" color="text.secondary">
									{card.title}
								</Typography>
							</CardContent>
						</Card>
					</Box>
				))}
			</Box>

			{/* 详细信息卡片 */}
			{isLibraryEmpty ? (
				<Card className="shadow-md">
					<CardContent className="min-h-[220px] flex flex-col items-center justify-center gap-4 text-center">
						<RepositoryIcon className="text-amber-500 text-5xl" />
						<Typography variant="h6" className="font-bold">
							{t("components.Toolbar.Category.noGames", "暂无游戏")}
						</Typography>
						<Button
							variant="contained"
							startIcon={<RecentlyAddedIcon />}
							onClick={() => openAddModal("")}
						>
							{t("components.AddModal.addGame", "添加游戏")}
						</Button>
					</CardContent>
				</Card>
			) : (
				<Box className="grid grid-cols-12 gap-6 flex-1 min-h-0 auto-rows-fr">
					{/* 游戏仓库 */}
					<Box className="col-span-12 md:col-span-6 lg:col-span-3 min-h-0">
						<Card className="h-full shadow-md">
							<CardContent className="h-full min-h-0 flex flex-col">
								<Box
									component={Link}
									to="/libraries"
									className="flex items-center mb-3 text-inherit decoration-none hover:text-[--mui-palette-primary-main] cursor-pointer"
								>
									<RepositoryIcon className="mr-2 text-amber-500" />
									<Typography variant="h6" className="font-bold">
										{t("home.repository", "游戏仓库")}
									</Typography>
								</Box>
								<Virtuoso
									className="min-h-0 flex-1 pr-1"
									style={{ height: "100%" }}
									data={gamesList}
									computeItemKey={(_, category) => category.id}
									itemContent={(_, category) => (
										<Box className="pb-1 pt-1">
											<Card
												variant="outlined"
												component={Link}
												to={`/libraries/${category.id}`}
												className="block p-2 text-center text-inherit decoration-none translate-y-0 cursor-pointer hover:-translate-y-0.5 hover:shadow-md"
											>
												<Typography variant="body2">
													{category.title}
												</Typography>
											</Card>
										</Box>
									)}
								/>
							</CardContent>
						</Card>
					</Box>

					{/* 动态 */}
					<Box className="col-span-12 md:col-span-6 lg:col-span-3 min-h-0">
						<Card className="h-full shadow-md">
							<CardContent className="h-full min-h-0 flex flex-col">
								<Box className="flex items-center mb-3">
									<ActivityIcon className="mr-2 text-purple-500" />
									<Typography variant="h6" className="font-bold">
										{t("home.activityTitle", "动态")}
									</Typography>
								</Box>
								{isActivityLoading ? (
									<Box className="min-h-0 flex-1 overflow-y-auto pr-1">
										{[1, 2, 3, 4].map((index) => (
											<Box key={index} className="flex items-center mb-3">
												<Skeleton
													variant="rounded"
													width={40}
													height={40}
													className="mr-3"
												/>
												<Box className="flex-1">
													<Skeleton width="80%" height={20} />
													<Skeleton width="60%" height={16} />
												</Box>
											</Box>
										))}
									</Box>
								) : (
									<List className="min-h-0 flex-1 overflow-y-auto pr-1">
										{activityData.activities.map((activity, idx) => (
											<React.Fragment key={activity.id}>
												<ListItem
													className="px-0 text-inherit"
													component={Link}
													to={`/libraries/${activity.gameId}`}
												>
													<ListItemAvatar>
														<Avatar variant="rounded" src={activity.imageUrl} />
													</ListItemAvatar>
													<Box>
														<Typography variant="body1">
															{activity.type === "add"
																? t("home.activity.added", "添加了 {{title}}", {
																		title: activity.gameTitle,
																	})
																: t(
																		"home.activity.played",
																		"游玩了 {{title}}",
																		{
																			title: activity.gameTitle,
																		},
																	)}
														</Typography>

														<Typography variant="body2" color="text.secondary">
															{activity.type === "add"
																? t(
																		"home.activity.addedAt",
																		"添加于 {{time}}",
																		{
																			time: formatRelativeTime(activity.time),
																		},
																	)
																: t(
																		"home.activity.playedAtTime",
																		"游玩于 {{time}}",
																		{
																			time: formatRelativeTime(activity.time),
																		},
																	)}
														</Typography>

														{activity.type === "play" &&
															activity.duration !== undefined && (
																<Typography
																	variant="body2"
																	color="text.secondary"
																>
																	{t(
																		"home.activity.duration",
																		"游戏时长: {{duration}}",
																		{
																			duration: formatPlayTime(
																				activity.duration,
																			),
																		},
																	)}
																</Typography>
															)}
													</Box>
												</ListItem>
												{idx !== activityData.activities.length - 1 && (
													<Divider />
												)}
											</React.Fragment>
										))}
									</List>
								)}
							</CardContent>
						</Card>
					</Box>

					{/* 最近游玩 */}
					<Box className="col-span-12 md:col-span-6 lg:col-span-3 min-h-0">
						<Card className="h-full shadow-md">
							<CardContent className="h-full min-h-0 flex flex-col">
								<Box className="flex items-center mb-3">
									<RecentlyPlayedIcon className="mr-2 text-[--mui-palette-primary-main]" />
									<Typography variant="h6" className="font-bold">
										{t("home.recentlyPlayed", "最近游玩")}
									</Typography>
								</Box>
								{isActivityLoading ? (
									<Box className="min-h-0 flex-1 overflow-y-auto pr-1">
										{[1, 2, 3, 4].map((index) => (
											<Box key={index} className="flex items-center mb-3">
												<Skeleton
													variant="rounded"
													width={40}
													height={40}
													className="mr-3"
												/>
												<Box className="flex-1">
													<Skeleton width="80%" height={20} />
													<Skeleton width="60%" height={16} />
												</Box>
											</Box>
										))}
									</Box>
								) : (
									<List className="min-h-0 flex-1 overflow-y-auto pr-1">
										{activityData.sessions.map((session, idx) => (
											<React.Fragment key={session.session_id}>
												<ListItem
													className="px-0 text-inherit"
													component={Link}
													to={`/libraries/${session.game_id}`}
												>
													<ListItemAvatar>
														<Avatar variant="rounded" src={session.imageUrl} />
													</ListItemAvatar>
													<ListItemText
														primary={session.gameTitle}
														secondary={t(
															"home.lastPlayed",
															"最后游玩: {{time}}",
															{
																time: formatRelativeTime(session.end_time),
															},
														)}
													/>
												</ListItem>
												{idx !== activityData.sessions.length - 1 && (
													<Divider />
												)}
											</React.Fragment>
										))}
									</List>
								)}
							</CardContent>
						</Card>
					</Box>

					{/* 最近添加 */}
					<Box className="col-span-12 md:col-span-6 lg:col-span-3 min-h-0">
						<Card className="h-full shadow-md">
							<CardContent className="h-full min-h-0 flex flex-col">
								<Box className="flex items-center mb-3">
									<RecentlyAddedIcon className="mr-2 text-green-500" />
									<Typography variant="h6" className="font-bold">
										{t("home.recentlyAdded", "最近添加")}
									</Typography>
								</Box>
								{isActivityLoading ? (
									<Box className="min-h-0 flex-1 overflow-y-auto pr-1">
										{[1, 2, 3, 4].map((index) => (
											<Box key={index} className="flex items-center mb-3">
												<Skeleton
													variant="rounded"
													width={40}
													height={40}
													className="mr-3"
												/>
												<Box className="flex-1">
													<Skeleton width="80%" height={20} />
													<Skeleton width="60%" height={16} />
												</Box>
											</Box>
										))}
									</Box>
								) : (
									<List className="min-h-0 flex-1 overflow-y-auto pr-1">
										{activityData.added.map((game, idx) => (
											<React.Fragment key={game.id}>
												<ListItem
													className="px-0 text-inherit"
													component={Link}
													to={`/libraries/${game.id}`}
												>
													<ListItemAvatar>
														<Avatar variant="rounded" src={game.imageUrl} />
													</ListItemAvatar>
													<ListItemText
														primary={game.title}
														secondary={t("home.addedAt", "添加时间: {{time}}", {
															time: game.time
																? formatRelativeTime(game.time)
																: "",
														})}
													/>
												</ListItem>
												{idx !== activityData.added.length - 1 && <Divider />}
											</React.Fragment>
										))}
									</List>
								)}
							</CardContent>
						</Card>
					</Box>
				</Box>
			)}
		</Box>
	);
};
