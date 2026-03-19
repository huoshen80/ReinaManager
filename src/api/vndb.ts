/**
 * @file VNDB 游戏信息 API 封装
 * @description 提供与 VNDB API 交互的函数和类型定义，用于获取视觉小说信息，返回结构化数据，便于前端统一处理。
 * @module src/api/vndb
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
import type { FullGameData, VndbData } from "@/types";
import i18n from "@/utils/i18n";
import http, { tauriHttp } from "./http";

const VNDB_API_BASE = "https://api.vndb.org/kana";
const VNDB_JSON_HEADERS = {
	Accept: "application/json",
	"Content-Type": "application/json",
} as const;

function buildVndbHeaders() {
	return {
		headers: {
			...VNDB_JSON_HEADERS,
		},
	};
}

function buildVndbAuthHeaders(token: string) {
	return {
		headers: {
			...VNDB_JSON_HEADERS,
			Authorization: `Token ${token}`,
		},
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
	image?: { url: string };
	released: string;
	rating: number;
	tags: { name: string; rating: number }[];
	description: string;
	developers: { name: string }[];
	length_minutes: number;
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

export interface UpdateVndbUserCollectionPayload {
	vote?: number | null;
	notes?: string | null;
	started?: string | null;
	finished?: string | null;
	labels?: number[];
	labels_set?: number[];
	labels_unset?: number[];
}

async function resolveVndbUserId(token: string, userId?: string) {
	if (userId) {
		return userId;
	}

	const authInfo = await fetchVndbCurrentUserProfile(token);
	return authInfo?.id ?? null;
}

/**
 * 将单个 VNDB 数据转换为统一格式
 * @private
 */
function transformVndbData(
	VNDBdata: RawVNDBData,
	update_batch?: boolean,
): FullGameData {
	// 处理标题信息
	const titles = VNDBdata.titles.map((title: VNDB_title) => ({
		title: title.title,
		lang: title.lang,
		main: title.main,
	}));

	const mainTitle: string =
		titles.find((title: VNDB_title) => title.main)?.title || "";
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
	const filtered_tags = (
		VNDBdata.tags as { rating: number; name: string; spoiler: number }[]
	)
		.sort((a, b) => b.rating - a.rating)
		.filter(({ spoiler }) => spoiler <= filterLevel)
		.map(({ name }) => name);

	const vndb_data: VndbData = {
		date: VNDBdata.released,
		image: VNDBdata.image?.url,
		summary: VNDBdata.description,
		name: mainTitle,
		name_cn: chineseTitle,
		all_titles: allTitles,
		aliases: VNDBdata.aliases || [],
		tags: filtered_tags,
		score: Number((VNDBdata.rating / 10).toFixed(2)),
		developer: VNDBdata.developers
			?.map((dev: { name: string }) => dev.name)
			.join("/"),
		average_hours: Number((VNDBdata.length_minutes / 60).toFixed(1)),
		nsfw: !filtered_tags.includes("No Sexual Content"),
	};

	return {
		vndb_id: VNDBdata.id,
		...(update_batch ? {} : { id_type: "vndb" }),
		date: VNDBdata.released,
		vndb_data,
	};
}

/**
 * 从 VNDB API 获取游戏信息。
 *
 * 该函数根据游戏名称或 VNDB 游戏 ID，调用 VNDB API 获取游戏详细信息。
 * 若未找到条目，则返回错误提示字符串。返回数据结构与 Bangumi 保持一致，便于统一处理。
 *
 * @param {string} name 游戏名称，用于搜索 VNDB 条目。
 * @param {string} [id] 可选，VNDB 游戏 ID，若提供则优先通过 ID 查询。
 * @param {number} [limit=25] 可选，返回的最大结果数量，默认 25。
 * @returns {Promise<FullGameData[] | string>} 包含游戏详细信息的数组，若未找到则返回错误提示字符串。
 */
export async function fetchVndbByName(
	name: string,
	id?: string,
	limit = 25,
): Promise<FullGameData[] | string> {
	try {
		// 构建 API 请求体
		const requestBody = {
			filters: id ? ["id", "=", id] : ["search", "=", name],
			fields:
				"id, titles.title, titles.lang, titles.main, aliases, image.url, released, rating, tags.name,tags.rating,tags.spoiler,description,developers.name,length_minutes",
			results: limit,
		};

		// 调用 VNDB API
		const rawResults = (
			await http.post(`${VNDB_API_BASE}/vn`, requestBody, buildVndbHeaders())
		).data.results as RawVNDBData[];
		if (!rawResults || rawResults.length === 0)
			return i18n.t(
				"api.vndb.notFound",
				"未找到相关条目，请确认ID或游戏名字后重试",
			);
		return rawResults.map((VNDBdata) => transformVndbData(VNDBdata));
	} catch (error) {
		Promise.reject(
			new Error(i18n.t("api.vndb.apiCallFailed", "VNDB API 调用失败")),
		);
		if (error instanceof Error) {
			console.error("错误消息:", error.message);
		}
		return i18n.t("api.vndb.fetchFailed", "获取数据失败，请稍后重试");
	}
}

/**
 * 通过 ID 直接获取 VNDB 游戏信息。
 *
 * @param {string} id VNDB 游戏 ID（如 "v17"）。
 * @returns {Promise<FullGameData | string>} 包含游戏详细信息的对象，若未找到则返回错误提示字符串。
 */
export async function fetchVndbById(
	id: string,
): Promise<FullGameData | string> {
	const result = await fetchVndbByName("", id);
	if (typeof result === "string") return result;
	return result[0];
}

