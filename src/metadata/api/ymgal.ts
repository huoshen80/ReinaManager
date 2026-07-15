/**
 * @file YMGal 月幕Galgame API 封装
 * @description 提供与 YMGal API 交互的函数和类型定义，用于获取游戏信息，返回结构化数据，便于前端统一处理。
 * @module src/metadata/api/ymgal
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - fetchYmByName：根据名称搜索获取游戏详细信息（列表模式）
 * - fetchYmByNameAccurate：精确搜索单个游戏详细信息
 * - fetchYmById：通过 YMGal 游戏 ID 获取游戏详细信息
 *
 * 依赖：
 * - http: 封装的 HTTP 请求工具
 */
// 注意认证失败重试机制未生效

import type { GameMetadataDraft, YmgalData } from "@/types";
import { AppError, isHttpStatus, toError } from "@/utils/errors";
import {
	createGameCandidate,
	createSourceCandidateRecord,
	getCandidateSourceData,
	getCandidateSourceId,
} from "../sourceCandidate";
import http, { type TauriHttpOptions, USER_AGENT } from "./http";

/**
 * YMGal API 全局配置
 */
const YMGAL_CONFIG = {
	baseUrl: "https://www.ymgal.games",
	clientId: "ymgal",
	clientSecret: "luna0327",
	scope: "public",
};

/**
 * Access Token 缓存
 */
interface TokenCache {
	token: string;
}

let tokenCache: TokenCache | null = null;

function buildYmgalRateLimitedOptions(
	options: TauriHttpOptions = {},
): TauriHttpOptions {
	return {
		...options,
		headers: {
			"User-Agent": USER_AGENT,
			...options.headers,
		},
		rateLimit: { source: "ymgal" },
	};
}

interface YmTokenResponse {
	access_token: string;
	token_type: string;
	expires_in: number;
	scope: string;
}

interface YmApiEnvelope<T> {
	success: boolean;
	code: number;
	msg?: string | null;
	data?: T | null;
}

interface YmPageResponse<T> {
	result: T[];
	total: number;
	hasNext: boolean;
	pageNum: number;
	pageSize: number;
}

/**
 * 获取 YMGal Access Token
 * @returns {Promise<string>} Access Token
 */
async function getAccessToken(
	forceRefresh = false,
	signal?: AbortSignal,
): Promise<string> {
	if (!forceRefresh && tokenCache?.token) return tokenCache.token;

	try {
		const response = await http.get<YmTokenResponse>(
			`${YMGAL_CONFIG.baseUrl}/oauth/token`,
			buildYmgalRateLimitedOptions({
				params: {
					grant_type: "client_credentials",
					client_id: YMGAL_CONFIG.clientId,
					client_secret: YMGAL_CONFIG.clientSecret,
					scope: YMGAL_CONFIG.scope,
				},
				signal,
			}),
		);

		const { access_token } = response.data;

		tokenCache = {
			token: access_token,
		};

		return access_token;
	} catch (error) {
		throw new AppError({
			code: "metadata_request_failed",
			message: "YMGal access token request failed",
			cause: toError(error, "YMGal access token request failed"),
		});
	}
}

/**
 * 发起 YMGal API 请求（自动处理认证和重试）
 * @param {string} path API 路径
 * @param {object} params 请求参数
 * @param {number} maxRetries 最大重试次数
 * @returns {Promise<T>} API 响应数据
 */
async function ymApiRequest<T>(
	path: string,
	params: Record<string, unknown> = {},
	maxRetries = 2,
	signal?: AbortSignal,
): Promise<T> {
	let lastError: unknown;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			const token = await getAccessToken(attempt > 0, signal); // 第一次尝试使用缓存，失败后强制刷新
			const response = await http.get<YmApiEnvelope<T>>(
				`${YMGAL_CONFIG.baseUrl}${path}`,
				buildYmgalRateLimitedOptions({
					params,
					headers: {
						Accept: "application/json;charset=utf-8",
						Authorization: `Bearer ${token}`,
						version: "1",
					},
					allowRetry: true, // 允许上层处理重试
					signal,
				}),
			);

			// 接口异常码 401/403 也视为需要重取 token 的信号
			if (!response.data.success || response.data.code !== 0) {
				if (response.data.code === 401 || response.data.code === 403) {
					if (attempt < maxRetries) {
						tokenCache = null; // 清空token缓存，强制重新获取
						continue; // 重试
					}
					throw new AppError({
						code: "metadata_request_failed",
						message: "YMGal authentication failed after retry",
					});
				}
				throw new AppError({
					code: "metadata_request_failed",
					message: response.data.msg
						? `YMGal API returned code ${response.data.code}: ${response.data.msg}`
						: `YMGal API returned code ${response.data.code}`,
				});
			}

			if (response.data.data == null) {
				throw new AppError({
					code: "metadata_request_failed",
					message: "YMGal API returned no data",
				});
			}

			return response.data.data;
		} catch (error: unknown) {
			lastError = error;

			if (
				(isHttpStatus(error, 401) || isHttpStatus(error, 403)) &&
				attempt < maxRetries
			) {
				tokenCache = null; // 清空token缓存
				continue; // 重试
			}

			// 如果不是认证错误或已达到最大重试次数，抛出错误
			break;
		}
	}

	throw toError(lastError, "YMGal API请求失败");
}

/**
 * 通过 orgId 获取机构名称（用于填充 YmgalData.developer）
 */
