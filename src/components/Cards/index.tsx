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
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardMedia from "@mui/material/CardMedia";
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
import RightMenu from "@/components/RightMenu";
import { useGameListFacade } from "@/hooks/features/games/useGameListFacade";
import { useUpdateCategoryGames } from "@/hooks/queries/useCollections";
import { useStore } from "@/store";
import { useGamePlayStore } from "@/store/gamePlayStore";
import type { GameData } from "@/types";
import {
	getGameCover,
	getGameDisplayName,
	getGameNsfwStatus,
	saveScrollPosition,
} from "@/utils";

// ============================================================================
// 类型定义
// ============================================================================

/** CardItem 组件的 Props */
interface CardItemProps extends React.HTMLAttributes<HTMLDivElement> {
	/** 游戏数据 */
	card: GameData;
	/** 是否为当前选中的卡片 */
	isActive: boolean;
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
	/** 外部传入的游戏数据（可选，用于分类页面） */
	gamesData?: GameData[];
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
	const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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
	sourceGames: GameData[];
	categoryId?: number;
	enabled: boolean;
}) {
	const { sourceGames, categoryId, enabled } = options;
	const updateCategoryGamesMutation = useUpdateCategoryGames();

	const [games, setGames] = useState(sourceGames);
	const [activeId, setActiveId] = useState<number | null>(null);
	const isDraggingRef = useRef(false);

	// 同步外部数据到本地状态（仅在非拖拽状态下）
	useEffect(() => {
		if (!isDraggingRef.current) {
			setGames(sourceGames);
		}
	}, [sourceGames]);

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
					className={`min-w-24 max-w-full transition-transform ${isActive ? "scale-y-105" : "scale-y-100"}`}
					onContextMenu={onContextMenu}
					{...props}
				>
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
	const { i18n } = useTranslation();
	const navigate = useNavigate();
	const path = useLocation().pathname;
	const isLibraries = path === "/libraries";

	// Store 状态
	const selectedGameId = useStore((s) => s.selectedGameId);
	const setSelectedGameId = useStore((s) => s.setSelectedGameId);
	const cardClickMode = useStore((s) => s.cardClickMode);
	const doubleClickLaunch = useStore((s) => s.doubleClickLaunch);
	const longPressLaunch = useStore((s) => s.longPressLaunch);
	const { games: gamesFromFacade } = useGameListFacade();
	const launchGame = useGamePlayStore((s) => s.launchGame);

	// 右键菜单状态
	const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

	// 数据源
	const sourceGames = gamesData ?? gamesFromFacade;

	// 判断是否启用拖拽排序
	const isSortable =
		!!categoryId && categoryId > 0 && !longPressLaunch && !!gamesData;

	// 拖拽排序 Hook
	const { games, activeGame, sensors, handleDragStart, handleDragEnd } =
		useDragSort({
			sourceGames,
			categoryId,
			enabled: isSortable,
		});

	// 卡片事件处理器
	const handleCardClick = useCallback(
		(cardId: number, _card: GameData) => {
			if (cardClickMode === "navigate") {
				setSelectedGameId(cardId);
				saveScrollPosition(window.location.pathname);
				navigate(`/libraries/${cardId}`);
			} else {
				setSelectedGameId(cardId);
			}
		},
		[cardClickMode, navigate, setSelectedGameId],
	);

	const handleCardDoubleClick = useCallback(
		async (cardId: number, card: GameData) => {
			if (doubleClickLaunch && card.localpath) {
				setSelectedGameId(cardId);
				try {
					await launchGame(card.localpath, cardId, {
						le_launch: card.le_launch === 1,
						magpie: card.magpie === 1,
					});
				} catch (error) {
					console.error("启动游戏失败:", error);
				}
			}
		},
		[doubleClickLaunch, launchGame, setSelectedGameId],
	);

	const handleCardLongPress = useCallback(
		async (cardId: number, card: GameData) => {
			if (longPressLaunch && card.localpath) {
				setSelectedGameId(cardId);
				try {
					await launchGame(card.localpath, cardId, {
						le_launch: card.le_launch === 1,
						magpie: card.magpie === 1,
					});
				} catch (error) {
					console.error("长按启动游戏失败:", error);
				}
			}
		},
		[longPressLaunch, launchGame, setSelectedGameId],
	);

	const handleContextMenu = useCallback(
		(event: React.MouseEvent, cardId: number) => {
			setMenuPosition({
				mouseX: event.clientX,
				mouseY: event.clientY,
				cardId,
			});
			setSelectedGameId(cardId);
		},
		[setSelectedGameId],
	);

	const closeMenu = useCallback(() => setMenuPosition(null), []);

	// 渲染单个卡片的 props 生成器
	const getCardProps = useCallback(
		(card: GameData): SortableCardItemProps => ({
			card,
			isActive: selectedGameId === card.id,
			displayName: getGameDisplayName(card, i18n.language),
			useDelayedClick: cardClickMode === "navigate" && doubleClickLaunch,
			onContextMenu: (e: React.MouseEvent) =>
				card.id != null && handleContextMenu(e, card.id),
			onClick: () => card.id != null && handleCardClick(card.id, card),
			onDoubleClick: () =>
				card.id != null && handleCardDoubleClick(card.id, card),
			onLongPress: () => card.id != null && handleCardLongPress(card.id, card),
		}),
		[
			selectedGameId,
			i18n.language,
			cardClickMode,
			doubleClickLaunch,
			handleContextMenu,
			handleCardClick,
			handleCardDoubleClick,
			handleCardLongPress,
		],
	);

	// 卡片列表
	const cardList = (
		<div
			className={`flex-1 text-center grid grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-4 p-4 ${isLibraries ? "pt-0" : ""}`}
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
				<SortableContext
					items={games.map((g) => g.id as number)}
					strategy={rectSortingStrategy}
				>
					{cardList}
				</SortableContext>
				<DragOverlay>
					{activeGame && (
						<CardItem
							card={activeGame}
							isActive
							isOverlay
							displayName={getGameDisplayName(activeGame, i18n.language)}
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
