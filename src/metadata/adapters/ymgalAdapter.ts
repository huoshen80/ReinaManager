import type { GameCandidateData, YmgalData } from "@/types";
import { fetchYmById, fetchYmByName } from "../api/ymgal";
import {
	DEFAULT_METADATA_SEARCH_LIMIT,
	type MetadataSourceAdapter,
} from "../sourceAdapter";
import {
	createSourceCandidate,
	getCandidateSourceData,
	getCandidateSourceId,
	mergeCandidateDetailData,
	normalizeGameCandidateSources,
	type SourceCandidate,
	type SourceDisplayFields,
	sourceCandidateToDraft,
} from "../sourceCandidate";

function toYmgalCandidate(game: GameCandidateData): SourceCandidate<YmgalData> {
	const data = getCandidateSourceData<YmgalData>(game, "ymgal");
	if (!data) {
		throw new Error("Missing ymgal data in ymgal candidate");
	}

	return createSourceCandidate({
		source: "ymgal",
		externalId: getCandidateSourceId(game, "ymgal"),
		data,
		display: ymgalAdapter.toDisplayFields(data),
	});
}

export const ymgalAdapter: MetadataSourceAdapter<YmgalData> = {
	key: "ymgal",
	label: "YMGal",
	iconUrl: "https://www.ymgal.games/favicon.ico",
	participatesInMixed: true,
	defaultMixedEnabled: false,
	validateId: (id) => /^(ga)?\d+$/i.test(id),
	getExternalUrl: (id) => `https://www.ymgal.games/ga${id}`,
	async fetchById(id, ctx) {
		const game = await fetchYmById(id, ctx.signal);
		return normalizeGameCandidateSources(game, "ymgal");
	},
	async searchByName(name, ctx) {
		const games = await fetchYmByName(
			name,
			1,
			ctx.limit ?? DEFAULT_METADATA_SEARCH_LIMIT,
			false,
			ctx.signal,
		);
		return games.map(toYmgalCandidate);
	},
	async enrichOnSelect(candidate, ctx) {
		if (!candidate.externalId) {
			return sourceCandidateToDraft(candidate);
		}

		const game = await fetchYmById(candidate.externalId, ctx.signal);
		return mergeCandidateDetailData(candidate, game);
	},
	toDisplayFields: (data): SourceDisplayFields => ({
		image: data.image,
		name: data.name,
		name_cn: data.name_cn,
		summary: data.summary,
		developer: data.developer,
		aliases: data.aliases ?? [],
		nsfw: data.nsfw,
		date: data.date,
	}),
};
