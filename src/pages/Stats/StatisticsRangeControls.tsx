import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import KeyboardDoubleArrowLeftIcon from "@mui/icons-material/KeyboardDoubleArrowLeft";
import KeyboardDoubleArrowRightIcon from "@mui/icons-material/KeyboardDoubleArrowRight";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import {
	Box,
	Button,
	ButtonBase,
	IconButton,
	Popover,
	ToggleButton,
	ToggleButtonGroup,
	Typography,
} from "@mui/material";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	formatLocalDate,
	resolveStatisticsDateRange,
	type StatisticsRange,
} from "./statsData";

interface CustomDates {
	startDate: string;
	endDate: string;
}

interface StatisticsRangeControlsProps {
	range: StatisticsRange;
	customDates: CustomDates;
	onRangeChange: (range: Exclude<StatisticsRange, "CUSTOM">) => void;
	onCustomApply: (dates: CustomDates) => void;
}

function parseDateKey(dateKey: string): Date {
	return new Date(`${dateKey}T00:00:00`);
}

function moveMonth(date: Date, offset: number): Date {
	return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

export function StatisticsRangeControls({
	range,
	customDates,
	onRangeChange,
	onCustomApply,
}: StatisticsRangeControlsProps) {
	const { t, i18n } = useTranslation();
	const todayDate = formatLocalDate(new Date());
	const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
	const [draftDates, setDraftDates] = useState(customDates);
	const [selectingEnd, setSelectingEnd] = useState(false);
	const [visibleMonth, setVisibleMonth] = useState(() =>
		parseDateKey(customDates.endDate || formatLocalDate(new Date())),
	);
	const todayMonth = todayDate.slice(0, 7);
	const monthTitle = useMemo(
		() =>
			new Intl.DateTimeFormat(i18n.language, {
				year: "numeric",
				month: "long",
			}).format(visibleMonth),
		[i18n.language, visibleMonth],
	);
	const weekdayLabels = useMemo(() => {
		const formatter = new Intl.DateTimeFormat(i18n.language, {
			weekday: "short",
		});
		return Array.from({ length: 7 }, (_, index) =>
			formatter.format(new Date(2026, 7, 2 + index)),
		);
	}, [i18n.language]);
	const calendarDays = useMemo(() => {
		const monthStart = new Date(
			visibleMonth.getFullYear(),
			visibleMonth.getMonth(),
			1,
		);
		const gridStart = new Date(monthStart);
		gridStart.setDate(gridStart.getDate() - monthStart.getDay());
		return Array.from({ length: 42 }, (_, index) => {
			const date = new Date(gridStart);
			date.setDate(gridStart.getDate() + index);
			return date;
		});
	}, [visibleMonth]);
	const isOpen = anchorEl !== null;
	const canApply = Boolean(
		draftDates.startDate &&
			draftDates.endDate &&
			resolveStatisticsDateRange(
				"CUSTOM",
				draftDates.startDate,
				draftDates.endDate,
			),
	);

	const handleOpen = (element: HTMLElement) => {
		const currentTodayDate = formatLocalDate(new Date());
		setDraftDates(customDates);
		setSelectingEnd(false);
		setVisibleMonth(parseDateKey(customDates.endDate || currentTodayDate));
		setAnchorEl(element);
	};

	const handleDayClick = (dateKey: string) => {
		if (!selectingEnd || !draftDates.startDate) {
			setDraftDates({ startDate: dateKey, endDate: "" });
			setSelectingEnd(true);
			return;
		}

		setDraftDates(
			dateKey < draftDates.startDate
				? { startDate: dateKey, endDate: draftDates.startDate }
				: { startDate: draftDates.startDate, endDate: dateKey },
		);
		setSelectingEnd(false);
	};

	const handleReset = () => {
		setDraftDates({ startDate: "", endDate: "" });
		setSelectingEnd(false);
		setVisibleMonth(parseDateKey(todayDate));
	};

	const handleApply = () => {
		if (!canApply) return;
		onCustomApply(draftDates);
		setAnchorEl(null);
	};

	return (
		<Box className="mb-4">
			<Box className="flex flex-wrap items-center gap-3">
				<ToggleButtonGroup
					exclusive
					size="small"
					value={range === "CUSTOM" ? null : range}
					onChange={(_, value: Exclude<StatisticsRange, "CUSTOM"> | null) => {
						if (value) onRangeChange(value);
					}}
					aria-label={t("pages.Stats.rangeSelector", "统计时间范围")}
				>
					<ToggleButton value="7D" className="!px-5">
						{t("pages.Stats.week", "周")}
					</ToggleButton>
					<ToggleButton value="30D" className="!px-5">
						{t("pages.Stats.month", "月")}
					</ToggleButton>
					<ToggleButton value="1Y" className="!px-5">
						{t("pages.Stats.year", "年")}
					</ToggleButton>
				</ToggleButtonGroup>
				<Button
					variant="outlined"
					color="inherit"
					startIcon={<CalendarMonthIcon />}
					onClick={(event) => handleOpen(event.currentTarget)}
					className={`!border-[var(--mui-palette-divider)] !px-4 !text-[var(--mui-palette-text-primary)] ${
						range === "CUSTOM" ? "!bg-[var(--mui-palette-action-selected)]" : ""
					}`}
				>
					{range === "CUSTOM" && customDates.startDate && customDates.endDate
						? `${customDates.startDate} - ${customDates.endDate}`
						: t("pages.Stats.customRange", "自定义")}
				</Button>
			</Box>

			<Popover
				open={isOpen}
				anchorEl={anchorEl}
				onClose={() => setAnchorEl(null)}
				anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
				transformOrigin={{ vertical: "top", horizontal: "left" }}
				slotProps={{
					paper: {
						className: "mt-2 w-[360px] max-w-[calc(100vw-32px)] p-4",
					},
				}}
			>
				<Box className="mb-3 flex items-center justify-between">
					<Box>
						<IconButton
							size="small"
							onClick={() =>
								setVisibleMonth((current) => moveMonth(current, -12))
							}
							aria-label={t("pages.Stats.previousYear", "上一年")}
						>
							<KeyboardDoubleArrowLeftIcon />
						</IconButton>
						<IconButton
							size="small"
							onClick={() =>
								setVisibleMonth((current) => moveMonth(current, -1))
							}
							aria-label={t("pages.Stats.previousMonth", "上个月")}
						>
							<ChevronLeftIcon />
						</IconButton>
					</Box>
					<Typography fontWeight={700}>{monthTitle}</Typography>
					<Box>
						<IconButton
							size="small"
							disabled={
								moveMonth(visibleMonth, 1).getTime() >
								parseDateKey(`${todayMonth}-01`).getTime()
							}
							onClick={() =>
								setVisibleMonth((current) => moveMonth(current, 1))
							}
							aria-label={t("pages.Stats.nextMonth", "下个月")}
						>
							<ChevronRightIcon />
						</IconButton>
						<IconButton
							size="small"
							disabled={
								moveMonth(visibleMonth, 12).getTime() >
								parseDateKey(`${todayMonth}-01`).getTime()
							}
							onClick={() =>
								setVisibleMonth((current) => moveMonth(current, 12))
							}
							aria-label={t("pages.Stats.nextYear", "下一年")}
						>
							<KeyboardDoubleArrowRightIcon />
						</IconButton>
					</Box>
				</Box>

				<Box className="mb-1 grid grid-cols-7 gap-1">
					{weekdayLabels.map((label) => (
						<Typography
							key={label}
							variant="caption"
							color="text.secondary"
							className="py-1 text-center"
						>
							{label}
						</Typography>
					))}
				</Box>
				<Box className="grid grid-cols-7 gap-1">
					{calendarDays.map((date) => {
						const dateKey = formatLocalDate(date);
						const isCurrentMonth = date.getMonth() === visibleMonth.getMonth();
						const isSelected =
							dateKey === draftDates.startDate ||
							dateKey === draftDates.endDate;
						const isInRange =
							Boolean(draftDates.startDate && draftDates.endDate) &&
							dateKey > draftDates.startDate &&
							dateKey < draftDates.endDate;
						const isFuture = dateKey > todayDate;
						return (
							<ButtonBase
								key={dateKey}
								disabled={isFuture}
								onClick={() => handleDayClick(dateKey)}
								aria-label={dateKey}
								aria-pressed={isSelected}
								className={`h-10 rounded-lg text-sm ${
									isSelected
										? "bg-[var(--mui-palette-primary-main)] text-[var(--mui-palette-primary-contrastText)]"
										: isInRange
											? "bg-[var(--mui-palette-action-selected)]"
											: "hover:bg-[var(--mui-palette-action-hover)]"
								} ${isFuture ? "opacity-30" : isCurrentMonth ? "" : "opacity-40"}`}
							>
								{date.getDate()}
							</ButtonBase>
						);
					})}
				</Box>

				<Box className="mt-4 flex items-center justify-between gap-2 border-0 border-t border-solid border-[var(--mui-palette-divider)] pt-3">
					<Typography
						variant="body2"
						color="text.secondary"
						className="min-w-0 truncate"
					>
						{draftDates.startDate || "—"} - {draftDates.endDate || "—"}
					</Typography>
					<Box className="shrink-0 flex gap-1">
						<Button
							size="small"
							startIcon={<RestartAltIcon />}
							onClick={handleReset}
						>
							{t("pages.Stats.reset", "重置")}
						</Button>
						<Button
							size="small"
							variant="contained"
							disabled={!canApply}
							onClick={handleApply}
						>
							{t("pages.Stats.apply", "应用")}
						</Button>
					</Box>
				</Box>
			</Popover>
		</Box>
	);
}
