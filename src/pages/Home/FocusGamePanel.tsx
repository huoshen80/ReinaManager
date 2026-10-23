import HistoryIcon from "@mui/icons-material/History";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import StopIcon from "@mui/icons-material/Stop";
import {
	Alert,
	Box,
	Button,
	ButtonBase,
	Chip,
	CircularProgress,
	Paper,
	Skeleton,
	Typography,
} from "@mui/material";
import { useEffect, useLayoutEffect, useState } from "react";
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
	totalPlayTime?: number;
	recentGames: GameData[];
	lastPlayedMap: ReadonlyMap<number, number>;
	lastPlayedLoaded: boolean;
	lastPlayedError: boolean;
	lastPlayedFetching: boolean;
	onRetryLastPlayed: () => void;
	replaceNsfwCover: boolean;
	isStopping: boolean;
	onLaunch: (game: GameData) => void;
	onStop: () => void;
	onSelectRecent: (gameId: number) => void;
}

// 缓存封面方向（竖屏/横屏），防止游戏切换时因异步 onLoad 导致 1 帧平铺闪烁
const coverAspectCache = new Map<string, boolean>();

function getCoverIsPortrait(url: string): boolean | undefined {
	if (!url) return undefined;
	if (coverAspectCache.has(url)) {
		return coverAspectCache.get(url);
	}
	if (typeof window !== "undefined") {
		const img = new Image();
		img.src = url;
		if (img.complete && img.naturalWidth > 0) {
			const isPortrait = img.naturalHeight > img.naturalWidth;
			coverAspectCache.set(url, isPortrait);
			return isPortrait;
		}
	}
	return undefined;
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
	lastPlayedLoaded,
	lastPlayedError,
	lastPlayedFetching,
	onRetryLastPlayed,
	replaceNsfwCover,
	isStopping,
	onLaunch,
	onStop,
	onSelectRecent,
}: FocusGamePanelProps) {
	const { t } = useTranslation();
	const hasPlayed = lastPlayed !== undefined;
	const coverUrl = game ? getVisibleCover(game, replaceNsfwCover) : "";

	const cachedIsPortrait = getCoverIsPortrait(coverUrl);
	const [coverLayout, setCoverLayout] = useState<{
		url: string;
		isPortrait: boolean;
	} | null>(null);

	const isPortraitCover =
		cachedIsPortrait ??
		(coverLayout?.url === coverUrl ? coverLayout.isPortrait : false);

	// 预加载 recentGames 的封面宽高比，消除点击最近游戏列表时的布局闪烁
	useEffect(() => {
		for (const recentGame of recentGames) {
			const url = getVisibleCover(recentGame, replaceNsfwCover);
			getCoverIsPortrait(url);
		}
	}, [recentGames, replaceNsfwCover]);

	// 当 coverUrl 变化时，若浏览器已缓存该图片则同步更新布局状态
	useLayoutEffect(() => {
		if (!coverUrl) return;
		const isPortrait = getCoverIsPortrait(coverUrl);
		if (isPortrait !== undefined) {
			setCoverLayout({ url: coverUrl, isPortrait });
		}
	}, [coverUrl]);

	return (
		<Paper
			variant="outlined"
			className="relative h-full min-h-0 overflow-hidden !bg-[var(--mui-palette-grey-900)] !text-white"
		>
			{lastPlayedError ? (
				<Alert
					severity="error"
					className="absolute left-3 right-3 top-3 z-2"
					action={
						<Button
							color="inherit"
							size="small"
							disabled={lastPlayedFetching}
							onClick={onRetryLastPlayed}
						>
							{t("common.retry", "重试")}
						</Button>
					}
				>
					{t("common.lastPlayedLoadFailed", "最近游玩记录读取失败")}
				</Alert>
			) : null}
			{game ? (
				<>
					<Box
						component="img"
						src={coverUrl}
						alt=""
						className={`absolute inset-0 h-full w-full object-cover ${
							isPortraitCover ? "scale-110 blur-2xl" : ""
						}`}
						onLoad={(event) => {
							const image = event.currentTarget;
							if (image.naturalWidth > 0) {
								const isPortrait = image.naturalHeight > image.naturalWidth;
								coverAspectCache.set(coverUrl, isPortrait);
								setCoverLayout({
									url: coverUrl,
									isPortrait,
								});
							}
						}}
					/>
					{isPortraitCover ? (
						<Box
							className="absolute inset-y-3 right-3 w-[48%]"
							sx={{
								maskImage: "linear-gradient(90deg, transparent 0%, black 28%)",
							}}
						>
							<Box
								component="img"
								src={coverUrl}
								alt=""
								className="h-full w-full object-contain object-right drop-shadow-[0_8px_24px_rgba(0,0,0,.45)]"
							/>
						</Box>
					) : null}
					<Box
						className="absolute inset-0"
						sx={{
							background: isPortraitCover
								? "linear-gradient(90deg, rgba(7, 13, 27, .96) 0%, rgba(7, 13, 27, .82) 42%, rgba(7, 13, 27, .24) 72%, rgba(7, 13, 27, .34) 100%)"
								: "linear-gradient(90deg, rgba(7, 13, 27, .94) 0%, rgba(7, 13, 27, .76) 42%, rgba(7, 13, 27, .18) 76%, rgba(7, 13, 27, .32) 100%)",
						}}
					/>
					<Box
						className={`relative z-1 h-full flex flex-col p-5 ${lastPlayedError ? "pt-18" : ""}`}
					>
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
							className={`mt-3 line-clamp-2 text-[26px] leading-[1.2] font-800 min-[1200px]:text-[34px] ${
								isPortraitCover ? "max-w-[58%]" : "max-w-[72%]"
							}`}
							title={getGameDisplayName(game)}
						>
							{getGameDisplayName(game)}
						</Typography>
						<Box className="mt-2">
							{isRunning && realTimeState ? (
								<RunningGameTimer {...realTimeState} />
							) : !lastPlayedLoaded ? (
								<Skeleton width={180} />
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
								total: formatPlayTime(totalPlayTime ?? 0),
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
			) : lastPlayedError ? null : (
				<Skeleton variant="rectangular" width="100%" height="100%" />
			)}
		</Paper>
	);
}
