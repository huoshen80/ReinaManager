/**
 * @file VNDB 游戏信息 API 封装
 * @description 提供与 VNDB API 交互的函数和类型定义，用于获取视觉小说信息，返回结构化数据，便于前端统一处理。
 * @module src/metadata/api/vndb
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - fetchVndbByName：根据名称搜索获取游戏详细信息
 * - fetchVndbById：通过单个 VNDB ID 直接获取游戏详细信息
 * - fetchVNDBByIds：批量获取 VNDB 游戏信息（最多 100 个 ID）
 *
 * 依赖：
 * - http: 封装的 HTTP 请求工具
 */

import { useStore } from "@/store/appStore";
import type { GameMetadataDraft, VndbData } from "@/types";
import { AppError, isApiRateLimitError } from "@/utils/errors";
import {
	createGameCandidate,
	createSourceCandidateRecord,
} from "../sourceCandidate";
import http, { type TauriHttpOptions, USER_AGENT } from "./http";

const VNDB_API_BASE = "https://api.vndb.org/kana";
const VNDB_JSON_HEADERS = {
	Accept: "application/json",
	"Content-Type": "application/json",
	"User-Agent": USER_AGENT,
} as const;

const VNDB_FIELDS =
	"id,titles{title,lang,main},aliases,image{url},released,rating,tags{name,rating,spoiler},description,developers{name},length_minutes";
const VNDB_USER_COLLECTION_FIELDS = "id, labels{id, label}";

function buildVndbRateLimitedOptions(signal?: AbortSignal): TauriHttpOptions {
	return {
		headers: {
			...VNDB_JSON_HEADERS,
		},
		rateLimit: { source: "vndb" as const },
		signal,
	};
}

function buildVndbRateLimitedAuthOptions(
	token: string,
	signal?: AbortSignal,
): TauriHttpOptions {
	return {
		headers: {
			...VNDB_JSON_HEADERS,
			Authorization: `Token ${token}`,
		},
		rateLimit: { source: "vndb" as const },
		signal,
	};
}

/**
 * VNDB 标题对象接口。
 */
interface VNDB_title {
	title: string;
	lang: string;
	main: boolean;
}

/**
 * VNDB API 原始数据接口
 */
interface RawVNDBData {
	id: string;
	titles: VNDB_title[];
	aliases: string[];
	image: { url: string } | null;
	released: string | null;
	rating: number | null;
	tags: { name: string; rating: number; spoiler: 0 | 1 | 2 }[];
	description: string | null;
	developers: { name: string }[];
	length_minutes: number | null;
}

export interface VndbAuthInfo {
	id: string;
	username: string;
	permissions: string[];
}

export interface VndbUserLabel {
	id: number;
	label: string;
	private: boolean;
	count?: number;
}

export interface VndbUserCollectionLabel {
	id: number;
	label: string;
}

export interface VndbUserCollectionRelease {
	id: string;
	list_status: number;
}

export interface VndbUserCollectionItem {
	id: string;
	added: number;
	voted: number | null;
	lastmod: number;
	vote: number | null;
	started: string | null;
	finished: string | null;
	notes: string | null;
	labels: VndbUserCollectionLabel[];
	releases?: VndbUserCollectionRelease[];
}

interface VndbUserCollectionsResponse {
	results?: VndbUserCollectionItem[];
	more?: boolean;
	count?: number;
}

export interface VndbUserCollectionsPage {
	results: VndbUserCollectionItem[];
	more: boolean;
	count?: number;
}

export interface UpdateVndbUserCollectionPayload {
	vote?: number | null;
	notes?: string | null;
	started?: string | null;
	finished?: string | null;
	labels?: number[];
	labels_set?: number[];
	labels_unset?: number[];
}

async function resolveVndbUserId(
	token: string,
	userId?: string,
	signal?: AbortSignal,
) {
	if (userId) {
		return userId;
	}

	const authInfo = await fetchVndbCurrentUserProfile(token, signal);
	return authInfo?.id ?? null;
}

