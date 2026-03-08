/**
 * @file 增强搜索功能模块
 * @description 基于 pinyin-pro 和 fuse.js 的高级搜索功能，支持拼音搜索、模糊搜索、权重排序
 * @module src/utils/enhancedSearch
 * @author Pysio<qq593277393@outlook.com>
 * @copyright AGPL-3.0
 */

import Fuse, { type FuseResult, type IFuseOptions } from "fuse.js";
import { pinyin } from "pinyin-pro";
import type { GameData } from "@/types";
import { getGameDisplayName } from "./appUtils";

/**
 * 搜索结果接口
 */
export interface SearchResult {
	item: GameData;
	score: number;
	matches?: FuseResult<GameDataWithSearchFields>["matches"];
}

/**
 * 为游戏数据添加搜索字段
 */
interface GameDataWithSearchFields extends GameData {
	searchKeywords: string;
	pinyinFull: string;
	pinyinFirst: string;
	displayName: string;
	allTitlesString: string;
	aliasesString: string;
}

/**
 * 预处理游戏数据，添加搜索相关字段
 * @param games 原始游戏数据数组
 * @returns 带搜索字段的游戏数据数组
 */
function preprocessGameData(games: GameData[]): GameDataWithSearchFields[] {
	return games.map((game) => {
		// 使用统一的显示名称获取函数
		const displayName = getGameDisplayName(game);

		// 处理字符串数组字段
		const allTitles = Array.isArray(game.all_titles) ? game.all_titles : [];
		const aliases = Array.isArray(game.aliases) ? game.aliases : [];

		// 转换为字符串用于搜索
		const allTitlesString = allTitles.join(" ");
		const aliasesString = aliases.join(" ");

		// 生成搜索关键词（避免重复 displayName 中已包含的内容）
		const keywords = [
			displayName,
			game.developer || "",
			...allTitles,
			...aliases,
		].filter(Boolean);

		const searchKeywords = keywords.join(" ").toLowerCase();

		// 生成拼音 - 只处理包含中文的文本
		const chineseTexts = [
			displayName,
			game.developer || "",
			...allTitles,
			...aliases,
		].filter((text) => text && /[\u4e00-\u9fff]/.test(text));

		// 完整拼音 (带空格分隔)
		const pinyinFull = chineseTexts
			.map((text) =>
				pinyin(text, {
					toneType: "none",
					type: "string",
					separator: " ",
				}).toLowerCase(),
			)
			.join(" ");

		// 拼音首字母 (连续)
		const pinyinFirst = chineseTexts
			.map((text) =>
				pinyin(text, {
					pattern: "first",
					toneType: "none",
					type: "string",
					separator: "",
				}).toLowerCase(),
			)
			.join("");

		return {
			...game,
			searchKeywords,
			pinyinFull,
			pinyinFirst,
			displayName,
			allTitlesString,
			aliasesString,
		};
	});
}

/**
 * 创建 Fuse.js 搜索实例
 * @param processedGames 预处理后的游戏数据
 * @returns Fuse 搜索实例
 */
function createFuseInstance(
	processedGames: GameDataWithSearchFields[],
	threshold: number = 0.6,
): Fuse<GameDataWithSearchFields> {
	const fuseOptions: IFuseOptions<GameDataWithSearchFields> = {
		// 搜索阈值：使用传入的阈值
		threshold,

		// 搜索位置权重 - 匹配开始位置越靠前权重越高
		location: 0,
		distance: 200,

		// 最小匹配字符长度
		minMatchCharLength: 1,

		// 是否按分数排序
		shouldSort: true,

		// 是否包含匹配信息
		includeMatches: true,
		includeScore: true,

		// 忽略大小写和位置
		isCaseSensitive: false,
		findAllMatches: false,

		// 搜索的字段及其权重
		keys: [
			{
				name: "displayName",
				weight: 0.35, // 显示名称权重最高
			},
			{
				name: "allTitlesString",
				weight: 0.3, // 所有标题权重较高
			},
			{
				name: "aliasesString",
				weight: 0.3, // 别名权重较高
			},
			{
				name: "pinyinFull",
				weight: 0.25, // 完整拼音权重
			},
			{
				name: "pinyinFirst",
				weight: 0.2, // 拼音首字母权重
			},
			{
				name: "developer",
				weight: 0.15, // 开发商权重较低
			},
			{
				name: "searchKeywords",
				weight: 0.1, // 综合关键词权重最低（避免重复计分）
			},
		],
	};

	return new Fuse(processedGames, fuseOptions);
}

/**
 * 增强搜索函数
 * @param games 游戏数据数组
 * @param keyword 搜索关键词
 * @param options 搜索选项
 * @returns 搜索结果数组，按相关性排序
 */
