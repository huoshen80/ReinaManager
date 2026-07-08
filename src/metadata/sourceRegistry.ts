import type {
	BgmData,
	KunData,
	SourceType,
	VndbData,
	YmgalData,
} from "@/types";
import { bgmAdapter } from "./adapters/bgmAdapter";
import { kunAdapter } from "./adapters/kunAdapter";
import { vndbAdapter } from "./adapters/vndbAdapter";
import { ymgalAdapter } from "./adapters/ymgalAdapter";
import type { MetadataSourceAdapter } from "./sourceAdapter";

export type SourceAdapterMap = {
	bgm: MetadataSourceAdapter<BgmData>;
	vndb: MetadataSourceAdapter<VndbData>;
	ymgal: MetadataSourceAdapter<YmgalData>;
	kun: MetadataSourceAdapter<KunData>;
};

export const SOURCE_ADAPTERS = {
	bgm: bgmAdapter,
	vndb: vndbAdapter,
	ymgal: ymgalAdapter,
	kun: kunAdapter,
} as const satisfies SourceAdapterMap;

export type RegisteredSourceAdapter = SourceAdapterMap[SourceType];
export type RuntimeSourceAdapter = MetadataSourceAdapter<unknown>;

export const REGISTERED_SOURCE_KEYS = Object.keys(
	SOURCE_ADAPTERS,
) as SourceType[];

export const SEARCHABLE_SOURCE_KEYS = REGISTERED_SOURCE_KEYS.filter(
	(source) => !SOURCE_ADAPTERS[source].isBanned,
);

export const MIXED_SOURCE_KEYS = REGISTERED_SOURCE_KEYS.filter(
	(source) => SOURCE_ADAPTERS[source].participatesInMixed,
);

export const DEFAULT_MIXED_SOURCE_KEYS = MIXED_SOURCE_KEYS.filter(
	(source) => SOURCE_ADAPTERS[source].defaultMixedEnabled,
);

export function getSourceAdapter<TSource extends SourceType>(
	source: TSource,
): SourceAdapterMap[TSource] {
	return SOURCE_ADAPTERS[source];
}

export function getEnabledMixedAdapters(
	enabledSources?: readonly SourceType[],
): RuntimeSourceAdapter[] {
	const enabledSet = enabledSources ? new Set(enabledSources) : undefined;
	return MIXED_SOURCE_KEYS.filter(
		(source) => !enabledSet || enabledSet.has(source),
	).map((source) => SOURCE_ADAPTERS[source]);
}

export function getRuntimeSourceAdapter(
	source: SourceType,
): RuntimeSourceAdapter {
	return SOURCE_ADAPTERS[source];
}