/**
 * 将单个 VNDB 数据转换为统一格式
 * @private
 */
function transformVndbData(
	VNDBdata: RawVNDBData,
	update_batch?: boolean,
): GameMetadataDraft {
	// 处理标题信息
	const titles = VNDBdata.titles.map((title: VNDB_title) => ({
		title: title.title,
		lang: title.lang,
		main: title.main,
	}));

	const mainTitle =
		titles.find((title) => title.main)?.title ?? titles[0]?.title ?? "";
	const chineseTitle =
		titles.find(
			(title: VNDB_title) =>
				title.lang === "zh-Hans" ||
				title.lang === "zh-Hant" ||
				title.lang === "zh",
		)?.title || "";

	// 提取所有标题
	const allTitles: string[] = titles.map((title: VNDB_title) => title.title);

	// 根据 spoilerLevel 过滤标签
	const filterLevel = useStore.getState().spoilerLevel;
	const filtered_tags = VNDBdata.tags
		.toSorted((a, b) => b.rating - a.rating)
		.filter(({ spoiler }) => spoiler <= filterLevel)
		.map(({ name }) => name);
	const releasedDate = VNDBdata.released ?? undefined;

	const vndbData: VndbData = {
		date: releasedDate,
		image: VNDBdata.image?.url,
		summary: VNDBdata.description ?? undefined,
		name: mainTitle,
		name_cn: chineseTitle,
		all_titles: allTitles,
		aliases: VNDBdata.aliases || [],
		tags: filtered_tags,
		score:
			VNDBdata.rating == null
				? null
				: Number((VNDBdata.rating / 10).toFixed(2)),
		developer: VNDBdata.developers
			?.map((dev: { name: string }) => dev.name)
			.join("/"),
		average_hours:
			VNDBdata.length_minutes == null
				? null
				: Number((VNDBdata.length_minutes / 60).toFixed(1)),
		nsfw: !filtered_tags.includes("No Sexual Content"),
	};

	return {
		...createGameCandidate({
			idType: update_batch ? undefined : "vndb",
			source: createSourceCandidateRecord("vndb", VNDBdata.id, vndbData),
		}),
	};
}

/**
 * 从 VNDB API 获取游戏信息。
 *
 * 该函数根据游戏名称或 VNDB 游戏 ID，调用 VNDB API 获取游戏详细信息。
 * 若未找到条目，则返回空数组。返回数据结构与 Bangumi 保持一致，便于统一处理。
 *
 * @param {string} name 游戏名称，用于搜索 VNDB 条目。
 * @param {string} [id] 可选，VNDB 游戏 ID，若提供则优先通过 ID 查询。
 * @param {number} [limit=25] 可选，返回的最大结果数量，默认 25。
 * @returns {Promise<GameMetadataDraft[]>} 包含游戏详细信息的数组。
 */
export async function fetchVndbByName(
	name: string,
	id?: string,
	limit = 25,
	signal?: AbortSignal,
): Promise<GameMetadataDraft[]> {
	// 构建 API 请求体
	const requestBody = {
		filters: id ? ["id", "=", id] : ["search", "=", name],
		fields:
			"id, titles.title, titles.lang, titles.main, aliases, image.url, released, rating, tags.name,tags.rating,tags.spoiler,description,developers.name,length_minutes",
		results: limit,
		...(id ? {} : { sort: "searchrank" }),
	};

	// 调用 VNDB API
	const rawResults = (
		await http.post<{ results: RawVNDBData[] }>(
			`${VNDB_API_BASE}/vn`,
			requestBody,
			buildVndbRateLimitedOptions(signal),
		)
	).data.results;

	if (!rawResults || rawResults.length === 0) {
		return [];
	}

	return rawResults.map((VNDBdata) => transformVndbData(VNDBdata));
}

/**
 * 通过 ID 直接获取 VNDB 游戏信息。
 *
 * @param {string} id VNDB 游戏 ID（如 "v17"）。
 * @returns {Promise<GameMetadataDraft>} 包含游戏详细信息的对象。
 */
