import type { NetworkRequestContext } from "@/metadata/api/http";
import { GameMetadataSession } from "@/metadata/data/gameMetadataService";
import type { MetadataRequestContext } from "@/metadata/sourceAdapter";
import { useStore } from "@/store/appStore";
import { withSourceMetadataAuth } from "./metadataAuth";

export function getNetworkRequestContext(
	signal?: AbortSignal,
): NetworkRequestContext {
	const proxyUrl = useStore.getState().proxyConfig.url.trim();
	return {
		proxyUrl: proxyUrl || undefined,
		signal,
	};
}

export function getMetadataRequestContext(
	options: {
		bgmToken?: string;
		hikarinagiToken?: string;
		nextmoeToken?: string;
		nextmoeUserId?: string;
		signal?: AbortSignal;
	} = {},
): MetadataRequestContext {
	const state = useStore.getState();
	const proxyUrl = state.proxyConfig.url.trim();
	return {
		proxyUrl: proxyUrl || undefined,
		signal: options.signal,
		spoilerLevel: state.spoilerLevel,
		bgmToken: options.bgmToken,
		hikarinagiToken: options.hikarinagiToken,
		nextmoeToken: options.nextmoeToken,
		nextmoeUserId: options.nextmoeUserId,
		autoExpandSources: [
			...(state.kunAutoExpand ? ["kun" as const] : []),
			...(state.hikarinagiAutoExpand ? ["hikarinagi" as const] : []),
		],
		mixedEnabledSources: [...state.mixedEnabledSources],
		authenticateSource: withSourceMetadataAuth,
	};
}

export function createMetadataSession(
	options: {
		bgmToken?: string;
		hikarinagiToken?: string;
		nextmoeToken?: string;
		nextmoeUserId?: string;
		signal?: AbortSignal;
	} = {},
): GameMetadataSession {
	return new GameMetadataSession(getMetadataRequestContext(options));
}