/**
 * 批量获取 VNDB 游戏信息（支持任意数量 ID）。
 *
 * 通过多次 API 调用获取多个游戏的信息，自动分批处理。
 * 根据 VNDB API 限制，单次请求最多包含 100 个 ID，函数会自动分批。
 *
 * @param {string[]} ids VNDB 游戏 ID 数组（如 ["v1", "v2", "v3", ...]，支持任意数量）。
 * @returns {Promise<Array<object | string>>} 包含游戏详细信息的对象数组，未找到的项返回错误提示字符串。
 *
 * @example
 * // 获取 250 个游戏（自动分 3 批：100 + 100 + 50）
 * const results = await fetchVNDBByIds(largeIdArray);
 * // 返回: [{ game, vndb_data, ... }, { game, vndb_data, ... }, ...]
 */
export async function fetchVNDBByIds(ids: string[]) {
	try {
		// 校验 ID 数量
		if (ids.length === 0) {
			return [];
		}

		// 分批处理，每批最多 100 个 ID
		const batchSize = 100;
		const batches: string[][] = [];

		for (let i = 0; i < ids.length; i += batchSize) {
			batches.push(ids.slice(i, i + batchSize));
		}

		// 并发请求所有批次
		const allResults: FullGameData[] = [];

		// 使用 Promise.all 并发请求所有批次
		const batchPromises = batches.map(async (batch) => {
			try {
				// 构建 OR 过滤器：["or", ["id", "=", "v1"], ["id", "=", "v2"], ...]
				const filters: (string | string[])[] = ["or"];
				for (const id of batch) {
					filters.push(["id", "=", id]);
				}

				// 构建 API 请求体
				const requestBody = {
					filters,
					fields:
						"id, titles.title, titles.lang, titles.main, aliases, image.url, released, rating, tags.name,tags.rating,tags.spoiler,description,developers.name,length_minutes",
					results: Math.min(batch.length, 100), // 最多请求 100 条结果
				};

				// 调用 VNDB API
				const response = await http.post(
					`${VNDB_API_BASE}/vn`,
					requestBody,
					buildVndbHeaders(),
				);

				const results = response.data.results;

				if (!results || results.length === 0) {
					return [];
				}

				// 转换所有结果数据
				return results.map((vndbData: RawVNDBData) =>
					transformVndbData(vndbData, true),
				);
			} catch (error) {
				console.error(`批次请求失败:`, error);
				return [];
			}
		});

		// 等待所有批次完成
		const batchResults = await Promise.all(batchPromises);

		// 合并所有结果
		for (const batch of batchResults) {
			allResults.push(...batch);
		}

		if (allResults.length === 0) {
			return i18n.t(
				"api.vndb.notFound",
				"未找到相关条目，请确认ID或游戏名字后重试",
			);
		}

		return allResults;
	} catch (error) {
		Promise.reject(
			new Error(i18n.t("api.vndb.apiCallFailed", "VNDB API 调用失败")),
		);
		if (error instanceof Error) {
			console.error("错误消息:", error.message);
		}
		return i18n.t("api.vndb.fetchFailed", "获取数据失败，请稍后重试");
	}
}

/**
 * 获取当前认证用户信息。
 *
 * VNDB 使用 `GET /authinfo` 返回当前 token 对应的用户资料与权限。
 */
export async function fetchVndbCurrentUserProfile(
	token: string,
): Promise<VndbAuthInfo | null> {
	if (!token) return null;

	try {
		const response = await http.get(
			`${VNDB_API_BASE}/authinfo`,
			buildVndbAuthHeaders(token),
		);
		return response.data as VndbAuthInfo;
	} catch (error) {
		console.error("获取 VNDB 当前用户信息失败:", error);
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
): Promise<VndbUserLabel[]> {
	if (!token) return [];

	try {
		const response = await http.get(`${VNDB_API_BASE}/ulist_labels`, {
			...buildVndbAuthHeaders(token),
			params: userId ? { user: userId, fields: "count" } : { fields: "count" },
		});
		return Array.isArray(response.data?.labels)
			? (response.data.labels as VndbUserLabel[])
			: [];
	} catch (error) {
		console.error("获取 VNDB 收藏标签失败:", error);
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
): Promise<VndbUserCollectionItem | null> {
	if (!token || !vndbId) return null;

	try {
		const resolvedUserId = await resolveVndbUserId(token, userId);
		if (!resolvedUserId) return null;

		const response = await http.post(
			`${VNDB_API_BASE}/ulist`,
			{
				user: resolvedUserId,
				filters: ["id", "=", vndbId],
				fields:
					"id, added, voted, lastmod, vote, started, finished, notes, labels.id, labels.label, releases.id, releases.list_status",
				results: 1,
			},
			buildVndbAuthHeaders(token),
		);

		const results = Array.isArray(response.data?.results)
			? (response.data.results as VndbUserCollectionItem[])
			: [];

		return results[0] ?? null;
	} catch (error) {
		console.error(`获取 VNDB 收藏状态失败 (vndbId: ${vndbId}):`, error);
		return null;
	}
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
): Promise<boolean> {
	if (!token || !vndbId) return false;

	try {
		await tauriHttp.patch(
			`${VNDB_API_BASE}/ulist/${vndbId}`,
			payload,
			buildVndbAuthHeaders(token),
		);
		return true;
	} catch (error) {
		console.error(`更新 VNDB 收藏状态失败 (vndbId: ${vndbId}):`, error);
		return false;
	}
}
