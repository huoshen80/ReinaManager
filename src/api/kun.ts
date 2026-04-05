/**
 * @file Kungal 游戏信息 API 封装
 * @description 提供与 Kungal API 交互的函数，包括搜索游戏和获取详细信息。
 * @module src/api/kun
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

import i18next from "i18next";
import { useStore } from "@/store/appStore";
import type { FullGameData, KunData } from "@/types";
import { AppError } from "@/utils/errors";
import http, { USER_AGENT } from "./http";

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
	id: number;
	name: string;
	category: string;
	galgameCount: number;
	spoilerLevel: number;
}

export interface GalgameOfficialItem {
	id: number;
	name: string;
	link: string;
	category: string;
	lang: string;
	alias: string[];
	galgameCount: number;
}

export interface GalgameDetailResponse {
	id: number;
	code: number;
	vndbId?: string;
	name: Partial<KunLanguage>;
	banner?: string;
	introduction?: Partial<KunLanguage>;
	contentLimit?: "sfw" | "nsfw";
	markdown?: Partial<KunLanguage>;
	ageLimit?: "all" | "r18";
	alias?: string[];
	official?: GalgameOfficialItem[];
	tag?: GalgameDetailTag[];
}

export interface SearchResultGalgame {
	id: number;
	name: KunLanguage;
	banner: string;
}

type KunLocaleKey = keyof KunLanguage;

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
			return value.trim();
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
		.slice()
		.sort((a, b) => (b.galgameCount || 0) - (a.galgameCount || 0))
		.filter((tag) => (tag.spoilerLevel ?? 0) <= filterLevel)
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
	const contentLimitNsfw = payload.contentLimit === "nsfw";
	return contentLimitNsfw || payload.ageLimit === "r18";
}

function buildKunAuthHeaders() {
	return {
		headers: {
			...KUN_JSON_HEADERS,
			"Content-Type": "application/json",
		},
	};
}

/**
 * 将 Kungal API 返回的对象转换为 FullGameData 结构
 * @param kunData Kungal 原始数据
 * @returns 转换后的 FullGameData
 */
const transformKunData = (kunData: GalgameDetailResponse): FullGameData => {
	const tags = extractKunTags(kunData.tag);
	const summary = pickLocalizedText(kunData.markdown);

	const kun_data: KunData = {
		image: kunData.banner,
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
		tags,
		developer: extractDeveloper(kunData.official),
		nsfw: computeNsfw(kunData),
	};

	const result: FullGameData = {
		kun_id: String(kunData.id),
		vndb_id: kunData.vndbId,
		id_type: "kungal",
		kun_data,
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
export async function fetchGalgameById(id: string): Promise<FullGameData> {
	const url = `${KUN_API_BASE}/galgame/${id}`;

	const resp = await http.get<GalgameDetailResponse>(url, {
		params: {
			galgameId: Number(id),
		},
		...buildKunAuthHeaders(),
	});

	if (!resp.data || resp.data.code === 233) {
		throw new AppError({
			code: "metadata_not_found",
			message: `Kungal game not found: ${id}`,
		});
	}

	return transformKunData(resp.data);
}

/**
 * 搜索 Kungal 游戏
 * @param keywords 关键词
 * @param page 页码
 * @param limit 每页数量
 */
export async function searchGalgame(
	keywords: string,
	page = 1,
	limit = 12,
): Promise<FullGameData[]> {
	const resp = await http.get<SearchResultGalgame[]>(`${KUN_API_BASE}/search`, {
		params: {
			keywords,
			type: "galgame",
			page,
			limit,
		},
		...buildKunAuthHeaders(),
	});

	if (!Array.isArray(resp.data)) {
		throw new AppError({
			code: "metadata_not_found",
			message: `Kungal search failed for: ${keywords}`,
		});
	}

	return resp.data.map((item) => ({
		kun_id: String(item.id),
		id_type: "kungal",
		kun_data: {
			name: pickLocalizedText(item.name),
			image: item.banner,
		},
	}));
}
