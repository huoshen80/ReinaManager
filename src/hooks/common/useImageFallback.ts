import { useCallback, useMemo, useState } from "react";
import { useStore } from "@/store/appStore";
import { getImageCandidates } from "@/utils/image";

export interface UseImageFallbackOptions {
	fallbackSrc?: string;
	onError?: () => void;
}

/**
 * 针对图片 URL 提供多候选降级重试能力的 Hook。
 *
 * 当当前图片加载失败（触发 onError）时，自动尝试下一个候选 URL（如第三方镜像、原站或代理），
 * 所有候选耗尽后回退到 fallbackSrc 并触发外部 onError 回调。
 */
export function useImageFallback(
	imageUrl: string | null | undefined,
	options?: UseImageFallbackOptions,
) {
	const proxyUrl = useStore((state) => state.proxyConfig.url);
	const isSystemProxyActive = useStore((state) => state.isSystemProxyActive);
	const candidates = useMemo(
		() => getImageCandidates(imageUrl, proxyUrl, isSystemProxyActive),
		[imageUrl, proxyUrl, isSystemProxyActive],
	);

	const sourceKey = `${imageUrl ?? ""}::${proxyUrl ?? ""}::${isSystemProxyActive}`;
	const [prevSourceKey, setPrevSourceKey] = useState(sourceKey);
	const [candidateIndex, setCandidateIndex] = useState(0);

	if (prevSourceKey !== sourceKey) {
		setPrevSourceKey(sourceKey);
		setCandidateIndex(0);
	}

	const currentSrc =
		candidateIndex < candidates.length
			? candidates[candidateIndex]
			: options?.fallbackSrc;
	const onError = options?.onError;

	const handleError = useCallback(() => {
		if (candidateIndex >= candidates.length) return;

		const nextIndex = candidateIndex + 1;
		setCandidateIndex(nextIndex);
		if (nextIndex >= candidates.length) {
			onError?.();
		}
	}, [candidateIndex, candidates.length, onError]);

	return {
		src: currentSrc,
		onError: handleError,
		hasError: candidateIndex >= candidates.length,
	};
}
