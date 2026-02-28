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
 * - @/utils/gameStats
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
	AddCircle as RecentlyAddedIcon,
	Gamepad as RecentlyPlayedIcon,
	Inventory as RepositoryIcon,
	AccessTime as TimeIcon,
	Today as TodayIcon,
	DateRange as WeekIcon,
} from "@mui/icons-material";
import {
	Avatar,
	Box,
	Card,
	CardContent,
	Divider,
	List,
	ListItem,
	ListItemAvatar,
	ListItemText,
	Skeleton,
	Typography,
} from "@mui/material";
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useAllGameListFacade } from "@/hooks/features/games/useGameListFacade";
import { usePlayTimeSummary } from "@/hooks/queries/useStats";
import type { GameData } from "@/types";
import { PlayStatus } from "@/types/collection";
import {
	formatPlayTime,
	formatRelativeTime,
	getGameCover,
	getGameDisplayName,
} from "@/utils";
import { getRecentSessionsForAllGames } from "@/utils/gameStats";

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
 * 获取最近游玩、最近添加、动态数据 - 优化版本
 * @param games 游戏列表
 * @param language 当前语言
 * @returns 包含 sessions、added、activities 的对象
 */
async function getGameActivities(
	games: GameData[],
	language: string,
): Promise<{
	sessions: RecentSession[];
	added: RecentGame[];
	activities: ActivityItem[];
}> {
	// 处理游玩记录 - 使用批量查询优化
	const playItems: ActivityItem[] = [];
	const sessions: RecentSession[] = [];

	// 提取所有有效的游戏ID
	const validGameIds = games
		.filter((game) => game.id && typeof game.id === "number")
		.map((game) => game.id as number);

	// 一次性获取所有游戏的会话记录，避免循环中的多次数据库查询
	const allSessionsMap = await getRecentSessionsForAllGames(validGameIds, 10);

	// 处理会话数据
	for (const game of games) {
		if (!game.id || typeof game.id !== "number") continue;

		const gameSessions = allSessionsMap.get(game.id) || [];
		const gameTitle = getGameDisplayName(game, language);
		const imageUrl = getGameCover(game);

		for (const s of gameSessions.filter(
			(s) => typeof s.end_time === "number",
		)) {
			const item: ActivityItem = {
				id: `play-${s.session_id || game.id}-${s.end_time}`,
				type: "play",
				gameId: game.id,
				gameTitle,
				imageUrl,
				time: s.end_time as number,
				duration: s.duration,
			};
			playItems.push(item);

			// 用于最近游玩区域
			sessions.push({
				session_id: s.session_id as number,
				game_id: game.id,
				end_time: s.end_time as number,
				gameTitle,
				imageUrl,
			});
		}
	}

	// 处理添加记录
	const addItems: ActivityItem[] = [];
	const added: RecentGame[] = [];

	// 过滤有效的游戏数据(有 ID 和创建时间)
	const filteredGames = games.filter(
		(game) => typeof game.id === "number" && game.created_at,
	);
	for (const game of filteredGames) {
		// created_at 是秒级时间戳
		const timestamp = game.created_at as number;
		const addedDate = new Date(timestamp * 1000);
		const gameTitle = getGameDisplayName(game, language);

		const item: ActivityItem = {
			id: `add-${game.id}`,
			type: "add",
			gameId: game.id as number,
			gameTitle,
			imageUrl: getGameCover(game),
			time: timestamp,
		};
		addItems.push(item);

		added.push({
			id: game.id as number,
			title: gameTitle,
			imageUrl: getGameCover(game),
			time: addedDate,
		});
	}

	// 合并所有动态，按时间排序
	const allActivities = [...playItems, ...addItems].sort(
		(a, b) => b.time - a.time,
	);

	// 排序最近游玩和最近添加
	sessions.sort((a, b) => b.end_time - a.end_time);
	added.sort((a, b) => {
		if (a.time && b.time) return b.time.getTime() - a.time.getTime();
		return 0;
	});

	return {
		sessions: sessions.slice(0, 6),
		added: added.slice(0, 6),
		activities: allActivities.slice(0, 10),
	};
}

