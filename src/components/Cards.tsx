/**
 * @file Cards 卡片列表组件
 * @description 游戏卡片网格列表，支持拖拽排序、右键菜单、点击/双击/长按交互
 * @module src/components/Cards/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	DragOverlay,
	type DragStartEvent,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import {
	arrayMove,
	rectSortingStrategy,
	SortableContext,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import CheckIcon from "@mui/icons-material/Check";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardMedia from "@mui/material/CardMedia";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import {
	forwardRef,
	memo,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { CardsBatchBar } from "@/components/CardsBatchBar";
import RightMenu from "@/components/RightMenu";
import {
	useCategoryGameIds,
	useUpdateCategoryGames,
} from "@/hooks/queries/useCollections";
import { snackbar } from "@/providers/snackBar";
import { useStore } from "@/store/appStore";
import { useGamePlayStore } from "@/store/gamePlayStore";
import type { GameData } from "@/types";
import {
	getGameCover,
	getGameDisplayName,
	getGameNsfwStatus,
	saveScrollPosition,
} from "@/utils/appUtils";
import { getUserErrorMessage } from "@/utils/errors";

// ============================================================================
// 类型定义
// ============================================================================

/** CardItem 组件的 Props */
interface CardItemProps extends React.HTMLAttributes<HTMLDivElement> {
	/** 游戏数据 */
	card: GameData;
	/** 是否为当前选中的卡片 */
	isActive: boolean;
	/** 是否被批量选择 */
	isBatchSelected?: boolean;
	/** 是否显示批量选择标志 */
	showBatchMarker?: boolean;
	/** 是否显示移出分类按钮 */
	showRemoveFromCategory?: boolean;
	/** 移出分类事件 */
	onRemoveFromCategory?: () => void;
	/** 移出分类提示 */
	removeFromCategoryTitle?: string;
	/** 是否为拖拽时的浮层预览 */
	isOverlay?: boolean;
	/** 右键菜单事件 */
	onContextMenu: (e: React.MouseEvent) => void;
	/** 点击事件 */
	onClick: () => void;
	/** 双击事件 */
	onDoubleClick: () => void;
	/** 长按事件 */
	onLongPress: () => void;
	/** 显示名称 */
	displayName: string;
	/** 是否启用延迟点击（用于区分单击和双击） */
	useDelayedClick: boolean;
}

/** SortableCardItem 组件的 Props（不包含 style 和 ref） */
type SortableCardItemProps = Omit<CardItemProps, "style" | "ref">;

/** Cards 组件的 Props */
interface CardsProps {
	/** 游戏数据（由调用方提供） */
	gamesData: GameData[];
	/** 分类 ID（可选，用于启用拖拽排序） */
	categoryId?: number;
}

/** 右键菜单位置状态 */
interface MenuPosition {
	mouseX: number;
	mouseY: number;
	cardId: number | null;
}

// ============================================================================
// 自定义 Hooks
// ============================================================================

/**
 * 卡片交互 Hook - 处理点击、双击、长按逻辑
 * 使用 useRef 管理计时器，避免不必要的重渲染
 */
