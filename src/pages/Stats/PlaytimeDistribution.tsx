import { Box, Paper, Skeleton, Typography } from "@mui/material";
import { BarChart } from "@mui/x-charts/BarChart";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { StatisticsDistribution } from "@/types";
import { getChartEdgeLabelMargin, getPlayTimeAxisWidth } from "@/utils/chart";
import { formatCompactPlayTime, formatPlayTime } from "@/utils/dateTime";

interface DistributionPoint {
	label: string;
	playtime: number;
	[key: string]: string | number;
}

const NORMAL_BAR_COLOR = "#10b981";
const PEAK_BAR_COLOR = "#f59e0b";

function getPeakIndex(values: number[]): number | null {
	let peakIndex: number | null = null;
	let peakValue = 0;
	for (let index = 0; index < values.length; index += 1) {
		if (values[index] > peakValue) {
			peakValue = values[index];
			peakIndex = index;
		}
	}
	return peakIndex;
}

function formatHourTick(minutes: number | null): string {
	if (minutes === null) return "";
	const hours = Math.round((minutes / 60) * 10) / 10;
	return `${hours}h`;
}

interface PlaytimeDistributionProps {
	distribution?: StatisticsDistribution;
	isLoading: boolean;
	isError: boolean;
}

export function PlaytimeDistribution({
	distribution,
	isLoading,
	isError,
}: PlaytimeDistributionProps) {
	const { t } = useTranslation();
	const hourlyValues = useMemo(
		() =>
			Array.from(
				{ length: 24 },
				(_, index) => distribution?.hourly[index] ?? 0,
			),
		[distribution],
	);
	const weekdayValues = useMemo(
		() =>
			Array.from(
				{ length: 7 },
				(_, index) => distribution?.weekdays[index] ?? 0,
			),
		[distribution],
	);
	const weekdayLabels = useMemo(
		() => [
			t("pages.Stats.weekdays.sunday", "日"),
			t("pages.Stats.weekdays.monday", "一"),
			t("pages.Stats.weekdays.tuesday", "二"),
			t("pages.Stats.weekdays.wednesday", "三"),
			t("pages.Stats.weekdays.thursday", "四"),
			t("pages.Stats.weekdays.friday", "五"),
			t("pages.Stats.weekdays.saturday", "六"),
		],
		[t],
	);
	const hourPeakIndex = getPeakIndex(hourlyValues);
	const weekdayPeakIndex = getPeakIndex(weekdayValues);
	const hourlyAxisWidth = useMemo(
		() => getPlayTimeAxisWidth(Math.max(...hourlyValues)),
		[hourlyValues],
	);
	const weekdayAxis = useMemo(() => {
		const maxPlayTime = Math.max(...weekdayValues);
		const tickStep = Math.max(30, Math.ceil(maxPlayTime / 6 / 30) * 30);
		const max = tickStep * 6;
		return {
			max,
			tickInterval: Array.from({ length: 7 }, (_, index) => index * tickStep),
			rightMargin: getChartEdgeLabelMargin(formatHourTick(max), 4),
		};
	}, [weekdayValues]);
	const hourlyData = useMemo<DistributionPoint[]>(
		() =>
			hourlyValues.map((playtime, hour) => ({
				label: String(hour),
				playtime,
			})),
		[hourlyValues],
	);
	const weekdayData = useMemo<DistributionPoint[]>(
		() =>
			weekdayValues.map((playtime, weekday) => ({
				label: weekdayLabels[weekday],
				playtime,
			})),
		[weekdayLabels, weekdayValues],
	);
	const hasRecords = hourlyValues.some((value) => value > 0);

	return (
		<Paper variant="outlined" className="min-w-0 p-4">
			<Typography variant="h6" component="h2" fontWeight={700}>
				{t("pages.Stats.distribution", "游玩时段分布")}
			</Typography>
			{isLoading ? (
				<Box className="mt-3 grid gap-4">
					<Skeleton variant="rounded" height={210} />
					<Skeleton variant="rounded" height={260} />
				</Box>
			) : isError ? (
				<Box className="min-h-[240px] grid place-items-center text-center">
					<Typography color="text.secondary">
						{t("pages.Stats.distributionLoadFailed", "游玩时段分布加载失败")}
					</Typography>
				</Box>
			) : !hasRecords ? (
				<Box className="min-h-[240px] grid place-items-center text-center">
					<Typography color="text.secondary">
						{t("pages.Stats.noRecords", "所选范围内暂无游玩记录")}
					</Typography>
				</Box>
			) : (
				<Box className="mt-3 grid gap-4">
					<Box className="min-w-0">
						<Box className="flex items-center justify-between gap-3">
							<Typography variant="body2" color="text.secondary">
								{t("pages.Stats.hourlyDistribution", "时段（24h）")}
							</Typography>
							{hourPeakIndex !== null ? (
								<Typography variant="body2" color="text.secondary">
									{t("pages.Stats.peakHour", "高峰 {{hour}}:00 · {{time}}", {
										hour: String(hourPeakIndex).padStart(2, "0"),
										time: formatPlayTime(hourlyValues[hourPeakIndex]),
									})}
								</Typography>
							) : null}
						</Box>
						<BarChart
							dataset={hourlyData}
							xAxis={[
								{
									dataKey: "label",
									scaleType: "band",
									colorMap: {
										type: "ordinal",
										values: hourlyData.map((item) => item.label),
										colors: hourlyData.map((_, index) =>
											index === hourPeakIndex
												? PEAK_BAR_COLOR
												: NORMAL_BAR_COLOR,
										),
									},
								},
							]}
							yAxis={[
								{
									min: 0,
									width: hourlyAxisWidth,
									valueFormatter: formatCompactPlayTime,
								},
							]}
							series={[
								{
									dataKey: "playtime",
									label: t("pages.Stats.playTime", "游玩时长"),
									valueFormatter: formatCompactPlayTime,
								},
							]}
							height={210}
							margin={{ left: 0, right: 12 }}
							grid={{ horizontal: true }}
							hideLegend
						/>
					</Box>

					<Box className="min-w-0">
						<Box className="flex items-center justify-between gap-3">
							<Typography variant="body2" color="text.secondary">
								{t("pages.Stats.weekdayDistribution", "星期分布")}
							</Typography>
							{weekdayPeakIndex !== null ? (
								<Typography variant="body2" color="text.secondary">
									{t(
										"pages.Stats.peakWeekday",
										"高峰周{{weekday}} · {{time}}",
										{
											weekday: weekdayLabels[weekdayPeakIndex],
											time: formatPlayTime(weekdayValues[weekdayPeakIndex]),
										},
									)}
								</Typography>
							) : null}
						</Box>
						<BarChart
							dataset={weekdayData}
							layout="horizontal"
							yAxis={[
								{
									dataKey: "label",
									scaleType: "band",
									width: 36,
									colorMap: {
										type: "ordinal",
										values: weekdayData.map((item) => item.label),
										colors: weekdayData.map((_, index) =>
											index === weekdayPeakIndex
												? PEAK_BAR_COLOR
												: NORMAL_BAR_COLOR,
										),
									},
								},
							]}
							xAxis={[
								{
									min: 0,
									max: weekdayAxis.max,
									tickInterval: weekdayAxis.tickInterval,
									valueFormatter: formatHourTick,
								},
							]}
							series={[
								{
									dataKey: "playtime",
									label: t("pages.Stats.playTime", "游玩时长"),
									valueFormatter: formatCompactPlayTime,
								},
							]}
							height={260}
							margin={{ left: 4, right: weekdayAxis.rightMargin }}
							grid={{ vertical: true }}
							hideLegend
						/>
					</Box>
				</Box>
			)}
		</Paper>
	);
}
