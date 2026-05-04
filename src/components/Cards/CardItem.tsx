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
import { getGameCover, getGameNsfwStatus } from "@/utils/appUtils";
import type { CardItemProps } from "./types";
import { useCardInteraction } from "./useCardInteraction";

/**
 * CardItem - 游戏卡片组件
 */
export const CardItem = memo(
	forwardRef<HTMLDivElement, CardItemProps>(
		(
			{
				card,
				isBatchSelected,
				showBatchMarker,
				showRemoveFromCategory,
				onRemoveFromCategory,
				removeFromCategoryTitle,
				isOverlay,
				onContextMenu,
				onClick,
				onDoubleClick,
				onLongPress,
				displayName,
				useDelayedClick,
				...props
			},
			ref,
		) => {
			const nsfwCoverReplace = useStore((s) => s.nsfwCoverReplace);
			const isActive = useStore((s) => s.selectedGameId === card.id);
			const isNsfw = getGameNsfwStatus(card);

			const { isLongPressing, handlers } = useCardInteraction({
				onClick,
				onDoubleClick,
				onLongPress,
				useDelayedClick,
			});

			const coverImage =
				nsfwCoverReplace && isNsfw ? "/images/NR18.png" : getGameCover(card);

			return (
				<Card
					ref={ref}
					className={`group relative min-w-24 max-w-full transition-shadow transition-colors ${isActive ? "ring-2 ring-blue-500 shadow-md" : ""}`}
					onContextMenu={onContextMenu}
					{...props}
				>
					{showBatchMarker && isBatchSelected && (
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
					{showRemoveFromCategory && (
						<Tooltip title={removeFromCategoryTitle} enterDelay={1000}>
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
									onRemoveFromCategory?.();
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
							${isLongPressing ? "ring-2 ring-blue-500 shadow-lg" : ""}
							${isOverlay ? "shadow-lg scale-105" : ""}
						`}
					>
						<CardMedia
							component="img"
							className="h-auto aspect-[3/4] object-cover"
							image={coverImage}
							alt="Card Image"
							draggable="false"
						/>
						<div
							className={`flex items-center justify-center h-8 px-1 w-full ${isActive ? "font-semibold text-blue-500" : ""}`}
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
