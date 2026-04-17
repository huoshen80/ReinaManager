/**
 * @file 多数据源混合获取 API 封装
 * @description 同时从 Bangumi、VNDB、YMGal 和 Kungal 获取游戏信息，返回各源原始数据
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
import type { FullGameData, SourceType } from "../types";
import { fetchBgmById, fetchBgmByName } from "./bgm";
import { fetchGalgameById, searchGalgame } from "./kun";
import { fetchVndbById, fetchVndbByName } from "./vndb";
import { fetchYmById, fetchYmByName } from "./ymgal";

interface SafeFetchResult {
	data: FullGameData | null;
	failed: boolean;
}

function isSourceEnabled(
	enabledSources: readonly SourceType[] | undefined,
	source: SourceType,
): boolean {
	return !enabledSources || enabledSources.includes(source);
}

function extractEmbeddedVndbResult(
	apiData: FullGameData | null,
): SafeFetchResult | null {
	if (!apiData?.vndb_data) {
		return null;
	}

	return {
		data: {
			vndb_id: apiData.vndb_id,
			vndb_data: apiData.vndb_data,
		},
		failed: false,
	};
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
		// mixed 模式固定为“搜索后取索引0并补全详情”。
		// 这样可以保证 mixed 预览尽量完整，同时避免对整页结果逐条补全。
		const result = await fetchYmByName(searchName, 1, 20, true);
		return { data: result[0] ?? null, failed: false };
	} catch {
		return { data: null, failed: true };
	}
}

// 辅助函数：安全获取 Kungal 数据
async function getKungalDataSafely(
	searchName: string,
	kun_id?: string,
): Promise<SafeFetchResult> {
	try {
		if (kun_id) {
			return { data: await fetchGalgameById(kun_id), failed: false };
		}
		const result = await searchGalgame(searchName, 1, 12, true);
		return { data: result[0] ?? null, failed: false };
	} catch {
		return { data: null, failed: true };
	}
}

function extractNameFromApi(apiData: FullGameData | null): string | undefined {
	if (!apiData) return undefined;

	const bgmName = apiData.bgm_data?.name;
	if (bgmName) return bgmName;
	const vndbName = apiData.vndb_data?.name;
	if (vndbName) return vndbName;
	const ymgalName = apiData.ymgal_data?.name;
	if (ymgalName) return ymgalName;
	const kunName = apiData.kun_data?.name;
	if (kunName) return kunName;
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
 * @param options.kun_id Kungal 游戏 ID（可选，仅用于更新等非 mixed ID 输入场景）
 * @param options.name 游戏名称（可选）
 * @param options.BGM_TOKEN Bangumi API 访问令牌（可选）
 * @returns 返回 { bgm_data, vndb_data, ymgal_data, kun_data } 对象
 */
export async function fetchMixedData(options: {
	bgm_id?: string;
	vndb_id?: string;
	ymgal_id?: string;
	kun_id?: string;
	name?: string;
	BGM_TOKEN?: string;
	enabledSources?: readonly SourceType[];
}) {
	const { bgm_id, vndb_id, ymgal_id, kun_id, name, BGM_TOKEN, enabledSources } =
		options;
	const enableBgm = isSourceEnabled(enabledSources, "bgm");
	const enableVndb = isSourceEnabled(enabledSources, "vndb");
	const enableYmgal = isSourceEnabled(enabledSources, "ymgal");
	const enableKun = isSourceEnabled(enabledSources, "kun");
	const providedIds = [
		enableBgm ? bgm_id : undefined,
		enableVndb ? vndb_id : undefined,
		enableYmgal ? ymgal_id : undefined,
		enableKun ? kun_id : undefined,
	].filter(Boolean).length;

	// 场景1: 单个ID提供 - 获取该数据源，然后用名称搜索其他数据源（取第一个结果）
	if (providedIds === 1) {
		let searchName: string | undefined;
		let bgmResult: SafeFetchResult = { data: null, failed: false };
		let vndbResult: SafeFetchResult = { data: null, failed: false };
		let ymgalResult: SafeFetchResult = { data: null, failed: false };
		let kunResult: SafeFetchResult = { data: null, failed: false };

		if (enableBgm && bgm_id && BGM_TOKEN) {
			bgmResult = await getBangumiDataSafely("", BGM_TOKEN, bgm_id);
			searchName = extractNameFromApi(bgmResult.data);
		} else if (enableVndb && vndb_id) {
			vndbResult = await getVNDBDataSafely("", vndb_id);
			searchName = extractNameFromApi(vndbResult.data);
		} else if (enableYmgal && ymgal_id) {
			ymgalResult = await getYmgalDataSafely("", ymgal_id);
			searchName = extractNameFromApi(ymgalResult.data);
		} else if (enableKun && kun_id) {
			kunResult = await getKungalDataSafely("", kun_id);
			searchName = extractNameFromApi(kunResult.data);
		}

		if (searchName) {
			const embeddedVndbResult =
				enableVndb && enableKun
					? extractEmbeddedVndbResult(kunResult.data)
					: null;
			const [nextBgmResult, nextVndbResult, nextYmgalResult, nextKunResult] =
				await Promise.all([
					enableBgm && !bgmResult.data && BGM_TOKEN
						? getBangumiDataSafely(searchName, BGM_TOKEN)
						: Promise.resolve(bgmResult),
					enableVndb && !vndbResult.data
						? embeddedVndbResult
							? Promise.resolve(embeddedVndbResult)
							: getVNDBDataSafely(searchName)
						: Promise.resolve(vndbResult),
					enableYmgal && !ymgalResult.data
						? getYmgalDataSafely(searchName)
						: Promise.resolve(ymgalResult),
					enableKun && !kunResult.data
						? getKungalDataSafely(searchName)
						: Promise.resolve(kunResult),
				]);
			bgmResult = nextBgmResult;
			vndbResult = nextVndbResult;
			ymgalResult = nextYmgalResult;
			kunResult = nextKunResult;
		}

		if (
			bgmResult.failed &&
			vndbResult.failed &&
			ymgalResult.failed &&
			kunResult.failed
		) {
			throw new AppError({
				code: "mixed_sources_failed",
				message: "All mixed source requests failed for single-id lookup",
			});
		}

		return {
			bgm_data: bgmResult.data,
			vndb_data: vndbResult.data,
			ymgal_data: ymgalResult.data,
			kun_data: kunResult.data,
		};
	}

	// 场景2: 只有名称（用于搜索）- 同时搜索所有数据源（取第一个结果）
	if (name?.trim()) {
		const searchName = name.trim();
		const [bgmResult, ymgalResult, kunResult] = await Promise.all([
			enableBgm && BGM_TOKEN
				? getBangumiDataSafely(searchName, BGM_TOKEN)
				: Promise.resolve({ data: null, failed: false }),
			enableYmgal
				? getYmgalDataSafely(searchName)
				: Promise.resolve({ data: null, failed: false }),
			enableKun
				? getKungalDataSafely(searchName)
				: Promise.resolve({ data: null, failed: false }),
		]);
		const vndbResult = enableVndb
			? ((enableKun ? extractEmbeddedVndbResult(kunResult.data) : null) ??
				(await getVNDBDataSafely(searchName)))
			: { data: null, failed: false };

		if (
			bgmResult.failed &&
			vndbResult.failed &&
			ymgalResult.failed &&
			kunResult.failed
		) {
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
			kun_data: kunResult.data,
		};
	}

	throw new AppError({
		code: "invalid_game_id",
		message: "Mixed fetch requires a single source id or a name query",
	});
}
