import { useCallback } from "react";
import { useStore } from "@/store/appStore";
import { getBackendProxyImageUrl, getImageCandidates } from "@/utils/image";

export function useProxyImageUrlResolver() {
	const proxyUrl = useStore((state) => state.proxyConfig.url);
	const isSystemProxyActive = useStore((state) => state.isSystemProxyActive);

	return useCallback(
		(imageUrl: string | null | undefined): string | undefined => {
			if (!imageUrl) return undefined;
			const candidates = getImageCandidates(
				imageUrl,
				proxyUrl,
				isSystemProxyActive,
			);
			if (candidates[0] !== imageUrl) return candidates[0];

			// 单值调用点无法执行 fallback；除镜像优先情况外，保留原有的应用代理行为。
			const backendProxyUrl = getBackendProxyImageUrl(imageUrl, proxyUrl);
			if (backendProxyUrl) return backendProxyUrl;

			return candidates[0] ?? imageUrl;
		},
		[proxyUrl, isSystemProxyActive],
	);
}
