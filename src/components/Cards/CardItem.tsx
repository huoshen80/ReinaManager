import CheckIcon from "@mui/icons-material/Check";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardMedia from "@mui/material/CardMedia";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { forwardRef, memo } from "react";
import { useStore } from "@/store/appStore";
import { getGameCover, getGameNsfwStatus } from "@/utils/game";
import type { CardItemProps } from "./types";
import { useCardInteraction } from "./useCardInteraction";

const noop = () => {};

/**
 * CardItem - 游戏卡片组件
 *
 * 由父级传入展示数据，避免卡片内部读取 React Query 缓存。
 */
export const CardItem = memo(
	forwardRef<HTMLDivElement, CardItemProps>(
		(
			{
				game,
				displayName,
				interaction,
				batch,
				removeAction,
				isOverlay,
				...props
			},
			ref,
		) => {
			const nsfwCoverReplace = useStore((s) => s.nsfwCoverReplace);
			const isActive = useStore((s) => s.selectedGameId === game.id);

			const { handlers } = useCardInteraction({
				onClick: interaction?.onClick ?? noop,
				onDoubleClick: interaction?.onDoubleClick ?? noop,
				useDelayedClick: interaction?.useDelayedClick ?? false,
			});

			const isNsfw = getGameNsfwStatus(game);
			const coverImage =
				nsfwCoverReplace && isNsfw ? "/images/NR18.png" : getGameCover(game);

			return (
				<Card
					ref={ref}
					className={`group relative min-w-24 max-w-full transition-shadow transition-colors ${isActive ? "ring-2 ring-[--mui-palette-primary-main] shadow-md" : ""}`}
					onContextMenu={interaction?.onContextMenu}
					{...props}
				>
					{batch?.selected && (
						<Box
							className="absolute top-1.5 left-1.5 z-2 h-5 w-5 flex items-center justify-center shadow-md"
							sx={{
								bgcolor: "primary.main",
								color: "primary.contrastText",
							}}
						>
							<CheckIcon className="text-18px" />
						</Box>
					)}
					{removeAction && (
						<Tooltip title={removeAction.title} enterDelay={1000}>
							<IconButton
								size="small"
								className="!absolute right-1 top-1 z-2 !p-0 opacity-0 group-hover:opacity-100"
								sx={{
									bgcolor: "error.main",
									color: "primary.contrastText",
									"&:hover": {
										bgcolor: "error.main",
									},
								}}
								onClick={(event) => {
									event.stopPropagation();
									removeAction.onRemove();
								}}
								onMouseDown={(event) => event.stopPropagation()}
							>
								<RemoveCircleIcon fontSize="medium" />
							</IconButton>
						</Tooltip>
					)}
					<CardActionArea
						{...handlers}
						className={`
							duration-100
							hover:shadow-lg hover:scale-105
							active:shadow-sm active:scale-95
							${isOverlay ? "shadow-lg scale-105" : ""}
						`}
					>
						<CardMedia
							component="img"
							className="h-auto aspect-[3/4] object-cover"
							image={coverImage}
							alt="Card Image"
							draggable="false"
							loading="lazy"
						/>
						<div
							className={`flex items-center justify-center h-8 px-1 w-full ${isActive ? "font-semibold text-[--mui-palette-primary-main]" : ""}`}
						>
							<span className="text-base truncate max-w-full">
								{displayName}
							</span>
						</div>
					</CardActionArea>
				</Card>
			);
		},
	),
);

CardItem.displayName = "CardItem";