export const Home: React.FC = () => {
	const displayAllGames = useAllGameListFacade();
	const { totalPlayTime, weekPlayTime, todayPlayTime, isLoading } =
		usePlayTimeSummary();

	// 分离活动数据的状态管理
	const [activityData, setActivityData] = useState<{
		sessions: RecentSession[];
		added: RecentGame[];
		activities: ActivityItem[];
		loading: boolean;
	}>({
		sessions: [],
		added: [],
		activities: [],
		loading: true,
	});

	const { t, i18n } = useTranslation();

	// 同步计算的数据 - 立即显示，无需 loading 状态
	const gamesList = useMemo(
		() =>
			displayAllGames.map((game) => ({
				title: getGameDisplayName(game, i18n.language),
				id: game.id,
				isLocal: !!game.localpath,
				imageUrl: getGameCover(game),
			})),
		[displayAllGames, i18n.language],
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
				title: t("home.stats.weekPlayTime", "本周游戏时长"),
				value: formatPlayTime(weekPlayTime),
				icon: <WeekIcon />,
				isAsync: true,
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
			todayPlayTime,
		],
	);

	// 异步获取活动数据
	useEffect(() => {
		const fetchActivityData = async () => {
			try {
				const result = await getGameActivities(displayAllGames, i18n.language);
				setActivityData({
					sessions: result.sessions,
					added: result.added,
					activities: result.activities,
					loading: false,
				});
			} catch (error) {
				console.error("获取首页活动数据失败:", error);
				setActivityData((prev) => ({ ...prev, loading: false }));
			}
		};

		fetchActivityData();
	}, [displayAllGames, i18n.language]);

	return (
		<Box className="p-6 pt-4 flex flex-col gap-4">
			<Typography variant="h4">{t("home.title", "主页")}</Typography>

			{/* 数据统计卡片 */}
			<Box className="grid grid-cols-12 gap-6">
				{statsCards.map((card) => (
					<Box
						key={card.title}
						className="col-span-12 sm:col-span-6 md:col-span-4 lg:col-span-2"
					>
						<Card className="h-full shadow-md hover:shadow-lg transition-shadow">
							<CardContent className="flex flex-col items-center text-center">
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
			<Box className="grid grid-cols-12 gap-6">
				{/* 游戏仓库 */}
				<Box className="col-span-12 md:col-span-6 lg:col-span-3">
					<Card className="h-full shadow-md">
						<CardContent>
							<Box
								component={Link}
								to="/libraries"
								className="flex items-center mb-3 text-inherit decoration-none hover:scale-105 hover:shadow-lg cursor-pointer"
							>
								<RepositoryIcon className="mr-2 text-amber-500" />
								<Typography variant="h6" className="font-bold">
									{t("home.repository", "游戏仓库")}
								</Typography>
							</Box>
							<Box className="grid grid-cols-1 gap-2 max-h-44vh overflow-y-auto pr-1">
								{gamesList.map((category) => (
									<Card
										key={category.id}
										variant="outlined"
										component={Link}
										to={`/libraries/${category.id}`}
										sx={{
											p: 1,
											textAlign: "center",
											cursor: "pointer",
											textDecoration: "none",
											"&:hover": {
												transform: "translateY(-2px)",
												boxShadow: 2,
											},
										}}
									>
										<Typography variant="body2">{category.title}</Typography>
									</Card>
								))}
							</Box>
						</CardContent>
					</Card>
				</Box>

				{/* 动态 */}
				<Box className="col-span-12 md:col-span-6 lg:col-span-3">
					<Card className="h-full shadow-md">
						<CardContent>
							<Box className="flex items-center mb-3">
								<ActivityIcon className="mr-2 text-purple-500" />
								<Typography variant="h6" className="font-bold">
									{t("home.activityTitle", "动态")}
								</Typography>
							</Box>
							{activityData.loading ? (
								<Box className="max-h-44vh overflow-y-auto pr-1">
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
								<List className="max-h-44vh overflow-y-auto pr-1">
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
															? t("home.activity.added", {
																	title: activity.gameTitle,
																})
															: t("home.activity.played", {
																	title: activity.gameTitle,
																})}
													</Typography>

													<Typography variant="body2" color="text.secondary">
														{activity.type === "add"
															? t("home.activity.addedAt", {
																	time: formatRelativeTime(activity.time),
																})
															: t("home.activity.playedAtTime", {
																	time: formatRelativeTime(activity.time),
																})}
													</Typography>

													{activity.type === "play" &&
														activity.duration !== undefined && (
															<Typography
																variant="body2"
																color="text.secondary"
															>
																{t("home.activity.duration", {
																	duration: formatPlayTime(activity.duration),
																})}
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
				<Box className="col-span-12 md:col-span-6 lg:col-span-3">
					<Card className="h-full shadow-md">
						<CardContent>
							<Box className="flex items-center mb-3">
								<RecentlyPlayedIcon className="mr-2 text-blue-500" />
								<Typography variant="h6" className="font-bold">
									{t("home.recentlyPlayed", "最近游玩")}
								</Typography>
							</Box>
							{activityData.loading ? (
								<Box className="max-h-44vh overflow-y-auto pr-1">
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
								<List className="max-h-44vh overflow-y-auto pr-1">
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
													secondary={t("home.lastPlayed", {
														time: formatRelativeTime(session.end_time),
													})}
												/>
											</ListItem>
											{idx !== activityData.sessions.length - 1 && <Divider />}
										</React.Fragment>
									))}
								</List>
							)}
						</CardContent>
					</Card>
				</Box>

				{/* 最近添加 */}
				<Box className="col-span-12 md:col-span-6 lg:col-span-3">
					<Card className="h-full shadow-md">
						<CardContent>
							<Box className="flex items-center mb-3">
								<RecentlyAddedIcon className="mr-2 text-green-500" />
								<Typography variant="h6" className="font-bold">
									{t("home.recentlyAdded", "最近添加")}
								</Typography>
							</Box>
							{activityData.loading ? (
								<Box className="max-h-44vh overflow-y-auto pr-1">
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
								<List className="max-h-44vh overflow-y-auto pr-1">
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
													secondary={t("home.addedAt", {
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
		</Box>
	);
};
