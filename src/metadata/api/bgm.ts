/**
 * @file Bangumi 游戏信息 API 封装
 * @description 提供与 Bangumi API 交互的函数，包括通过名称或 ID 获取游戏条目，并对标签进行敏感词过滤。
 * @module src/metadata/api/bgm
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

import type { BgmAuth, BgmData, GameMetadataDraft } from "@/types";
import { AppError, isApiRateLimitError, isHttpStatus } from "@/utils/errors";
import {
	createGameCandidate,
	createSourceCandidateRecord,
} from "../sourceCandidate";
import http, { type TauriHttpOptions, USER_AGENT } from "./http";

const BGM_API_BASE_URL = "https://api.bgm.tv/v0";
const BGM_OAUTH_BASE_URL = "https://bgm.tv/oauth";

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

export interface BgmUserCollection {
	subject_id: number;
	type: number;
}

export interface BgmUserCollectionModifyPayload {
	type?: number;
	rate?: number;
	comment?: string;
	private?: boolean;
	tags?: string[];
}

interface BgmUserCollectionsResponse {
	total?: number;
	limit?: number;
	offset?: number;
	data?: BgmUserCollection[];
}

export interface BgmUserCollectionsPage {
	total: number;
	limit: number;
	offset: number;
	data: BgmUserCollection[];
}

export interface BgmUserProfile {
	id: number;
	username: string;
	nickname: string;
	sign?: string;
	avatar: { large: string; medium: string; small: string };
}

export interface BgmTokenStatus {
	access_token: string;
	client_id: string;
	expires: number | null;
	scope: string | null;
}

function buildBgmAuthHeaders(token?: string) {
	const headers: Record<string, string> = { ...BGM_JSON_HEADERS };
	if (token) {
		headers.Authorization = `Bearer ${token}`;
	}
	return { headers };
}

function buildBgmRateLimitedOptions(
	token?: string,
	signal?: AbortSignal,
): TauriHttpOptions {
	return {
		...buildBgmAuthHeaders(token),
		rateLimit: { source: "bgm" as const },
		signal,
	};
}

const SENSITIVE_KEYWORDS = ["台独", "港独", "藏独", "分裂", "反华", "辱华"];
const DEVELOPER_KEYWORDS = ["开发", "游戏开发商", "开发商"];

/**
 * 过滤掉包含敏感关键词的标签。
 *
 * @param tags 标签字符串数组。
 * @returns 过滤后的标签字符串数组，不包含敏感词。
 */
function filterSensitiveTags(tags: string[]): string[] {
	return tags.filter(
		(tag) => !SENSITIVE_KEYWORDS.some((kw) => tag.includes(kw)),
	);
}

