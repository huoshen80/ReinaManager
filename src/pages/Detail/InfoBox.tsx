import AccessTimeIcon from "@mui/icons-material/AccessTime";
import BackupIcon from "@mui/icons-material/Backup";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import TodayIcon from "@mui/icons-material/Today";
import {
	Box,
	IconButton,
	Paper,
	ToggleButton,
	ToggleButtonGroup,
	Typography,
} from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameStats } from "@/hooks/queries/useStats";
import { savedataService } from "@/services";
import { useGamePlayStore } from "@/store/gamePlayStore";
import type { GameTimeStats } from "@/types";

/**
 * 时间范围类型定义
 */
type TimeRange = "7D" | "30D" | "MONTH" | "1Y" | "ALL";

/**
 * 图表数据类型定义
 */
interface GameTimeChartData {
	date: string;
	playtime: number;
	[key: string]: string | number;
}

/**
 * InfoBox 组件属性类型
 */
interface InfoBoxProps {
	gameID: number;
}

/**
 * InfoBox 组件
 * 展示游戏统计信息（游玩次数、今日时长、总时长、备份次数）及近7天游玩时长折线图。
 *
 * @param {InfoBoxProps} props 组件属性
 * @returns 统计信息卡片与折线图
 */
export const InfoBox: React.FC<InfoBoxProps> = ({ gameID }: InfoBoxProps) => {
	const { t } = useTranslation();
	const runningGameIds = useGamePlayStore((s) => s.runningGameIds);
	const gameStatsQuery = useGameStats(gameID);
	const stats = gameStatsQuery.data as GameTimeStats | null;
	const [backupCount, setBackupCount] = useState<number>(0);
	const [timeRange, setTimeRange] = useState<TimeRange>("7D");
	// 选中的月份 (YYYY-MM 格式)
	const [selectedMonth, setSelectedMonth] = useState<string>(() => {
		const now = new Date();
		return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
	});

	// 存储上一次游戏运行状态，用于检测变化
	const prevRunningRef = useRef(false);

	useEffect(() => {
		const loadBackupCount = async () => {
			try {
				setBackupCount(await savedataService.getSavedataCount(gameID));
			} catch (error) {
				console.error("加载备份数量失败:", error);
			}
		};

		loadBackupCount();
	}, [gameID]);

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
		if (prevRunningRef.current && !isCurrentGameRunning) {
			const timer = setTimeout(() => {
				if (!unmounted) {
					gameStatsQuery.refetch();
				}
			}, 500);
			return () => {
				unmounted = true;
				clearTimeout(timer);
			};
		}
		prevRunningRef.current = isCurrentGameRunning;
		return () => {
			unmounted = true;
		};
	}, [runningGameIds, gameID, gameStatsQuery]);

	/**
	 * 统计项数据
	 */
	const statItems = useMemo(
		() => [
			{
				color: "primary",
				icon: <SportsEsportsIcon fontSize="small" />,
				title: t("pages.Detail.playCount"),
				value: stats ? `${stats.sessionCount}` : "0",
			},
			{
				color: "primary",
				icon: <TodayIcon fontSize="small" />,
				title: t("pages.Detail.todayPlayTime"),
				value: stats ? `${stats.todayPlayTime}` : "0分钟",
			},
			{
				color: "primary",
				icon: <AccessTimeIcon fontSize="small" />,
				title: t("pages.Detail.totalPlayTime"),
				value: stats ? `${stats.totalPlayTime}` : "0分钟",
			},
			{
				color: "primary",
				icon: <BackupIcon fontSize="small" />,
				title: t("pages.Detail.backupCount"),
				value: backupCount,
			},
		],
		[stats, t, backupCount],
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
					playtime: datePlaytimeMap.get(dateStr) || 0,
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
					playtime: datePlaytimeMap.get(dateStr) || 0,
				});
			}
		} else if (timeRange === "1Y") {
			// 1年：按月聚合
			const monthlyMap = new Map<string, number>();
			for (const [dateStr, playtime] of datePlaytimeMap) {
				const monthKey = dateStr.substring(0, 7); // YYYY-MM
				monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + playtime);
			}

			// 生成过去12个月（修复跨年问题）
			for (let i = 11; i >= 0; i--) {
				const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
				const year = date.getFullYear();
				const month = String(date.getMonth() + 1).padStart(2, "0");
				const monthKey = `${year}-${month}`;
				result.push({
					date: monthKey,
					playtime: monthlyMap.get(monthKey) || 0,
				});
			}
		} else if (timeRange === "ALL") {
			// 全部：判断数据量决定是否按月聚合
			const allDates = Array.from(datePlaytimeMap.keys()).sort();

			if (allDates.length > 60) {
				// 数据点较多，按月聚合
				const monthlyMap = new Map<string, number>();
				for (const [dateStr, playtime] of datePlaytimeMap) {
					const monthKey = dateStr.substring(0, 7); // YYYY-MM
					monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + playtime);
				}

				// 按月排序输出
				const sortedMonths = Array.from(monthlyMap.keys()).sort();
				for (const monthKey of sortedMonths) {
					result.push({
						date: monthKey,
						playtime: monthlyMap.get(monthKey) || 0,
					});
				}
			} else {
				// 数据点较少，按天显示
				for (const dateStr of allDates) {
					result.push({
						date: dateStr,
						playtime: datePlaytimeMap.get(dateStr) || 0,
					});
				}
			}
		}

		return result;
	}, [stats?.daily_stats, timeRange, selectedMonth]);

	/**
	 * 格式化X轴标签
	 */
	const xAxisFormatter = useCallback(
		(value: string) => {
			if (timeRange === "1Y" || (timeRange === "ALL" && value.length === 7)) {
				// 月份格式：YYYY-MM
				return value;
			}
			// 日期格式：YYYY-MM-DD
			if (timeRange === "MONTH") {
				// 月度视图只显示日期（DD）
				return value.substring(8);
			}
			// 其他情况显示 MM-DD
			return value.substring(5);
		},
		[timeRange],
	);

	/**
	 * 图表配置项
	 */
	const chartConfig = useMemo(() => {
		const showMark = timeRange === "7D";
		const showArea = timeRange === "1Y";

		return {
			showMark,
			showArea,
		};
	}, [timeRange]);

	return (
		<>
			{/* 统计信息卡片 */}
			<Box className="mb-4">
				<Typography variant="h6" fontWeight="bold" gutterBottom component="div">
					{t("pages.Detail.gameStats")}
				</Typography>
				<div className="grid grid-cols-4 gap-4">
					{statItems.map((item) => (
						<Paper
							key={item.title}
							elevation={0}
							className={
								"p-4 rounded-lg overflow-hidden hover:shadow-md hover:scale-[1.02]"
							}
						>
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
						</Paper>
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
							{/* 月份选择器 - 仅在MONTH模式下显示 */}
							{timeRange === "MONTH" && (
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
						</Box>
					</Box>
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
							},
						]}
						series={[
							{
								dataKey: "playtime",
								color: "#1976d2",
								showMark: chartConfig.showMark,
								area: chartConfig.showArea,
							},
						]}
						height={300}
						margin={{ right: 40 }}
						grid={{ vertical: true, horizontal: true }}
					/>
				</Box>
			)}
		</>
	);
};
