import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Virtuoso } from "react-virtuoso";
import { useStore } from "@/store/appStore";
import { CardItem } from "./CardItem";
import { useCardsController } from "./useCardsController";

const BREAKPOINTS = [
	{ min: 2560, cols: 10 },
	{ min: 1920, cols: 9 },
	{ min: 1536, cols: 8 },
	{ min: 1280, cols: 7 },
	{ min: 1024, cols: 6 },
] as const;

function getColumnCount(): number {
	const w = window.innerWidth;
	for (const bp of BREAKPOINTS) {
		if (w >= bp.min) return bp.cols;
	}
	return 3;
}

/**
 * 从当前元素向上遍历 DOM 树，找到第一个具有 overflow-y: auto 或 scroll 的祖先元素。
 * 相比 querySelector("main")，不依赖特定标签名，避免嵌套 <main> 导致的错误匹配。
 */
function findScrollableParent(el: HTMLElement | null): HTMLElement | null {
	let current = el?.parentElement ?? null;
	while (current) {
		const style = window.getComputedStyle(current);
		const overflowY = style.overflowY;
		if (overflowY === "auto" || overflowY === "scroll") {
			return current;
		}
		current = current.parentElement;
	}
	return null;
}

interface VirtualCardsGridProps {
	gameIds: number[];
}

/**
 * VirtualCardsGrid - 虚拟化卡片网格（用于 LibrariesPage）
 *
 * 滚动恢复：
 * - 保存：scroll 事件中缓存 scrollParent.scrollTop - wrapper 相对偏移，
 *         unmount 时写入 Zustand（ref 值，避免 react-router 重置 DOM 的时序问题）
 * - 恢复：initialScrollTop 直接传列表内偏移，Virtuoso 初始化时同步生效
 */
export const VirtualCardsGrid = memo(({ gameIds }: VirtualCardsGridProps) => {
	const { controls, getCardProps } = useCardsController({ gameIds });

	const virtuosoWrapperRef = useRef<HTMLDivElement>(null);
	const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null);

	// 从 wrapper 向上查找可滚动的祖先容器（DashboardLayout 的 <main>）
	// 使用 requestAnimationFrame 确保 DOM 已完全渲染（PageContainer 等）后再查找
	useEffect(() => {
		const tryFind = () => {
			const found = findScrollableParent(virtuosoWrapperRef.current);
			if (found) {
				setScrollParent(found);
				return;
			}
			// 重试一次——PageContainer 内部的 DOM 可能还未完成布局
			requestAnimationFrame(() => {
				const retry = findScrollableParent(virtuosoWrapperRef.current);
				if (retry) setScrollParent(retry);
			});
		};
		// 延迟一帧确保 DashboardLayout + PageContainer 的 DOM 全部就位
		const raf = requestAnimationFrame(tryFind);
		return () => cancelAnimationFrame(raf);
	}, []);

	// 首次 mount 时读取，仅用于 initialScrollTop（Virtuoso 初始化时同步生效）
	const savedScrollTop = useMemo(
		() => useStore.getState().librariesScrollTop,
		[],
	);

	const [columns, setColumns] = useState(() => getColumnCount());

	useEffect(() => {
		const onResize = () => setColumns(getColumnCount());
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	const rows = useMemo(() => {
		const result: number[][] = [];
		for (let i = 0; i < gameIds.length; i += columns) {
			result.push(gameIds.slice(i, i + columns));
		}
		return result;
	}, [gameIds, columns]);

	// scroll 事件缓存列表内相对偏移，unmount 时存入 Zustand
	const lastScrollTop = useRef(0);

	useEffect(() => {
		if (!scrollParent) return;

		// wrapper 相对 scrollParent 内容区的固定偏移（含 margin），算一次
		const wrapperOffsetTop =
			(virtuosoWrapperRef.current?.getBoundingClientRect().top ?? 0) -
			scrollParent.getBoundingClientRect().top +
			scrollParent.scrollTop;

		const onScroll = () => {
			lastScrollTop.current = Math.max(
				0,
				scrollParent.scrollTop - wrapperOffsetTop,
			);
		};

		scrollParent.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			scrollParent.removeEventListener("scroll", onScroll);
			useStore.getState().setLibrariesScrollTop(lastScrollTop.current);
		};
	}, [scrollParent]);

	const renderRow = useCallback(
		(rowIndex: number) => (
			<div
				className="grid gap-4 pb-4"
				style={{
					gridTemplateColumns: `repeat(${columns}, 1fr)`,
				}}
			>
				{rows[rowIndex].map((gameId) => {
					const props = getCardProps(gameId);
					return <CardItem key={gameId} {...props} />;
				})}
			</div>
		),
		[rows, columns, getCardProps],
	);

	// 如果还没找到滚动父容器，先渲染空占位，等 useEffect 触发更新后再挂载 Virtuoso
	if (!scrollParent) {
		return (
			<>
				{controls}
				<div ref={virtuosoWrapperRef} className="flex-1 min-h-0" />
			</>
		);
	}

	return (
		<>
			{controls}
			<div ref={virtuosoWrapperRef} className="flex-1 min-h-0">
				<Virtuoso
					customScrollParent={scrollParent}
					totalCount={rows.length}
					overscan={400}
					initialScrollTop={savedScrollTop}
					itemContent={renderRow}
				/>
			</div>
		</>
	);
});

VirtualCardsGrid.displayName = "VirtualCardsGrid";
