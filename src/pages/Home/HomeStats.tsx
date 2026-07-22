import AccessTimeIcon from "@mui/icons-material/AccessTime";
import CalendarMonthIcon from "@mui/icons-material/CalendarMonth";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import TodayIcon from "@mui/icons-material/Today";
import {
	Box,
	Paper,
	Skeleton,
	ToggleButton,
	ToggleButtonGroup,
	Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { formatPlayTime } from "@/utils/dateTime";

type PlayTimePeriod = "week" | "month";

interface HomeStatsProps {
	totalGames: number;
	totalPlayTime: number;
	todayPlayTime: number;
	weekPlayTime: number;
	monthPlayTime: number;
	playTimePeriod: PlayTimePeriod;
	onPlayTimePeriodChange: (period: PlayTimePeriod) => void;
	gamesLoading: boolean;
	statsLoading: boolean;
}

export function HomeStats({
	totalGames,
	totalPlayTime,
	todayPlayTime,
	weekPlayTime,
	monthPlayTime,
	playTimePeriod,
	onPlayTimePeriodChange,
	gamesLoading,
	statsLoading,
}: HomeStatsProps) {
	const { t } = useTranslation();
	const periodValue = playTimePeriod === "week" ? weekPlayTime : monthPlayTime;
	const stats = [
		{
			key: "games",
			label: t("home.stats.totalGames", "总游戏数"),
			value: totalGames,
			icon: <SportsEsportsIcon />,
			loading: gamesLoading,
		},
		{
			key: "total",
			label: t("home.stats.totalPlayTime", "总游戏时长"),
			value: formatPlayTime(totalPlayTime),
			icon: <AccessTimeIcon />,
			loading: statsLoading,
		},
		{
			key: "today",
			label: t("home.stats.todayPlayTime", "今日时长"),
			value: formatPlayTime(todayPlayTime),
			icon: <TodayIcon />,
			loading: statsLoading,
		},
		{
			key: "period",
			label:
				playTimePeriod === "week"
					? t("home.stats.weekPlayTime", "本周时长")
					: t("home.stats.monthPlayTime", "本月时长"),
			value: formatPlayTime(periodValue),
			icon: <CalendarMonthIcon />,
			loading: statsLoading,
		},
	];

	return (
		<Paper
			variant="outlined"
			className="grid shrink-0 grid-cols-4 overflow-hidden"
		>
			{stats.map((stat, index) => (
				<Box
					key={stat.key}
					className="relative min-h-[88px] min-w-0 flex items-center gap-2 border-0 border-solid border-[var(--mui-palette-divider)] px-3 py-3.5 min-[1200px]:gap-3.5 min-[1200px]:px-4 min-[1536px]:px-6"
					sx={{
						"&::before": {
							content: '""',
							position: "absolute",
							left: 0,
							top: 18,
							bottom: 18,
							width: "1px",
							bgcolor: "divider",
							opacity: 0.55,
							display: index > 0 ? "block" : "none",
						},
					}}
				>
					<Box className="h-[42px] w-[42px] shrink-0 grid place-items-center min-[1200px]:h-12 min-[1200px]:w-12">
						{stat.icon}
					</Box>
					<Box className="min-w-0 flex-1">
						<Box className="flex w-full items-center gap-2">
							<Typography
								variant="body2"
								color="text.secondary"
								className="text-[13px] min-[1200px]:text-sm"
								noWrap
							>
								{stat.label}
							</Typography>
							{stat.key === "period" ? (
								<ToggleButtonGroup
									exclusive
									size="small"
									value={playTimePeriod}
									onChange={(_, value: PlayTimePeriod | null) => {
										if (value) onPlayTimePeriodChange(value);
									}}
									className="ml-auto shrink-0"
								>
									<ToggleButton
										value="week"
										className="!px-1.5 !py-0.5 !leading-6"
									>
										{t("home.stats.week", "周")}
									</ToggleButton>
									<ToggleButton
										value="month"
										className="!px-1.5 !py-0.5 !leading-6"
									>
										{t("home.stats.month", "月")}
									</ToggleButton>
								</ToggleButtonGroup>
							) : null}
						</Box>
						<Typography
							variant="h5"
							fontWeight={700}
							className="text-[22px] min-[1200px]:text-2xl"
							noWrap
							title={String(stat.value)}
						>
							{stat.loading ? <Skeleton width={90} /> : stat.value}
						</Typography>
					</Box>
				</Box>
			))}
		</Paper>
	);
}
