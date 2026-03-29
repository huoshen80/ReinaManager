/**
 * @file Bangumi 游戏信息 API 封装
 * @description 提供与 Bangumi API 交互的函数，包括通过名称或 ID 获取游戏条目，并对标签进行敏感词过滤。
 * @module src/api/bgm
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - fetchBgmById：根据 Bangumi ID 获取游戏详细信息
 * - fetchBgmByName：根据游戏名称搜索获取游戏详细信息
 *
 * 依赖：
 * - http: 封装的 HTTP 请求工具
 */

import type { BgmData, FullGameData } from "@/types";
import { AppError } from "@/utils/errors";
import http, { USER_AGENT } from "./http";

const BGM_JSON_HEADERS = {
	Accept: "application/json",
	"User-Agent": USER_AGENT,
} as const;

interface BgmSubjectResponse {
	id?: number;
	date?: string;
}

interface BgmSearchResponse {
	data?: unknown[];
}

function buildBgmAuthHeaders(token?: string) {
	return {
		headers: {
			...BGM_JSON_HEADERS,
			...(token ? { Authorization: `Bearer ${token}` } : {}),
		},
	};
}

/**
 * 过滤掉包含敏感关键词的标签。
 *
 * @param tags 标签字符串数组。
 * @returns 过滤后的标签字符串数组，不包含敏感词。
 */
function filterSensitiveTags(tags: string[]): string[] {
	const sensitiveKeywords = ["台独", "港独", "藏独", "分裂", "反华", "辱华"];
	return tags.filter((tag) => {
		return !sensitiveKeywords.some((keyword) => tag.includes(keyword));
	});
}

// 新增：将 BGM API 返回对象转换为统一的结构
// biome-ignore lint/suspicious/noExplicitAny: external API has dynamic shape
const transformBgmData = (BGMdata: any): FullGameData => {
	const baseData = {
		bgm_id: String(BGMdata.id),
		id_type: "bgm",
		date: BGMdata.date,
	};

	// 处理 aliases 字段：可能是数组或字符串
	const aliasesRaw = BGMdata.infobox?.find(
		(k: { key: string }) => k.key === "别名",
	)?.value;

	let aliasesArray: string[] = [];
	if (Array.isArray(aliasesRaw)) {
		// 如果是数组，提取每个对象的 v 字段
		aliasesArray = aliasesRaw.map((k: { v: string } | string) =>
			typeof k === "string" ? k : k.v,
		);
	} else if (typeof aliasesRaw === "string") {
		// 如果是字符串，直接包装成数组
		aliasesArray = [aliasesRaw];
	}

	const bgm_data: BgmData = {
		date: BGMdata.date,
		image: BGMdata.images?.large,
		summary: BGMdata.summary,
		name: BGMdata.name,
		name_cn: BGMdata.name_cn,
		aliases: aliasesArray,
		tags: filterSensitiveTags(
			(BGMdata.tags || []).map((tag: { name: string }) => tag.name),
		),
		rank: BGMdata.rating?.rank,
		score: BGMdata.rating?.score,
		developer: (() => {
			const developers =
				BGMdata.infobox?.flatMap(
					(item: { key: string; value: string | unknown }) => {
						if (["开发", "游戏开发商", "开发商"].includes(item.key)) {
							if (typeof item.value !== "string") return [];
							return item.value
								.split(/、|×/g)
								.map((name: string) => name.trim())
								.filter((name: string) => name.length > 0);
						}
						return [];
					},
				) ?? [];
			const uniqueDevelopers = [...new Set(developers)];
			return uniqueDevelopers.length > 0
				? uniqueDevelopers.join("/")
				: undefined;
		})(),
		nsfw: BGMdata.nsfw,
	};

	return { ...baseData, bgm_data };
};

/**
 * 根据 Bangumi ID 获取游戏详细信息
 *
 * @param id Bangumi 条目 ID
 * @param BGM_TOKEN Bangumi API 访问令牌
 * @returns 返回游戏详细信息对象
 */
export async function fetchBgmById(
	id: string,
	BGM_TOKEN?: string,
): Promise<FullGameData> {
	const BGMdata = (
		await http.get<BgmSubjectResponse>(
			`https://api.bgm.tv/v0/subjects/${id}`,
			buildBgmAuthHeaders(BGM_TOKEN),
		)
	).data;

	if (!BGMdata?.id) {
		throw new AppError({
			code: "metadata_not_found",
			message: `Bangumi subject not found: ${id}`,
		});
	}

	return transformBgmData(BGMdata);
}

/**
 * 根据游戏名称搜索获取游戏详细信息（返回全部结果）
 *
 * @param name 游戏名称
 * @param BGM_TOKEN Bangumi API 访问令牌
 * @param limit 最多返回结果数量，默认 25
 * @returns 返回游戏详细信息数组
 */
