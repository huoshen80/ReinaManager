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
 * 搜索索引，包含预处理后的数据和 Fuse.js 实例。
 * 只依赖游戏列表，与搜索词无关，可以安全缓存。
 */
export interface SearchIndex {
	fuse: Fuse<GameDataWithSearchFields>;
}

/**
 * 搜索建议的预处理条目。
 * 每个条目对应一个游戏的一个可搜索名称，拼音在预处理阶段计算完成。
 */
export interface SuggestionEntry {
	name: string;
	lower: string;
	pinyinFull: string;
	pinyinSpaced: string;
	pinyinFirst: string;
}

const DEFAULT_SEARCH_THRESHOLD = 0.4;

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

		// 生成搜索关键词和拼音源文本（复用同一基础数组）
		const baseTexts = [
			displayName,
			game.developer || "",
			...allTitles,
			...aliases,
		];
		const keywords = baseTexts.filter(Boolean);
		const searchKeywords = keywords.join(" ").toLowerCase();

		// 生成拼音 - 只处理包含中文的文本
		const chineseTexts = keywords.filter((text) =>
			/[\u4e00-\u9fff]/.test(text),
		);

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
	threshold: number = DEFAULT_SEARCH_THRESHOLD,
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
 * 创建搜索索引（预处理层）。
 * 只依赖游戏列表，与搜索词无关。调用方应基于游戏列表变化缓存此结果。
 * @param games 游戏数据数组
 * @param threshold Fuse.js 搜索阈值 (0-1)
 * @returns 搜索索引
 */
export function createSearchIndex(
	games: GameData[],
	threshold = DEFAULT_SEARCH_THRESHOLD,
): SearchIndex {
	const processedGames = preprocessGameData(games);
	const fuse = createFuseInstance(processedGames, threshold);
	return { fuse };
}

/**
 * 使用预构建的索引执行搜索（搜索层）。
 * 调用方应先通过 createSearchIndex 创建索引并缓存，然后每次搜索词变化时调用此函数。
 * @param index 预构建的搜索索引
 * @param keyword 搜索关键词（必须非空）
 * @param options 搜索选项
 * @returns 搜索结果数组，按相关性排序
 */
export function searchWithIndex(
	index: SearchIndex,
	keyword: string,
	options: {
		limit?: number;
		enablePinyin?: boolean;
	} = {},
): SearchResult[] {
	const { limit = 50, enablePinyin = true } = options;

	// 执行搜索
	const searchTerm = keyword.trim().toLowerCase();
	let fuseResults = index.fuse.search(searchTerm, { limit });

	// 如果启用拼音搜索且结果较少，尝试拼音搜索
	if (enablePinyin && fuseResults.length < 5) {
		// 将搜索词转换为拼音进行二次搜索
		const keywordPinyin = pinyin(searchTerm, {
			toneType: "none",
			type: "string",
			separator: "",
		}).toLowerCase();

		if (keywordPinyin !== searchTerm) {
			const pinyinResults = index.fuse.search(keywordPinyin, { limit });

			// 合并结果并去重
			const existingIds = new Set(fuseResults.map((r) => r.item.id));
			const newResults = pinyinResults.filter(
				(r) => !existingIds.has(r.item.id),
			);
			fuseResults = [...fuseResults, ...newResults];
		}
	}

	// 转换为统一的搜索结果格式
	return fuseResults
		.map((result) => ({
			item: result.item,
			score: 1 - (result.score || 0), // Fuse.js 的 score 越小越好，转换为越大越好
			matches: result.matches,
		}))
		.slice(0, limit);
}

/**
 * 增强搜索函数（便捷 wrapper）。
 * 内部调用 createSearchIndex + searchWithIndex。
 * 适用于无缓存需求的场景；热路径建议分别使用 createSearchIndex 和 searchWithIndex。
 * @param games 游戏数据数组
 * @param keyword 搜索关键词
 * @param options 搜索选项
 * @returns 搜索结果数组，按相关性排序
 */
