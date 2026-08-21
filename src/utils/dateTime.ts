import i18next from "i18next";

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(time: string | number | Date): Date {
	if (time instanceof Date) return time;
	if (typeof time === "number") {
		return new Date(time * (time.toString().length === 10 ? 1000 : 1));
	}
	return new Date(/^\d{4}-\d{2}-\d{2}$/.test(time) ? `${time}T00:00:00` : time);
}

function startOfLocalWeek(date: Date): Date {
	const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const daysSinceMonday = (start.getDay() + 6) % 7;
	start.setDate(start.getDate() - daysSinceMonday);
	return start;
}

function isLastWeek(target: Date, now: Date): boolean {
	const thisWeek = startOfLocalWeek(now);
	const lastWeek = new Date(thisWeek);
	lastWeek.setDate(lastWeek.getDate() - 7);
	return target >= lastWeek && target < thisWeek;
}

function formatTime(date: Date): string {
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

interface FormatDateLabelOptions {
	language: string;
	todayLabel: string;
	yesterdayLabel: string;
	showRecentTime?: boolean;
}

export function formatDateLabel(
	time: string | number | Date,
	{
		language,
		todayLabel,
		yesterdayLabel,
		showRecentTime = false,
	}: FormatDateLabelOptions,
): string {
	const date = toDate(time);
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const target = new Date(date.getFullYear(), date.getMonth(), date.getDate());
	const diffDays = Math.round((today.getTime() - target.getTime()) / DAY_MS);

	if (diffDays === 0) {
		return showRecentTime ? formatTime(date) : todayLabel;
	}
	if (diffDays === 1) {
		if (!showRecentTime) return yesterdayLabel;
		return `${yesterdayLabel} ${formatTime(date)}`;
	}

	return new Intl.DateTimeFormat(language, {
		year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
		month: "long",
		day: "numeric",
	}).format(date);
}

export const getLocalDateString = (timestamp?: number): string => {
	const date = timestamp ? new Date(timestamp * 1000) : new Date();
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export function formatRelativeTime(time: string | number | Date): string {
	const now = new Date();
	const target = toDate(time);

	const diff = (now.getTime() - target.getTime()) / 1000;

	if (diff < 60) return i18next.t("utils.relativetime.justNow", "刚刚");
	if (diff < 3600) {
		const minutes = Math.floor(diff / 60);
		return i18next.t("utils.relativetime.minutesAgo", "{{count}}分钟前", {
			count: minutes,
		});
	}
	if (diff < 86400) {
		const hours = Math.floor(diff / 3600);
		return i18next.t("utils.relativetime.hoursAgo", "{{count}}小时前", {
			count: hours,
		});
	}
	if (diff < 7 * 86400) {
		const days = Math.floor(diff / 86400);
		return i18next.t("utils.relativetime.daysAgo", "{{count}}天前", {
			count: days,
		});
	}

	if (isLastWeek(target, now)) {
		return i18next.t("utils.relativetime.lastWeek", "上周");
	}

	return target.toLocaleDateString();
}

export function isRecentRelativeTime(time: string | number | Date): boolean {
	const now = new Date();
	const target = toDate(time);
	const diff = now.getTime() - target.getTime();
	return (diff >= 0 && diff < 7 * DAY_MS) || isLastWeek(target, now);
}

export function parsePlaytimeInput(
	hoursInput: string,
	minutesInput: string,
): number | null {
	if (!/^\d+$/.test(hoursInput) || !/^\d+$/.test(minutesInput)) {
		return null;
	}

	const hours = Number(hoursInput);
	const minutes = Number(minutesInput);
	if (
		!Number.isSafeInteger(hours) ||
		!Number.isSafeInteger(minutes) ||
		hours < 0 ||
		minutes < 0 ||
		minutes > 59
	) {
		return null;
	}

	const totalMinutes = hours * 60 + minutes;
	return Number.isSafeInteger(totalMinutes) ? totalMinutes : null;
}

export function formatPlayTime(minutes: number): string {
	if (!minutes)
		return i18next.t("utils.formatPlayTime.minutes", "{{count}}分钟", {
			count: 0,
		});

	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;

	if (hours >= 100) {
		const totalHoursAsFloat = Math.floor((minutes / 60) * 10) / 10;
		return i18next.t("utils.formatPlayTime.hours", "{{count}}小时", {
			count: totalHoursAsFloat,
		});
	}

	if (hours === 0) {
		return i18next.t("utils.formatPlayTime.minutes", "{{count}}分钟", {
			count: mins,
		});
	}

	if (mins > 0) {
		return i18next.t(
			"utils.formatPlayTime.hoursAndMinutes",
			"{{hours}}小时{{minutes}}分钟",
			{
				hours,
				minutes: mins,
			},
		);
	}
	return i18next.t("utils.formatPlayTime.hours", "{{count}}小时", {
		count: hours,
	});
}

export function formatCompactPlayTime(minutes: number | null): string {
	if (minutes === null) return "";

	const roundedMinutes = Math.round(minutes);
	const hours = Math.floor(roundedMinutes / 60);
	const remainingMinutes = roundedMinutes % 60;

	if (hours === 0) return `${remainingMinutes}min`;
	if (remainingMinutes === 0) return `${hours}h`;
	return `${hours}h ${remainingMinutes}min`;
}

export function formatChartDayLabel(value: string): string {
	const match = /^(?:\d{4})-(\d{2})-(\d{2})$/.exec(value);
	return match ? `${match[1]}-${match[2]}` : value;
}

export function formatChartMonthLabel(value: string): string {
	const match = /^(\d{4})-(\d{2})$/.exec(value);
	return match ? `${match[1].slice(-2)}/${match[2]}` : value;
}
