import type { SourceType } from "@/types";
import type { SourceCandidate, SourceDisplayFields } from "./sourceCandidate";

export type SourceIdMap = Partial<Record<SourceType, string>>;

export const DEFAULT_METADATA_SEARCH_LIMIT = 8;

export interface MetadataSourceContext {
	bgmToken?: string;
	enrichCrossSource?: boolean;
	limit?: number;
	signal?: AbortSignal;
}

export interface MetadataSourceAdapter<TData = unknown> {
	key: SourceType;
	label: string;
	iconUrl: string;
	participatesInMixed: boolean;
	defaultMixedEnabled: boolean;
	validateId: (id: string) => boolean;
	getExternalUrl(id: string): string;
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