export function enhancedSearch(
	games: GameData[],
	keyword: string,
	options: {
		limit?: number;
		threshold?: number;
		enablePinyin?: boolean;
	} = {},
): SearchResult[] {
	// 如果没有关键词，返回所有游戏
	if (!keyword || keyword.trim() === "") {
		return games.map((game) => ({
			item: game,
			score: 1,
		}));
	}

	const {
		limit = 50,
		threshold = DEFAULT_SEARCH_THRESHOLD,
		enablePinyin = true,
	} = options;
	const index = createSearchIndex(games, threshold);
	return searchWithIndex(index, keyword, { limit, enablePinyin });
}

/**
 * 预处理搜索建议数据（拼音预计算层）。
 * 对每个游戏的每个可搜索名称生成拼音变体，只在游戏列表变化时调用。
 * @param games 游戏数据数组
 * @returns 预处理后的建议条目数组
 */
export function preprocessSuggestionData(games: GameData[]): SuggestionEntry[] {
	const entries: SuggestionEntry[] = [];

	for (const game of games) {
		const displayName = getGameDisplayName(game);
		const allTitles = Array.isArray(game.all_titles) ? game.all_titles : [];
		const aliases = Array.isArray(game.aliases) ? game.aliases : [];

		const names = [
			displayName,
			game.developer,
			...allTitles,
			...aliases,
		].filter(Boolean) as string[];

		for (const name of names) {
			const lower = name.toLowerCase();
			let pinyinFull = "";
			let pinyinSpaced = "";
			let pinyinFirst = "";

			if (/[\u4e00-\u9fff]/.test(name)) {
				try {
					pinyinSpaced = pinyin(name, {
						toneType: "none",
						type: "string",
						separator: " ",
					}).toLowerCase();

					// 从带空格拼音派生无空格拼音，避免重复调用 pinyin()
					pinyinFull = pinyinSpaced.replaceAll(" ", "");

					pinyinFirst = pinyin(name, {
						pattern: "first",
						toneType: "none",
						type: "string",
						separator: "",
					}).toLowerCase();
				} catch {
					// 拼音转换失败时保持空字符串
				}
			}

			entries.push({ name, lower, pinyinFull, pinyinSpaced, pinyinFirst });
		}
	}

	return entries;
}

/**
 * 从预处理数据中获取搜索建议（搜索层）。
 * 只做字符串匹配，不调用 pinyin()，适合高频调用。
 * @param entries 预处理后的建议条目
 * @param input 输入的部分关键词
 * @param limit 返回建议数量限制
 * @returns 搜索建议数组
 */
export function getSearchSuggestionsFromData(
	entries: SuggestionEntry[],
	input: string,
	limit: number = 8,
): string[] {
	if (!input || input.trim() === "") {
		return [];
	}

	const inputLower = input.toLowerCase().trim();

	// 同名建议只保留最高优先级，减少后续排序数量
	const suggestionPriority = new Map<string, number>();

	const addSuggestion = (name: string, priority: number) => {
		const currentPriority = suggestionPriority.get(name) ?? 0;
		if (priority > currentPriority) {
			suggestionPriority.set(name, priority);
		}
	};

	for (const entry of entries) {
		// 直接名称匹配
		if (entry.lower.includes(inputLower)) {
			let priority = 1;
			if (entry.lower === inputLower) {
				priority = 4; // 精确匹配优先级最高
			} else if (entry.lower.startsWith(inputLower)) {
				priority = 3; // 开头匹配优先级高
			}
			addSuggestion(entry.name, priority);
		}

		// 拼音匹配
		if (entry.pinyinFull) {
			if (
				entry.pinyinFull.includes(inputLower) ||
				entry.pinyinSpaced.includes(inputLower)
			) {
				addSuggestion(entry.name, 2);
			} else if (
				entry.pinyinFirst.includes(inputLower) &&
				inputLower.length >= 2
			) {
				addSuggestion(entry.name, 1);
			}
		}
	}

	// 按优先级排序并限制数量
	return Array.from(suggestionPriority.entries())
		.toSorted((a, b) => b[1] - a[1])
		.map(([name]) => name)
		.slice(0, limit);
}

/**
 * 获取搜索建议（便捷 wrapper）。
 * 内部调用 preprocessSuggestionData + getSearchSuggestionsFromData。
 * 适用于无缓存需求的场景；热路径建议分别使用预处理和搜索函数。
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

	const entries = preprocessSuggestionData(games);
	return getSearchSuggestionsFromData(entries, input, limit);
}
