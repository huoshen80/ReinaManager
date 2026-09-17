import { useCallback, useEffect, useRef, useState } from "react";
import { fileService } from "@/services/invoke";
import type { UserPathInspection } from "@/services/invoke/fileService";

export interface UserPathInspectionState {
	inspection: UserPathInspection | null;
	error: unknown;
	isLoading: boolean;
	inspectedValue: string;
}

export interface UserPathInspectionControls extends UserPathInspectionState {
	inspect: (value?: string) => Promise<void>;
	markEditing: (value: string) => void;
}

const EMPTY_STATE: UserPathInspectionState = {
	inspection: null,
	error: null,
	isLoading: false,
	inspectedValue: "",
};

/** 对用户配置路径做轻量预览，不把输入过程写入全局查询缓存。 */
export function useUserPathInspection(
	value: string,
	enabled = true,
): UserPathInspectionControls {
	const requestIdRef = useRef(0);
	const previousValueRef = useRef<string>();
	const expectedEditedValueRef = useRef<string | null>(null);
	const inFlightRequestRef = useRef<{
		value: string;
		promise: Promise<void>;
	} | null>(null);
	const [state, setState] = useState<UserPathInspectionState>(EMPTY_STATE);

	const inspect = useCallback(
		async (requestedValue = value) => {
			const inspectedValue = requestedValue.trim();
			if (!enabled || !inspectedValue) {
				++requestIdRef.current;
				inFlightRequestRef.current = null;
				setState(EMPTY_STATE);
				return;
			}

			const inFlightRequest = inFlightRequestRef.current;
			if (inFlightRequest?.value === inspectedValue) {
				await inFlightRequest.promise;
				return;
			}

			const requestId = ++requestIdRef.current;
			setState({
				inspection: null,
				error: null,
				isLoading: true,
				inspectedValue,
			});
			const promise = (async () => {
				try {
					const inspection = await fileService.inspectUserPath(inspectedValue);
					if (requestId === requestIdRef.current) {
						setState({
							inspection,
							error: null,
							isLoading: false,
							inspectedValue,
						});
					}
				} catch (error: unknown) {
					if (requestId === requestIdRef.current) {
						setState({
							inspection: null,
							error,
							isLoading: false,
							inspectedValue,
						});
					}
				}
			})();
			inFlightRequestRef.current = { value: inspectedValue, promise };
			await promise;
			if (inFlightRequestRef.current?.promise === promise) {
				inFlightRequestRef.current = null;
			}
		},
		[enabled, value],
	);

	const markEditing = useCallback((nextValue: string) => {
		expectedEditedValueRef.current = nextValue.trim();
		++requestIdRef.current;
		inFlightRequestRef.current = null;
		setState({
			...EMPTY_STATE,
			inspectedValue: nextValue.trim(),
		});
	}, []);

	useEffect(() => {
		const nextValue = value.trim();
		const previousValue = previousValueRef.current;
		previousValueRef.current = nextValue;

		if (!enabled || !nextValue) {
			expectedEditedValueRef.current = null;
			++requestIdRef.current;
			setState(EMPTY_STATE);
			return;
		}

		if (expectedEditedValueRef.current === nextValue) {
			expectedEditedValueRef.current = null;
			return;
		}
		if (previousValue === nextValue && previousValue !== undefined) return;
		expectedEditedValueRef.current = null;
		void inspect(nextValue);
	}, [enabled, inspect, value]);

	return { ...state, inspect, markEditing };
}
