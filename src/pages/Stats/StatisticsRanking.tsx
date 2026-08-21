import {
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	LinearProgress,
	Paper,
	Typography,
} from "@mui/material";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Virtuoso } from "react-virtuoso";
import { formatPlayTime } from "@/utils/dateTime";
import { getGameDisplayName, getVisibleGameCover } from "@/utils/game";
import type { StatisticsRankingItem } from "./statsData";

interface RankingListProps {
	items: StatisticsRankingItem[];
	replaceNsfwCover: boolean;
	onNavigate?: () => void;
}

interface RankingRowProps {
	item: StatisticsRankingItem;
	index: number;
	maxPlayTime: number;
	replaceNsfwCover: boolean;
	onNavigate?: () => void;
}

function RankingRow({
	item,
	index,
	maxPlayTime,
	replaceNsfwCover,
	onNavigate,
}: RankingRowProps) {
	const gameName = getGameDisplayName(item.game) || `#${item.game.id}`;
	return (
		<Box
			component={Link}
			to={`/libraries/${item.game.id}`}
			onClick={onNavigate}
			className="min-w-0 rounded-lg flex items-center gap-3 p-2 no-underline transition-colors hover:bg-[var(--mui-palette-action-hover)]"
			color="inherit"
		>
			<Typography
				variant="body2"
				color={index === 0 ? "primary" : "text.secondary"}
				fontWeight={700}
				className="w-7 shrink-0 text-center"
			>
				#{index + 1}
			</Typography>
			<img
				src={getVisibleGameCover(item.game, replaceNsfwCover)}
				alt=""
				loading="lazy"
				className="h-14 w-10 shrink-0 rounded object-cover bg-[var(--mui-palette-action-hover)]"
			/>
			<Box className="min-w-0 flex-1">
				<Box className="mb-1.5 flex items-center gap-2">
					<Typography
						variant="body2"
						fontWeight={600}
						noWrap
						className="min-w-0 flex-1"
					>
						{gameName}
					</Typography>
					<Typography
						variant="body2"
						color="text.secondary"
						className="shrink-0"
					>
						{formatPlayTime(item.playtime)}
					</Typography>
				</Box>
				<LinearProgress
					variant="determinate"
					value={maxPlayTime === 0 ? 0 : (item.playtime / maxPlayTime) * 100}
					className="!h-1.5 !rounded-full"
				/>
			</Box>
		</Box>
	);
}

function RankingList({
	items,
	replaceNsfwCover,
	onNavigate,
}: RankingListProps) {
	const maxPlayTime = items[0]?.playtime ?? 0;

	return (
		<Box className="min-w-0 grid gap-1.5">
			{items.map((item, index) => (
				<RankingRow
					key={item.game.id}
					item={item}
					index={index}
					maxPlayTime={maxPlayTime}
					replaceNsfwCover={replaceNsfwCover}
					onNavigate={onNavigate}
				/>
			))}
		</Box>
	);
}

interface StatisticsRankingProps {
	ranking: StatisticsRankingItem[];
	replaceNsfwCover: boolean;
}

export function StatisticsRanking({
	ranking,
	replaceNsfwCover,
}: StatisticsRankingProps) {
	const { t } = useTranslation();
	const [dialogOpen, setDialogOpen] = useState(false);
	const topTen = ranking.slice(0, 10);
	const maxPlayTime = ranking[0]?.playtime ?? 0;
	const renderVirtualItem = useCallback(
		(index: number, item: StatisticsRankingItem) => (
			<RankingRow
				item={item}
				index={index}
				maxPlayTime={maxPlayTime}
				replaceNsfwCover={replaceNsfwCover}
				onNavigate={() => setDialogOpen(false)}
			/>
		),
		[maxPlayTime, replaceNsfwCover],
	);

	return (
		<>
			<Paper
				variant="outlined"
				className="h-[520px] min-h-0 min-w-0 flex flex-col p-4 min-[1000px]:h-full"
			>
				<Box className="flex items-center justify-between gap-2">
					<Typography variant="h6" component="h2" fontWeight={700}>
						{t("pages.Stats.ranking", "游玩时长 Top 10")}
					</Typography>
					{ranking.length > 10 ? (
						<Button size="small" onClick={() => setDialogOpen(true)}>
							{t("pages.Stats.viewMore", "查看更多")}
						</Button>
					) : null}
				</Box>
				{topTen.length === 0 ? (
					<Box className="min-h-0 flex-1 grid place-items-center text-center">
						<Typography color="text.secondary">
							{t("pages.Stats.noRecords", "所选范围内暂无游玩记录")}
						</Typography>
					</Box>
				) : (
					<Box className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-gutter:stable]">
						<RankingList items={topTen} replaceNsfwCover={replaceNsfwCover} />
					</Box>
				)}
			</Paper>

			<Dialog
				open={dialogOpen}
				onClose={() => setDialogOpen(false)}
				fullWidth
				maxWidth="sm"
			>
				<DialogTitle className="!pb-2">
					{t("pages.Stats.rankingAll", "全部游玩时长排行")}
					<Typography variant="body2" color="text.secondary">
						{t("pages.Stats.rankingCount", "共 {{total}} 个游戏", {
							total: ranking.length,
						})}
					</Typography>
				</DialogTitle>
				<DialogContent dividers className="!h-[70dvh] !max-h-[720px] !p-2">
					<Virtuoso
						data={ranking}
						itemContent={renderVirtualItem}
						computeItemKey={(_, item) => item.game.id}
						overscan={200}
						style={{ height: "100%" }}
					/>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setDialogOpen(false)}>
						{t("common.close", "关闭")}
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
}
