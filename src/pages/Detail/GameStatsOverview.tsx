import AccessTimeIcon from "@mui/icons-material/AccessTime";
import AddIcon from "@mui/icons-material/Add";
import BackupIcon from "@mui/icons-material/Backup";
import BarChartIcon from "@mui/icons-material/BarChart";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DeleteIcon from "@mui/icons-material/Delete";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import TodayIcon from "@mui/icons-material/Today";
import {
	Box,
	Button,
	CircularProgress,
	IconButton,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography,
} from "@mui/material";
import { axisClasses } from "@mui/x-charts/ChartsAxis";
import { LineChart } from "@mui/x-charts/LineChart";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertConfirmBox } from "@/components/AlertBox";
import { useSaveDataBackupCount } from "@/hooks/queries/useSavedata";
import {
	useCreateManualGameSession,
	useDeleteGameSession,
	useGameSessions,
	useGameStats,
} from "@/hooks/queries/useStats";
import { snackbar } from "@/providers/snackBar";
import { useGamePlayStore } from "@/store/gamePlayStore";
import type { GameSession, GameTimeStats } from "@/types";
import { formatPlayTime, getLocalDateString } from "@/utils/dateTime";
import { getUserErrorMessage } from "@/utils/errors";
import { GameSessionCreateDialog } from "./GameSessionCreateDialog";

/**
 * 时间范围类型定义
 */
type TimeRange = "7D" | "30D" | "MONTH" | "1Y" | "ALL";

/**
 * 统计视图类型定义
 */
type StatsViewMode = "chart" | "timeline";

const SESSION_PAGE_SIZE = 30;

/**
 * 图表数据类型定义
 */
interface GameTimeChartData {
	date: string;
	playtime: number;
	[key: string]: string | number;
}

/**
 * GameStatsOverview 组件属性类型
 */
interface GameStatsOverviewProps {
	gameID: number;
}

const padTimeUnit = (value: number): string => String(value).padStart(2, "0");

const formatClockTime = (date: Date): string =>
	`${padTimeUnit(date.getHours())}:${padTimeUnit(date.getMinutes())}`;

const formatMonthDayTime = (date: Date): string =>
	`${padTimeUnit(date.getMonth() + 1)}/${padTimeUnit(date.getDate())} ${formatClockTime(date)}`;

const formatYearMonthDayTime = (date: Date): string =>
	`${date.getFullYear()}/${formatMonthDayTime(date)}`;

const formatChartPlaytime = (minutes: number | null): string => {
	if (minutes === null) return "";

	const roundedMinutes = Math.round(minutes);
	const hours = Math.floor(roundedMinutes / 60);
	const remainingMinutes = roundedMinutes % 60;

	if (hours === 0) return `${remainingMinutes}m`;
	if (remainingMinutes === 0) return `${hours}h`;
	return `${hours}h ${remainingMinutes}m`;
};

/**
 * GameStatsOverview 组件
 * 展示游戏统计信息（游玩次数、今日时长、总时长、备份次数）及近7天游玩时长折线图。
 *
 * @param {GameStatsOverviewProps} props 组件属性
 * @returns 统计信息卡片与折线图
 */