async function fetchOrganizationName(
	orgId?: number,
	signal?: AbortSignal,
): Promise<string | undefined> {
	if (!orgId) return undefined;
	try {
		const data = await ymApiRequest<YmOrganizationArchiveResponse>(
			"/open/archive",
			{ orgId },
			2,
			signal,
		);
		const org = data?.org;
		return org?.chineseName || org?.name || undefined;
	} catch {
		return undefined;
	}
}

/**
 * YMGal 游戏基础信息接口（列表返回）
 */
interface YmGameListItem {
	id: number; // gid
	orgName: string;
	releaseDate: string | null;
	name: string;
	chineseName: string | null;
	mainImg: string;
}

/**
 * YMGal 游戏详细信息接口
 */
interface YmGameDetail {
	gid: number;
	developerId: number;
	releaseDate: string | null;
	restricted: boolean; // NSFW 限制级标识
	name: string;
	chineseName: string | null;
	extensionName: Array<{
		name: string;
		type: string | null;
		desc: string | null;
	}>;
	introduction: string;
	mainImg: string;
}

interface YmGameArchiveResponse {
	game?: YmGameDetail;
}

interface YmOrganizationArchiveResponse {
	org?: {
		name: string;
		chineseName: string | null;
	};
}

/**
 * 将 YMGal 数据转换为统一格式
 * @param {YmGameDetail} ymData YMGal 游戏详细数据
 * @param {boolean} update_batch 是否批量更新模式
 * @returns {GameMetadataDraft}
 */
function transformYmData(
	ymData: YmGameDetail,
	update_batch = false,
): GameMetadataDraft {
	const aliases = ymData.extensionName?.map((ext) => ext.name).filter(Boolean);

	const ymgalData: YmgalData = {
		date: ymData.releaseDate ?? undefined,
		image: ymData.mainImg,
		name: ymData.name,
		name_cn: ymData.chineseName ?? undefined,
		aliases: aliases && aliases.length > 0 ? aliases : undefined,
		summary: ymData.introduction,
		developer: undefined,
		nsfw: ymData.restricted,
	};

	return {
		...createGameCandidate({
			idType: update_batch ? undefined : "ymgal",
			source: createSourceCandidateRecord(
				"ymgal",
				String(ymData.gid),
				ymgalData,
			),
		}),
	};
}

/**
 * 根据游戏名称搜索获取游戏列表（列表模式）
 *
 * @param {string} name 游戏名称
 * @param {number} pageNum 页号，从 1 开始
 * @param {number} pageSize 每页数量，范围 1-20
 * @param {boolean} fetchDetailById 是否仅对第一个结果用 ID 再次请求完整详情（默认 false）
 * 说明：该参数只用于“首条补全”场景，禁止对搜索结果列表逐条补全。
 * @returns {Promise<GameMetadataDraft[]>} 游戏列表
 */
export async function fetchYmByName(
	name: string,
	pageNum = 1,
	pageSize = 20,
	fetchDetailById = false,
	signal?: AbortSignal,
): Promise<GameMetadataDraft[]> {
	const data = await ymApiRequest<YmPageResponse<YmGameListItem>>(
		"/open/archive/search-game",
		{
			mode: "list",
			keyword: name.trim(),
			pageNum: pageNum,
			pageSize: pageSize,
		},
		2,
		signal,
	);

	if (data.result.length === 0) {
		return [];
	}

	// 将列表数据转换为统一格式（不包含详细信息）
	const results = data.result.map((item: YmGameListItem): GameMetadataDraft => {
		const ymgalData: YmgalData = {
			date: item.releaseDate ?? undefined,
			image: item.mainImg,
			name: item.name,
			name_cn: item.chineseName ?? undefined,
			developer: item.orgName,
		};

		return {
			...createGameCandidate({
				idType: "ymgal",
				source: createSourceCandidateRecord(
					"ymgal",
					String(item.id),
					ymgalData,
				),
			}),
		};
	});

	// 如果启用二步请求且有结果，用第一个结果的 ID 获取完整详情。
	// 注意：详情请求失败时降级为首条轻量数据，避免上层 mixed 链路整体失败。
	const firstResultId = results[0]
		? getCandidateSourceId(results[0], "ymgal")
		: undefined;
	if (fetchDetailById && firstResultId) {
		try {
			const detailedData = await fetchYmById(firstResultId, signal);
			return [detailedData];
		} catch {
			return [results[0]];
		}
	}

	return results;
}

/**
 * 通过 YMGal 游戏 ID 获取游戏详细信息
 *
 * @param {number} gid YMGal 游戏 ID
 * @returns {Promise<GameMetadataDraft>} 游戏详细信息
 */
export async function fetchYmById(
	gid: string,
	signal?: AbortSignal,
): Promise<GameMetadataDraft> {
	const id = Number(gid.replace(/^ga/i, ""));
	const data = await ymApiRequest<YmGameArchiveResponse>(
		"/open/archive",
		{ gid: id },
		2,
		signal,
	);

	if (!data?.game) {
		throw new AppError({
			code: "metadata_not_found",
			message: `YMGal entry not found: ${gid}`,
		});
	}

	const result = transformYmData(data.game);
	const ymgalData = getCandidateSourceData<YmgalData>(result, "ymgal");
	if (ymgalData) {
		ymgalData.developer = await fetchOrganizationName(
			data.game?.developerId,
			signal,
		);
	}

	return result;
}