export async function fetchBgmByName(
	name: string,
	BGM_TOKEN?: string,
	limit = 25,
): Promise<FullGameData[]> {
	const keyword = name.trim();
	const resp = (
		await http.post<BgmSearchResponse>(
			"https://api.bgm.tv/v0/search/subjects",
			{
				keyword: keyword,
				filter: {
					type: [4], // 4 = 游戏类型
				},
				limit: limit,
			},
			buildBgmAuthHeaders(BGM_TOKEN),
		)
	).data;

	const rawResults = Array.isArray(resp.data) ? resp.data : [];

	// biome-ignore lint/suspicious/noExplicitAny: external API has dynamic shape
	return rawResults.map((item: any) => transformBgmData(item));
}

/**
 * 批量获取 BGM 游戏信息（支持任意数量 ID）
 *
 * 通过多次 API 调用获取多个游戏的信息，自动分批处理以避免频繁请求。
 * 为了避免触发 Bangumi API 频率限制，使用延迟处理。
 *
 * @param ids BGM 游戏 ID 数组（如 ["123", "456", "789", ...]，支持任意数量）
 * @param BGM_TOKEN Bangumi API 访问令牌
 * @returns 包含游戏详细信息的对象数组
 *
 * @example
 * // 获取 50 个游戏（自动控制请求频率）
 * const results = await fetchBgmByIds(idArray, token);
 * // 返回: [{ game, bgm_data, ... }, { game, bgm_data, ... }, ...]
 */
export async function fetchBgmByIds(
	ids: string[],
	BGM_TOKEN?: string,
): Promise<FullGameData[]> {
	if (ids.length === 0) {
		return [];
	}
	if (!BGM_TOKEN) {
		throw new AppError({
			code: "bgm_token_required",
			message: "Bangumi token is required for batch fetch",
		});
	}

	const allResults: FullGameData[] = [];
	let hasRequestFailure = false;

	// 逐个请求，避免频繁调用 API
	// BGM API 对频率有限制，建议间隔 1 秒
	for (let i = 0; i < ids.length; i++) {
		const id = ids[i];

		try {
			// 每 10 个请求后延迟 2 秒，避免触发频率限制
			if (i > 0 && i % 10 === 0) {
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}

			const BGMdata = (
				await http.get<BgmSubjectResponse>(
					`https://api.bgm.tv/v0/subjects/${id}`,
					buildBgmAuthHeaders(BGM_TOKEN),
				)
			).data;

			if (BGMdata?.id) {
				allResults.push(transformBgmData(BGMdata));
			}

			// 每个请求之间延迟 200ms
			await new Promise((resolve) => setTimeout(resolve, 200));
		} catch {
			hasRequestFailure = true;
		}
	}

	if (allResults.length === 0 && hasRequestFailure) {
		throw new AppError({
			code: "metadata_request_failed",
			message: `Bangumi batch fetch failed for ${ids.length} ids`,
		});
	}

	return allResults;
}

/**
 * 获取当前用户的 Profile 信息
 * @param token Bangumi API 访问令牌
 * @returns { username: string, avatar: string, nickname: string } 或 null
 */
export async function fetchCurrentUserProfile(token: string) {
	if (!token) return null;
	try {
		const res = await http.get<{
			username: string;
			nickname: string;
			avatar: { large: string; medium: string; small: string };
		}>("https://api.bgm.tv/v0/me", buildBgmAuthHeaders(token));
		return res.data;
	} catch {
		return null;
	}
}

/**
 * 获取当前用户的条目收藏状态
 * @param username 用户名
 * @param subjectId Bangumi 条目 ID
 * @param token Bangumi API 访问令牌
 * @returns 收藏数据对象或 null
 */
export async function fetchUserCollection(
	username: string,
	subjectId: string,
	token: string,
) {
	try {
		const res = await http.get<{
			type: number;
			rate?: number;
			comment?: string;
		}>(
			`https://api.bgm.tv/v0/users/${username}/collections/${subjectId}`,
			buildBgmAuthHeaders(token),
		);
		return res.data;
	} catch {
		return null;
	}
}

/**
 * 更新当前用户的条目收藏状态
 * @param username 用户名
 * @param subjectId Bangumi 条目 ID
 * @param type 收藏状态 (1=wish, 2=collect, 3=do, 4=on_hold, 5=dropped)
 * @param token Bangumi API 访问令牌
 */
export async function updateUserCollection(
	username: string,
	subjectId: string,
	type: number,
	token: string,
): Promise<boolean> {
	if (!token || !username) return false;
	try {
		await http.post(
			`https://api.bgm.tv/v0/users/-/collections/${subjectId}`,
			{ type },
			buildBgmAuthHeaders(token),
		);
		// HTTP 204 does not return response body (但是官方api调试文档返回的是202(?))
		return true;
	} catch {
		return false;
	}
}
