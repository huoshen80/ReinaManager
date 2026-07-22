import HistoryIcon from "@mui/icons-material/History";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import {
	Box,
	Button,
	ButtonBase,
	Chip,
	CircularProgress,
	Paper,
	Skeleton,
	Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { GameData, TimeTrackingMode } from "@/types";
import { formatPlayTime, formatRelativeTime } from "@/utils/dateTime";
import { getGameDisplayName } from "@/utils/game";
import { getVisibleCover } from "./homeData";
import { RunningGameTimer } from "./RunningGameTimer";

interface FocusRealTimeState {
	currentSessionMinutes: number;
	currentSessionSeconds: number;
	startTime: number;
	timeTrackingMode: TimeTrackingMode;
}

interface FocusGamePanelProps {
	game: GameData | null;
	isRunning: boolean;
	realTimeState?: FocusRealTimeState;
	lastPlayed?: number;
	weekPlayTime: number;
	totalPlayTime?: string;
	recentGames: GameData[];
	lastPlayedMap: ReadonlyMap<number, number>;
	replaceNsfwCover: boolean;
	isStopping: boolean;
	onLaunch: (game: GameData) => void;
	onStop: () => void;
	onSelectRecent: (gameId: number) => void;
}

export function FocusGamePanel({
	game,
	isRunning,
	realTimeState,
	lastPlayed,
	weekPlayTime,
	totalPlayTime,
	recentGames,
	lastPlayedMap,
	replaceNsfwCover,
	isStopping,
	onLaunch,
	onStop,
	onSelectRecent,
}: FocusGamePanelProps) {
	const { t } = useTranslation();
	const hasPlayed = lastPlayed !== undefined;

	return (
		<Paper
			variant="outlined"
			className="relative h-full min-h-0 overflow-hidden !bg-[var(--mui-palette-grey-900)] !text-white"
		>
			{game ? (
				<>
					<Box
						component="img"
						src={getVisibleCover(game, replaceNsfwCover)}
						alt=""
						className="absolute inset-0 h-full w-full object-cover"
					/>
					<Box
						className="absolute inset-0"
						sx={{
							background:
								"linear-gradient(90deg, rgba(7, 13, 27, .94) 0%, rgba(7, 13, 27, .76) 42%, rgba(7, 13, 27, .18) 76%, rgba(7, 13, 27, .32) 100%)",
						}}
					/>
					<Box className="relative z-1 h-full flex flex-col p-5">
						<Chip
							label={
								isRunning
									? t("home.focus.running", "正在运行")
									: hasPlayed
										? t("home.focus.continue", "继续游戏")
										: t("home.random.start", "启动游戏")
							}
							size="small"
							className="!self-start !bg-[rgba(37,99,235,.72)] !font-700 !text-white"
						/>
						<Typography
							component="h1"
							className="mt-3 max-w-[72%] line-clamp-2 text-[26px] leading-[1.2] font-800 min-[1200px]:text-[34px]"
							title={getGameDisplayName(game)}
						>
							{getGameDisplayName(game)}
						</Typography>
						<Box className="mt-2">
							{isRunning && realTimeState ? (
								<RunningGameTimer {...realTimeState} />
							) : (
								<Typography className="text-[rgba(255,255,255,.78)]">
									{lastPlayed
										? t("home.focus.lastPlayed", "上次游玩：{{time}}", {
												time: formatRelativeTime(lastPlayed),
											})
										: t("home.focus.notPlayed", "还没有游玩记录")}
								</Typography>
							)}
						</Box>
						<Typography className="mt-1 text-[rgba(255,255,255,.78)]">
							{t("home.focus.playTime", "本周 {{week}} · 总计 {{total}}", {
								week: formatPlayTime(weekPlayTime),
								total: totalPlayTime ?? formatPlayTime(0),
							})}
						</Typography>
						<Box className="mt-3 flex flex-wrap gap-2.5">
							{isRunning ? (
								<Button
									variant="contained"
									color="error"
									startIcon={
										isStopping ? (
											<CircularProgress size={16} color="inherit" />
										) : (
											<StopIcon />
										)
									}
									disabled={isStopping}
									onClick={onStop}
								>
									{isStopping
										? t("components.LaunchModal.stoppingGame", "停止游戏中...")
										: t("components.LaunchModal.stopGame", "停止游戏")}
								</Button>
							) : (
								<Button
									variant="contained"
									startIcon={<PlayArrowIcon />}
									onClick={() => onLaunch(game)}
								>
									{t("home.random.start", "启动游戏")}
								</Button>
							)}
							<Button
								component={Link}
								to={`/libraries/${game.id}`}
								variant="outlined"
								startIcon={<InfoOutlinedIcon />}
								className="!border-[rgba(255,255,255,.55)] !text-white hover:!border-white hover:!bg-[rgba(255,255,255,.08)]"
							>
								{t("home.focus.details", "查看详情")}
							</Button>
						</Box>

						{recentGames.length > 0 ? (
							<Box className="mt-auto pt-2 [@media(max-height:705px)]:hidden">
								<Box className="mb-1.5 flex items-center gap-2">
									<HistoryIcon fontSize="small" />
									<Typography variant="body2" fontWeight={700}>
										{t("home.focus.recent", "最近玩过")}
									</Typography>
								</Box>
								<Box className="grid grid-cols-4 gap-2">
									{recentGames.map((recentGame) => {
										const recentLastPlayed = lastPlayedMap.get(recentGame.id);
										return (
											<ButtonBase
												key={recentGame.id}
												onClick={() => onSelectRecent(recentGame.id)}
												className="h-13 min-w-0 flex justify-start overflow-hidden rounded-2xl border border-solid bg-[rgba(7,13,27,.48)] text-left"
												sx={{
													borderColor:
														game.id === recentGame.id
															? "primary.light"
															: "rgba(255,255,255,.22)",
												}}
											>
												<Box
													component="img"
													src={getVisibleCover(recentGame, replaceNsfwCover)}
													alt=""
													className="h-full w-[50px] shrink-0 object-cover"
												/>
												<Box className="min-w-0 px-2">
													<Typography variant="body2" fontWeight={700} noWrap>
														{getGameDisplayName(recentGame)}
													</Typography>
													<Typography
														variant="caption"
														className="text-[rgba(255,255,255,.66)]"
														noWrap
													>
														{recentLastPlayed
															? formatRelativeTime(recentLastPlayed)
															: t("home.focus.notPlayedShort", "未游玩")}
													</Typography>
												</Box>
											</ButtonBase>
										);
									})}
								</Box>
							</Box>
						) : null}
					</Box>
				</>
			) : (
				<Skeleton variant="rectangular" width="100%" height="100%" />
			)}
		</Paper>
	);
}
