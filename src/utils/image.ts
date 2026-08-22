import { isTauri } from "@tauri-apps/api/core";
import { buildTauriProtocolUrl } from "@/utils/tauriProtocol";

export const BANGUMI_IMAGE_HOST = "lain.bgm.tv";
export const VNDB_IMAGE_HOST = "t.vndb.org";
export const BANGUMI_IMAGE_PROXY_PREFIX = "https://imagesp.yurari.moe/bangumi/";
export const VNDB_IMAGE_PROXY_PREFIX = "https://imagesp.yurari.moe/vndb/";

export function getProxyCacheKey(proxyUrl: string): string {
	let hash = 2166136261;
	for (let index = 0; index < proxyUrl.length; index += 1) {
		hash ^= proxyUrl.charCodeAt(index);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

export function buildProxyImageUrl(imageUrl: string, proxyUrl: string): string {
	const params = new URLSearchParams({
		url: imageUrl,
		proxy: getProxyCacheKey(proxyUrl),
	});
	return buildTauriProtocolUrl("reina-image", "/", params);
}

function canUseBackendProxy(parsed: URL, proxyUrl?: string | null): boolean {
	return (
		Boolean(proxyUrl?.trim()) &&
		isTauri() &&
		parsed.hostname !== "localhost" &&
		!parsed.hostname.endsWith(".localhost")
	);
}

export function getBackendProxyImageUrl(
	imageUrl: string,
	proxyUrl?: string | null,
): string | undefined {
	let parsed: URL;
	try {
		parsed = new URL(imageUrl);
	} catch {
		return undefined;
	}

	if (
		!["http:", "https:"].includes(parsed.protocol) ||
		!canUseBackendProxy(parsed, proxyUrl) ||
		!proxyUrl
	) {
		return undefined;
	}

	return buildProxyImageUrl(imageUrl, proxyUrl);
}

/**
 * 针对外部图片 URL 构建按优先级排序的候选加载列表（用于 WebView2 原生直连与 fallback 重试）。
 *
 * 优先级策略：
 * 1. Bangumi (lain.bgm.tv)：国内直连大概率超时被阻断，因此优先走第三方代理镜像，失败后再尝试原站。
 * 2. VNDB (t.vndb.org)：直连较为稳定，因此优先走原站，失败后再尝试第三方代理镜像。
 * 3. 其他 URL：优先直连原站。
 * 4. 若配置了应用内代理且处于 Tauri 环境下，最后追加 reina-image 协议作为 Rust 代理终极兜底。
 */
export function getImageCandidates(
	imageUrl: string | null | undefined,
	proxyUrl?: string | null,
): string[] {
	if (!imageUrl) return [];

	let parsed: URL;
	try {
		parsed = new URL(imageUrl);
	} catch {
		// 非合法 URL（如本地路径、相对路径或 data URI 等），直接返回原字符串
		return [imageUrl];
	}

	if (!["http:", "https:"].includes(parsed.protocol)) {
		return [imageUrl];
	}

	const hostname = parsed.hostname;
	const candidates: string[] = [];

	if (hostname === BANGUMI_IMAGE_HOST) {
		const mirrorUrl = `${BANGUMI_IMAGE_PROXY_PREFIX}${imageUrl}`;
		// 镜像优先 -> 原站
		candidates.push(mirrorUrl, imageUrl);
	} else if (hostname === VNDB_IMAGE_HOST) {
		const mirrorUrl = `${VNDB_IMAGE_PROXY_PREFIX}${imageUrl}`;
		// 原站优先 -> 镜像
		candidates.push(imageUrl, mirrorUrl);
	} else {
		candidates.push(imageUrl);
	}

	// 如果配置了代理，在最后加上后端代理协议兜底
	if (canUseBackendProxy(parsed, proxyUrl) && proxyUrl) {
		const proxyProtocolUrl = buildProxyImageUrl(imageUrl, proxyUrl);
		if (!candidates.includes(proxyProtocolUrl)) {
			candidates.push(proxyProtocolUrl);
		}
	}

	return candidates;
}