function useCardInteraction(options: {
	onClick: () => void;
	onDoubleClick: () => void;
	onLongPress: () => void;
	useDelayedClick: boolean;
}) {
	const { onClick, onDoubleClick, onLongPress, useDelayedClick } = options;

	// 使用 ref 管理计时器，避免 state 更新导致重渲染
	const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const hasLongPressedRef = useRef(false);
	const [isLongPressing, setIsLongPressing] = useState(false);

	// 清理计时器
	const clearClickTimeout = useCallback(() => {
		if (clickTimeoutRef.current) {
			clearTimeout(clickTimeoutRef.current);
			clickTimeoutRef.current = null;
		}
	}, []);

	const clearLongPressTimeout = useCallback(() => {
		if (longPressTimeoutRef.current) {
			clearTimeout(longPressTimeoutRef.current);
			longPressTimeoutRef.current = null;
		}
	}, []);

	// 点击处理
	const handleClick = useCallback(() => {
		if (hasLongPressedRef.current) {
			hasLongPressedRef.current = false;
			return;
		}

		if (useDelayedClick) {
			clearClickTimeout();
			clickTimeoutRef.current = setTimeout(() => {
				onClick();
				clickTimeoutRef.current = null;
			}, 200);
		} else {
			onClick();
		}
	}, [onClick, useDelayedClick, clearClickTimeout]);

	// 双击处理
	const handleDoubleClick = useCallback(() => {
		if (useDelayedClick) {
			clearClickTimeout();
		}
		onDoubleClick();
	}, [onDoubleClick, useDelayedClick, clearClickTimeout]);

	// 鼠标按下 - 开始长按计时
	const handleMouseDown = useCallback(() => {
		hasLongPressedRef.current = false;
		clearLongPressTimeout();

		longPressTimeoutRef.current = setTimeout(() => {
			setIsLongPressing(true);
			hasLongPressedRef.current = true;
			onLongPress();
		}, 800);
	}, [onLongPress, clearLongPressTimeout]);

	// 鼠标抬起 - 结束长按
	const handleMouseUp = useCallback(() => {
		clearLongPressTimeout();
		setIsLongPressing(false);

		// 延迟重置，避免触发点击事件
		setTimeout(() => {
			hasLongPressedRef.current = false;
		}, 50);
	}, [clearLongPressTimeout]);

	// 鼠标离开 - 取消长按
	const handleMouseLeave = useCallback(() => {
		clearLongPressTimeout();
		setIsLongPressing(false);
	}, [clearLongPressTimeout]);

	// 组件卸载时清理计时器
	useEffect(() => {
		return () => {
			clearClickTimeout();
			clearLongPressTimeout();
		};
	}, [clearClickTimeout, clearLongPressTimeout]);

	return {
		isLongPressing,
		handlers: {
			onClick: handleClick,
			onDoubleClick: handleDoubleClick,
			onMouseDown: handleMouseDown,
			onMouseUp: handleMouseUp,
			onMouseLeave: handleMouseLeave,
		},
	};
}

/**
 * 拖拽排序 Hook - 管理拖拽相关状态和逻辑
 */
function useDragSort(options: {
	gamesData: GameData[];
	categoryId?: number;
	enabled: boolean;
}) {
	const { gamesData, categoryId, enabled } = options;
	const updateCategoryGamesMutation = useUpdateCategoryGames();

	const [games, setGames] = useState(gamesData);
	const [activeId, setActiveId] = useState<number | null>(null);
	const isDraggingRef = useRef(false);

	// 同步外部数据到本地状态（仅在非拖拽状态下）
	useEffect(() => {
		if (!isDraggingRef.current) {
			setGames(gamesData);
		}
	}, [gamesData]);

	// 传感器配置
	const sensors = useSensors(
		useSensor(MouseSensor, {
			activationConstraint: { distance: 10 },
		}),
		useSensor(TouchSensor, {
			activationConstraint: { delay: 250, tolerance: 5 },
		}),
	);

	const handleDragStart = useCallback(
		(event: DragStartEvent) => {
			if (!enabled) return;
			isDraggingRef.current = true;
			setActiveId(event.active.id as number);
		},
		[enabled],
	);

	const handleDragEnd = useCallback(
		async (event: DragEndEvent) => {
			const { active, over } = event;
			setActiveId(null);

			if (!over || active.id === over.id || !categoryId) {
				isDraggingRef.current = false;
				return;
			}

			const oldIndex = games.findIndex((g) => g.id === active.id);
			const newIndex = games.findIndex((g) => g.id === over.id);

			if (oldIndex !== -1 && newIndex !== -1) {
				const newGames = arrayMove(games, oldIndex, newIndex);
				setGames(newGames);

				try {
					const gameIds = newGames.map((g) => g.id as number);
					await updateCategoryGamesMutation.mutateAsync({
						categoryId,
						gameIds,
					});
				} catch (error) {
					console.error("排序更新失败:", error);
					setGames(games); // 回滚
				}
			}

			// 延迟重置拖拽状态
			setTimeout(() => {
				isDraggingRef.current = false;
			}, 100);
		},
		[games, categoryId, updateCategoryGamesMutation],
	);

	const activeGame = useMemo(
		() => games.find((g) => g.id === activeId),
		[activeId, games],
	);

	return {
		games,
		activeId,
		activeGame,
		sensors,
		handleDragStart,
		handleDragEnd,
	};
}

