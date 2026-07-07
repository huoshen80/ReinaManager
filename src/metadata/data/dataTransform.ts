/**
 * @file 数据转换工具
 * @description 将后端数据结构转换为前端显示结构,智能合并关联数据
 *
 * 重构说明:
 * - 后端已采用单表架构，FullGameData 直接包含 JSON 元数据字段
 * - 不再需要从 game 属性中提取数据
 * - 转换时将 null 值转换为 undefined（展示层不需要 null）
 */

import type { FullGameData, GameData } from "@/types";
import { isSourceType } from "@/types";
import {
	getSourceIdMap,
	getSourceRecordMap,
	type SourceDataMap,
} from "../sourceRecord";
import {
	applyCustomDataOverride,
	applyCustomSourceDisplay,
	applyMixedSourceDisplay,
	applySingleSourceDisplay,
	getSourceDisplayFields,
} from "./displayMergeRules";

/**
 * 将 null 转换为 undefined
 * 用于将后端返回的 null 值转换为前端展示层的 undefined
 */
const nullToUndefined = <T>(value: T | null | undefined): T | undefined =>
	value ?? undefined;

/**
 * 根据 id_type 智能合并游戏数据
 *
 * @param fullData 完整游戏数据（单表架构，元数据嵌入）
 * @returns 展平的 GameData
 */
export function getDisplayGameData(fullData: FullGameData): GameData {
	const { custom_data } = fullData;
	const displayCustomData = nullToUndefined(custom_data);
	const sourceDataMap: SourceDataMap = {};
	for (const [source, record] of getSourceRecordMap(fullData)) {
		if (record.data != null) sourceDataMap[source] = record.data;
	}

	// 基础数据 - 直接从 fullData 中获取根节点字段
	const baseData: GameData = {
		id: fullData.id,
		id_type: fullData.id_type,
		sourceIds: getSourceIdMap(fullData),
		date: fullData.date,
		localpath: nullToUndefined(fullData.localpath),
		savepath: nullToUndefined(fullData.savepath),
		autosave: nullToUndefined(fullData.autosave),
		maxbackups: nullToUndefined(fullData.maxbackups),
		clear: nullToUndefined(fullData.clear),
		le_launch: nullToUndefined(fullData.le_launch),
		magpie: nullToUndefined(fullData.magpie),
		custom_data: displayCustomData,
		created_at: fullData.created_at,
		updated_at: fullData.updated_at,
		// 初始化展平字段
		image: undefined,
		name: undefined,
		name_cn: undefined,
		summary: undefined,
		tags: [],
		rank: undefined,
		score: undefined,
		sourceScores: {
			bgm: sourceDataMap.bgm
				? getSourceDisplayFields("bgm", sourceDataMap.bgm).score
				: undefined,
			vndb: sourceDataMap.vndb
				? getSourceDisplayFields("vndb", sourceDataMap.vndb).score
				: undefined,
		},
		developer: undefined,
		all_titles: undefined,
		aliases: undefined,
		average_hours: undefined,
		nsfw: undefined,
	};

	// 根据 id_type 决定数据来源
	if (fullData.id_type && isSourceType(fullData.id_type)) {
		const sourceData = sourceDataMap[fullData.id_type];
		if (sourceData) {
			applySingleSourceDisplay(baseData, fullData.id_type, sourceData);
		}
	} else {
		switch (fullData.id_type) {
			case "mixed":
				// 混合数据源：合并所有可用数据
				if (Object.keys(sourceDataMap).length > 0) {
					applyMixedSourceDisplay(
						baseData,
						sourceDataMap,
						custom_data?.cover_source,
					);
				}
				break;

			case "custom":
			case "Whitecloud":
				if (custom_data) applyCustomSourceDisplay(baseData, custom_data);
				break;

			default: {
				// 未知类型：尝试使用任何可用数据
				const [source, sourceData] = Object.entries(sourceDataMap)[0] ?? [];
				if (source && sourceData && isSourceType(source)) {
					applySingleSourceDisplay(baseData, source, sourceData);
				} else if (custom_data) {
					applyCustomSourceDisplay(baseData, custom_data);
				}
			}
		}
	}

	// 应用 custom_data 覆盖层（最高优先级）
	if (custom_data) {
		applyCustomDataOverride(baseData, custom_data);
	}

	return baseData;
}