export const GameStatsOverview: React.FC<GameStatsOverviewProps> = ({
	gameID,
}: GameStatsOverviewProps) => {
	const { t } = useTranslation();
	const runningGameIds = useGamePlayStore((s) => s.runningGameIds);
	const gameStatsQuery = useGameStats(gameID);
	const [sessionLimit, setSessionLimit] = useState(SESSION_PAGE_SIZE);
	const gameSessionsQuery = useGameSessions(gameID, sessionLimit);
	const backupCountQuery = useSaveDataBackupCount(gameID);
	const { refetch: refetchGameStats } = gameStatsQuery;
	const { refetch: refetchGameSessions } = gameSessionsQuery;
	const stats = gameStatsQuery.data as GameTimeStats | null;
	const [timeRange, setTimeRange] = useState<TimeRange>("7D");
	const [viewMode, setViewMode] = useState<StatsViewMode>("chart");
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [sessionToDelete, setSessionToDelete] = useState<GameSession | null>(
		null,
	);
	const createSessionMutation = useCreateManualGameSession();
	const deleteSessionMutation = useDeleteGameSession();
	// 选中的月份 (YYYY-MM 格式)
	const [selectedMonth, setSelectedMonth] = useState<string>(() => {
		const now = new Date();
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
	});

	// 存储上一次游戏运行状态，用于检测变化
	const prevRunningRef = useRef(false);

	/**
	 * 切换到上个月
	 */
	const handlePreviousMonth = useCallback(() => {
		const [year, month] = selectedMonth.split("-").map(Number);
		const prevDate = new Date(year, month - 2, 1); // month-2 因为 month 是 1-12，但 Date 的月份是 0-11
		setSelectedMonth(
			`${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, "0")}`,
		);
	}, [selectedMonth]);

	/**
	 * 切换到下个月
	 */
	const handleNextMonth = useCallback(() => {
		const [year, month] = selectedMonth.split("-").map(Number);
		const nextDate = new Date(year, month, 1); // month 会自动进位
		const now = new Date();
		const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

		// 不能超过当前月份
		const nextMonth = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;
		if (nextMonth <= currentMonth) {
			setSelectedMonth(nextMonth);
		}
	}, [selectedMonth]);

	/**
	 * 格式化月份显示
	 */
	const formatMonthDisplay = useCallback(
		(monthStr: string) => {
			const [year, month] = monthStr.split("-").map(Number);
			const date = new Date(year, month - 1, 1);
			// 使用Intl.DateTimeFormat进行国际化格式化
			const formatter = new Intl.DateTimeFormat(t("common.locale", "zh-CN"), {
				year: "numeric",
				month: "long",
			});
			return formatter.format(date);
		},
		[t],
	);

	// 监听当前游戏的运行状态变化，关闭后自动刷新统计
	useEffect(() => {
		let unmounted = false;
		const isCurrentGameRunning = runningGameIds.has(gameID);
		const wasCurrentGameRunning = prevRunningRef.current;
		prevRunningRef.current = isCurrentGameRunning;

		if (wasCurrentGameRunning && !isCurrentGameRunning) {
			const timer = setTimeout(() => {
				if (!unmounted) {
					refetchGameStats();
					refetchGameSessions();
				}
			}, 500);
			return () => {
				unmounted = true;
				clearTimeout(timer);
			};
		}
		return () => {
			unmounted = true;
		};
	}, [runningGameIds, gameID, refetchGameStats, refetchGameSessions]);

	/**
	 * 统计项数据
	 */
	const statItems = useMemo(
		() => [
			{
				color: "primary",
				icon: <SportsEsportsIcon fontSize="small" />,
				title: t("pages.Detail.playCount", "累计游戏次数"),
				value: stats ? `${stats.sessionCount}` : "0",
			},
			{
				color: "primary",
				icon: <TodayIcon fontSize="small" />,
				title: t("pages.Detail.todayPlayTime", "今日游戏时长"),
				value: stats ? `${stats.todayPlayTime}` : "0分钟",
			},
			{
				color: "primary",
				icon: <AccessTimeIcon fontSize="small" />,
				title: t("pages.Detail.totalPlayTime", "累计总时长"),
				value: stats ? `${stats.totalPlayTime}` : "0分钟",
			},
			{
				color: "primary",
				icon: <BackupIcon fontSize="small" />,
				title: t("pages.Detail.backupCount", "存档备份数"),
				value: backupCountQuery.data ?? 0,
			},
		],
		[stats, t, backupCountQuery.data],
	);

	/**
	 * 生成图表数据，根据选中的时间范围动态生成
	 */
	const chartData = useMemo(() => {
		const datePlaytimeMap = new Map<string, number>();
		if (stats?.daily_stats) {
			for (const item of stats.daily_stats) {
				datePlaytimeMap.set(item.date, item.playtime);
			}
		}

		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const result: GameTimeChartData[] = [];

		if (timeRange === "7D" || timeRange === "30D") {
			// 7天或30天：按天显示
			const days = timeRange === "7D" ? 7 : 30;

			// 使用时间戳方式生成日期，避免跨年问题
			for (let i = days - 1; i >= 0; i--) {
				const timestamp = today.getTime() - i * 24 * 60 * 60 * 1000;
				const date = new Date(timestamp);
				const year = date.getFullYear();
				const month = String(date.getMonth() + 1).padStart(2, "0");
				const day = String(date.getDate()).padStart(2, "0");
				const dateStr = `${year}-${month}-${day}`;
				result.push({
					date: dateStr,
					playtime: datePlaytimeMap.get(dateStr) ?? 0,
				});
			}
		} else if (timeRange === "MONTH") {
			// 显示选中的自然月数据
			const [year, month] = selectedMonth.split("-").map(Number);
			// 获取该月的天数
			const daysInMonth = new Date(year, month, 0).getDate();

			// 生成该月每一天的数据
			for (let day = 1; day <= daysInMonth; day++) {
				const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
				result.push({
					date: dateStr,
					playtime: datePlaytimeMap.get(dateStr) ?? 0,
				});
			}
		} else if (timeRange === "1Y") {
			// 1年：按月聚合
			const monthlyMap = new Map<string, number>();
			for (const [dateStr, playtime] of datePlaytimeMap) {
				const monthKey = dateStr.substring(0, 7); // YYYY-MM
				monthlyMap.set(monthKey, (monthlyMap.get(monthKey) ?? 0) + playtime);
			}

			// 生成过去12个月（修复跨年问题）
			for (let i = 11; i >= 0; i--) {
				const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
				const year = date.getFullYear();
				const month = String(date.getMonth() + 1).padStart(2, "0");
				const monthKey = `${year}-${month}`;
				result.push({
					date: monthKey,
					playtime: monthlyMap.get(monthKey) ?? 0,
				});
			}
		} else if (timeRange === "ALL") {
			// 全部：根据数据量和时间跨度决定是否按月聚合
			const allDates = Array.from(datePlaytimeMap.keys()).toSorted();

			// 计算数据跨越的时间天数
			const spanDays =
				allDates.length > 1
					? Math.ceil(
							(new Date(allDates[allDates.length - 1]).getTime() -
								new Date(allDates[0]).getTime()) /
								(1000 * 60 * 60 * 24),
						)
					: 0;

			// 数据点较多 或 时间跨度超过180天 → 按月聚合
			if (allDates.length > 60 || spanDays > 180) {
				// 数据点较多，按月聚合
				const monthlyMap = new Map<string, number>();
				for (const [dateStr, playtime] of datePlaytimeMap) {
					const monthKey = dateStr.substring(0, 7); // YYYY-MM
					monthlyMap.set(monthKey, (monthlyMap.get(monthKey) ?? 0) + playtime);
				}

				// 按月排序输出
				const sortedMonths = Array.from(monthlyMap.keys()).toSorted();
				for (const monthKey of sortedMonths) {
					result.push({
						date: monthKey,
						playtime: monthlyMap.get(monthKey) ?? 0,
					});
				}
			} else {
				// 数据点较少，按天显示
				for (const dateStr of allDates) {
					result.push({
						date: dateStr,
						playtime: datePlaytimeMap.get(dateStr) ?? 0,
					});
				}
			}
		}

		return result;
	}, [stats?.daily_stats, timeRange, selectedMonth]);

	const maxChartPlaytime = chartData.reduce(
		(max, item) => Math.max(max, item.playtime),
		0,
	);
	const yAxisWidth =
		maxChartPlaytime < 60
			? 48
			: (String(Math.ceil(maxChartPlaytime / 60)).length + 6) * 8 + 12;

	const xAxisFormatter = useCallback(
		(value: string) => {
			if (timeRange === "1Y" || (timeRange === "ALL" && value.length === 7)) {
				// 按月聚合：YYYY-MM
				return value;
			}
			// 日期格式：YYYY-MM-DD
			if (timeRange === "MONTH") {
				// 月度视图只显示日期（DD）
				return value.substring(8);
			}
			// 按天显示：MM-DD（跨度≤180天走按天，基本同年内）
			return value.substring(5);
		},
		[timeRange],
	);

	/**
	 * 动态计算右侧边距，防止最后一个标签溢出被截断
	 */
	const rightMargin = useMemo(() => {
		if (chartData.length === 0) return 8;
		const lastLabel = xAxisFormatter(chartData[chartData.length - 1].date);
		// 估算字符宽度（假设约 8-9px/字符）。由于标签是以最后一个点为中心对齐的，
		// 溢出右边界的部分大约是文本宽度的一半，即：(length * 8) / 2 = length * 4。
		// 最后加上额外的基础留白（如 12px）保证图形圆点（Mark）不会贴边。
		return Math.max(8, lastLabel.length * 4 + 12);
	}, [chartData, xAxisFormatter]);

	/**
	 * 图表配置项
	 */
	const chartConfig = useMemo(() => {
		const showMark = timeRange === "7D";

		return {
			showMark,
		};
	}, [timeRange]);

	const formatSessionTimeRange = useCallback(
		(startTime: number, endTime?: number) => {
			if (!endTime) {
				return `${formatClockTime(new Date(startTime * 1000))} -`;
			}

			const start = new Date(startTime * 1000);
			const end = new Date(endTime * 1000);
			const isSameDate =
				start.getFullYear() === end.getFullYear() &&
				start.getMonth() === end.getMonth() &&
				start.getDate() === end.getDate();
			const endText = isSameDate
				? formatClockTime(end)
				: start.getFullYear() === end.getFullYear()
					? formatMonthDayTime(end)
					: formatYearMonthDayTime(end);

			return `${formatClockTime(start)} - ${endText}`;
		},
		[],
	);

	const sessions = gameSessionsQuery.data ?? [];
	const canLoadMoreSessions =
		sessions.length > 0 &&
		(gameSessionsQuery.isPlaceholderData || sessions.length === sessionLimit) &&
		!gameSessionsQuery.isLoading;

	const handleCreateSession = useCallback(
		async (startTime: number, duration: number) => {
			try {
				await createSessionMutation.mutateAsync({
					gameId: gameID,
					startTime,
					duration,
				});
				snackbar.success(
					t("pages.Detail.createSessionSuccess", "游玩记录已添加"),
				);
				return true;
			} catch (error) {
				snackbar.error(
					getUserErrorMessage(
						error,
						t,
						t("pages.Detail.createSessionFailed", "添加游玩记录失败"),
					),
				);
				return false;
			}
		},
		[createSessionMutation, gameID, t],
	);

	const handleDeleteSession = useCallback(async () => {
		if (!sessionToDelete) {
			return;
		}

		try {
			await deleteSessionMutation.mutateAsync(sessionToDelete.session_id);
			setSessionToDelete(null);
			snackbar.success(
				t("pages.Detail.deleteSessionSuccess", "游玩记录已删除"),
			);
		} catch (error) {
			snackbar.error(
				getUserErrorMessage(
					error,
					t,
					t("pages.Detail.deleteSessionFailed", "删除游玩记录失败"),
				),
			);
		}
	}, [deleteSessionMutation, sessionToDelete, t]);

	return (
		<>
			{/* 统计信息卡片 */}
			<Box className="mb-4">
				<div className="grid grid-cols-4 gap-4">
					{statItems.map((item) => (
						<Box key={item.title} className="p-4 overflow-hidden">
							<div className="flex items-center space-x-2 mb-2">
								<span className="text-[#1976d2] flex-shrink-0 flex items-center">
									{item.icon}
								</span>
								<Typography
									variant="body2"
									className="font-medium text-gray-600 truncate"
									title={item.title}
									component="span"
								>
									{item.title}
								</Typography>
							</div>
							<Typography variant="h6" className="font-bold" component="div">
								{item.value}
							</Typography>
						</Box>
					))}
				</div>
			</Box>
			{/* 游玩时长折线图 */}
			{chartData.length > 0 && (
				<Box>
					<Box className="flex items-center justify-between mb-4">
						<Typography variant="h6" fontWeight="bold" component="div">
							{t("pages.Detail.playTimeChart", "统计图表")}
						</Typography>
						<Box className="flex items-center gap-2">
							{viewMode === "timeline" && (
								<Button
									size="small"
									startIcon={<AddIcon />}
									onClick={() => setCreateDialogOpen(true)}
								>
									{t("pages.Detail.addGameSession", "添加记录")}
								</Button>
							)}
							{/* 月份选择器 - 仅在MONTH模式下显示 */}
							{viewMode === "chart" && timeRange === "MONTH" && (
								<Box className="flex items-center gap-1 mr-2">
									<IconButton
										size="small"
										onClick={handlePreviousMonth}
										aria-label="previous month"
									>
										<ChevronLeftIcon fontSize="small" />
									</IconButton>
									<Typography
										variant="body2"
										className="min-w-[80px] text-center"
									>
										{formatMonthDisplay(selectedMonth)}
									</Typography>
									<IconButton
										size="small"
										onClick={handleNextMonth}
										aria-label="next month"
										disabled={
											selectedMonth >=
											`${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
										}
									>
										<ChevronRightIcon fontSize="small" />
									</IconButton>
								</Box>
							)}
							{viewMode === "chart" && (
								<ToggleButtonGroup
									value={timeRange}
									exclusive
									onChange={(_, newValue) => {
										if (newValue !== null) {
											setTimeRange(newValue);
										}
									}}
									size="small"
									aria-label="time range selector"
								>
									<ToggleButton value="7D" aria-label="7 days">
										7D
									</ToggleButton>
									<ToggleButton value="30D" aria-label="30 days">
										30D
									</ToggleButton>
									<ToggleButton value="MONTH" aria-label="month view">
										M
									</ToggleButton>
									<ToggleButton value="1Y" aria-label="1 year">
										1Y
									</ToggleButton>
									<ToggleButton value="ALL" aria-label="all time">
										ALL
									</ToggleButton>
								</ToggleButtonGroup>
							)}
							<ToggleButtonGroup
								value={viewMode}
								exclusive
								onChange={(_, newValue) => {
									if (newValue !== null) {
										setViewMode(newValue);
									}
								}}
								size="small"
								aria-label="stats view selector"
							>
								<ToggleButton
									value="chart"
									aria-label={t("pages.Detail.chartView", "图表")}
								>
									<Tooltip title={t("pages.Detail.chartView", "图表")}>
										<BarChartIcon fontSize="small" />
									</Tooltip>
								</ToggleButton>
								<ToggleButton
									value="timeline"
									aria-label={t("pages.Detail.timelineView", "列表")}
								>
									<Tooltip title={t("pages.Detail.timelineView", "列表")}>
										<FormatListBulletedIcon fontSize="small" />
									</Tooltip>
								</ToggleButton>
							</ToggleButtonGroup>
						</Box>
					</Box>
					{viewMode === "chart" ? (
						<LineChart
							dataset={chartData}
							xAxis={[
								{
									dataKey: "date",
									scaleType: "point",
									valueFormatter: xAxisFormatter,
								},
							]}
							yAxis={[
								{
									min: 0,
									max: chartData.every((item) => item.playtime === 0)
										? 10
										: undefined,
									scaleType: "linear",
									tickMinStep: 1,
									width: yAxisWidth,
									valueFormatter: formatChartPlaytime,
									tickLabelStyle: {
										fontWeight: 600,
									},
								},
							]}
							series={[
								{
									dataKey: "playtime",
									color: "#1976d2",
									showMark: chartConfig.showMark,
									valueFormatter: formatChartPlaytime,
								},
							]}
							height={300}
							margin={{ left: 8, right: rightMargin }}
							grid={{ vertical: true, horizontal: true }}
							sx={{
								[`& .${axisClasses.left} .${axisClasses.line}, & .${axisClasses.left} .${axisClasses.tick}`]:
									{
										stroke: "text.secondary",
										strokeWidth: 1.5,
									},
							}}
						/>
					) : (
						<Box className="min-h-[300px]">
							{gameSessionsQuery.isLoading ? (
								<Box className="h-[300px] flex items-center justify-center">
									<CircularProgress size={24} />
								</Box>
							) : sessions.length === 0 ? (
								<Box className="h-[300px] flex items-center justify-center">
									<Typography color="textSecondary" component="div">
										{t("pages.Detail.noPlaySessions", "暂无游玩记录")}
									</Typography>
								</Box>
							) : (
								<Box className="max-h-[360px] overflow-y-auto pr-2">
									{sessions.map((session, index) => {
										const sessionDate = getLocalDateString(session.start_time);
										const previousSessionDate = sessions[index - 1]
											? getLocalDateString(sessions[index - 1].start_time)
											: null;
										const showDate =
											index === 0 || previousSessionDate !== sessionDate;

										return (
											<Box key={session.session_id}>
												{showDate && (
													<Typography
														variant="subtitle2"
														color="textSecondary"
														className="mt-2 mb-1"
														component="div"
													>
														{sessionDate}
													</Typography>
												)}
												<Box className="relative flex gap-3 py-2 pl-1">
													<Box className="flex flex-col items-center">
														<Box className="w-2 h-2 rounded-full bg-[#1976d2] mt-2" />
														{index !== sessions.length - 1 && (
															<Box className="w-px flex-1 min-h-8 bg-gray-200 mt-1" />
														)}
													</Box>
													<Box className="min-w-0 flex-1">
														<Typography
															variant="body2"
															className="font-medium"
															component="div"
														>
															{formatSessionTimeRange(
																session.start_time,
																session.end_time,
															)}
														</Typography>
														<Typography
															variant="body2"
															color="textSecondary"
															component="div"
														>
															{t("pages.Detail.sessionDuration", "时长")}:{" "}
															{formatPlayTime(session.duration ?? 0)}
														</Typography>
													</Box>
													<Tooltip
														title={t(
															"pages.Detail.deleteGameSession",
															"删除记录",
														)}
													>
														<IconButton
															size="small"
															color="error"
															aria-label={t(
																"pages.Detail.deleteGameSession",
																"删除记录",
															)}
															onClick={() => setSessionToDelete(session)}
															disabled={deleteSessionMutation.isPending}
														>
															<DeleteIcon fontSize="small" />
														</IconButton>
													</Tooltip>
												</Box>
											</Box>
										);
									})}
									{canLoadMoreSessions && (
										<Box className="flex justify-center py-3">
											<Button
												variant="outlined"
												onClick={() =>
													setSessionLimit((value) => value + SESSION_PAGE_SIZE)
												}
												disabled={gameSessionsQuery.isFetching}
											>
												{gameSessionsQuery.isFetching
													? t("pages.Detail.loading", "加载中...")
													: t("pages.Detail.loadMoreSessions", "加载更多")}
											</Button>
										</Box>
									)}
								</Box>
							)}
						</Box>
					)}
				</Box>
			)}
			<GameSessionCreateDialog
				open={createDialogOpen}
				setOpen={setCreateDialogOpen}
				isLoading={createSessionMutation.isPending}
				onSubmit={handleCreateSession}
			/>
			<AlertConfirmBox
				open={sessionToDelete !== null}
				setOpen={(open) => {
					if (!open && !deleteSessionMutation.isPending) {
						setSessionToDelete(null);
					}
				}}
				title={t("pages.Detail.deleteGameSessionTitle", "删除游玩记录")}
				message={t(
					"pages.Detail.deleteGameSessionMessage",
					"删除该游玩记录后，总时长、游玩次数、每日统计和最近游玩时间将同步更新。",
				)}
				confirmText={t("pages.Detail.deleteGameSession", "删除记录")}
				isLoading={deleteSessionMutation.isPending}
				onConfirm={() => void handleDeleteSession()}
			/>
		</>
	);
};
