/**
 * @file Kungal 游戏信息 API 封装
 * @description 提供与 Kungal API 交互的函数，包括搜索游戏和获取详细信息。
 * @module src/metadata/api/kun
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

import i18next from "i18next";
import { useStore } from "@/store/appStore";
import type { GameMetadataDraft, KunData } from "@/types";
import { AppError } from "@/utils/errors";
import {
	createGameCandidate,
	createSourceCandidateRecord,
	getCandidateSourceData,
	getCandidateSourceId,
	mergeCandidateSources,
} from "../sourceCandidate";
import http, { type TauriHttpOptions, USER_AGENT } from "./http";
import { fetchVndbById } from "./vndb";

const KUN_API_BASE = "https://www.kungal.com/api";

const KUN_JSON_HEADERS = {
	Accept: "application/json",
	"User-Agent": USER_AGENT,
} as const;

export interface KunLanguage {
	"en-us": string;
	"ja-jp": string;
	"zh-cn": string;
	"zh-tw": string;
}

export interface GalgameDetailTag {
	name: string;
	galgame_count: number;
	spoiler_level: number;
}

export interface GalgameOfficialItem {
	name: string;
}

export interface GalgameDetailResponse {
	id: number;
	vndb_id: string;
	name: KunLanguage;
	effective_banner_url?: string;
	content_limit: "sfw" | "nsfw";
	markdown: KunLanguage;
	age_limit: "all" | "r18";
	alias: string[];
	official: GalgameOfficialItem[];
	tag: GalgameDetailTag[];
	release_date: string | null;
}

export interface SearchResultGalgame {
	id: number;
	name: KunLanguage;
	effective_banner_url?: string;
	release_date?: string | null;
}

export interface KunApiResponse<T> {
	code: number;
	message: string;
	data?: T;
}

export interface KunPaginatedData<T> {
	items: T[];
	total: number;
}

type KunLocaleKey = keyof KunLanguage;

interface KunFetchOptions {
	enrichVndb?: boolean;
	signal?: AbortSignal;
}

const KUN_LOCALE_ORDER: KunLocaleKey[] = ["zh-cn", "ja-jp", "en-us", "zh-tw"];

function toKunLocale(language: string): KunLocaleKey {
	if (language === "zh-CN") {
		return "zh-cn";
	}
	if (language === "zh-TW") {
		return "zh-tw";
	}
	if (language === "ja-JP") {
		return "ja-jp";
	}
	if (language === "en-US") {
		return "en-us";
	}

	return "zh-cn";
}

function pickLocalizedText(
	localized?: Partial<KunLanguage>,
): string | undefined {
	if (!localized) {
		return undefined;
	}

	const preferred = toKunLocale(i18next.language);
	const order: KunLocaleKey[] = [
		preferred,
		...KUN_LOCALE_ORDER.filter((k) => k !== preferred),
	];

	for (const key of order) {
		const value = localized[key];
		if (typeof value === "string" && value.trim()) {
			return value.replace(/\\\r?\n/g, "\n").trim();
		}
	}

	return undefined;
}

function extractAllTitles(localized?: Partial<KunLanguage>): string[] {
	if (!localized) {
		return [];
	}

	return Array.from(
		new Set(
			Object.values(localized)
				.filter((value): value is string => typeof value === "string")
				.map((value) => value.trim())
				.filter(Boolean),
		),
	);
}

function extractKunTags(tags?: GalgameDetailTag[]): string[] {
	if (!Array.isArray(tags) || tags.length === 0) {
		return [];
	}

	const filterLevel = useStore.getState().spoilerLevel;

	return tags
		.toSorted((a, b) => (b.galgame_count || 0) - (a.galgame_count || 0))
		.filter((tag) => (tag.spoiler_level ?? 0) <= filterLevel)
		.map((tag) => tag.name?.trim())
		.filter((name): name is string => Boolean(name));
}

function extractDeveloper(
	official?: GalgameOfficialItem[],
): string | undefined {
	if (!Array.isArray(official) || official.length === 0) {
		return undefined;
	}

	const names = Array.from(
		new Set(
			official
				.map((item) => item.name?.trim())
				.filter((name): name is string => Boolean(name)),
		),
	);

	if (names.length === 0) {
		return undefined;
	}

	return names.join("/");
}

function computeNsfw(payload: GalgameDetailResponse): boolean {
	const contentLimitNsfw = payload.content_limit === "nsfw";
	return contentLimitNsfw || payload.age_limit === "r18";
}

function buildKunRateLimitedOptions(
	options: TauriHttpOptions = {},
): TauriHttpOptions {
	return {
		...options,
		headers: {
			...KUN_JSON_HEADERS,
			"Content-Type": "application/json",
			...options.headers,
		},
		rateLimit: { source: "kun" },
	};
}

/**
 * 将 Kungal API 返回的对象转换为 GameMetadataDraft 结构
 * @param kunData Kungal 原始数据
 * @returns 转换后的 GameMetadataDraft
 */