export async function fetchVndbById(
	id: string,
	signal?: AbortSignal,
): Promise<GameMetadataDraft> {
	const result = await fetchVndbByName("", id, 25, signal);
	if (result.length === 0) {
		throw new AppError({
			code: "metadata_not_found",
			message: `VNDB entry not found: ${id}`,
		});
	}
	return result[0];
}

/**
 * 批量获取 VNDB 游戏信息（支持任意数量 ID）。
 *
 * 通过多次 API 调用获取多个游戏的信息，自动分批处理。
 * 根据 VNDB API 限制，单次请求最多包含 100 个 ID，函数会自动分批。
 *
 * @param {string[]} ids VNDB 游戏 ID 数组（如 ["v1", "v2", "v3", ...]，支持任意数量）。
 * @returns {Promise<GameMetadataDraft[]>} 包含游戏详细信息的对象数组。
 *
 * @example
 * // 获取 250 个游戏（自动分 3 批：100 + 100 + 50）
 * const results = await fetchVNDBByIds(largeIdArray);
 * // 返回: [{ id_type, sources }, ...]
 */
export async function fetchVNDBByIds(
	ids: string[],
	signal?: AbortSignal,
): Promise<GameMetadataDraft[]> {
	if (ids.length === 0) {
		return [];
	}

	// 分批处理，每批最多 100 个 ID；请求节奏由统一限速队列控制。
	const batchSize = 100;
	const batches: string[][] = [];

	for (let i = 0; i < ids.length; i += batchSize) {
		batches.push(ids.slice(i, i + batchSize));
	}

	const fetchBatch = async (batch: string[]): Promise<GameMetadataDraft[]> => {
		// 构建 OR 过滤器：["or", ["id", "=", "v1"], ["id", "=", "v2"], ...]
		const filters: (string | string[])[] = ["or"];
		for (const id of batch) {
			filters.push(["id", "=", id]);
		}

		const requestBody = {
			filters,
			fields: VNDB_FIELDS,
			results: Math.min(batch.length, 100),
		};

		const response = await http.post<{ results: RawVNDBData[] }>(
			`${VNDB_API_BASE}/vn`,
			requestBody,
			buildVndbRateLimitedOptions(signal),
		);

		const results = response.data.results;

		if (!results || results.length === 0) {
			return [];
		}

		return results.map((vndbData: RawVNDBData) =>
			transformVndbData(vndbData, true),
		);
	};

	const allResults: GameMetadataDraft[] = [];

	for (let i = 0; i < batches.length; i++) {
		try {
			allResults.push(...(await fetchBatch(batches[i])));
		} catch (error) {
			if (isApiRateLimitError(error)) throw error;
			throw new AppError({
				code: "metadata_request_failed",
				message: `VNDB batch fetch failed for batch: ${i + 1}`,
				cause: error,
			});
		}
	}

	return allResults;
}

/**
 * 获取当前认证用户信息。
 *
 * VNDB 使用 `GET /authinfo` 返回当前 token 对应的用户资料与权限。
 */
export async function fetchVndbCurrentUserProfile(
	token: string,
	signal?: AbortSignal,
): Promise<VndbAuthInfo | null> {
	if (!token) return null;

	try {
		const response = await http.get<VndbAuthInfo>(
			`${VNDB_API_BASE}/authinfo`,
			buildVndbRateLimitedAuthOptions(token, signal),
		);
		return response.data;
	} catch (error) {
		if (isApiRateLimitError(error)) throw error;
		return null;
	}
}

/**
 * 获取用户的 VNDB 收藏标签列表。
 *
 * @param token VNDB API Token，需要具备 `listread` 权限
 * @param userId 可选，目标用户 ID，格式如 `u1`
 */
