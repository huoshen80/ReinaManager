/**
 * @file 数据转换工具
 * @description 将后端数据结构转换为前端显示结构,智能合并关联数据
 *
 * 重构说明:
 * - 后端已采用单表架构，FullGameData 直接包含 JSON 元数据字段
 * - 不再需要从 game 属性中提取数据
 * - 转换时将 null 值转换为 undefined（展示层不需要 null）
 */

import type {
	BgmData,
	CustomData,
	FullGameData,
	GameData,
	Nullable,
	VndbData,
	YmgalData,
} from "@/types";

/**
 * 将 null 转换为 undefined
 * 用于将后端返回的 null 值转换为前端展示层的 undefined
 */
const nullToUndefined = <T>(value: T | null | undefined): T | undefined =>
	value ?? undefined;

/**
 * 辅助函数：从数据源提取基础字段（避免重复代码）
 */
const assignBasicFields = (
	target: GameData,
	source: {
		image?: string | null;
		name?: string | null;
		name_cn?: string | null;
		summary?: string | null;
		developer?: string | null;
		nsfw?: boolean | null;
		date?: string | null;
	},
) => {
	if (source.image != null) target.image = source.image;
	if (source.name != null) target.name = source.name;
	if (source.name_cn != null) target.name_cn = source.name_cn;
	if (source.summary != null) target.summary = source.summary;
	if (source.developer != null) target.developer = source.developer;
	if (source.nsfw != null) target.nsfw = source.nsfw;
	if (source.date != null) target.date = source.date;
};

/**
 * 根据 id_type 智能合并游戏数据
 *
 * @param fullData 完整游戏数据（单表架构，元数据嵌入）
 * @param language 当前语言
 * @returns 展平的 GameData
 */
export function getDisplayGameData(
	fullData: FullGameData,
	_language?: string,
): GameData {
	// 基础数据 - 直接从 fullData 中获取根节点字段
	const baseData: GameData = {
		...fullData,
		localpath: nullToUndefined(fullData.localpath),
		savepath: nullToUndefined(fullData.savepath),
		custom_data: nullToUndefined(fullData.custom_data),
		// 初始化展平字段
		image: undefined,
		name: undefined,
		name_cn: undefined,
		summary: undefined,
		tags: [],
		rank: undefined,
		score: undefined,
		developer: undefined,
		all_titles: undefined,
		aliases: undefined,
		average_hours: undefined,
		nsfw: undefined,
	};

	// 根据 id_type 决定数据来源
	const { bgm_data, vndb_data, ymgal_data, custom_data } = fullData;

	switch (fullData.id_type) {
		case "bgm":
			if (bgm_data) assignFromDataSource(baseData, bgm_data, "bgm");
			break;

		case "vndb":
			if (vndb_data) assignFromDataSource(baseData, vndb_data, "vndb");
			break;

		case "ymgal":
			if (ymgal_data) assignFromDataSource(baseData, ymgal_data, "ymgal");
			break;

		case "mixed":
			// 混合数据源：合并所有可用数据
			if (bgm_data || vndb_data || ymgal_data) {
				mergeMultipleDataSources(baseData, {
					bgm_data,
					vndb_data,
					ymgal_data,
					custom_data,
				});
			}
			break;

		case "custom":
		case "Whitecloud":
			if (custom_data) assignFromDataSource(baseData, custom_data, "custom");
			break;

		default: {
			// 未知类型：尝试使用任何可用数据
			const anyData = bgm_data ?? vndb_data ?? ymgal_data ?? custom_data;
			if (anyData)
				assignFromDataSource(baseData, anyData as DataSource, "fallback");
		}
	}

	// 应用 custom_data 覆盖层（最高优先级）
	if (custom_data) {
		applyCustomDataOverride(baseData, custom_data);
	}

	return baseData;
}

/**
 * 数据源类型联合
 */
type DataSource = BgmData | VndbData | YmgalData | CustomData;

/**
 * 从单个数据源分配字段
 */
