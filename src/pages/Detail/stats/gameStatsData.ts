import type { GameTimeStats } from "@/types";

export type TimeRange = "7D" | "30D" | "MONTH" | "1Y" | "ALL";

export interface GameTimeChartData {
	date: string;
	playtime: number;
	[key: string]: string | number;
}

export function buildGameTimeChartData(
	dailyStats: GameTimeStats["daily_stats"],
	timeRange: TimeRange,
	selectedMonth: string,
): GameTimeChartData[] {
	const datePlaytimeMap = new Map<string, number>();
	for (const item of dailyStats ?? []) {
		datePlaytimeMap.set(item.date, item.playtime);
	}

	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const result: GameTimeChartData[] = [];

	if (timeRange === "7D" || timeRange === "30D") {
		const days = timeRange === "7D" ? 7 : 30;
		for (let i = days - 1; i >= 0; i--) {
			const date = new Date(today.getTime() - i * 24 * 60 * 60 * 1000);
			const year = date.getFullYear();
			const month = String(date.getMonth() + 1).padStart(2, "0");
			const day = String(date.getDate()).padStart(2, "0");
			const dateKey = `${year}-${month}-${day}`;
			result.push({
				date: dateKey,
				playtime: datePlaytimeMap.get(dateKey) ?? 0,
			});
		}
		return result;
	}

	if (timeRange === "MONTH") {
		const [year, month] = selectedMonth.split("-").map(Number);
		const daysInMonth = new Date(year, month, 0).getDate();
		for (let day = 1; day <= daysInMonth; day++) {
			const dateKey = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
			result.push({
				date: dateKey,
				playtime: datePlaytimeMap.get(dateKey) ?? 0,
			});
		}
		return result;
	}

	if (timeRange === "1Y") {
		const monthlyMap = aggregateByMonth(datePlaytimeMap);
		for (let i = 11; i >= 0; i--) {
			const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
			const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
			result.push({
				date: monthKey,
				playtime: monthlyMap.get(monthKey) ?? 0,
			});
		}
		return result;
	}

	const allDates = Array.from(datePlaytimeMap.keys()).toSorted();
	const spanDays =
		allDates.length > 1
			? Math.ceil(
					(new Date(allDates[allDates.length - 1]).getTime() -
						new Date(allDates[0]).getTime()) /
						(1000 * 60 * 60 * 24),
				)
			: 0;

	if (allDates.length > 60 || spanDays > 180) {
		const monthlyMap = aggregateByMonth(datePlaytimeMap);
		for (const monthKey of Array.from(monthlyMap.keys()).toSorted()) {
			result.push({
				date: monthKey,
				playtime: monthlyMap.get(monthKey) ?? 0,
			});
		}
		return result;
	}

	for (const dateKey of allDates) {
		result.push({
			date: dateKey,
			playtime: datePlaytimeMap.get(dateKey) ?? 0,
		});
	}
	return result;
}

function aggregateByMonth(
	datePlaytimeMap: ReadonlyMap<string, number>,
): Map<string, number> {
	const monthlyMap = new Map<string, number>();
	for (const [date, playtime] of datePlaytimeMap) {
		const monthKey = date.substring(0, 7);
		monthlyMap.set(monthKey, (monthlyMap.get(monthKey) ?? 0) + playtime);
	}
	return monthlyMap;
}
