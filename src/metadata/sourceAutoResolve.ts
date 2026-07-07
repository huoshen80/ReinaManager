import type { GameMetadataDraft, SourceType } from "@/types";
import {
	getCandidateSourceData,
	getSourceCandidateFromGame,
	type SourceCandidate,
	sourceCandidateToDraft,
} from "./sourceCandidate";
import { getRuntimeSourceAdapter } from "./sourceRegistry";

export interface AutoResolveSourceCandidateParams {
	query: string;
	source: SourceType;
	bgmToken?: string;
	enrichCrossSource?: boolean;
	signal?: AbortSignal;
}

async function searchFirstSourceCandidate({
	query,
	source,
	bgmToken,
	signal,
}: AutoResolveSourceCandidateParams): Promise<SourceCandidate | null> {
	const adapter = getRuntimeSourceAdapter(source);
	const [candidate] = await adapter.searchByName(query, {
		bgmToken,
		limit: 1,
		signal,
	});

	return candidate ?? null;
}

export async function resolveAutoSelectedSourceCandidate({
	query,
	source,
	bgmToken,
	enrichCrossSource = true,
	signal,
}: AutoResolveSourceCandidateParams): Promise<SourceCandidate | null> {
	const adapter = getRuntimeSourceAdapter(source);
	const candidate = await searchFirstSourceCandidate({
		query,
		source,
		bgmToken,
		signal,
	});

	if (!candidate) {
		return null;
	}

	if (!adapter.enrichOnSelect) {
		return candidate;
	}

	const draft = await adapter.enrichOnSelect(candidate, {
		bgmToken,
		enrichCrossSource,
		signal,
	});
	const data = getCandidateSourceData(draft, source) ?? candidate.data;

	return getSourceCandidateFromGame(
		draft,
		adapter,
		adapter.toDisplayFields(data),
	);
}

export async function resolveAutoSelectedGameDraft(
	params: AutoResolveSourceCandidateParams,
): Promise<GameMetadataDraft | null> {
	const candidate = await searchFirstSourceCandidate(params);
	if (!candidate) {
		return null;
	}

	const adapter = getRuntimeSourceAdapter(params.source);
	if (!adapter.enrichOnSelect || !candidate.externalId) {
		return sourceCandidateToDraft(candidate);
	}

	return adapter.enrichOnSelect(candidate, {
		bgmToken: params.bgmToken,
		enrichCrossSource: params.enrichCrossSource ?? true,
		signal: params.signal,
	});
}
