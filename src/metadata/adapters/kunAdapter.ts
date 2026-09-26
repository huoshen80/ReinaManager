import type { KunData } from "@/types";
import {
	createDeprecatedSourceError,
	type MetadataSourceAdapter,
} from "../sourceAdapter";
import type { SourceDisplayFields } from "../sourceCandidate";

// Kungal v1 只保留历史数据读取；新版本使用独立的源键和获取链路。
const rejectLegacyRequest = async (): Promise<never> => {
	throw createDeprecatedSourceError("kun");
};

export const kunAdapter: MetadataSourceAdapter<KunData> = {
	key: "kun",
	label: "Kungal v1",
	iconUrl: "https://www.kungal.com/favicon.ico",
	validateId: (id) => /^\d+$/.test(id),
	getExternalUrl: (id) => `https://www.kungal.com/galgame/${id}`,
	fetchById: rejectLegacyRequest,
	searchByName: rejectLegacyRequest,
	enrichOnSelect: rejectLegacyRequest,
	toDisplayFields: (data): SourceDisplayFields => ({
		image: data.image,
		name: data.name,
		name_cn: data.name_cn,
		summary: data.summary,
		tags: data.tags ?? [],
		developer: data.developer,
		all_titles: data.all_titles ?? [],
		aliases: data.aliases ?? [],
		nsfw: data.nsfw,
		date: data.date,
	}),
};