function assignFromDataSource(
	target: GameData,
	source: DataSource,
	sourceType: "bgm" | "vndb" | "ymgal" | "custom" | "fallback",
) {
	// 基础字段
	assignBasicFields(target, source);

	// 源特有的字段 - 使用类型断言处理不同数据源的属性差异
	switch (sourceType) {
		case "bgm": {
			const bgmSource = source as BgmData;
			target.tags = bgmSource.tags || [];
			target.rank = bgmSource.rank;
			target.score = bgmSource.score;
			target.aliases = bgmSource.aliases || [];
			break;
		}

		case "vndb": {
			const vndbSource = source as VndbData;
			target.tags = vndbSource.tags || [];
			target.score = vndbSource.score;
			target.all_titles = vndbSource.all_titles || [];
			target.aliases = vndbSource.aliases || [];
			target.average_hours = vndbSource.average_hours;
			break;
		}

		case "ymgal": {
			const ymgalSource = source as YmgalData;
			target.aliases = ymgalSource.aliases || [];
			break;
		}

		case "custom":
		case "fallback": {
			const customSource = source as CustomData;
			target.aliases = customSource.aliases || [];
			target.tags = customSource.tags || [];
			break;
		}
	}
}

/**
 * 合并多个数据源的字段
 */
function mergeMultipleDataSources(
	target: GameData,
	sources: {
		bgm_data?: Nullable<BgmData>;
		vndb_data?: Nullable<VndbData>;
		ymgal_data?: Nullable<YmgalData>;
		custom_data?: Nullable<CustomData>;
	},
) {
	const { bgm_data, vndb_data, ymgal_data, custom_data } = sources;

	// 基础字段：优先级 BGM > VNDB > YMGal
	const primarySource = bgm_data || vndb_data || ymgal_data;
	if (primarySource) assignBasicFields(target, primarySource);

	// 简介：YMGal 优先
	target.summary =
		ymgal_data?.summary || bgm_data?.summary || vndb_data?.summary;

	// 开发商: VNDB 优先
	target.developer =
		vndb_data?.developer || bgm_data?.developer || ymgal_data?.developer;

	// 标签: 合并所有数据源的标签，去重
	const allTags = [
		...(bgm_data?.tags || []),
		...(vndb_data?.tags || []),
		...(ymgal_data?.tags || []),
		...(custom_data?.tags || []),
	];
	target.tags = Array.from(new Set(allTags));

	// 别名: 合并所有数据源的别名，去重
	const allAliases = [
		...(bgm_data?.aliases || []),
		...(vndb_data?.aliases || []),
		...(ymgal_data?.aliases || []),
		...(custom_data?.aliases || []),
	];
	target.aliases = Array.from(new Set(allAliases));

	// 评分: BGM 优先，其次 VNDB
	target.score = bgm_data?.score ?? vndb_data?.score;

	// BGM 特有字段
	target.rank = bgm_data?.rank;

	// VNDB 特有字段
	target.all_titles = vndb_data?.all_titles || [];
	target.average_hours = vndb_data?.average_hours;
}

/**
 * 应用 custom_data 覆盖层
 * custom_data 具有最高优先级，用于覆盖其他数据源的字段
 */
function applyCustomDataOverride(target: GameData, customData: CustomData) {
	// 基础字段覆盖
	if (customData.summary) {
		target.summary = customData.summary;
	}
	if (customData.developer) {
		target.developer = customData.developer;
	}
	if (customData.nsfw) {
		target.nsfw = customData.nsfw;
	}
	if (customData.date) {
		target.date = customData.date;
	}

	// 数组字段增量合并
	if (customData.aliases) {
		target.aliases = Array.from(
			new Set([...(target.aliases || []), ...customData.aliases]),
		);
	}
	if (customData.tags) {
		target.tags = Array.from(
			new Set([...(target.tags || []), ...customData.tags]),
		);
	}
}

/**
 * 批量转换 FullGameData 数组
 */
export function getDisplayGameDataList(
	fullDataList: FullGameData[],
	language?: string,
): GameData[] {
	return fullDataList.map((fullData) => getDisplayGameData(fullData, language));
}
