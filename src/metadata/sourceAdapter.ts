import type { SourceDataKey, SourceIdType, SourceType } from "@/types";
import type { SourceCandidate, SourceDisplayFields } from "./sourceCandidate";

export interface MetadataSourceContext {
	bgmToken?: string;
	enrichCrossSource?: boolean;
	limit?: number;
	signal?: AbortSignal;
}

export interface MetadataSourceAdapter<TData = unknown> {
	key: SourceType;
	label: string;
	idKey: SourceIdType;
	dataKey: SourceDataKey;
	participatesInMixed: boolean;
	defaultMixedEnabled: boolean;
	mixedSearchLimit: number;
	validateId: (id: string) => boolean;
	fetchById(
		id: string,
		ctx: MetadataSourceContext,
	): Promise<SourceCandidate<TData>>;
	searchByName(
		name: string,
		ctx: MetadataSourceContext,
	): Promise<SourceCandidate<TData>[]>;
	enrichOnSelect?(
		candidate: SourceCandidate<TData>,
		ctx: MetadataSourceContext,
	): Promise<SourceCandidate<TData>>;
	toDisplayFields(data: TData): SourceDisplayFields;
}
