import { axisClasses } from "@mui/x-charts/ChartsAxis";
import { LineChart } from "@mui/x-charts/LineChart";
import { useCallback, useMemo } from "react";
import type { GameTimeChartData, TimeRange } from "./gameStatsData";

interface GameTimeChartProps {
	data: GameTimeChartData[];
	timeRange: TimeRange;
}

function formatChartPlaytime(minutes: number | null): string {
	if (minutes === null) return "";

	const roundedMinutes = Math.round(minutes);
	const hours = Math.floor(roundedMinutes / 60);
	const remainingMinutes = roundedMinutes % 60;

	if (hours === 0) return `${remainingMinutes}m`;
	if (remainingMinutes === 0) return `${hours}h`;
	return `${hours}h ${remainingMinutes}m`;
}

export function GameTimeChart({ data, timeRange }: GameTimeChartProps) {
	const maxPlaytime = data.reduce(
		(maximum, item) => Math.max(maximum, item.playtime),
		0,
	);
	const yAxisWidth =
		maxPlaytime < 60
			? 48
			: (String(Math.ceil(maxPlaytime / 60)).length + 6) * 8 + 12;
	const xAxisFormatter = useCallback(
		(value: string) => {
			if (timeRange === "1Y" || (timeRange === "ALL" && value.length === 7)) {
				return value;
			}
			if (timeRange === "MONTH") {
				return value.substring(8);
			}
			return value.substring(5);
		},
		[timeRange],
	);
	const rightMargin = useMemo(() => {
		if (data.length === 0) return 8;
		const lastLabel = xAxisFormatter(data[data.length - 1].date);
		return Math.max(8, lastLabel.length * 4 + 12);
	}, [data, xAxisFormatter]);

	return (
		<LineChart
			dataset={data}
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
					max: data.every((item) => item.playtime === 0) ? 10 : undefined,
					scaleType: "linear",
					tickMinStep: 1,
					width: yAxisWidth,
					valueFormatter: formatChartPlaytime,
					tickLabelStyle: { fontWeight: 600 },
				},
			]}
			series={[
				{
					dataKey: "playtime",
					color: "#1976d2",
					showMark: timeRange === "7D",
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
	);
}
