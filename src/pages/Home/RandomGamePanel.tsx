import CasinoOutlinedIcon from "@mui/icons-material/CasinoOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RefreshIcon from "@mui/icons-material/Refresh";
import SyncIcon from "@mui/icons-material/Sync";
import {
	Box,
	Button,
	Chip,
	IconButton,
	Paper,
	Skeleton,
	Tooltip,
	Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { SmartImage } from "@/components/SmartImage";
import type { GameData } from "@/types";
import { getGameDisplayName } from "@/utils/game";
import { getVisibleCover } from "./homeData";

interface RandomGamePanelProps {
	game: GameData | null;
	replaceNsfwCover: boolean;
	isRunning: boolean;
	onShuffle: () => void;
	onLaunch: (game: GameData) => void;
	onSyncLocalPath: (game: GameData) => void;
}

export function RandomGamePanel({
	game,
	replaceNsfwCover,
	isRunning,
	onShuffle,
	onLaunch,
	onSyncLocalPath,
}: RandomGamePanelProps) {
	const { t } = useTranslation();

	return (
		<Paper
			variant="outlined"
			className="flex h-full min-h-0 flex-col justify-between overflow-hidden p-3 min-[1200px]:p-3.5"
		>
			<Box className="mb-2 flex items-center gap-2">
				<CasinoOutlinedIcon />
				<Typography variant="h6" fontWeight={700}>
					{t("home.random.title", "随机游戏")}
				</Typography>
				<Button
					size="small"
					startIcon={<RefreshIcon />}
					onClick={onShuffle}
					className="ml-auto"
				>
					{t("home.random.shuffle", "换一个")}
				</Button>
			</Box>
			{game ? (
				<Box className="grid grid-cols-[112px_minmax(0,1fr)_auto] items-center gap-4 min-[1200px]:grid-cols-[140px_minmax(0,1fr)_auto]">
					<SmartImage
						src={getVisibleCover(game, replaceNsfwCover)}
						alt=""
						className="h-21 w-full rounded-2xl object-cover"
					/>
					<Box className="min-w-0">
						<Typography
							variant="h6"
							fontWeight={700}
							noWrap
							title={getGameDisplayName(game)}
						>
							{getGameDisplayName(game)}
						</Typography>
						{game.developer ? (
							<Typography
								variant="body2"
								color="text.secondary"
								noWrap
								className="mt-0.5"
							>
								{game.developer}
							</Typography>
						) : null}
						<Box className="mt-1.5 flex min-w-0 gap-1.5 overflow-hidden">
							{game.tags?.slice(0, 3).map((tag) => (
								<Chip
									key={tag}
									label={tag}
									title={tag}
									size="small"
									variant="outlined"
									className="min-w-0 shrink"
									sx={{
										"& .MuiChip-label": {
											overflow: "hidden",
											textOverflow: "ellipsis",
											whiteSpace: "nowrap",
										},
									}}
								/>
							))}
						</Box>
					</Box>
					<Box className="flex justify-end gap-2">
						<Tooltip title={t("home.focus.details", "查看详情")}>
							<IconButton
								component={Link}
								to={`/libraries/${game.id}`}
								aria-label={t("home.focus.details", "查看详情")}
								className="!border border-solid border-[var(--mui-palette-divider)]"
							>
								<InfoOutlinedIcon />
							</IconButton>
						</Tooltip>
						<Button
							variant="contained"
							startIcon={game.localpath ? <PlayArrowIcon /> : <SyncIcon />}
							disabled={isRunning}
							onClick={() =>
								game.localpath ? onLaunch(game) : onSyncLocalPath(game)
							}
							className="flex-initial"
						>
							{isRunning
								? t("home.focus.running", "正在运行")
								: game.localpath
									? t("home.random.start", "启动游戏")
									: t("components.LaunchModal.syncLocalPath", "同步本地")}
						</Button>
					</Box>
				</Box>
			) : (
				<Skeleton variant="rounded" height={104} />
			)}
		</Paper>
	);
}
