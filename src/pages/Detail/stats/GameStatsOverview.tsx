import AccessTimeIcon from "@mui/icons-material/AccessTime";
import AddIcon from "@mui/icons-material/Add";
import BackupIcon from "@mui/icons-material/Backup";
import BarChartIcon from "@mui/icons-material/BarChart";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import TodayIcon from "@mui/icons-material/Today";
import {
	Box,
	Button,
	IconButton,
	ToggleButton,
	ToggleButtonGroup,
	Tooltip,
	Typography,
} from "@mui/material";
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
import { getUserErrorMessage } from "@/utils/errors";
import { GameSessionCreateDialog } from "./GameSessionCreateDialog";
import { GameSessionTimeline } from "./GameSessionTimeline";
import { GameTimeChart } from "./GameTimeChart";
import { buildGameTimeChartData, type TimeRange } from "./gameStatsData";

/**
 * 时间范围类型定义
 */
type StatsViewMode = "chart" | "timeline";

const SESSION_PAGE_SIZE = 30;

/**
 * GameStatsOverview 组件属性类型
 */
interface GameStatsOverviewProps {
	gameID: number;
}

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

	const chartData = useMemo(
		() => buildGameTimeChartData(stats?.daily_stats, timeRange, selectedMonth),
		[stats?.daily_stats, timeRange, selectedMonth],
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
						<GameTimeChart data={chartData} timeRange={timeRange} />
					) : (
						<Box className="min-h-[300px]">
							<GameSessionTimeline
								sessions={sessions}
								isLoading={gameSessionsQuery.isLoading}
								isFetching={gameSessionsQuery.isFetching}
								canLoadMore={canLoadMoreSessions}
								deletePending={deleteSessionMutation.isPending}
								onLoadMore={() =>
									setSessionLimit((value) => value + SESSION_PAGE_SIZE)
								}
								onDelete={setSessionToDelete}
							/>
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