export function enhancedSearch(
	games: GameData[],
	keyword: string,
	options: {
		limit?: number; // 返回结果数量限制
		threshold?: number; // 搜索阈值 (0-1)
		enablePinyin?: boolean; // 是否启用拼音搜索
	} = {},
): SearchResult[] {
	// 如果没有关键词，返回所有游戏
	if (!keyword || keyword.trim() === "") {
		return games.map((game) => ({
			item: game,
			score: 1,
		}));
	}

	const { limit = 50, threshold = 0.4, enablePinyin = true } = options;

	// 预处理游戏数据
	const processedGames = preprocessGameData(games);

	// 创建搜索实例
	const fuse = createFuseInstance(processedGames, threshold);

	// 执行搜索
	const searchTerm = keyword.trim().toLowerCase();
	let fuseResults = fuse.search(searchTerm, { limit });

	// 如果启用拼音搜索且结果较少，尝试拼音搜索
	if (enablePinyin && fuseResults.length < 5) {
		// 将搜索词转换为拼音进行二次搜索
		const keywordPinyin = pinyin(searchTerm, {
			toneType: "none",
			type: "string",
			separator: "",
		}).toLowerCase();

		if (keywordPinyin !== searchTerm) {
			const pinyinResults = fuse.search(keywordPinyin, { limit });

			// 合并结果并去重
			const existingIds = new Set(fuseResults.map((r) => r.item.id));
			const newResults = pinyinResults.filter(
				(r) => !existingIds.has(r.item.id),
			);
			fuseResults = [...fuseResults, ...newResults];
		}
	}

	// 转换为统一的搜索结果格式（移除重复的阈值过滤）
	const results: SearchResult[] = fuseResults
		.map((result) => ({
			item: result.item,
			score: 1 - (result.score || 0), // Fuse.js 的 score 越小越好，转换为越大越好
			matches: result.matches,
		}))
		.slice(0, limit);

	return results;
}

/**
 * 获取搜索建议（自动补全）
 * @param games 游戏数据数组
 * @param input 输入的部分关键词
 * @param limit 返回建议数量限制
 * @returns 搜索建议数组
 */
export function getSearchSuggestions(
	games: GameData[],
	input: string,
	limit: number = 8,
): string[] {
	if (!input || input.trim() === "") {
		return [];
	}

	const inputLower = input.toLowerCase().trim();

	// 优先级排序的建议
	const prioritySuggestions: Array<{ name: string; priority: number }> = [];

	for (const game of games) {
		const displayName = getGameDisplayName(game);
		const allTitles = Array.isArray(game.all_titles) ? game.all_titles : [];
		const aliases = Array.isArray(game.aliases) ? game.aliases : [];

		const names = [
			displayName,
			game.developer,
			...allTitles,
			...aliases,
		].filter(Boolean);

		// 直接名称匹配
		for (const name of names) {
			if (name?.toLowerCase().includes(inputLower)) {
				let priority = 1;
				if (name.toLowerCase().startsWith(inputLower)) {
					priority = 3; // 开头匹配优先级高
				} else if (name.toLowerCase() === inputLower) {
					priority = 4; // 精确匹配优先级最高
				}
				prioritySuggestions.push({ name, priority });
			}
		}

		// 拼音匹配建议 - 只对包含中文的内容进行拼音处理
		const chineseNames = names.filter(
			(name): name is string => name != null && /[\u4e00-\u9fff]/.test(name),
		);
		for (const chineseName of chineseNames) {
			try {
				// 完整拼音
				const pinyinFull = pinyin(chineseName, {
					toneType: "none",
					type: "string",
					separator: "",
				}).toLowerCase();

				// 带空格拼音
				const pinyinSpaced = pinyin(chineseName, {
					toneType: "none",
					type: "string",
					separator: " ",
				}).toLowerCase();

				// 拼音首字母
				const pinyinFirst = pinyin(chineseName, {
					pattern: "first",
					toneType: "none",
					type: "string",
					separator: "",
				}).toLowerCase();

				if (
					pinyinFull.includes(inputLower) ||
					pinyinSpaced.includes(inputLower)
				) {
					prioritySuggestions.push({ name: chineseName, priority: 2 });
				} else if (pinyinFirst.includes(inputLower) && inputLower.length >= 2) {
					prioritySuggestions.push({ name: chineseName, priority: 1 });
				}
			} catch (error) {
				console.warn("拼音建议生成失败:", error);
			}
		}
	}

	// 按优先级排序并去重
	const sortedSuggestions = prioritySuggestions
		.sort((a, b) => b.priority - a.priority)
		.map((s) => s.name)
		.filter((name, index, arr) => arr.indexOf(name) === index) // 去重
		.slice(0, limit);

	return sortedSuggestions;
}

// 暂时无用
/**
 * 高亮搜索关键词
 * @param text 原文本
 * @param keyword 搜索关键词
 * @returns 带有高亮标记的文本
 */
export function highlightSearchTerm(text: string, keyword: string): string {
	if (!keyword || keyword.trim() === "" || !text) {
		return text;
	}

	const searchTerm = keyword.trim();

	// 创建正则表达式，忽略大小写
	const regex = new RegExp(
		`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
		"gi",
	);

	return text.replace(regex, "<mark>$1</mark>");
}

// 暂时无用
/**
 * 检查是否包含中文字符
 * @param text 文本
 * @returns 是否包含中文
 */
export function containsChinese(text: string): boolean {
	return /[\u4e00-\u9fff]/.test(text);
}
