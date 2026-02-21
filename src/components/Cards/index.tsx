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
import { useStore } from "@/store";
import { useGamePlayStore } from "@/store/gamePlayStore";
import type { GameData } from "@/types";
import {
	getGameCover,
	getGameDisplayName,
	getGameNsfwStatus,
	saveScrollPosition,
} from "@/utils";

interface CardItemProps extends React.HTMLAttributes<HTMLDivElement> {
	card: GameData;
	isActive: boolean;
	isOverlay?: boolean;
	onContextMenu: (e: React.MouseEvent) => void;
	onClick: () => void;
	onDoubleClick: () => void;
	onLongPress: () => void;
	displayName: string;
	useDelayedClick: boolean;
}

type SortableCardItemProps = Omit<CardItemProps, "style" | "ref">;

interface CardsProps {
	gamesData?: GameData[];
	categoryId?: number;
}

interface MenuPosition {
	mouseX: number;
	mouseY: number;
	cardId: number | null;
}

function useCardInteraction(options: {
	onClick: () => void;
	onDoubleClick: () => void;
	onLongPress: () => void;
	useDelayedClick: boolean;
}) {
	const { onClick, onDoubleClick, onLongPress, useDelayedClick } = options;
	const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const longPressTimeoutRef = useRef<NodeJS.Timeout | null>(null);
	const hasLongPressedRef = useRef(false);
	const [isLongPressing, setIsLongPressing] = useState(false);

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
			return;
		}

		onClick();
	}, [onClick, useDelayedClick, clearClickTimeout]);

	const handleDoubleClick = useCallback(() => {
		if (useDelayedClick) clearClickTimeout();
		onDoubleClick();
	}, [onDoubleClick, useDelayedClick, clearClickTimeout]);

	const handleMouseDown = useCallback(() => {
		hasLongPressedRef.current = false;
		clearLongPressTimeout();
		longPressTimeoutRef.current = setTimeout(() => {
			setIsLongPressing(true);
			hasLongPressedRef.current = true;
			onLongPress();
		}, 800);
	}, [onLongPress, clearLongPressTimeout]);

	const handleMouseUp = useCallback(() => {
		clearLongPressTimeout();
		setIsLongPressing(false);
		setTimeout(() => {
			hasLongPressedRef.current = false;
		}, 50);
	}, [clearLongPressTimeout]);

	const handleMouseLeave = useCallback(() => {
		clearLongPressTimeout();
		setIsLongPressing(false);
	}, [clearLongPressTimeout]);

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

function sortByDragOrder(
	games: GameData[],
	orderIds: number[],
	sortOrder: "asc" | "desc",
): GameData[] {
	if (games.length <= 1) return games;

	const sourceIndexMap = new Map<number, number>();
	games.forEach((game, index) => {
		if (game.id != null) sourceIndexMap.set(game.id, index);
	});

	const orderIndexMap = new Map<number, number>();
	orderIds.forEach((id, index) => {
		orderIndexMap.set(id, index);
	});

	const ordered = [...games].sort((a, b) => {
		const aIndex =
			a.id != null
				? (orderIndexMap.get(a.id) ?? Number.MAX_SAFE_INTEGER)
				: Number.MAX_SAFE_INTEGER;
		const bIndex =
			b.id != null
				? (orderIndexMap.get(b.id) ?? Number.MAX_SAFE_INTEGER)
				: Number.MAX_SAFE_INTEGER;

		if (aIndex !== bIndex) return aIndex - bIndex;

		const fallbackA =
			a.id != null
				? (sourceIndexMap.get(a.id) ?? Number.MAX_SAFE_INTEGER)
				: Number.MAX_SAFE_INTEGER;
		const fallbackB =
			b.id != null
				? (sourceIndexMap.get(b.id) ?? Number.MAX_SAFE_INTEGER)
				: Number.MAX_SAFE_INTEGER;
		return fallbackA - fallbackB;
	});

	return sortOrder === "desc" ? ordered.reverse() : ordered;
}

function useDragSort(options: {
	sourceGames: GameData[];
	enabled: boolean;
	onReorder?: (games: GameData[]) => Promise<void> | void;
}) {
	const { sourceGames, enabled, onReorder } = options;
	const [games, setGames] = useState(sourceGames);
	const [activeId, setActiveId] = useState<number | null>(null);
	const isDraggingRef = useRef(false);

	useEffect(() => {
		if (!isDraggingRef.current) setGames(sourceGames);
	}, [sourceGames]);

	const sensors = useSensors(
		useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
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

			if (!enabled || !over || active.id === over.id) {
				isDraggingRef.current = false;
				return;
			}

			const oldIndex = games.findIndex((g) => g.id === active.id);
			const newIndex = games.findIndex((g) => g.id === over.id);

			if (oldIndex !== -1 && newIndex !== -1) {
				const previousGames = games;
				const newGames = arrayMove(games, oldIndex, newIndex);
				setGames(newGames);
				try {
					await onReorder?.(newGames);
				} catch (error) {
					console.error("排序更新失败:", error);
					setGames(previousGames);
				}
			}

			setTimeout(() => {
				isDraggingRef.current = false;
			}, 100);
		},
		[enabled, games, onReorder],
	);

	const activeGame = useMemo(() => games.find((g) => g.id === activeId), [activeId, games]);

	return { games, activeGame, sensors, handleDragStart, handleDragEnd };
}

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
							<span className="text-base truncate max-w-full">{displayName}</span>
						</div>
					</CardActionArea>
				</Card>
			);
		},
	),
);

