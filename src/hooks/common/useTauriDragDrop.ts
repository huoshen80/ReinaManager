/**
 * @file useTauriDragDrop Hook
 * @description 修复了弹窗重复触发的问题。
 * 核心策略：收到路径后立即清空 State，切断重渲染导致的二次触发。
 */

import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
// 假设 handleDroppedPath 是你的业务逻辑（包含弹窗）
import { handleDroppedPath } from "@/utils";

interface UseTauriDragDropOptions {
	onValidPath?: (path: string) => void;
	enabled?: boolean;
}

export const useTauriDragDrop = ({
	onValidPath,
	enabled = true,
}: UseTauriDragDropOptions = {}) => {
	const [isDragging, setIsDragging] = useState(false);

	// 数据状态：缓冲区
	const [pendingPaths, setPendingPaths] = useState<string[] | null>(null);

	// 业务锁
	const isHandlingRef = useRef(false);
	const lastDropRef = useRef<{ path: string; time: number } | null>(null);

	// Effect 1: 监听器 (保持不变)
	useEffect(() => {
		if (!isTauri() || !enabled) return;

		let isMounted = true;
		let unlistenEnter: () => void;
		let unlistenLeave: () => void;
		let unlistenDrop: () => void;

		const setupListeners = async () => {
			const appWindow = getCurrentWindow();

			const uEnter = await appWindow.listen("tauri://drag-enter", () => {
				if (isMounted) setIsDragging(true);
			});
			if (!isMounted) {
				uEnter();
				return;
			}
			unlistenEnter = uEnter;

			const uLeave = await appWindow.listen("tauri://drag-leave", () => {
				if (isMounted) setIsDragging(false);
			});
			if (!isMounted) {
				uLeave();
				return;
			}
			unlistenLeave = uLeave;

			const uDrop = await appWindow.listen<{ paths: string[] }>(
				"tauri://drag-drop",
				(event) => {
					if (!isMounted) return;
					setIsDragging(false);
					const paths = event.payload?.paths ?? [];
					if (paths.length > 0) {
						setPendingPaths(paths);
					}
				},
			);
			if (!isMounted) {
				uDrop();
				return;
			}
			unlistenDrop = uDrop;
		};

		setupListeners();

		return () => {
			isMounted = false;
			if (unlistenEnter) unlistenEnter();
			if (unlistenLeave) unlistenLeave();
			if (unlistenDrop) unlistenDrop();
		};
	}, [enabled]);

	// Effect 2: 处理器 (修复了这里)
	useEffect(() => {
		// 1. 如果没有路径，直接退出
		if (!pendingPaths || pendingPaths.length === 0) return;

		// 2. 关键修复：立即捕获数据到局部变量
		const currentPath = pendingPaths[0];

		// 3. 关键修复：立即清空 State！
		// 告诉 React：“这个任务我已经领走了，别再发给我了”
		// 这样即使下面 await 很久，pendingPaths 也已经是 null 了，不会重复触发
		setPendingPaths(null);

		const processDrop = async () => {
			// 4. 检查锁
			if (isHandlingRef.current) return;
			isHandlingRef.current = true;

			try {
				const now = Date.now();
				const lastDrop = lastDropRef.current;

				// 防抖检查
				if (
					lastDrop &&
					lastDrop.path === currentPath &&
					now - lastDrop.time < 800
				) {
					console.log("防抖拦截");
					return;
				}

				// 5. 执行耗时任务（如弹窗）
				// 此时 pendingPaths 已经是 null，组件怎么重渲染都没事
				const selectedPath = await handleDroppedPath(currentPath);

				if (selectedPath) {
					lastDropRef.current = { path: currentPath, time: now };
					onValidPath?.(selectedPath);
				}
			} catch (error) {
				console.error("处理异常:", error);
			} finally {
				// 6. 任务彻底结束，释放锁
				isHandlingRef.current = false;
			}
		};

		processDrop();
	}, [pendingPaths, onValidPath]);

	return { isDragging };
};
