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

import i18n from "@/utils/i18n";
import type { FullGameData } from "../types";
import { fetchBgmById, fetchBgmByName } from "./bgm";
import { fetchVndbById, fetchVndbByName } from "./vndb";
import { fetchYmById, fetchYmByName } from "./ymgal";

// 辅助函数：安全获取 BGM 数据
async function getBangumiDataSafely(
	name: string,
	BGM_TOKEN: string,
	bgm_id?: string,
): Promise<FullGameData | null> {
	try {
		if (bgm_id) {
			const result = await fetchBgmById(bgm_id, BGM_TOKEN);
			return result && typeof result !== "string" ? result : null;
		}
		// 名称搜索返回数组，取第一个
		const result = await fetchBgmByName(name, BGM_TOKEN);
		if (typeof result === "string") return null;
		return result.length > 0 ? result[0] : null;
	} catch {
		return null;
	}
}

// 辅助函数：安全获取 VNDB 数据
async function getVNDBDataSafely(
	searchName: string,
	vndb_id?: string,
): Promise<FullGameData | null> {
	try {
		if (vndb_id) {
			const result = await fetchVndbById(vndb_id);
			return result && typeof result !== "string" ? result : null;
		}
		// 名称搜索返回数组，取第一个
		const result = await fetchVndbByName(searchName);
		if (typeof result === "string") return null;
		return result.length > 0 ? result[0] : null;
	} catch {
		return null;
	}
}

// 辅助函数：安全获取 YMGal 数据
async function getYmgalDataSafely(
	searchName: string,
	ymgal_id?: string,
): Promise<FullGameData | null> {
	try {
		if (ymgal_id) {
			const result = await fetchYmById(Number(ymgal_id));
			return result && typeof result !== "string" ? result : null;
		}
		// 名称搜索返回数组，取第一个
		const result = await fetchYmByName(searchName);
		if (typeof result === "string") return null;
		return result.length > 0 ? result[0] : null;
	} catch {
		return null;
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

	try {
		// 计算有多少个ID被提供
		const providedIds = [bgm_id, vndb_id, ymgal_id].filter(Boolean).length;

		// 场景1: 单个ID提供 - 获取该数据源，然后用名称搜索其他数据源（取第一个结果）
		if (providedIds === 1) {
			let searchName: string | undefined;
			let BGMdata: FullGameData | null = null;
			let VNDBdata: FullGameData | null = null;
			let YMGaldata: FullGameData | null = null;

			// 获取已知ID的数据源
			if (bgm_id && BGM_TOKEN) {
				BGMdata = await getBangumiDataSafely("", BGM_TOKEN, bgm_id);
				searchName = extractNameFromApi(BGMdata);
			} else if (vndb_id) {
				VNDBdata = await getVNDBDataSafely("", vndb_id);
				searchName = extractNameFromApi(VNDBdata);
			} else if (ymgal_id) {
				YMGaldata = await getYmgalDataSafely("", ymgal_id);
				searchName = extractNameFromApi(YMGaldata);
			}

			// 如果有名称，用名称搜索其他数据源（取第一个结果）
			if (searchName) {
				const promises: Promise<FullGameData | null>[] = [];

				if (!BGMdata && BGM_TOKEN) {
					promises.push(getBangumiDataSafely(searchName, BGM_TOKEN));
				} else {
					promises.push(Promise.resolve(BGMdata));
				}

				if (!VNDBdata) {
					promises.push(getVNDBDataSafely(searchName));
				} else {
					promises.push(Promise.resolve(VNDBdata));
				}

				if (!YMGaldata) {
					promises.push(getYmgalDataSafely(searchName));
				} else {
					promises.push(Promise.resolve(YMGaldata));
				}

				const [bgm, vndb, ymgal] = await Promise.all(promises);
				BGMdata = bgm;
				VNDBdata = vndb;
				YMGaldata = ymgal;
			}

			return { bgm_data: BGMdata, vndb_data: VNDBdata, ymgal_data: YMGaldata };
		}
		// 场景2: 只有名称（用于搜索）- 同时搜索所有数据源（取第一个结果）
		else if (name?.trim()) {
			const searchName = name.trim();
			const promises: Promise<FullGameData | null>[] = [];

			if (BGM_TOKEN) {
				promises.push(getBangumiDataSafely(searchName, BGM_TOKEN));
			} else {
				promises.push(Promise.resolve(null));
			}
			promises.push(getVNDBDataSafely(searchName));
			promises.push(getYmgalDataSafely(searchName));

			const [bgm, vndb, ymgal] = await Promise.all(promises);

			// 检查三个数据源是否都为空
			if (!bgm && !vndb && !ymgal) {
				throw new Error(
					i18n.t("api.mixed.noDataFromAnySource", "所有数据源均未获取到数据"),
				);
			}

			return { bgm_data: bgm, vndb_data: vndb, ymgal_data: ymgal };
		}

		// 参数不足
		throw new Error(
			i18n.t("api.mixed.noParameterProvided", "必须提供单个数据源ID或游戏名称"),
		);
	} catch (error) {
		console.error(
			"Mixed API 调用失败:",
			error instanceof Error ? error.message : error,
		);
		throw error;
	}
}