export async function fetchVndbUserLabels(
	token: string,
	userId?: string,
	signal?: AbortSignal,
): Promise<VndbUserLabel[]> {
	if (!token) return [];

	try {
		const response = await http.get<{ labels: VndbUserLabel[] }>(
			`${VNDB_API_BASE}/ulist_labels`,
			{
				...buildVndbRateLimitedAuthOptions(token, signal),
				params: userId
					? { user: userId, fields: "count" }
					: { fields: "count" },
			},
		);
		return Array.isArray(response.data?.labels) ? response.data.labels : [];
	} catch (error) {
		if (isApiRateLimitError(error)) throw error;
		return [];
	}
}

/**
 * 获取某个 VN 在用户列表中的收藏信息。
 *
 * @param vndbId VNDB 条目 ID，如 `v17`
 * @param token VNDB API Token，需要具备 `listread` 权限
 * @param userId 可选，目标用户 ID；不传时会通过 token 自动解析当前用户
 */
export async function fetchVndbUserCollection(
	vndbId: string,
	token: string,
	userId?: string,
	signal?: AbortSignal,
): Promise<VndbUserCollectionItem | null> {
	if (!token || !vndbId) return null;

	try {
		const resolvedUserId = await resolveVndbUserId(token, userId, signal);
		if (!resolvedUserId) return null;

		const response = await http.post<{ results: VndbUserCollectionItem[] }>(
			`${VNDB_API_BASE}/ulist`,
			{
				user: resolvedUserId,
				filters: ["id", "=", vndbId],
				fields: VNDB_USER_COLLECTION_FIELDS,
				results: 1,
			},
			buildVndbRateLimitedAuthOptions(token, signal),
		);

		const results = Array.isArray(response.data?.results)
			? response.data.results
			: [];

		return results[0] ?? null;
	} catch (error) {
		if (isApiRateLimitError(error)) throw error;
		return null;
	}
}

export async function fetchVndbUserCollections(
	token: string,
	userId?: string,
): Promise<VndbUserCollectionItem[]> {
	if (!token) return [];

	try {
		const resolvedUserId = await resolveVndbUserId(token, userId);
		if (!resolvedUserId) return [];

		const collections: VndbUserCollectionItem[] = [];
		let page = 1;

		while (true) {
			const response = await fetchVndbUserCollectionsPage(token, {
				userId: resolvedUserId,
				page,
			});
			collections.push(...response.results);

			if (!response.more || response.results.length === 0) {
				break;
			}
			page += 1;
		}

		return collections;
	} catch (error) {
		if (isApiRateLimitError(error)) throw error;
		return [];
	}
}

export async function fetchVndbUserCollectionsPage(
	token: string,
	params: {
		userId: string;
		page: number;
		count?: boolean;
	},
	signal?: AbortSignal,
): Promise<VndbUserCollectionsPage> {
	const response = await http.post<VndbUserCollectionsResponse>(
		`${VNDB_API_BASE}/ulist`,
		{
			user: params.userId,
			fields: VNDB_USER_COLLECTION_FIELDS,
			results: 100,
			page: params.page,
			...(params.count ? { count: true } : {}),
		},
		buildVndbRateLimitedAuthOptions(token, signal),
	);

	return {
		results: Array.isArray(response.data?.results) ? response.data.results : [],
		more: Boolean(response.data?.more),
		count: response.data?.count,
	};
}

/**
 * 更新当前用户的 VNDB 收藏状态。
 *
 * @param vndbId VNDB 条目 ID，如 `v17`
 * @param payload 支持 vote、notes、started、finished、labels 等字段
 * @param token VNDB API Token，需要具备 `listwrite` 权限
 */
export async function updateVndbUserCollection(
	vndbId: string,
	payload: UpdateVndbUserCollectionPayload,
	token: string,
	signal?: AbortSignal,
): Promise<boolean> {
	if (!token || !vndbId) return false;

	try {
		await http.patch(
			`${VNDB_API_BASE}/ulist/${vndbId}`,
			payload,
			buildVndbRateLimitedAuthOptions(token, signal),
		);
		return true;
	} catch (error) {
		if (isApiRateLimitError(error)) throw error;
		return false;
	}
}
