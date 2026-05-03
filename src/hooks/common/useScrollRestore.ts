import { useCallback, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

const scrollPositions: Record<string, number> = {};

export const getScrollPosition = (path: string): number => {
	return scrollPositions[path] ?? 0;
};

export const setScrollPosition = (path: string, position: number): void => {
	scrollPositions[path] = position;
};

interface UseScrollRestoreOptions {
	/** 滚动容器选择器，默认 'main' */
	containerSelector?: string;
	/** 是否正在加载中 */
	isLoading?: boolean;
	/** 是否启用调试日志 */
	debug?: boolean;
}

const DEFAULT_OPTIONS: Required<Omit<UseScrollRestoreOptions, "isLoading">> = {
	containerSelector: "main",
	debug: false,
};

/**
 * 滚动位置还原 Hook
 * 等页面数据加载完成后一帧恢复；目标超过当前高度时回到顶部。
 */
export function useScrollRestore(
	scrollPath: string,
	options: UseScrollRestoreOptions = {},
) {
	const { containerSelector, isLoading, debug } = {
		...DEFAULT_OPTIONS,
		...options,
	};

	const location = useLocation();

	const cleanupRef = useRef<(() => void) | null>(null);
	const settledRef = useRef(false);
	const lastPathRef = useRef<string>("");

	const log = useCallback(
		(...args: Parameters<Console["log"]>) => {
			if (debug) console.log("[useScrollRestore]", ...args);
		},
		[debug],
	);

	useEffect(() => {
		if ("scrollRestoration" in window.history) {
			window.history.scrollRestoration = "manual";
		}
	}, []);

	// 提取滚动恢复逻辑为独立函数
	const performScrollRestore = useCallback(() => {
		// 路径变化时重置状态
		if (lastPathRef.current !== location.pathname) {
			settledRef.current = false;
			lastPathRef.current = location.pathname;
		}

		// 清理上一次的副作用
		if (cleanupRef.current) {
			log("Cleaning up previous effect");
			cleanupRef.current();
			cleanupRef.current = null;
		}

		if (isLoading) {
			log("Skipping: isLoading=true");
			return;
		}

		const container = document.querySelector<HTMLElement>(containerSelector);
		if (!container) {
			log("Container not found:", containerSelector);
			return;
		}

		const isTargetPath = location.pathname === scrollPath;
		const target = isTargetPath ? getScrollPosition(scrollPath) : 0;

		log("Target position:", target, "for path:", location.pathname);

		// 快速路径：目标为 0
		if (target === 0) {
			container.scrollTop = 0;
			settledRef.current = true;
			log("Scrolled to top immediately");
			return;
		}

		if (settledRef.current) {
			log("Already settled, skipping");
			return;
		}

		let frameId: number | null = null;
		let cancelled = false;

		// 清理函数（先定义，避免在 performRestore 中引用未定义的变量）
		const cleanup = () => {
			cancelled = true;
			if (frameId !== null) {
				window.cancelAnimationFrame(frameId);
				frameId = null;
			}
		};

		// 执行滚动恢复
		const performRestore = (reason: string) => {
			if (settledRef.current || cancelled) return;

			const maxScroll = Math.max(
				0,
				container.scrollHeight - container.clientHeight,
			);
			const restoreTarget = target > maxScroll ? 0 : target;

			const prevBehavior = container.style.scrollBehavior;
			container.style.scrollBehavior = "auto";
			container.scrollTop = restoreTarget;
			container.style.scrollBehavior = prevBehavior;

			settledRef.current = true;

			if (restoreTarget < target) {
				log(`⚠ Restored to top (${restoreTarget}/${target}) - ${reason}`);
			} else {
				log(`✓ Restored scroll to ${restoreTarget} - ${reason}`);
			}

			// 清理资源
			cleanup();
		};

		const restoreNextFrame = () => {
			if (settledRef.current || cancelled) return;
			performRestore("next frame");
		};

		frameId = window.requestAnimationFrame(restoreNextFrame);

		cleanupRef.current = cleanup;
		return cleanup;
	}, [location.pathname, scrollPath, isLoading, containerSelector, log]);

	// 普通模式：使用 useEffect
	useEffect(() => {
		performScrollRestore();
	}, [performScrollRestore]);
}
