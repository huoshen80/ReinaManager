import { formatCompactPlayTime } from "./dateTime";

export function getPlayTimeAxisWidth(maxMinutes: number): number {
	const safeMaxMinutes = Math.max(0, Math.ceil(maxMinutes));
	const maxHours = Math.ceil(safeMaxMinutes / 60);
	const longestLabel =
		maxHours === 0
			? formatCompactPlayTime(safeMaxMinutes)
			: `${maxHours}h 59min`;
	return Math.max(48, longestLabel.length * 7 + 12);
}

export function getChartEdgeLabelMargin(label: string, padding = 12): number {
	return Math.max(16, label.length * 4 + padding);
}