const transformKunData = (
	kunData: GalgameDetailResponse,
): GameMetadataDraft => {
	const summary = pickLocalizedText(kunData.markdown);

	const sourceData: KunData = {
		image: kunData.effective_banner_url,
		name: pickLocalizedText(kunData.name),
		name_cn:
			typeof kunData.name?.["zh-cn"] === "string"
				? kunData.name["zh-cn"].trim()
				: undefined,
		all_titles: extractAllTitles(kunData.name),
		aliases: Array.from(
			new Set((kunData.alias || []).map((alias) => alias.trim())),
		),
		summary,
		tags: kunData.vndb_id ? undefined : extractKunTags(kunData.tag),
		developer: extractDeveloper(kunData.official),
		nsfw: computeNsfw(kunData),
		date: kunData.release_date ?? undefined,
	};

	const result: GameMetadataDraft = {
		...createGameCandidate({
			idType: "kun",
			source: createSourceCandidateRecord(
				"kun",
				String(kunData.id),
				sourceData,
			),
		}),
	};

	if (import.meta.env.DEV) {
		console.log("[Kungal API] Transformed Data:", result);
	}

	return result;
};

/**
 * 根据 ID 获取 Kungal 游戏详情
 * @param id Kungal 游戏 ID
 */
export async function fetchGalgameById(
	id: string,
	options: KunFetchOptions = {},
): Promise<GameMetadataDraft> {
	const { enrichVndb = true, signal } = options;
	const url = `${KUN_API_BASE}/galgame/${id}`;

	const resp = await http.get<KunApiResponse<GalgameDetailResponse>>(
		url,
		buildKunRateLimitedOptions({
			params: {
				galgame_id: Number(id),
			},
			signal,
		}),
	);

	const kunData = resp.data?.data;

	if (!kunData) {
		throw new AppError({
			code: "metadata_not_found",
			message: `Kungal game not found: ${id}`,
		});
	}

	const kunResult = transformKunData(kunData);
	const vndbId = kunData.vndb_id;

	if (!enrichVndb || !vndbId) {
		return kunResult;
	}

	try {
		const vndbResult = await fetchVndbById(vndbId, signal);

		return {
			...kunResult,
			id_type: "mixed",
			sources: mergeCandidateSources([kunResult, vndbResult]),
		};
	} catch (error) {
		if (import.meta.env.DEV) {
			console.warn(
				`[Kungal API] VNDB 增强失败，回退到 Kungal 原始数据: ${vndbId}`,
				error,
			);
		}

		const kunSourceData = getCandidateSourceData<KunData>(kunResult, "kun");
		return {
			...kunResult,
			id_type: "kun",
			sources: kunSourceData
				? [
						createSourceCandidateRecord(
							"kun",
							getCandidateSourceId(kunResult, "kun") ?? id,
							{
								...kunSourceData,
								// VNDB 不可用时，保留鲲源自身 tags，避免 kun 源整体失效。
								tags: extractKunTags(kunData.tag),
							},
						),
					]
				: kunResult.sources,
		};
	}
}

/**
 * 搜索 Kungal 游戏
 * @param keywords 关键词
 * @param page 页码
 * @param limit 每页数量
 * @param fetchDetailById 是否仅对第一个结果用 ID 再次请求完整详情（默认 false）
 * 说明：该参数只用于“首条补全”场景，禁止对搜索结果列表逐条补全。
 */
export async function searchGalgame(
	keywords: string,
	page = 1,
	limit = 12,
	fetchDetailById = false,
	options: KunFetchOptions = {},
): Promise<GameMetadataDraft[]> {
	const resp = await http.get<
		KunApiResponse<KunPaginatedData<SearchResultGalgame>>
	>(
		`${KUN_API_BASE}/search`,
		buildKunRateLimitedOptions({
			params: {
				keywords,
				type: "galgame",
				page,
				limit,
			},
			signal: options.signal,
		}),
	);

	const items = resp.data?.data?.items;

	if (!Array.isArray(items)) {
		throw new AppError({
			code: "metadata_not_found",
			message: `Kungal search failed for: ${keywords}`,
		});
	}

	const results = items.map((item) => ({
		...createGameCandidate({
			idType: "kun",
			source: createSourceCandidateRecord("kun", String(item.id), {
				name: pickLocalizedText(item.name),
				image: item.effective_banner_url,
				date: item.release_date ?? undefined,
			}),
		}),
	}));

	// 如果启用二步请求且有结果，用第一个结果的 ID 获取完整详情
	const firstResultId = results[0]
		? getCandidateSourceId(results[0], "kun")
		: undefined;
	if (fetchDetailById && firstResultId) {
		const detailedData = await fetchGalgameById(firstResultId, options);
		return [detailedData];
	}

	return results;
}