// 新增：将 BGM API 返回对象转换为统一的结构
// biome-ignore lint/suspicious/noExplicitAny: external API has dynamic shape
const transformBgmData = (BGMdata: any): GameMetadataDraft => {
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

	const bgmData: BgmData = {
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
						if (DEVELOPER_KEYWORDS.includes(item.key)) {
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

	return createGameCandidate({
		idType: "bgm",
		source: createSourceCandidateRecord("bgm", String(BGMdata.id), bgmData),
	});
};

/**
 * 根据 Bangumi ID 获取游戏详细信息
 *
 * @param id Bangumi 条目 ID
 * @param token Bangumi API 访问令牌
 * @returns 返回游戏详细信息对象
 */
export async function fetchBgmById(
	id: string,
	token?: string,
	signal?: AbortSignal,
): Promise<GameMetadataDraft> {
	const BGMdata = (
		await http.get<BgmSubjectResponse>(
			`${BGM_API_BASE_URL}/subjects/${id}`,
			buildBgmRateLimitedOptions(token, signal),
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
 * @param token Bangumi API 访问令牌
 * @param limit 最多返回结果数量，默认 25
 * @returns 返回游戏详细信息数组
 */
export async function fetchBgmByName(
	name: string,
	token?: string,
	limit = 25,
	signal?: AbortSignal,
): Promise<GameMetadataDraft[]> {
	const keyword = name.trim();
	const resp = (
		await http.post<BgmSearchResponse>(
			`${BGM_API_BASE_URL}/search/subjects`,
			{
				keyword: keyword,
				filter: {
					type: [4], // 4 = 游戏类型
				},
			},
			{
				...buildBgmRateLimitedOptions(token, signal),
				params: { limit },
			},
		)
	).data;

	const rawResults = Array.isArray(resp.data) ? resp.data : [];

	// biome-ignore lint/suspicious/noExplicitAny: external API has dynamic shape
	return rawResults.map((item: any) => transformBgmData(item));
}

/**
 * 批量获取 BGM 游戏信息（支持任意数量 ID）
 *
 * 通过多次 API 调用获取多个游戏的信息，请求节奏由统一限速队列控制。
 *
 * @param ids BGM 游戏 ID 数组（如 ["123", "456", "789", ...]，支持任意数量）
 * @param token Bangumi API 访问令牌
 * @returns 包含游戏详细信息的对象数组
 *
 * @example
 * // 获取 50 个游戏（自动控制请求频率）
 * const results = await fetchBgmByIds(idArray, token);
 * // 返回: [{ id_type, sources }, ...]
 */
export async function fetchBgmByIds(
	ids: string[],
	token?: string,
	signal?: AbortSignal,
): Promise<GameMetadataDraft[]> {
	if (ids.length === 0) {
		return [];
	}

	const allResults: GameMetadataDraft[] = [];
	let hasRequestFailure = false;

	for (const id of ids) {
		try {
			const BGMdata = (
				await http.get<BgmSubjectResponse>(
					`${BGM_API_BASE_URL}/subjects/${id}`,
					buildBgmRateLimitedOptions(token, signal),
				)
			).data;

			if (BGMdata?.id) {
				allResults.push(transformBgmData(BGMdata));
			}
		} catch (error) {
			if (isApiRateLimitError(error)) throw error;
			if (isHttpStatus(error, 401)) throw error;
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
 * @returns 当前用户资料。
 */
export async function fetchCurrentUserProfile(
	token: string,
	signal?: AbortSignal,
) {
	const res = await http.get<BgmUserProfile>(
		`${BGM_API_BASE_URL}/me`,
		buildBgmRateLimitedOptions(token, signal),
	);
	return res.data;
}

export async function fetchBgmTokenStatus(
	token: string,
): Promise<BgmTokenStatus> {
	const res = await http.post<BgmTokenStatus>(
		`${BGM_OAUTH_BASE_URL}/token_status`,
		null,
		buildBgmAuthHeaders(token),
	);
	return res.data;
}

export function getBgmAvatarUrl(username?: string | null) {
	return username
		? `${BGM_API_BASE_URL}/users/${encodeURIComponent(username)}/avatar?type=large`
		: undefined;
}

export async function buildManualBgmAuth(
	accessToken: string,
): Promise<BgmAuth | null> {
	if (!accessToken) return null;

	const [tokenStatus, profile] = await Promise.all([
		fetchBgmTokenStatus(accessToken),
		fetchCurrentUserProfile(accessToken),
	]);

	return {
		access_token: accessToken,
		refresh_token: null,
		expires_at: tokenStatus?.expires ?? null,
		username: profile.username,
		nickname: profile.nickname,
	};
}

export async function completeBgmAuth(auth: BgmAuth): Promise<BgmAuth> {
	const [tokenStatus, profile] = await Promise.all([
		auth.expires_at == null
			? fetchBgmTokenStatus(auth.access_token)
			: Promise.resolve(null),
		auth.username && auth.nickname
			? Promise.resolve(null)
			: fetchCurrentUserProfile(auth.access_token),
	]);

	return {
		...auth,
		expires_at: auth.expires_at ?? tokenStatus?.expires ?? null,
		username: auth.username ?? profile?.username ?? null,
		nickname: auth.nickname ?? profile?.nickname ?? null,
	};
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
	signal?: AbortSignal,
) {
	try {
		const res = await http.get<{
			type: number;
			rate?: number;
			comment?: string;
		}>(
			`${BGM_API_BASE_URL}/users/${username}/collections/${subjectId}`,
			buildBgmRateLimitedOptions(token, signal),
		);
		return res.data;
	} catch (error) {
		if (isHttpStatus(error, 404)) return null;
		throw error;
	}
}

export async function fetchUserGameCollections(
	username: string,
	token: string,
): Promise<BgmUserCollection[]> {
	const collections: BgmUserCollection[] = [];
	const limit = 50;
	let page = await fetchUserGameCollectionsPage(username, token, {
		limit,
		offset: 0,
	});
	collections.push(...page.data);

	while (true) {
		const nextOffset = page.offset + page.limit;
		if (page.data.length === 0 || nextOffset >= page.total) {
			break;
		}
		page = await fetchUserGameCollectionsPage(username, token, {
			limit,
			offset: nextOffset,
		});
		collections.push(...page.data);
	}

	return collections;
}

export async function fetchUserGameCollectionsPage(
	username: string,
	token: string,
	params: { limit: number; offset: number },
	signal?: AbortSignal,
): Promise<BgmUserCollectionsPage> {
	const res = await http.get<BgmUserCollectionsResponse>(
		`${BGM_API_BASE_URL}/users/${username}/collections`,
		{
			...buildBgmRateLimitedOptions(token, signal),
			params: {
				subject_type: 4,
				limit: params.limit,
				offset: params.offset,
			},
		},
	);

	return {
		total: res.data?.total ?? 0,
		limit: res.data?.limit ?? params.limit,
		offset: res.data?.offset ?? params.offset,
		data: Array.isArray(res.data?.data) ? res.data.data : [],
	};
}
/**
 * 更新当前用户的条目收藏状态
 * @param subjectId Bangumi 条目 ID
 * @param payload 收藏状态、评分、评价等更新字段
 * @param token Bangumi API 访问令牌
 */
export async function updateUserCollection(
	subjectId: string,
	payload: BgmUserCollectionModifyPayload,
	token: string,
	signal?: AbortSignal,
): Promise<boolean> {
	await http.post(
		`${BGM_API_BASE_URL}/users/-/collections/${subjectId}`,
		payload,
		buildBgmRateLimitedOptions(token, signal),
	);
	// HTTP 204 does not return response body
	return true;
}
