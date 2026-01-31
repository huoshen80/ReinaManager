/**
 * @file useDebouncedValue Hook
 * @description 防抖值 Hook，用于延迟更新值以优化性能
 * @module src/hooks/useDebouncedValue
 */

import { useEffect, useState } from "react";

/**
 * 防抖值 Hook
 * @param value 原始值
 * @param delay 延迟时间（毫秒），默认 300ms
 * @returns 防抖后的值
 */
export function useDebouncedValue<T>(value: T, delay: number = 300): T {
	const [debouncedValue, setDebouncedValue] = useState<T>(value);

	useEffect(() => {
		// 设置定时器延迟更新值
		const handler = setTimeout(() => {
			setDebouncedValue(value);
		}, delay);

		// 清理函数：在值变化或组件卸载时清除定时器
		return () => {
			clearTimeout(handler);
		};
	}, [value, delay]);

	return debouncedValue;
}
