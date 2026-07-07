import type {
	GameMetadataDraft,
	GameSourceRecord,
	JsonValue,
	SourceCandidateRecord,
	SourceType,
} from "@/types";
import { SOURCE_TYPES } from "@/types";

export interface SourceDisplayFields {
	image?: string;
	name?: string;
	name_cn?: string;
	summary?: string;
	tags?: string[];
	rank?: number;
	score?: number;
	developer?: string;
	all_titles?: string[];
	aliases?: string[];
	average_hours?: number;
	nsfw?: boolean;
	date?: string;
}

export interface SourceCandidate<TData = unknown> {
	source: SourceType;
	externalId?: string;
	data: TData;
	display: SourceDisplayFields;
}

const SOURCE_ORDER = [...SOURCE_TYPES];

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function mergeDefinedValues<T extends Record<string, unknown>>(
	base: T,
	next: T,
): T {
	const merged = { ...base };
	for (const [key, value] of Object.entries(next)) {
		if (value !== undefined) {
			merged[key as keyof T] = value as T[keyof T];
		}
	}
	return merged;
}

export function createSourceCandidateRecord<TData>(
	source: SourceType,
	externalId: string,
	data: TData,
): SourceCandidateRecord<TData> {
	return {
		source,
		external_id: externalId,
		data,
	};
}

export function candidateSourcesToGameSources(
	sources: readonly SourceCandidateRecord[],
): GameSourceRecord[] {
	return sources.map((record) => ({
		source: record.source,
		external_id: record.external_id,
		data: record.data as JsonValue,
	}));
}

export function mergeCandidateSources(
	candidates: readonly GameMetadataDraft[],
): SourceCandidateRecord[] {
	const sourceMap = new Map<SourceType, SourceCandidateRecord>();

	for (const candidate of candidates) {
		for (const source of SOURCE_ORDER) {
			const record = getCandidateSourceRecord(candidate, source);
			if (record) {
				sourceMap.set(source, record);
			}
		}
	}

	return SOURCE_ORDER.map((source) => sourceMap.get(source)).filter(
		(record): record is SourceCandidateRecord => Boolean(record),
	);
}

export function createGameCandidate(params: {
	idType?: string;
	source?: SourceCandidateRecord;
	sources?: readonly SourceCandidateRecord[];
	localpath?: string;
	customData?: GameMetadataDraft["custom_data"];
}): GameMetadataDraft {
	const sources = params.sources ?? (params.source ? [params.source] : []);
	return {
		id_type: params.idType,
		sources: [...sources],
		localpath: params.localpath,
		custom_data: params.customData,
	};
}

export function normalizeGameCandidateSources(
	candidate: GameMetadataDraft,
	fallbackIdType?: string,
): GameMetadataDraft {
	return createGameCandidate({
		idType: candidate.id_type ?? fallbackIdType,
		sources: mergeCandidateSources([candidate]),
		localpath: candidate.localpath ?? undefined,
		customData: candidate.custom_data,
	});
}

export function getCandidateSourceRecord(
	candidate: GameMetadataDraft,
	source: SourceType,
): SourceCandidateRecord | undefined {
	const nativeRecord = candidate.sources?.find(
		(record) => record.source === source,
	);
	if (nativeRecord) {
		return nativeRecord;
	}
}

export function getCandidateSourceId(
	candidate: GameMetadataDraft,
	source: SourceType,
): string | undefined {
	return getCandidateSourceRecord(candidate, source)?.external_id;
}

export function getCandidateSourceData<TData = unknown>(
	candidate: GameMetadataDraft,
	source: SourceType,
): TData | undefined {
	return getCandidateSourceRecord(candidate, source)?.data as TData | undefined;
}

export function createSourceCandidate<TData>(params: {
	source: SourceType;
	externalId?: string;
	data: TData;
	display: SourceDisplayFields;
}): SourceCandidate<TData> {
	return {
		source: params.source,
		externalId: params.externalId,
		data: params.data,
		display: params.display,
	};
}

export function sourceCandidateToDraft(
	candidate: SourceCandidate,
): GameMetadataDraft {
	if (!candidate.externalId) {
		throw new Error(`Missing ${candidate.source} external id in candidate`);
	}

	return createGameCandidate({
		idType: candidate.source,
		source: createSourceCandidateRecord(
			candidate.source,
			candidate.externalId,
			candidate.data,
		),
	});
}

export function mergeCandidateDetailData(
	candidate: SourceCandidate,
	details: GameMetadataDraft,
): GameMetadataDraft {
	const merged = normalizeGameCandidateSources(details, candidate.source);
	const source = candidate.source;
	const detailRecord = getCandidateSourceRecord(details, source);
	const baseSourceData = candidate.data;
	const detailSourceData = detailRecord?.data;

	if (!detailRecord) {
		merged.sources = mergeCandidateSources([
			merged,
			sourceCandidateToDraft(candidate),
		]);
		return merged;
	}

	if (isRecord(baseSourceData) && isRecord(detailSourceData)) {
		const mergedData = mergeDefinedValues(baseSourceData, detailSourceData);
		merged.sources = mergeCandidateSources([
			merged,
			{
				...merged,
				sources: [
					createSourceCandidateRecord(
						source,
						detailRecord.external_id,
						mergedData,
					),
				],
			},
		]);
	} else {
		merged.sources = mergeCandidateSources([merged]);
	}

	return merged;
}

export function getSourceCandidateFromGame<TData>(
	game: GameMetadataDraft,
	source: {
		key: SourceType;
	},
	display: SourceDisplayFields,
): SourceCandidate<TData> {
	const data = getCandidateSourceData<TData>(game, source.key);

	if (!data) {
		throw new Error(`Missing ${source.key} data in ${source.key} candidate`);
	}

	return createSourceCandidate({
		source: source.key,
		externalId: getCandidateSourceId(game, source.key),
		data,
		display,
	});
}

export function buildGameCandidateFromSourceSelection(params: {
	selection: Partial<Record<SourceType, SourceCandidate | null>>;
	defaults?: Partial<GameMetadataDraft>;
}): GameMetadataDraft {
	const selected = SOURCE_ORDER.map(
		(source) => params.selection[source],
	).filter((candidate): candidate is SourceCandidate => Boolean(candidate));

	if (selected.length === 0) {
		throw new Error("At least one source candidate must be selected");
	}

	const sources = selected.map((candidate) => {
		if (!candidate.externalId) {
			throw new Error(`Missing ${candidate.source} external id in candidate`);
		}

		return createSourceCandidateRecord(
			candidate.source,
			candidate.externalId,
			candidate.data,
		);
	});

	return {
		...params.defaults,
		id_type: sources.length === 1 ? sources[0].source : "mixed",
		sources,
	};
}
