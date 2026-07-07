import type { BgmData, GameMetadataDraft } from "@/types";
import { fetchBgmById, fetchBgmByName } from "../api/bgm";
import {
	DEFAULT_METADATA_SEARCH_LIMIT,
	type MetadataSourceAdapter,
} from "../sourceAdapter";
import {
	createSourceCandidate,
	getCandidateSourceData,
	getCandidateSourceId,
	normalizeGameCandidateSources,
	type SourceCandidate,
	type SourceDisplayFields,
} from "../sourceCandidate";

// BGM token 不應為必須
// 但是需要R18等信息時還是需要登錄

function toBgmCandidate(game: GameMetadataDraft): SourceCandidate<BgmData> {
	const data = getCandidateSourceData<BgmData>(game, "bgm");
	if (!data) {
		throw new Error("Missing bgm data in bgm candidate");
	}

	return createSourceCandidate({
		source: "bgm",
		externalId: getCandidateSourceId(game, "bgm"),
		data,
		display: bgmAdapter.toDisplayFields(data),
	});
}

export const bgmAdapter: MetadataSourceAdapter<BgmData> = {
	key: "bgm",
	label: "Bangumi",
	iconUrl: "https://bgm.tv/img/favicon.ico",
	participatesInMixed: true,
	defaultMixedEnabled: true,
	validateId: (id) => /^\d+$/.test(id),
	getExternalUrl: (id) => `https://bgm.tv/subject/${id}`,
	async fetchById(id, ctx) {
		const game = await fetchBgmById(id, ctx.bgmToken, ctx.signal);
		return normalizeGameCandidateSources(game, "bgm");
	},
	async searchByName(name, ctx) {
		const games = await fetchBgmByName(
			name,
			ctx.bgmToken,
			ctx.limit ?? DEFAULT_METADATA_SEARCH_LIMIT,
			ctx.signal,
		);
		return games.map(toBgmCandidate);
	},
	toDisplayFields: (data): SourceDisplayFields => ({
		image: data.image,
		name: data.name,
		name_cn: data.name_cn,
		summary: data.summary,
		tags: data.tags ?? [],
		rank: data.rank,
		score: data.score,
		developer: data.developer,
		aliases: data.aliases ?? [],
		nsfw: data.nsfw,
		date: data.date,
	}),
};
