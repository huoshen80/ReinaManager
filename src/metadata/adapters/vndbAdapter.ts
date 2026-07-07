import type { GameMetadataDraft, VndbData } from "@/types";
import { fetchVndbById, fetchVndbByName } from "../api/vndb";
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

function toVndbCandidate(game: GameMetadataDraft): SourceCandidate<VndbData> {
	const data = getCandidateSourceData<VndbData>(game, "vndb");
	if (!data) {
		throw new Error("Missing vndb data in vndb candidate");
	}

	return createSourceCandidate({
		source: "vndb",
		externalId: getCandidateSourceId(game, "vndb"),
		data,
		display: vndbAdapter.toDisplayFields(data),
	});
}

export const vndbAdapter: MetadataSourceAdapter<VndbData> = {
	key: "vndb",
	label: "VNDB",
	iconUrl: "https://vndb.org/favicon.ico",
	participatesInMixed: true,
	defaultMixedEnabled: true,
	validateId: (id) => /^v\d+$/i.test(id),
	getExternalUrl: (id) => `https://vndb.org/${id}`,
	async fetchById(id, ctx) {
		const game = await fetchVndbById(id, ctx.signal);
		return normalizeGameCandidateSources(game, "vndb");
	},
	async searchByName(name, ctx) {
		const games = await fetchVndbByName(
			name,
			undefined,
			ctx.limit ?? DEFAULT_METADATA_SEARCH_LIMIT,
			ctx.signal,
		);
		return games.map(toVndbCandidate);
	},
	toDisplayFields: (data): SourceDisplayFields => ({
		image: data.image,
		name: data.name,
		name_cn: data.name_cn,
		summary: data.summary,
		tags: data.tags ?? [],
		score: data.score ?? undefined,
		developer: data.developer,
		all_titles: data.all_titles ?? [],
		aliases: data.aliases ?? [],
		average_hours: data.average_hours ?? undefined,
		nsfw: data.nsfw,
		date: data.date,
	}),
};
