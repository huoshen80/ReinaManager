/**
 * @file AddModal Tauri 拖放 Hook
 * @description 监听 Tauri 窗口拖拽，并将一次事件中的完整路径批次交给业务层。
 */

import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";

interface UseTauriDragDropOptions {
	onPathsDropped?: (paths: string[]) => void;
	enabled?: boolean;
}

export const useTauriDragDrop = ({
	onPathsDropped,
	enabled = true,
}: UseTauriDragDropOptions = {}) => {
	const [isDragging, setIsDragging] = useState(false);

	const callbackRef = useRef(onPathsDropped);
	const lastDropRef = useRef<{ signature: string; time: number } | null>(null);

	useEffect(() => {
		callbackRef.current = onPathsDropped;
	}, [onPathsDropped]);

	useEffect(() => {
		if (!enabled) return;
		if (!isTauri()) return;

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
					if (paths.length === 0) return;

					const now = Date.now();
					const signature = paths.join("\u0000");
					const lastDrop = lastDropRef.current;
					if (lastDrop?.signature === signature && now - lastDrop.time < 800) {
						return;
					}

					lastDropRef.current = { signature, time: now };
					callbackRef.current?.(paths);
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
	return { isDragging };
};
