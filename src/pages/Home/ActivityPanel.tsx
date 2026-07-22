import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import HistoryIcon from "@mui/icons-material/History";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import {
	Avatar,
	Box,
	ButtonBase,
	CircularProgress,
	Paper,
	Skeleton,
	ToggleButton,
	ToggleButtonGroup,
	Typography,
} from "@mui/material";
import type { RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
	formatDateLabel,
	formatPlayTime,
	formatRelativeTime,
	isRecentRelativeTime,
} from "@/utils/dateTime";
import type { ActivityFilter, ActivityGroup, ActivityItem } from "./homeData";

interface ActivityPanelProps {
	filter: ActivityFilter;
	groups: ActivityGroup[];
	loading: boolean;
	fetchingMore: boolean;
	scrollRef: RefObject<HTMLDivElement | null>;
	sentinelRef: RefObject<HTMLDivElement | null>;
	onFilterChange: (filter: ActivityFilter) => void;
}

export function ActivityPanel({
	filter,
	groups,
	loading,
	fetchingMore,
	scrollRef,
	sentinelRef,
	onFilterChange,
}: ActivityPanelProps) {
	const { i18n, t } = useTranslation();

	const getDateLabel = (date: string) =>
		formatDateLabel(date, {
			language: i18n.language,
			todayLabel: t("home.activity.today", "今天"),
			yesterdayLabel: t("home.activity.yesterday", "昨天"),
		});

	const getPlaySummary = (activity: ActivityItem) => {
		const relativeTime = formatRelativeTime(activity.time);
		const count = activity.count ?? 1;
		const duration = formatPlayTime(activity.duration ?? 0);
		const absoluteTime = new Date(activity.time * 1000).toLocaleDateString();

		return relativeTime === absoluteTime
			? t("home.activity.playSummaryCompact", "{{count}}次 · 共{{duration}}", {
					count,
					duration,
				})
			: t(
					"home.activity.playSummary",
					"{{time}} · {{count}}次 · 共{{duration}}",
					{ time: relativeTime, count, duration },
				);
	};

	return (
		<Paper
			variant="outlined"
			className="h-full min-h-0 flex flex-col overflow-hidden p-3 min-[1200px]:p-4"
		>
			<Box className="mb-4 flex items-center gap-2">
				<HistoryIcon color="primary" />
				<Typography variant="h6" fontWeight={700}>
					{t("home.activityTitle", "动态")}
				</Typography>
				<ToggleButtonGroup
					exclusive
					size="small"
					value={filter}
					onChange={(_, value: ActivityFilter | null) => {
						if (!value) return;
						onFilterChange(value);
						scrollRef.current?.scrollTo({ top: 0 });
					}}
					className="ml-auto"
				>
					<ToggleButton value="all" className="!px-2.5 !py-0.5">
						{t("home.activity.filters.all", "全部")}
					</ToggleButton>
					<ToggleButton value="play" className="!px-2.5 !py-0.5">
						{t("home.activity.filters.play", "游玩")}
					</ToggleButton>
					<ToggleButton value="add" className="!px-2.5 !py-0.5">
						{t("home.activity.filters.add", "添加")}
					</ToggleButton>
				</ToggleButtonGroup>
			</Box>

			<Box ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
				{loading ? (
					<Box className="grid gap-4">
						{[1, 2, 3, 4, 5].map((item) => (
							<Skeleton key={item} variant="rounded" height={58} />
						))}
					</Box>
				) : groups.length === 0 ? (
					<Box className="h-full min-h-60 grid place-items-center text-[var(--mui-palette-text-secondary)]">
						<Typography>{t("home.activity.empty", "暂无动态")}</Typography>
					</Box>
				) : (
					groups.map((group) => (
						<Box key={group.date} className="mb-4.5">
							<Typography
								variant="body2"
								fontWeight={700}
								color="text.secondary"
								className="mb-2.5"
							>
								{getDateLabel(group.date)}
							</Typography>
							<Box
								className="relative pl-7"
								sx={{
									"&::before": {
										content: '""',
										position: "absolute",
										left: 13,
										top: 7,
										bottom: 7,
										width: "2px",
										bgcolor: "divider",
									},
								}}
							>
								{group.items.map((activity) => (
									<Box key={activity.id} className="relative">
										<Box
											className={`pointer-events-none absolute -left-6 top-5 z-1 grid h-5 w-5 place-items-center rounded-full bg-[var(--mui-palette-background-paper)] shadow-sm ${
												activity.type === "play"
													? "text-[var(--mui-palette-primary-main)]"
													: "text-[var(--mui-palette-success-main)]"
											}`}
										>
											{activity.type === "play" ? (
												<SportsEsportsIcon fontSize="small" />
											) : (
												<AddCircleOutlineIcon fontSize="small" />
											)}
										</Box>
										<ButtonBase
											component={Link}
											to={`/libraries/${activity.gameId}`}
											className="w-full justify-start rounded-2xl p-1.5 text-left hover:bg-[var(--mui-palette-action-hover)]"
										>
											<Avatar
												variant="rounded"
												src={activity.imageUrl}
												className="mr-3 h-12 w-12"
											/>
											<Box className="min-w-0">
												<Typography variant="body2" fontWeight={700} noWrap>
													{activity.type === "play"
														? t("home.activity.played", "游玩了 {{title}}", {
																title: activity.gameTitle,
															})
														: t("home.activity.added", "添加了 {{title}}", {
																title: activity.gameTitle,
															})}
												</Typography>
												{activity.type === "play" ||
												isRecentRelativeTime(activity.time) ? (
													<Typography
														variant="caption"
														color="text.secondary"
														noWrap
														className="block"
													>
														{activity.type === "play"
															? getPlaySummary(activity)
															: t("home.activity.addedAt", "添加于 {{time}}", {
																	time: formatRelativeTime(activity.time),
																})}
													</Typography>
												) : null}
											</Box>
										</ButtonBase>
									</Box>
								))}
							</Box>
						</Box>
					))
				)}
				<Box ref={sentinelRef} className="h-6 grid place-items-center">
					{fetchingMore ? <CircularProgress size={18} /> : null}
				</Box>
			</Box>
		</Paper>
	);
}
