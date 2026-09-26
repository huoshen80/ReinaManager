export {
	DEFAULT_MIXED_SOURCE_KEYS,
	DEPRECATED_SOURCE_KEYS,
	isDeprecatedSource,
	MIXED_SOURCE_KEYS,
	MIXED_SOURCE_MAX_COUNT,
	MIXED_SOURCE_MIN_COUNT,
	REGISTERED_SOURCE_KEYS,
	SEARCHABLE_SOURCE_KEYS,
} from "./constants";
export type { GameSearchParams } from "./data/gameMetadataService";
export { GameMetadataSession } from "./data/gameMetadataService";
export type {
	BoundMetadataSourceAdapter,
	MetadataSourceAdapter,
	MetadataSourceContext,
	MetadataSourceOptions,
	SourceIdMap,
} from "./sourceAdapter";
export type { AutoResolveSourceCandidateParams } from "./sourceAutoResolve";
export {
	resolveAutoSelectedGameDraft,
	resolveAutoSelectedSourceCandidate,
} from "./sourceAutoResolve";
export type {
	SourceCandidate,
	SourceDisplayFields,
} from "./sourceCandidate";
export {
	buildGameCandidateFromSourceSelection,
	candidateSourcesToGameSources,
	createGameCandidate,
	createSourceCandidate,
	createSourceCandidateRecord,
	getCandidateSourceData,
	getCandidateSourceId,
	getCandidateSourceRecord,
	getSourceCandidateFromGame,
	mergeCandidateDetailData,
	mergeCandidateSources,
	normalizeGameCandidateSources,
	sourceCandidateToDraft,
} from "./sourceCandidate";
export type {
	BoundSourceAdapterMap,
	RuntimeBoundSourceAdapter,
	RuntimeSourceAdapter,
} from "./sourceRegistry";
export {
	bindSourceAdapters,
	getRuntimeSourceAdapter,
	getSourceAdapter,
	SOURCE_ADAPTERS,
} from "./sourceRegistry";
