/**
 * @file Kungal 游戏信息 API 封装
 * @description 提供与 Kungal API 交互的函数，包括搜索游戏和获取详细信息。
 * @module src/api/kun
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

import type { KunData, FullGameData } from "@/types";
import { AppError } from "@/utils/errors";
import http, { USER_AGENT } from "./http";

const KUN_API_BASE = "https://www.kungal.com/api";

const KUN_JSON_HEADERS = {
	Accept: "application/json",
	"User-Agent": USER_AGENT,
} as const;

function buildKunAuthHeaders(token?: string) {
	return {
		headers: {
			...KUN_JSON_HEADERS,
			"Content-Type": "application/json",
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
	};
}

/**
 * 将 Kungal API 返回的对象转换为 FullGameData 结构
 * @param kunData Kungal 原始数据
 * @returns 转换后的 FullGameData
 */
const transformKunData = (kunData: any): FullGameData => {
	// 提取简介 (Summary): 遍历 markdown 对象的所有键（多语言支持），直到找到非空内容
	let summaryRaw = "";
	if (kunData.markdown) {
		const langKeys = ["zh-cn", "en-us", "ja-jp", "zh-tw"];
		for (const key of langKeys) {
			if (kunData.markdown[key]) {
				summaryRaw = kunData.markdown[key];
				break;
			}
		}
		// 如果指定键没找到，取第一个可用的
		if (!summaryRaw) {
			const firstAvailableKey = Object.keys(kunData.markdown)[0];
			if (firstAvailableKey) summaryRaw = kunData.markdown[firstAvailableKey];
		}
	}

	// 如果没有 markdown，回退到 introduction
	if (!summaryRaw && kunData.introduction) {
		const langKeys = ["zh-cn", "en-us", "ja-jp", "zh-tw"];
		for (const key of langKeys) {
			if (kunData.introduction[key]) {
				summaryRaw = kunData.introduction[key];
				break;
			}
		}
	}

	const kun_data: KunData = {
		id: kunData.id,
		name: kunData.name || {},
		banner: kunData.banner,
		summary: summaryRaw
			.replace(/<p>/g, "")
			.replace(/<\/p>/g, "\n")
			.replace(/<br\s*\/?>/g, "\n")
			.replace(/<\/?[^>]+(>|$)/g, "")
			.trim(),
		tags: (kunData.tag || []).map((t: any) => t.name),
		developer: (kunData.official || [])
			.filter((o: any) => ["developer", "maker", "company", "circle"].includes(o.category))
			.map((o: any) => o.name)
			.join("/"),
		score: kunData.ratings?.[0]?.rate,
		nsfw: kunData.contentLimit === "nsfw" || kunData.ageLimit === "r-18" || kunData.ageLimit === "r18",
		date: kunData.resourceUpdateTime || kunData.updated || kunData.created,
		alias: kunData.alias || [],
		platform: kunData.platform || [],
		language: kunData.language || [],
		ageLimit: kunData.ageLimit,
		originalLanguage: kunData.originalLanguage,
	};

	const result = {
		kun_id: String(kun_data.id),
		bgm_id: kunData.bgmId ? String(kunData.bgmId) : undefined,
		vndb_id: kunData.vndbId ? (String(kunData.vndbId).startsWith("v") ? String(kunData.vndbId) : `v${kunData.vndbId}`) : undefined,
		id_type: "kungal",
		date: kun_data.date,
		kun_data,
	} as FullGameData;

	if (import.meta.env.DEV) {
		console.log("[Kungal API] Transformed Data:", result);
	}

	return result;
};

/**
 * 根据 ID 获取 Kungal 游戏详情
 * @param id Kungal 游戏 ID
 * @param token 认证令牌
 */
export async function fetchGalgameById(id: string, token?: string): Promise<FullGameData> {
	const url = `${KUN_API_BASE}/galgame/${id}`;
	if (import.meta.env.DEV) {
		console.log(`[Kungal API] Fetching details: GET ${url}?galgameId=${id}`, { hasToken: !!token });
	}

	const resp = await http.get<any>(
		url,
		{
			params: {
				galgameId: Number(id),
			},
			...buildKunAuthHeaders(token),
		}
	);

	if (!resp.data || resp.data === "banned") {
		throw new AppError({
			code: "metadata_not_found",
			message: `Kungal game not found or banned: ${id}`,
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
	token?: string,
): Promise<{ galgames: FullGameData[]; total: number }> {
	const resp = await http.get<any>(
		`${KUN_API_BASE}/search`,
		{
			params: {
				keywords,
				type: "galgame",
				page,
				limit,
			},
			...buildKunAuthHeaders(token),
		}
	);

	const rawData = Array.isArray(resp.data) ? resp.data : (resp.data?.galgame || []);
	const total = resp.data?.totalCount || (Array.isArray(resp.data) ? resp.data.length : 0);

	return {
		galgames: rawData.map((item: any) => transformKunData(item)),
		total,
	};
}

/**
 * 获取当前用户状态
 * @param token 认证令牌
 */
export async function fetchCurrentUserProfile(token: string) {
	if (!token) return null;
	try {
		const resp = await http.get<any>(
			`${KUN_API_BASE}/user/status`,
			buildKunAuthHeaders(token)
		);
		console.log(resp.data);
		return resp.data;
	} catch {
		return null;
	}
}

/**
 * 登录 Kungal 并从 Headers 中解析 Token
 * @param name 用户名或邮箱
 * @param password 密码
 */
export async function login(name: string, password: string) {
	const resp = await http.post<any>(
		`${KUN_API_BASE}/user/login`,
		{ name, password },
		buildKunAuthHeaders()
	);

	const setCookies = resp.headers.filter(h => h[0].toLowerCase() === "set-cookie");
	let token: string | undefined;

	for (const [_, value] of setCookies) {
		const match = value.match(/kungalgame-moemoe-refresh-token=([^;]+)/);
		if (match?.[1]) {
			token = match[1];
			break;
		}
	}

	return {
		...resp.data,
		token: token || resp.data?.token
	};
}

/**
 * 更新点赞状态
 */
export async function toggleLike(id: number, token: string) {
	return http.patch(`${KUN_API_BASE}/galgame/${id}/like`, {}, buildKunAuthHeaders(token));
}

/**
 * 更新收藏状态
 */
export async function toggleFavorite(id: number, token: string) {
	return http.patch(`${KUN_API_BASE}/galgame/${id}/favorite`, {}, buildKunAuthHeaders(token));
}
