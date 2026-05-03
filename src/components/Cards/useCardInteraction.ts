import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 卡片交互 Hook - 处理点击、双击、长按逻辑
 * 使用 useRef 管理计时器，避免不必要的重渲染
 */
export function useCardInteraction(options: {
	onClick: () => void;
	onDoubleClick: () => void;
	onLongPress: () => void;
	useDelayedClick: boolean;
}) {
	const { onClick, onDoubleClick, onLongPress, useDelayedClick } = options;

	// 使用 ref 管理计时器，避免 state 更新导致重渲染
	const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const longPressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const hasLongPressedRef = useRef(false);
	const [isLongPressing, setIsLongPressing] = useState(false);

	// 清理计时器
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

	// 点击处理
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
		} else {
			onClick();
		}
	}, [onClick, useDelayedClick, clearClickTimeout]);

	// 双击处理
	const handleDoubleClick = useCallback(() => {
		if (useDelayedClick) {
			clearClickTimeout();
		}
		onDoubleClick();
	}, [onDoubleClick, useDelayedClick, clearClickTimeout]);

	// 鼠标按下 - 开始长按计时
	const handleMouseDown = useCallback(() => {
		hasLongPressedRef.current = false;
		clearLongPressTimeout();

		longPressTimeoutRef.current = setTimeout(() => {
			setIsLongPressing(true);
			hasLongPressedRef.current = true;
			onLongPress();
		}, 800);
	}, [onLongPress, clearLongPressTimeout]);

	// 鼠标抬起 - 结束长按
	const handleMouseUp = useCallback(() => {
		clearLongPressTimeout();
		setIsLongPressing(false);

		// 延迟重置，避免触发点击事件
		setTimeout(() => {
			hasLongPressedRef.current = false;
		}, 50);
	}, [clearLongPressTimeout]);

	// 鼠标离开 - 取消长按
	const handleMouseLeave = useCallback(() => {
		clearLongPressTimeout();
		setIsLongPressing(false);
	}, [clearLongPressTimeout]);

	// 组件卸载时清理计时器
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
