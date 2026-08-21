import AccessTimeIcon from "@mui/icons-material/AccessTime";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import EmojiEventsIcon from "@mui/icons-material/EmojiEvents";
import EventAvailableIcon from "@mui/icons-material/EventAvailable";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import { Alert, Box, Button, Paper, Skeleton, Typography } from "@mui/material";
import { LineChart } from "@mui/x-charts/LineChart";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameIndex } from "@/hooks/features/games/useGameListFacade";
import {
	useAllGameStatistics,
	useStatisticsDistribution,
} from "@/hooks/queries/useStats";
import { useStore } from "@/store/appStore";
import type { GameStatistics } from "@/types";
import { getChartEdgeLabelMargin, getPlayTimeAxisWidth } from "@/utils/chart";
import {
	formatChartDayLabel,
	formatChartMonthLabel,
	formatCompactPlayTime,
	formatPlayTime,
} from "@/utils/dateTime";
import { getUserErrorMessage } from "@/utils/errors";
import { applyNsfwFilter } from "@/utils/game";
import { PlaytimeDistribution } from "./PlaytimeDistribution";
import { StatisticsRangeControls } from "./StatisticsRangeControls";
import { StatisticsRanking } from "./StatisticsRanking";
import {
	buildStatisticsOverview,
	resolveStatisticsDateRange,
	type StatisticsRange,
} from "./statsData";

const EMPTY_STATISTICS = new Map<number, GameStatistics>();
const STAT_SKELETON_KEYS = [
	"playtime",
	"games",
	"completed",
	"new",
	"days",
	"average",
];

function StatisticsSkeleton() {
	return (
		<Box className="grid gap-4">
			<Box className="grid grid-cols-3 gap-3 2xl:grid-cols-6">
				{STAT_SKELETON_KEYS.map((key) => (
					<Skeleton key={key} variant="rounded" height={104} />
				))}
			</Box>
			<Box className="grid gap-3 min-[1000px]:grid-cols-3">
				<Skeleton variant="rounded" height={520} />
				<Skeleton
					variant="rounded"
					height={520}
					className="min-[1000px]:col-span-2"
				/>
			</Box>
		</Box>
	);
}

