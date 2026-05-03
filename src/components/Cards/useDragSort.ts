import {
	type DragEndEvent,
	type DragStartEvent,
	MouseSensor,
	TouchSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useUpdateCategoryGames } from "@/hooks/queries/useCollections";
import type { GameData } from "@/types";

/**
 * 拖拽排序 Hook - 管理拖拽相关状态和逻辑
 */
export function useDragSort(options: {
	gamesData: GameData[];
	categoryId?: number;
	enabled: boolean;
}) {
	const { gamesData, categoryId, enabled } = options;
	const updateCategoryGamesMutation = useUpdateCategoryGames();

	const [sortableGames, setSortableGames] = useState(gamesData);
	const [activeId, setActiveId] = useState<number | null>(null);
	const isDraggingRef = useRef(false);

	const games = enabled ? sortableGames : gamesData;

	// 排序模式保留本地顺序，非排序模式直接使用外部数据，避免删除后慢一帧
	useEffect(() => {
		if (enabled && !isDraggingRef.current) {
			setSortableGames(gamesData);
		}
	}, [enabled, gamesData]);

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

	const handleDragCancel = useCallback(() => {
		isDraggingRef.current = false;
		setActiveId(null);
	}, []);

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
				setSortableGames(newGames);

				try {
					const gameIds = newGames.map((g) => g.id as number);
					await updateCategoryGamesMutation.mutateAsync({
						categoryId,
						gameIds,
					});
				} catch (error) {
					console.error("排序更新失败:", error);
					setSortableGames(games); // 回滚
				}
			}

			isDraggingRef.current = false;
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
		handleDragCancel,
		handleDragEnd,
	};
}
