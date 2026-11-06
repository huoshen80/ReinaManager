import CheckIcon from "@mui/icons-material/Check";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { forwardRef, memo } from "react";
import { SmartImage } from "@/components/SmartImage";
import { useStore } from "@/store/appStore";
import { getVisibleGameCover, getVisibleGameCoverKey } from "@/utils/game";
import type { CardItemProps, GameCardItemProps } from "./types";
import { useCardInteraction } from "./useCardInteraction";

const noop = () => {};

interface CardCoverImageProps {
	src: string;
	coverKey: string;
	alt: string;
}

const CardCoverImage = memo(
	({ src, alt }: CardCoverImageProps) => (
		<SmartImage
			src={src}
			alt={alt}
			draggable="false"
			loading="lazy"
			decoding="async"
			className="h-full w-full object-cover"
		/>
	),
	(previous, next) =>
		previous.coverKey === next.coverKey && previous.alt === next.alt,
);

CardCoverImage.displayName = "CardCoverImage";

interface CardContentProps {
	coverImage: string;
	coverKey: string;
	displayName: string;
	sortFieldValue?: string;
	isActive: boolean;
}

// 交互、批量选择与拖拽更新不进入展示层，只有实际显示值改变时才渲染内容。
const CardContent = memo(
	({
		coverImage,
		coverKey,
		displayName,
		sortFieldValue,
		isActive,
	}: CardContentProps) => (
		<>
			<Box className="relative aspect-[3/4] overflow-hidden">
				<CardCoverImage
					src={coverImage}
					coverKey={coverKey}
					alt={displayName}
				/>
				{sortFieldValue && (
					<Box className="pointer-events-none absolute inset-x-0 bottom-0 px-2.5 pt-6 pb-1.5 text-white [background:linear-gradient(to_bottom,transparent_0%,rgba(15,23,32,0.3)_50%,rgba(15,23,32,0.85)_100%)]">
						<Typography
							variant="caption"
							className="block truncate text-left text-13px font-600 drop-shadow"
						>
							{sortFieldValue}
						</Typography>
					</Box>
				)}
			</Box>
			<Box className="px-3 py-2.5 text-center">
				<Tooltip title={displayName} placement="top" arrow>
					<Typography
						variant="subtitle2"
						sx={{ color: isActive ? "primary.main" : "text.primary" }}
						className="text-base truncate"
					>
						{displayName}
					</Typography>
				</Tooltip>
			</Box>
		</>
	),
	(previous, next) =>
		// 只按实际封面身份更新图片，来源或封面版本变化时才重新加载。
		previous.coverKey === next.coverKey &&
		previous.displayName === next.displayName &&
		previous.sortFieldValue === next.sortFieldValue &&
		previous.isActive === next.isActive,
);

CardContent.displayName = "CardContent";

/** 列表顺序变化时，保持单张卡片的属性与交互边界稳定。 */
export const GameCardItem = memo(
	({ game, getCardProps, isOverlay, isDragging }: GameCardItemProps) => (
		<CardItem
			{...getCardProps(game)}
			isOverlay={isOverlay}
			isDragging={isDragging}
		/>
	),
);

GameCardItem.displayName = "GameCardItem";

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
				sortFieldOverlay,
				interaction,
				batch,
				removeAction,
				isOverlay,
				isDragging,
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
			const coverImage = getVisibleGameCover(game, nsfwCoverReplace);
			const coverKey = getVisibleGameCoverKey(game, nsfwCoverReplace);

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
						// 已识别为拖拽后卸载按下时的涟漪，防止松手后继续播放点击反馈。
						disableRipple={isDragging || isOverlay}
						className={`
							transition-[transform,box-shadow] duration-100
							${!isOverlay ? "hover:shadow-lg hover:scale-105" : ""}
							${!isDragging && !isOverlay ? "active:shadow-sm active:scale-95" : ""}
							${isOverlay ? "shadow-lg scale-105 [&_.MuiCardActionArea-focusHighlight]:opacity-[var(--mui-palette-action-hoverOpacity,0.04)]" : ""}
						`}
					>
						<CardContent
							coverImage={coverImage}
							coverKey={coverKey}
							displayName={displayName}
							sortFieldValue={sortFieldOverlay?.value}
							isActive={isActive}
						/>
					</CardActionArea>
				</Card>
			);
		},
	),
);

CardItem.displayName = "CardItem";
