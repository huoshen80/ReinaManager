import { closestCenter, DndContext, DragOverlay } from "@dnd-kit/core";
import {
	rectSortingStrategy,
	SortableContext,
	useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { memo, useMemo } from "react";
import type { GameData } from "@/types";
import { getGameDisplayName } from "@/utils/appUtils";
import { CardItem } from "./CardItem";
import type { SortableCardItemProps } from "./types";
import { useCardsController } from "./useCardsController";
import { useDragSort } from "./useDragSort";

interface SortableCardsGridProps {
	gamesData: GameData[];
	categoryId: number;
}

const SortableCardItem = memo((props: SortableCardItemProps) => {
	const { card, disabledSortable, ...restProps } = props;
	const cardId = card.id;

	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: cardId, disabled: disabledSortable });

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
			{...(!disabledSortable ? attributes : {})}
			{...(!disabledSortable ? listeners : {})}
		/>
	);
});

SortableCardItem.displayName = "SortableCardItem";

/**
 * SortableCardsGrid - 拖拽卡片布局。
 */
export const SortableCardsGrid = memo(
	({ gamesData, categoryId }: SortableCardsGridProps) => {
		const {
			games,
			activeGame,
			sensors,
			handleDragStart,
			handleDragCancel,
			handleDragEnd,
		} = useDragSort({
			gamesData,
			categoryId,
			enabled: true,
		});
		const {
			controls,
			displayedGames,
			getCardProps,
			loadAllButton,
			longPressLaunch,
			showBatchControls,
		} = useCardsController({
			gamesData: games,
			categoryId,
		});
		const sortableIds = games.map((g) => g.id);
		const isDragSortEnabled = !longPressLaunch && !showBatchControls;

		return (
			<DndContext
				sensors={sensors}
				collisionDetection={closestCenter}
				onDragStart={isDragSortEnabled ? handleDragStart : undefined}
				onDragCancel={handleDragCancel}
				onDragEnd={isDragSortEnabled ? handleDragEnd : undefined}
			>
				<SortableContext items={sortableIds} strategy={rectSortingStrategy}>
					{controls}
					<div className="flex-1 min-h-0">
						<div
							className={
								"text-center grid lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 3xl:grid-cols-10 4xl:grid-cols-12 gap-4"
							}
						>
							{displayedGames.map((card) => {
								const props = getCardProps(card);
								return (
									<SortableCardItem
										key={card.id}
										{...props}
										disabledSortable={!isDragSortEnabled}
									/>
								);
							})}
						</div>
						{loadAllButton}
					</div>
				</SortableContext>
				<DragOverlay>
					{activeGame && (
						<CardItem
							card={activeGame}
							isOverlay
							displayName={getGameDisplayName(activeGame)}
						/>
					)}
				</DragOverlay>
			</DndContext>
		);
	},
);

SortableCardsGrid.displayName = "SortableCardsGrid";
