import { useCallback, useEffect, useRef } from "react";
import { useActivate, useUnactivate } from "react-activation";
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
	/** 超时时间（ms），默认 2000 */
	timeout?: number;
	/** 是否启用调试日志 */
	debug?: boolean;
	/** 内容稳定检测的等待时间（ms），默认 150 */
	stabilityDelay?: number;
	/** 是否在 KeepAlive 中使用 */
	useKeepAlive?: boolean;
}

const DEFAULT_OPTIONS: Required<Omit<UseScrollRestoreOptions, "isLoading">> = {
	containerSelector: "main",
	timeout: 1500,
	debug: false,
	stabilityDelay: 0,
	useKeepAlive: false,
};

/**
 * 滚动位置还原 Hook (优化版)
 *
 * 特性：
 * - 智能检测内容是否渲染完成（高度稳定检测）
 * - 支持滚动到底部的场景
 * - 避免滚动抖动和跳跃
 * - 自动清理资源，防止内存泄漏
 */
export function useScrollRestore(
	scrollPath: string,
	options: UseScrollRestoreOptions = {},
) {
	const {
		containerSelector,
		isLoading,
		timeout,
		debug,
		stabilityDelay,
		useKeepAlive,
	} = {
		...DEFAULT_OPTIONS,
		...options,
	};

	const location = useLocation();

	const cleanupRef = useRef<(() => void) | null>(null);
	const settledRef = useRef(false);
	const lastPathRef = useRef<string>("");
	const lastHeightRef = useRef(0);
	const stabilityTimerRef = useRef<number | null>(null);

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
			lastHeightRef.current = 0;
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

		let ro: ResizeObserver | null = null;
		let fallbackTimer: number | null = null;

		// 清理函数（先定义，避免在 performRestore 中引用未定义的变量）
		const cleanup = () => {
			if (ro) {
				ro.disconnect();
				ro = null;
			}
			if (fallbackTimer !== null) {
				window.clearTimeout(fallbackTimer);
				fallbackTimer = null;
			}
			if (stabilityTimerRef.current !== null) {
				window.clearTimeout(stabilityTimerRef.current);
				stabilityTimerRef.current = null;
			}
		};

		// 执行滚动恢复
		const performRestore = (reason: string) => {
			if (settledRef.current) return;

			const maxScroll = Math.max(
				0,
				container.scrollHeight - container.clientHeight,
			);
			const clampedTarget = Math.max(0, Math.min(target, maxScroll));

			const prevBehavior = container.style.scrollBehavior;
			container.style.scrollBehavior = "auto";
			container.scrollTop = clampedTarget;
			container.style.scrollBehavior = prevBehavior;

			settledRef.current = true;

			if (clampedTarget < target) {
				log(`⚠ Restored to bottom (${clampedTarget}/${target}) - ${reason}`);
			} else {
				log(`✓ Restored scroll to ${clampedTarget} - ${reason}`);
			}

			// 清理资源
			cleanup();
		};

		// 检查内容高度是否稳定
		const checkStability = () => {
			const currentHeight = container.scrollHeight;
			const maxScroll = currentHeight - container.clientHeight;

			log("Height check:", {
				current: currentHeight,
				last: lastHeightRef.current,
				maxScroll,
				target,
			});

			// 情况1: 内容已经足够高，可以直接恢复
			if (maxScroll >= target) {
				performRestore("content sufficient");
				return;
			}

			// 情况2: 高度稳定（不再增长）
			if (
				lastHeightRef.current > 0 &&
				currentHeight === lastHeightRef.current
			) {
				// 高度不再变化，说明内容已渲染完成
				// 即使 maxScroll < target，也恢复到最大可滚动位置
				performRestore("content stable");
				return;
			}

			// 更新上次高度
			lastHeightRef.current = currentHeight;

			// 清除旧的稳定性计时器
			if (stabilityTimerRef.current !== null) {
				window.clearTimeout(stabilityTimerRef.current);
			}

			// 设置新的稳定性计时器
			// 如果在 stabilityDelay 时间内高度没有变化，认为内容已稳定
			stabilityTimerRef.current = window.setTimeout(() => {
				if (!settledRef.current) {
					checkStability();
				}
			}, stabilityDelay);
		};

		// 立即检查一次
		checkStability();

		// 使用 ResizeObserver 监听容器尺寸变化
		try {
			ro = new ResizeObserver(() => {
				if (!settledRef.current) {
					checkStability();
				}
			});
			ro.observe(container);
			log("ResizeObserver attached");
		} catch (err) {
			log("ResizeObserver not available", err);
		}

		// 超时保护
		fallbackTimer = window.setTimeout(() => {
			if (!settledRef.current) {
				log("⏰ Timeout reached, forcing restore");
				performRestore("timeout");
			}
		}, timeout);

		cleanupRef.current = cleanup;
		return cleanup;
	}, [
		location.pathname,
		scrollPath,
		isLoading,
		containerSelector,
		timeout,
		stabilityDelay,
		log,
	]);

	// 普通模式：使用 useEffect
	useEffect(() => {
		if (!useKeepAlive) {
			performScrollRestore();
		}
	}, [useKeepAlive, performScrollRestore]);

	// KeepAlive 模式：使用 useActivate
	useActivate(() => {
		if (useKeepAlive) {
			log("[KeepAlive] 组件激活，触发滚动恢复");
			// 重置状态，因为可能是从其他页面返回
			settledRef.current = false;
			lastHeightRef.current = 0;
			performScrollRestore();
		}
	});

	// KeepAlive 失活时清理
	useUnactivate(() => {
		if (useKeepAlive && cleanupRef.current) {
			cleanupRef.current();
			cleanupRef.current = null;
		}
	});
}
