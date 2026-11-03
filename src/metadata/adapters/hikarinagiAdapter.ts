import type { HikarinagiData } from "@/types";
import {
	fetchHikarinagiById,
	fetchHikarinagiByName,
	getHikarinagiDataDisplayFields,
	HIKARINAGI_ASSOCIATED_SOURCE_KEYS,
	mergeHikarinagiSearchCandidate,
} from "../api/hikarinagi";
import {
	DEFAULT_METADATA_SEARCH_LIMIT,
	type MetadataSourceAdapter,
} from "../sourceAdapter";
import type { SourceCandidate } from "../sourceCandidate";

export const hikarinagiAdapter: MetadataSourceAdapter<HikarinagiData> = {
	key: "hikarinagi",
	label: "Hikarinagi",
	iconUrl: "https://www.hikarinagi.org/brand/hikarinagi-icon.webp",
	associatedSourceKeys: HIKARINAGI_ASSOCIATED_SOURCE_KEYS,
	validateId: (id) => /^\d+$/.test(id),
	getExternalUrl: (id) => `https://www.hikarinagi.org/galgames/${id}`,
	async fetchById(id, ctx) {
		return fetchHikarinagiById(id, ctx.hikarinagiToken, ctx);
	},
	async searchByName(name, ctx) {
		return fetchHikarinagiByName(
			name,
			ctx.hikarinagiToken,
			ctx.limit ?? DEFAULT_METADATA_SEARCH_LIMIT,
			ctx,
		);
	},
	async enrichOnSelect(candidate: SourceCandidate<HikarinagiData>, ctx) {
		const details = await fetchHikarinagiById(
			candidate.externalId ?? "",
			ctx.hikarinagiToken,
			ctx,
		);
		return mergeHikarinagiSearchCandidate(candidate, details);
	},
	toDisplayFields: getHikarinagiDataDisplayFields,
};
