import { memo, useEffect, useState } from "react";
import { VirtuosoGrid } from "react-virtuoso";
import { useVirtuosoGridRestore } from "@/hooks/common/useScrollRestore";
import type { GameData } from "@/types";
import { CardItem } from "./CardItem";
import { useCardsController } from "./useCardsController";

const BREAKPOINTS = [
	{ min: 2560, cols: 10 },
	{ min: 1920, cols: 9 },
	{ min: 1536, cols: 8 },
	{ min: 1280, cols: 7 },
	{ min: 1024, cols: 6 },
] as const;

const CARD_GRID_ROW_HEIGHT_ESTIMATE = 260;
const VIRTUAL_CARDS_GRID_CLASS =
	"grid gap-4 pb-4 [grid-template-columns:repeat(var(--virtual-cards-grid-columns),minmax(0,1fr))]";

function getColumnCount(): number {
	const width = window.innerWidth;
	for (const bp of BREAKPOINTS) {
		if (width >= bp.min) return bp.cols;
	}
	return 3;
}

interface VirtualCardsGridProps {
	gameIds: number[];
	displayById: Map<number, GameData>;
	scrollRestoreKey?: string | null;
	enableBatchMode?: boolean;
	enableSortFieldOverlay?: boolean;
}

/**
 * VirtualCardsGrid - 虚拟化游戏卡片网格
 *
 * 滚动恢复：
 * - 保存：scroll 事件中缓存 main.scrollTop - wrapper 相对偏移（列表内坐标），
 *         unmount 时写入通用滚动缓存（ref 值，避免 react-router 重置 DOM 的时序问题）
 * - 恢复：优先使用 VirtuosoGrid 状态快照，缺失时 fallback 到近似 item index
 */
export const VirtualCardsGrid = memo(
	({
		gameIds,
		displayById,
		scrollRestoreKey = "libraries",
		enableBatchMode = false,
		enableSortFieldOverlay = false,
	}: VirtualCardsGridProps) => {
		const { controls, getCardProps } = useCardsController({
			gameIds,
			enableBatchMode,
			enableSortFieldOverlay,
		});
		const [columns, setColumns] = useState(() => getColumnCount());

		useEffect(() => {
			const onResize = () => setColumns(getColumnCount());
			window.addEventListener("resize", onResize);
			return () => window.removeEventListener("resize", onResize);
		}, []);

		const {
			restoreProps,
			scrollParent,
			stateChanged,
			wrapperRef: virtuosoWrapperRef,
		} = useVirtuosoGridRestore({
			columns,
			itemCount: gameIds.length,
			rowHeight: CARD_GRID_ROW_HEIGHT_ESTIMATE,
			scrollKey: scrollRestoreKey,
		});

		return (
			<>
				{controls}
				<div ref={virtuosoWrapperRef} className="flex-1 min-h-0">
					{scrollParent && (
						<VirtuosoGrid
							key={scrollRestoreKey ?? "no-scroll-restore"}
							customScrollParent={scrollParent}
							data={gameIds}
							computeItemKey={(index, gameId) =>
								gameId === undefined
									? `missing-game-${index}`
									: `game-${gameId}`
							}
							listClassName={VIRTUAL_CARDS_GRID_CLASS}
							itemClassName="min-w-0"
							increaseViewportBy={{ top: 600, bottom: 1200 }}
							stateChanged={stateChanged}
							{...restoreProps}
							style={
								{
									"--virtual-cards-grid-columns": columns,
								} as React.CSSProperties
							}
							itemContent={(_, gameId) => {
								if (gameId === undefined) return null;
								const game = displayById.get(gameId);
								if (!game) return null;
								const props = getCardProps(game);
								return <CardItem {...props} />;
							}}
						/>
					)}
				</div>
			</>
		);
	},
);

VirtualCardsGrid.displayName = "VirtualCardsGrid";