CardItem.displayName = "CardItem";

const SortableCardItem = memo((props: SortableCardItemProps) => {
	const { card, ...restProps } = props;
	const cardId = card.id ?? 0;
	const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
		useSortable({ id: cardId });

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

const Cards: React.FC<CardsProps> = ({ gamesData, categoryId }) => {
	const { i18n } = useTranslation();
	const navigate = useNavigate();
	const path = useLocation().pathname;
	const isLibraries = path === "/libraries";

	const selectedGameId = useStore((s) => s.selectedGameId);
	const setSelectedGameId = useStore((s) => s.setSelectedGameId);
	const cardClickMode = useStore((s) => s.cardClickMode);
	const doubleClickLaunch = useStore((s) => s.doubleClickLaunch);
	const longPressLaunch = useStore((s) => s.longPressLaunch);
	const gamesFromStore = useStore((s) => s.games);
	const sortOption = useStore((s) => s.sortOption);
	const sortOrder = useStore((s) => s.sortOrder);
	const libraryDragOrder = useStore((s) => s.libraryDragOrder);
	const setLibraryDragOrder = useStore((s) => s.setLibraryDragOrder);
	const { launchGame } = useGamePlayStore();

	const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
	const sourceGames = gamesData ?? gamesFromStore;

	const isCategorySortable =
		!!categoryId && categoryId > 0 && !longPressLaunch && !!gamesData;
	const isLibraryDragSort =
		isLibraries && !gamesData && !longPressLaunch && sortOption === "dragsort";
	const isSortable = isCategorySortable || isLibraryDragSort;

	const sortedSourceGames = useMemo(() => {
		if (!isLibraryDragSort) return sourceGames;
		return sortByDragOrder(sourceGames, libraryDragOrder, sortOrder);
	}, [isLibraryDragSort, sourceGames, libraryDragOrder, sortOrder]);

	const onReorder = useCallback(
		async (newGames: GameData[]) => {
			if (isCategorySortable && categoryId) {
				const gameIds = newGames
					.map((g) => g.id)
					.filter((id): id is number => id != null);
				await useStore.getState().updateCategoryGames(gameIds, categoryId);
				return;
			}

			if (isLibraryDragSort) {
				const gameIds = newGames
					.map((g) => g.id)
					.filter((id): id is number => id != null);
				setLibraryDragOrder(gameIds);
			}
		},
		[categoryId, isCategorySortable, isLibraryDragSort, setLibraryDragOrder],
	);

	const { games, activeGame, sensors, handleDragStart, handleDragEnd } = useDragSort({
		sourceGames: sortedSourceGames,
		enabled: isSortable,
		onReorder,
	});

	const handleCardClick = useCallback(
		(cardId: number) => {
			if (cardClickMode === "navigate") {
				setSelectedGameId(cardId);
				saveScrollPosition(window.location.pathname);
				navigate(`/libraries/${cardId}`);
				return;
			}
			setSelectedGameId(cardId);
		},
		[cardClickMode, navigate, setSelectedGameId],
	);

	const handleCardDoubleClick = useCallback(
		async (cardId: number, card: GameData) => {
			if (!doubleClickLaunch || !card.localpath) return;
			setSelectedGameId(cardId);
			try {
				await launchGame(card.localpath, cardId, {
					le_launch: card.le_launch === 1,
					magpie: card.magpie === 1,
				});
			} catch (error) {
				console.error("启动游戏失败:", error);
			}
		},
		[doubleClickLaunch, launchGame, setSelectedGameId],
	);

	const handleCardLongPress = useCallback(
		async (cardId: number, card: GameData) => {
			if (!longPressLaunch || !card.localpath) return;
			setSelectedGameId(cardId);
			try {
				await launchGame(card.localpath, cardId, {
					le_launch: card.le_launch === 1,
					magpie: card.magpie === 1,
				});
			} catch (error) {
				console.error("长按启动游戏失败:", error);
			}
		},
		[longPressLaunch, launchGame, setSelectedGameId],
	);

	const handleContextMenu = useCallback(
		(event: React.MouseEvent, cardId: number) => {
			setMenuPosition({ mouseX: event.clientX, mouseY: event.clientY, cardId });
			setSelectedGameId(cardId);
		},
		[setSelectedGameId],
	);

	const closeMenu = useCallback(() => setMenuPosition(null), []);

	const getCardProps = useCallback(
		(card: GameData): SortableCardItemProps => ({
			card,
			isActive: selectedGameId === card.id,
			displayName: getGameDisplayName(card, i18n.language),
			useDelayedClick: cardClickMode === "navigate" && doubleClickLaunch,
			onContextMenu: (e: React.MouseEvent) =>
				card.id != null && handleContextMenu(e, card.id),
			onClick: () => card.id != null && handleCardClick(card.id),
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

			{games.map((card, index) => {
				const props = getCardProps(card);
				const key = card.id ?? `game-${index}`;
				if (isSortable && card.id != null) {
					return <SortableCardItem key={key} {...props} />;
				}
				return <CardItem key={key} {...props} />;
			})}
		</div>
	);

	if (!isSortable) return cardList;

	return (
		<DndContext
			sensors={sensors}
			collisionDetection={closestCenter}
			onDragStart={handleDragStart}
			onDragEnd={handleDragEnd}
		>
			<SortableContext
				items={games.map((g) => g.id).filter((id): id is number => id != null)}
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
};

export default Cards;
