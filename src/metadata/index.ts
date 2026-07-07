export type { GameSearchParams } from "./data/gameMetadataService";
export { gameMetadataService } from "./data/gameMetadataService";
export type {
	MetadataSourceAdapter,
	MetadataSourceContext,
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
export type { RuntimeSourceAdapter } from "./sourceRegistry";
export {
	DEFAULT_MIXED_SOURCE_KEYS,
	getEnabledMixedAdapters,
	getRuntimeSourceAdapter,
	getSourceAdapter,
	MIXED_SOURCE_KEYS,
	REGISTERED_SOURCE_KEYS,
	SOURCE_ADAPTERS,
} from "./sourceRegistry";
