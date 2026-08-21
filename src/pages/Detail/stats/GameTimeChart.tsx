import { axisClasses } from "@mui/x-charts/ChartsAxis";
import { LineChart } from "@mui/x-charts/LineChart";
import { useCallback, useMemo } from "react";
import { getChartEdgeLabelMargin, getPlayTimeAxisWidth } from "@/utils/chart";
import {
	formatChartDayLabel,
	formatChartMonthLabel,
	formatCompactPlayTime,
} from "@/utils/dateTime";
import type { GameTimeChartData, TimeRange } from "./gameStatsData";

interface GameTimeChartProps {
	data: GameTimeChartData[];
	timeRange: TimeRange;
}

export function GameTimeChart({ data, timeRange }: GameTimeChartProps) {
	const maxPlaytime = data.reduce(
		(maximum, item) => Math.max(maximum, item.playtime),
		0,
	);
	const yAxisWidth = getPlayTimeAxisWidth(maxPlaytime);
	const xAxisFormatter = useCallback(
		(value: string) => {
			if (timeRange === "1Y" || (timeRange === "ALL" && value.length === 7)) {
				return formatChartMonthLabel(value);
			}
			return formatChartDayLabel(value);
		},
		[timeRange],
	);
	const rightMargin = useMemo(() => {
		if (data.length === 0) return 8;
		const lastLabel = xAxisFormatter(data[data.length - 1].date);
		return getChartEdgeLabelMargin(lastLabel);
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
					valueFormatter: formatCompactPlayTime,
					tickLabelStyle: { fontWeight: 600 },
				},
			]}
			series={[
				{
					dataKey: "playtime",
					color: "#1976d2",
					showMark: timeRange === "7D",
					valueFormatter: formatCompactPlayTime,
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
