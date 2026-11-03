import type { KunData } from "@/types";
import {
	cleanNextmoeTags,
	fetchNextmoeById,
	fetchNextmoeByName,
	NEXTMOE_ASSOCIATED_SOURCE_KEYS,
} from "../api/nextmoe";
import {
	DEFAULT_METADATA_SEARCH_LIMIT,
	type MetadataSourceAdapter,
} from "../sourceAdapter";
import type { SourceDisplayFields } from "../sourceCandidate";
import {
	createSourceCandidate,
	getCandidateSourceData,
	getCandidateSourceId,
	sourceCandidateToDraft,
} from "../sourceCandidate";

export const kunAdapter: MetadataSourceAdapter<KunData> = {
	key: "kun",
	label: "Kungal",
	iconUrl: "https://www.kungal.com/favicon.ico",
	associatedSourceKeys: NEXTMOE_ASSOCIATED_SOURCE_KEYS,
	validateId: (id) => /^\d+$/.test(id),
	getExternalUrl: (id) => `https://www.kungal.com/galgame/${id}`,
	finalizeData: cleanNextmoeTags,
	fetchById: (id, ctx) => {
		return fetchNextmoeById(
			id,
			ctx.nextmoeToken,
			ctx.spoilerLevel,
			ctx,
			ctx.referencesOnly,
		);
	},
	async searchByName(name, ctx) {
		const games = await fetchNextmoeByName(
			name,
			ctx.nextmoeToken,
			ctx.limit ?? DEFAULT_METADATA_SEARCH_LIMIT,
			ctx,
		);
		return games.map((game) => {
			const data = getCandidateSourceData<KunData>(game, "kun");
			if (!data) throw new Error("Missing kun data in NextMoe candidate");
			return createSourceCandidate({
				source: "kun",
				externalId: getCandidateSourceId(game, "kun"),
				data,
				display: kunAdapter.toDisplayFields(data),
			});
		});
	},
	enrichOnSelect: (candidate, ctx) => {
		return candidate.externalId
			? fetchNextmoeById(
					candidate.externalId,
					ctx.nextmoeToken,
					ctx.spoilerLevel,
					ctx,
				)
			: Promise.resolve(sourceCandidateToDraft(candidate));
	},
	toDisplayFields: (data): SourceDisplayFields => ({
		image: data.image,
		name: data.name,
		name_cn: data.name_cn,
		summary: data.summary,
		tags: data.tags ?? [],
		developer: data.developer,
		score: data.score,
		average_hours: data.average_hours,
		all_titles: data.all_titles ?? [],
		aliases: data.aliases ?? [],
		nsfw: data.nsfw,
		date: data.date,
	}),
};