export function Stats() {
	const { t } = useTranslation();
	const [range, setRange] = useState<StatisticsRange>("30D");
	const [customDates, setCustomDates] = useState({
		startDate: "",
		endDate: "",
	});
	const nsfwFilter = useStore((state) => state.nsfwFilter);
	const nsfwCoverReplace = useStore((state) => state.nsfwCoverReplace);
	const gamesQuery = useGameIndex();
	const statisticsQuery = useAllGameStatistics();
	const visibleGames = useMemo(
		() => applyNsfwFilter(gamesQuery.index.displayList, nsfwFilter),
		[gamesQuery.index.displayList, nsfwFilter],
	);
	const visibleGameIds = useMemo(
		() => visibleGames.map((game) => game.id),
		[visibleGames],
	);
	const dateRange = useMemo(
		() =>
			resolveStatisticsDateRange(
				range,
				customDates.startDate,
				customDates.endDate,
			),
		[customDates.endDate, customDates.startDate, range],
	);
	const todayDate = useMemo(
		() => resolveStatisticsDateRange("7D")?.endDate ?? "",
		[],
	);
	const distributionQuery = useStatisticsDistribution(
		visibleGameIds,
		dateRange?.startDate ?? "",
		dateRange?.endDate ?? "",
		{ enabled: dateRange !== null },
	);
	const overview = useMemo(
		() =>
			dateRange
				? buildStatisticsOverview(
						visibleGames,
						statisticsQuery.data ?? EMPTY_STATISTICS,
						dateRange,
					)
				: null,
		[dateRange, visibleGames, statisticsQuery.data],
	);
	const statItems = useMemo(
		() =>
			overview
				? [
						{
							key: "totalPlayTime",
							label: t("pages.Stats.totalPlayTime", "游玩时长"),
							value: formatPlayTime(overview.totalPlayTime),
							icon: <AccessTimeIcon color="primary" />,
						},
						{
							key: "playedGames",
							label: t("pages.Stats.playedGames", "游玩游戏数"),
							value: overview.playedGames,
							icon: <SportsEsportsIcon color="primary" />,
						},
						{
							key: "completedGames",
							label: t("pages.Stats.completedGames", "通关游戏数"),
							value: overview.completedGames,
							icon: <EmojiEventsIcon color="primary" />,
						},
						{
							key: "newGames",
							label: t("pages.Stats.newGames", "新增游戏数"),
							value: overview.newGames,
							icon: <AddCircleOutlineIcon color="primary" />,
						},
						{
							key: "activeDays",
							label: t("pages.Stats.activeDays", "活跃天数"),
							value: overview.activeDays,
							icon: <EventAvailableIcon color="primary" />,
						},
						{
							key: "averageActiveDayPlayTime",
							label: t("pages.Stats.averageActiveDayPlayTime", "活跃日均时长"),
							value: formatPlayTime(overview.averageActiveDayPlayTime),
							icon: <CalendarMonthIcon color="primary" />,
						},
					]
				: [],
		[overview, t],
	);
	const trendDateFormatter = dateRange?.groupByMonth
		? formatChartMonthLabel
		: formatChartDayLabel;
	const trendAxisLayout = useMemo(() => {
		const trend = overview?.trend ?? [];
		let maxPlayTime = 0;
		for (const item of trend) {
			maxPlayTime = Math.max(maxPlayTime, item.playtime);
		}
		const lastDate = trend[trend.length - 1]?.date;
		return {
			yAxisWidth: getPlayTimeAxisWidth(maxPlayTime),
			rightMargin: getChartEdgeLabelMargin(
				lastDate ? trendDateFormatter(lastDate) : "",
				4,
			),
		};
	}, [overview?.trend, trendDateFormatter]);
	const baseError = gamesQuery.error ?? statisticsQuery.error;
	const error = baseError;
	const isLoading = gamesQuery.isLoading || statisticsQuery.isLoading;
	const hasBlockingError = Boolean(
		baseError &&
			(!statisticsQuery.data || gamesQuery.index.displayList.length === 0),
	);

	const handleRetry = () => {
		void Promise.all([
			gamesQuery.refetch(),
			statisticsQuery.refetch(),
			distributionQuery.refetch(),
		]);
	};

	return (
		<Box className="box-border min-h-[calc(100dvh-64px)] bg-[var(--mui-palette-background-default)] p-4 min-[1000px]:p-5">
			<Box className="w-full">
				<Box className="mb-3">
					<Typography variant="h4" component="h1" fontWeight={700}>
						{t("app.NAVIGATION.stats", "统计")}
					</Typography>
					<Typography variant="body2" color="text.secondary">
						{t("pages.Stats.subtitle", "回顾游玩投入与近期变化")}
					</Typography>
				</Box>
				<StatisticsRangeControls
					range={range}
					customDates={customDates}
					todayDate={todayDate}
					onRangeChange={(nextRange) => {
						setCustomDates({ startDate: "", endDate: "" });
						setRange(nextRange);
					}}
					onCustomApply={(dates) => {
						setCustomDates(dates);
						setRange("CUSTOM");
					}}
				/>

				{error ? (
					<Alert
						severity="error"
						action={
							<Button color="inherit" size="small" onClick={handleRetry}>
								{t("common.retry", "重试")}
							</Button>
						}
						className="mb-4"
					>
						{getUserErrorMessage(
							error,
							t,
							t("pages.Stats.loadFailed", "统计数据加载失败"),
						)}
					</Alert>
				) : null}
				{hasBlockingError || !dateRange || !overview ? null : isLoading ? (
					<StatisticsSkeleton />
				) : visibleGames.length === 0 ? (
					<Paper
						variant="outlined"
						className="min-h-[360px] flex flex-col items-center justify-center gap-2 p-8 text-center"
					>
						<SportsEsportsIcon className="!text-5xl text-[var(--mui-palette-text-disabled)]" />
						<Typography variant="h6" fontWeight={700}>
							{t("pages.Stats.noGames", "暂无可统计的游戏")}
						</Typography>
						<Typography variant="body2" color="text.secondary">
							{t(
								"pages.Stats.noGamesHint",
								"添加游戏或调整内容过滤设置后再来看看",
							)}
						</Typography>
					</Paper>
				) : (
					<Box className="grid gap-4">
						<Box className="grid grid-cols-3 gap-3 2xl:grid-cols-6">
							{statItems.map((item) => (
								<Paper
									key={item.key}
									variant="outlined"
									className="min-w-0 flex items-center gap-3 p-4"
								>
									<Box className="h-10 w-10 shrink-0 grid place-items-center rounded-full bg-[var(--mui-palette-action-hover)]">
										{item.icon}
									</Box>
									<Box className="min-w-0">
										<Typography variant="body2" color="text.secondary" noWrap>
											{item.label}
										</Typography>
										<Typography variant="h5" fontWeight={700} noWrap>
											{item.value}
										</Typography>
									</Box>
								</Paper>
							))}
						</Box>

						<Box className="grid gap-3 min-[1000px]:h-[520px] min-[1000px]:grid-cols-3 min-[1000px]:grid-rows-[minmax(0,1fr)]">
							<StatisticsRanking
								ranking={overview.ranking}
								replaceNsfwCover={nsfwCoverReplace}
							/>

							<Paper
								variant="outlined"
								className="min-h-0 min-w-0 overflow-hidden flex flex-col p-4 min-[1000px]:col-span-2"
							>
								<Typography variant="h6" component="h2" fontWeight={700}>
									{t("pages.Stats.trend", "总游玩时长趋势")}
								</Typography>
								{overview.totalPlayTime === 0 ? (
									<Box className="min-h-0 flex-1 grid place-items-center text-center">
										<Typography color="text.secondary">
											{t("pages.Stats.noRecords", "所选范围内暂无游玩记录")}
										</Typography>
									</Box>
								) : (
									<Box className="min-w-0 min-h-0 flex-1 overflow-hidden">
										<LineChart
											dataset={overview.trend}
											xAxis={[
												{
													dataKey: "date",
													scaleType: "point",
													valueFormatter: trendDateFormatter,
												},
											]}
											yAxis={[
												{
													min: 0,
													width: trendAxisLayout.yAxisWidth,
													valueFormatter: formatCompactPlayTime,
												},
											]}
											series={[
												{
													dataKey: "playtime",
													label: t("pages.Stats.playTime", "游玩时长"),
													curve: "linear",
													showMark: range === "7D",
													valueFormatter: formatCompactPlayTime,
												},
											]}
											height={440}
											margin={{
												left: 0,
												right: trendAxisLayout.rightMargin,
											}}
											grid={{ horizontal: true }}
										/>
									</Box>
								)}
							</Paper>
						</Box>
						<PlaytimeDistribution
							distribution={distributionQuery.data}
							isLoading={distributionQuery.isLoading}
							isError={distributionQuery.isError}
						/>
					</Box>
				)}
			</Box>
		</Box>
	);
}
