/**
 * @file useTauriDragDrop Hook
 * @description 监听 Tauri 拖拽事件，支持一次处理多个路径，避免重复触发。
 */

import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useRef, useState } from "react";
import { handleDroppedPaths, type LaunchSelection } from "@/utils";

interface UseTauriDragDropOptions {
	onValidPath?: (path: string) => void;
	onValidPaths?: (paths: LaunchSelection[]) => void;
	enabled?: boolean;
}

export const useTauriDragDrop = ({
	onValidPath,
	onValidPaths,
	enabled = true,
}: UseTauriDragDropOptions = {}) => {
	const [isDragging, setIsDragging] = useState(false);
	const [pendingPaths, setPendingPaths] = useState<string[] | null>(null);

	const isHandlingRef = useRef(false);
	const lastDropRef = useRef<{ pathKey: string; time: number } | null>(null);

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
					if (paths.length > 0) setPendingPaths(paths);
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

	useEffect(() => {
		if (!pendingPaths || pendingPaths.length === 0) return;

		const currentPaths = pendingPaths;
		setPendingPaths(null);

		const processDrop = async () => {
			if (isHandlingRef.current) return;
			isHandlingRef.current = true;

			try {
				const now = Date.now();
				const pathKey = currentPaths.join("|");
				const lastDrop = lastDropRef.current;

				if (
					lastDrop &&
					lastDrop.pathKey === pathKey &&
					now - lastDrop.time < 800
				) {
					return;
				}

				const selectedPaths = await handleDroppedPaths(currentPaths);
				if (selectedPaths.length === 0) return;

				lastDropRef.current = { pathKey, time: now };
				onValidPaths?.(selectedPaths);
				onValidPath?.(selectedPaths[0].executablePath);
			} catch (error) {
				console.error("处理拖拽异常:", error);
			} finally {
				isHandlingRef.current = false;
			}
		};

		processDrop();
	}, [pendingPaths, onValidPath, onValidPaths]);

	return { isDragging };
};
