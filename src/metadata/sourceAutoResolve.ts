import type { SourceType } from "@/types";
import {
	getCandidateSourceData,
	getSourceCandidateFromGame,
	type SourceCandidate,
} from "./sourceCandidate";
import { getRuntimeSourceAdapter } from "./sourceRegistry";

export interface AutoResolveSourceCandidateParams {
	query: string;
	source: SourceType;
	bgmToken?: string;
	enrichCrossSource?: boolean;
	signal?: AbortSignal;
}

export async function resolveAutoSelectedSourceCandidate({
	query,
	source,
	bgmToken,
	enrichCrossSource = true,
	signal,
}: AutoResolveSourceCandidateParams): Promise<SourceCandidate | null> {
	const adapter = getRuntimeSourceAdapter(source);
	const [candidate] = await adapter.searchByName(query, {
		bgmToken,
		limit: 1,
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