// ============================================================================
// 子组件
// ============================================================================

/**
 * CardItem - 游戏卡片组件
 */
export const CardItem = memo(
	forwardRef<HTMLDivElement, CardItemProps>(
		(
			{
				card,
				isActive,
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
					className={`group relative min-w-24 max-w-full transition-transform [content-visibility:auto] [contain-intrinsic-size:auto_280px] ${isActive ? "scale-y-105" : "scale-y-100"}`}
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
								color="error"
								className="!absolute right-1 top-1 z-2 !p-0 opacity-0 !bg-transparent hover:!bg-transparent group-hover:opacity-100"
								onClick={(event) => {
									event.stopPropagation();
									onRemoveFromCategory?.();
								}}
								onMouseDown={(event) => event.stopPropagation()}
							>
								<RemoveCircleOutlineIcon className="text-28px" />
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
							className="h-auto aspect-[3/4]"
							image={coverImage}
							alt="Card Image"
							draggable="false"
							loading="lazy"
						/>
						<div
							className={`flex items-center justify-center h-8 px-1 w-full ${isActive ? "!font-bold text-blue-500" : ""}`}
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

/**
 * SortableCardItem - 可排序的卡片包装组件
 */
const SortableCardItem = memo((props: SortableCardItemProps) => {
	const { card, ...restProps } = props;
	const cardId = card.id ?? 0;

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: cardId });

	const style = useMemo(
		() => ({
			transform: CSS.Transform.toString(transform),
			transition,
			opacity: isDragging ? 0 : 1,
			zIndex: isDragging ? 1000 : ("auto" as const),
		}),
		[transform, transition, isDragging],
	);

	return (
		<CardItem
			ref={setNodeRef}
			style={style}
			card={card}
			{...restProps}
			{...attributes}
			{...listeners}
		/>
	);
});

SortableCardItem.displayName = "SortableCardItem";

// ============================================================================
// 主组件
// ============================================================================

/**
 * Cards - 游戏卡片网格列表
 */
const Cards: React.FC<CardsProps> = ({ gamesData, categoryId }) => {
	const { i18n, t } = useTranslation();
	const navigate = useNavigate();
	const path = useLocation().pathname;
	const isLibraries = path === "/libraries";
	const isCollectionCategory = typeof categoryId === "number" && categoryId > 0;
	const canUseBatchMode = isLibraries || isCollectionCategory;

	// Store 状态
	const {
		selectedGameId,
		setSelectedGameId,
		cardClickMode,
		doubleClickLaunch,
		longPressLaunch,
	} = useStore(
		useShallow((s) => ({
			selectedGameId: s.selectedGameId,
			setSelectedGameId: s.setSelectedGameId,
			cardClickMode: s.cardClickMode,
			doubleClickLaunch: s.doubleClickLaunch,
			longPressLaunch: s.longPressLaunch,
		})),
	);
	const launchGame = useGamePlayStore((s) => s.launchGame);
	const [batchMode, setBatchMode] = useState(false);
	const [selectedBatchGameIds, setSelectedBatchGameIds] = useState<number[]>(
		[],
	);
	const selectedBatchGameIdSet = useMemo(
		() => new Set(selectedBatchGameIds),
		[selectedBatchGameIds],
	);
	const showBatchControls = canUseBatchMode && batchMode;
	const categoryGameIdsQuery = useCategoryGameIds(
		isCollectionCategory ? categoryId : null,
	);
	const updateCategoryGamesMutation = useUpdateCategoryGames();

	// 右键菜单状态
	const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

	// 判断是否启用拖拽排序
	const isSortable =
		!!categoryId &&
		categoryId > 0 &&
		!longPressLaunch &&
		!showBatchControls &&
		!!gamesData;

	// 拖拽排序 Hook
	const { games, activeGame, sensors, handleDragStart, handleDragEnd } =
		useDragSort({
			gamesData,
			categoryId,
			enabled: isSortable,
		});

	// 缓存 SortableContext 的 items 数组，避免每次渲染重新创建
	const sortableIds = useMemo(() => games.map((g) => g.id as number), [games]);
	const gameIds = useMemo(
		() => games.map((game) => game.id).filter((id): id is number => id != null),
		[games],
	);
	const selectionScope = `${path}:${categoryId ?? "all"}`;

	useEffect(() => {
		void selectionScope;
		setBatchMode(false);
		setSelectedBatchGameIds([]);
	}, [selectionScope]);

	const toggleBatchGame = useCallback((gameId: number) => {
		setSelectedBatchGameIds((prev) =>
			prev.includes(gameId)
				? prev.filter((id) => id !== gameId)
				: [...prev, gameId],
		);
	}, []);

	// 卡片事件处理器
	const handleCardClick = useCallback(
		(cardId: number, _card: GameData) => {
			if (showBatchControls) {
				toggleBatchGame(cardId);
				return;
			}

			if (cardClickMode === "navigate") {
				setSelectedGameId(cardId);
				saveScrollPosition(window.location.pathname);
				navigate(`/libraries/${cardId}`);
			} else {
				setSelectedGameId(cardId);
			}
		},
		[
			cardClickMode,
			navigate,
			setSelectedGameId,
			showBatchControls,
			toggleBatchGame,
		],
	);

	const handleCardDoubleClick = useCallback(
		async (cardId: number, card: GameData) => {
			if (showBatchControls) return;

			if (doubleClickLaunch && card.localpath) {
				setSelectedGameId(cardId);
				try {
					const result = await launchGame(card.localpath, cardId, {
						le_launch: card.le_launch === 1,
						magpie: card.magpie === 1,
					});
					if (!result.success) {
						snackbar.error(result.message);
					}
				} catch (error) {
					snackbar.error(getUserErrorMessage(error, i18n.t.bind(i18n)));
				}
			}
		},
		[doubleClickLaunch, launchGame, setSelectedGameId, showBatchControls, i18n],
	);

	const handleCardLongPress = useCallback(
		async (cardId: number, card: GameData) => {
			if (showBatchControls) return;

			if (longPressLaunch && card.localpath) {
				setSelectedGameId(cardId);
				try {
					const result = await launchGame(card.localpath, cardId, {
						le_launch: card.le_launch === 1,
						magpie: card.magpie === 1,
					});
					if (!result.success) {
						snackbar.error(result.message);
					}
				} catch (error) {
					snackbar.error(getUserErrorMessage(error, i18n.t.bind(i18n)));
				}
			}
		},
		[longPressLaunch, launchGame, setSelectedGameId, showBatchControls, i18n],
	);

	const handleContextMenu = useCallback(
		(event: React.MouseEvent, cardId: number) => {
			if (showBatchControls) {
				event.preventDefault();
				return;
			}

			setMenuPosition({
				mouseX: event.clientX,
				mouseY: event.clientY,
				cardId,
			});
			setSelectedGameId(cardId);
		},
		[setSelectedGameId, showBatchControls],
	);

	const closeMenu = useCallback(() => setMenuPosition(null), []);

	const handleRemoveFromCategory = useCallback(
		async (targetGameIds: number[]) => {
			if (!isCollectionCategory || !categoryId) return;

			const targetGameIdSet = new Set(targetGameIds);
			const categoryGameIds = categoryGameIdsQuery.data ?? gameIds;
			const nextGameIds = categoryGameIds.filter(
				(id) => !targetGameIdSet.has(id),
			);

			await updateCategoryGamesMutation.mutateAsync({
				categoryId,
				gameIds: nextGameIds,
			});

			setSelectedBatchGameIds((prev) =>
				prev.filter((selectedId) => !targetGameIdSet.has(selectedId)),
			);
		},
		[
			categoryGameIdsQuery.data,
			categoryId,
			gameIds,
			isCollectionCategory,
			updateCategoryGamesMutation,
		],
	);

	const handleRemoveSingleFromCategory = useCallback(
		async (cardId: number) => {
			try {
				await handleRemoveFromCategory([cardId]);
				snackbar.success(
					t("components.Cards.removeFromCategorySuccess", {
						defaultValue: "已从当前分类移除",
					}),
				);
			} catch (error) {
				console.error("移出分类失败:", error);
				snackbar.error(
					t("components.Cards.removeFromCategoryFailed", {
						defaultValue: "移出分类失败",
					}),
				);
			}
		},
		[handleRemoveFromCategory, t],
	);

	// 渲染单个卡片的 props 生成器
	const getCardProps = useCallback(
		(card: GameData): SortableCardItemProps => ({
			card,
			isActive: selectedGameId === card.id,
			isBatchSelected:
				card.id != null ? selectedBatchGameIdSet.has(card.id) : false,
			showBatchMarker: showBatchControls,
			showRemoveFromCategory: isCollectionCategory && !showBatchControls,
			onRemoveFromCategory: () =>
				card.id != null && handleRemoveSingleFromCategory(card.id),
			removeFromCategoryTitle: t(
				"components.Cards.removeFromCategory",
				"移出当前分类",
			),
			displayName: getGameDisplayName(card),
			useDelayedClick:
				!showBatchControls && cardClickMode === "navigate" && doubleClickLaunch,
			onContextMenu: (e: React.MouseEvent) =>
				card.id != null && handleContextMenu(e, card.id),
			onClick: () => card.id != null && handleCardClick(card.id, card),
			onDoubleClick: () =>
				card.id != null && handleCardDoubleClick(card.id, card),
			onLongPress: () => card.id != null && handleCardLongPress(card.id, card),
		}),
		[
			selectedGameId,
			cardClickMode,
			doubleClickLaunch,
			handleContextMenu,
			handleCardClick,
			handleCardDoubleClick,
			handleCardLongPress,
			handleRemoveSingleFromCategory,
			isCollectionCategory,
			selectedBatchGameIdSet,
			showBatchControls,
			t,
		],
	);

	// 卡片列表
	const cardList = (
		<>
			{canUseBatchMode && (
				<CardsBatchBar
					batchMode={batchMode}
					selectedBatchGameIds={selectedBatchGameIds}
					gameIds={gameIds}
					categoryId={categoryId}
					onBatchModeChange={setBatchMode}
					onSelectionChange={setSelectedBatchGameIds}
					onSelectionClear={() => setSelectedBatchGameIds([])}
					onDeleteSuccess={() => setSelectedGameId(null)}
					onRemoveFromCategory={handleRemoveFromCategory}
				/>
			)}
			<div
				className={
					"text-center grid lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-4"
				}
			>
				<RightMenu
					id={menuPosition?.cardId}
					isopen={Boolean(menuPosition)}
					anchorPosition={
						menuPosition
							? { top: menuPosition.mouseY, left: menuPosition.mouseX }
							: undefined
					}
					setAnchorEl={(value) => {
						if (!value) closeMenu();
					}}
				/>

				{games.map((card) => {
					const props = getCardProps(card);
					return isSortable ? (
						<SortableCardItem key={card.id} {...props} />
					) : (
						<CardItem key={card.id} {...props} />
					);
				})}
			</div>
		</>
	);

	// 拖拽模式渲染
	if (isSortable) {
		return (
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragStart={handleDragStart}
				onDragEnd={handleDragEnd}
			>
				<SortableContext items={sortableIds} strategy={rectSortingStrategy}>
					{cardList}
				</SortableContext>
				<DragOverlay>
					{activeGame && (
						<CardItem
							card={activeGame}
							isActive
							isOverlay
							showBatchMarker={false}
							displayName={getGameDisplayName(activeGame)}
							useDelayedClick={false}
							onContextMenu={() => {}}
							onClick={() => {}}
							onDoubleClick={() => {}}
							onLongPress={() => {}}
						/>
					)}
				</DragOverlay>
			</DndContext>
		);
	}

	return cardList;
};

export default Cards;
