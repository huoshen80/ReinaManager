/**
 * @file 多数据源混合获取 API 封装
 * @description 同时从 Bangumi、VNDB 和 YMGal 获取游戏信息，返回三份原始数据
 * @module src/api/mixed
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 逻辑说明：
 * 1. 根据传入的参数智能获取：
 *    - 只有单个数据源ID：获取该数据，用其名称搜索其他数据源
 *    - 多个数据源ID：并行获取所有指定的数据源
 *    - 只有名称：同时搜索所有数据源
 * 2. 使用安全模式避免单个数据源失败导致整体失败
 * 3. 返回三份原始数据 { bgm_data, vndb_data, ymgal_data }
 *
 * 主要导出：
 * - fetchMixedData：通用混合数据获取，返回 { bgm_data, vndb_data, ymgal_data }
 * - fetchMultiSourceData：多数据源搜索和获取的统一接口
 */

import { AppError, toError } from "@/utils/errors";
import type { FullGameData } from "../types";
import { fetchBgmById, fetchBgmByName } from "./bgm";
import { fetchVndbById, fetchVndbByName } from "./vndb";
import { fetchYmById, fetchYmByName } from "./ymgal";

interface SafeFetchResult {
	data: FullGameData | null;
	failed: boolean;
}

// 辅助函数：安全获取 BGM 数据
async function getBangumiDataSafely(
	name: string,
	BGM_TOKEN: string,
	bgm_id?: string,
): Promise<SafeFetchResult> {
	try {
		if (bgm_id) {
			return {
				data: await fetchBgmById(bgm_id, BGM_TOKEN),
				failed: false,
			};
		}
		const result = await fetchBgmByName(name, BGM_TOKEN);
		return { data: result[0] ?? null, failed: false };
	} catch {
		return { data: null, failed: true };
	}
}

// 辅助函数：安全获取 VNDB 数据
async function getVNDBDataSafely(
	searchName: string,
	vndb_id?: string,
): Promise<SafeFetchResult> {
	try {
		if (vndb_id) {
			return { data: await fetchVndbById(vndb_id), failed: false };
		}
		const result = await fetchVndbByName(searchName);
		return { data: result[0] ?? null, failed: false };
	} catch {
		return { data: null, failed: true };
	}
}

// 辅助函数：安全获取 YMGal 数据
async function getYmgalDataSafely(
	searchName: string,
	ymgal_id?: string,
): Promise<SafeFetchResult> {
	try {
		if (ymgal_id) {
			return { data: await fetchYmById(Number(ymgal_id)), failed: false };
		}
		const result = await fetchYmByName(searchName);
		return { data: result[0] ?? null, failed: false };
	} catch {
		return { data: null, failed: true };
	}
}

function extractNameFromApi(apiData: FullGameData | null): string | undefined {
	if (!apiData) return undefined;
	// 优先级: YMGal > VNDB > BGM > Custom
	const ymgalName = apiData.ymgal_data?.name;
	if (ymgalName) return ymgalName as string;
	const vndbName = apiData.vndb_data?.name;
	if (vndbName) return vndbName as string;
	const bgmName = apiData.bgm_data?.name;
	if (bgmName) return bgmName as string;
	// 其次使用 custom_data 中的名称
	const custom = apiData.custom_data?.name;
	if (custom) return custom as string;
	return undefined;
}

/**
 * 多数据源混合数据获取函数
 * 根据新的设计思路：添加游戏只能输入单id、游戏名称两种
 * - 单id：返回一个结果（用id指向的游戏名搜索其他两个源，取第一个结果）
 * - 游戏名称：所有源都取第一个结果
 *
 * @param options 配置选项
 * @param options.bgm_id Bangumi 条目 ID（可选）
 * @param options.vndb_id VNDB 游戏 ID（可选）
 * @param options.ymgal_id YMGal 游戏 ID（可选）
 * @param options.name 游戏名称（可选）
 * @param options.BGM_TOKEN Bangumi API 访问令牌（可选）
 * @returns 返回 { bgm_data, vndb_data, ymgal_data } 对象
 */
export async function fetchMixedData(options: {
	bgm_id?: string;
	vndb_id?: string;
	ymgal_id?: string;
	name?: string;
	BGM_TOKEN?: string;
}) {
	const { bgm_id, vndb_id, ymgal_id, name, BGM_TOKEN } = options;

	const providedIds = [bgm_id, vndb_id, ymgal_id].filter(Boolean).length;

	// 场景1: 单个ID提供 - 获取该数据源，然后用名称搜索其他数据源（取第一个结果）
	if (providedIds === 1) {
		let searchName: string | undefined;
		let bgmResult: SafeFetchResult = { data: null, failed: false };
		let vndbResult: SafeFetchResult = { data: null, failed: false };
		let ymgalResult: SafeFetchResult = { data: null, failed: false };

		if (bgm_id && BGM_TOKEN) {
			bgmResult = await getBangumiDataSafely("", BGM_TOKEN, bgm_id);
			searchName = extractNameFromApi(bgmResult.data);
		} else if (vndb_id) {
			vndbResult = await getVNDBDataSafely("", vndb_id);
			searchName = extractNameFromApi(vndbResult.data);
		} else if (ymgal_id) {
			ymgalResult = await getYmgalDataSafely("", ymgal_id);
			searchName = extractNameFromApi(ymgalResult.data);
		}

		if (searchName) {
			const [nextBgmResult, nextVndbResult, nextYmgalResult] =
				await Promise.all([
					!bgmResult.data && BGM_TOKEN
						? getBangumiDataSafely(searchName, BGM_TOKEN)
						: Promise.resolve(bgmResult),
					!vndbResult.data
						? getVNDBDataSafely(searchName)
						: Promise.resolve(vndbResult),
					!ymgalResult.data
						? getYmgalDataSafely(searchName)
						: Promise.resolve(ymgalResult),
				]);
			bgmResult = nextBgmResult;
			vndbResult = nextVndbResult;
			ymgalResult = nextYmgalResult;
		}

		if (bgmResult.failed && vndbResult.failed && ymgalResult.failed) {
			throw new AppError({
				code: "mixed_sources_failed",
				message: "All mixed source requests failed for single-id lookup",
			});
		}

		return {
			bgm_data: bgmResult.data,
			vndb_data: vndbResult.data,
			ymgal_data: ymgalResult.data,
		};
	}

	// 场景2: 只有名称（用于搜索）- 同时搜索所有数据源（取第一个结果）
	if (name?.trim()) {
		const searchName = name.trim();
		const [bgmResult, vndbResult, ymgalResult] = await Promise.all([
			BGM_TOKEN
				? getBangumiDataSafely(searchName, BGM_TOKEN)
				: Promise.resolve({ data: null, failed: false }),
			getVNDBDataSafely(searchName),
			getYmgalDataSafely(searchName),
		]);

		if (bgmResult.failed && vndbResult.failed && ymgalResult.failed) {
			throw new AppError({
				code: "mixed_sources_failed",
				message: `All mixed source requests failed for search: ${searchName}`,
				cause: toError(undefined, "Mixed search failed"),
			});
		}

		return {
			bgm_data: bgmResult.data,
			vndb_data: vndbResult.data,
			ymgal_data: ymgalResult.data,
		};
	}

	throw new AppError({
		code: "invalid_game_id",
		message: "Mixed fetch requires a single source id or a name query",
	});
}
