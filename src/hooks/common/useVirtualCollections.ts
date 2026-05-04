/**
 * @file useVirtualCollections Hook
 * @description 虚拟分组生成器，包含开发商分组，使用缓存优化性能
 * @module src/hooks/useVirtualCollections
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { GameData } from "@/types";
import type { Category } from "@/types/collection";

/**
 * 虚拟分类生成配置接口
 */
interface VirtualCategoryConfig<T> {
	/** 从游戏中提取分类键（支持返回数组，用于多开发商等场景） */
	extractKeys: (game: GameData, t: (key: string) => string) => T | T[];
	/** 生成分类ID */
	generateId: (key: T, index?: number) => number;
	/** 生成分类名称 */
	generateName: (key: T) => string;
	/** 生成排序值 */
	generateSortOrder: (key: T, index?: number) => number;
	/** 对结果进行排序（可选） */
	sortResults?: (a: [T, number], b: [T, number]) => number;
}

export function getDeveloperNames(
	developer: string | null | undefined,
	unknownDeveloper: string,
): string[] {
	const developerStr = developer || unknownDeveloper;
	const developers: string[] = [];
	for (const dev of developerStr.split("/")) {
		const trimmed = dev.trim();
		if (trimmed) {
			developers.push(trimmed);
		}
	}

	return developers.length > 0 ? developers : [unknownDeveloper];
}

/**
 * 通用虚拟分类生成器
 * 抽取公共逻辑：遍历游戏、统计、转换为Category数组
 */
function generateVirtualCategories<T>(
	allGames: GameData[],
	config: VirtualCategoryConfig<T>,
	t: (key: string) => string,
): Category[] {
	const categoryMap = new Map<T, number>();

	// 遍历游戏并统计
	for (const game of allGames) {
		const keys = config.extractKeys(game, t);
		const keyArray = Array.isArray(keys) ? keys : [keys];

		for (const key of keyArray) {
			categoryMap.set(key, (categoryMap.get(key) ?? 0) + 1);
		}
	}

	// 转换为数组并排序
	let entries = Array.from(categoryMap.entries());
	if (config.sortResults) {
		entries = entries.toSorted(config.sortResults);
	}

	// 映射为Category对象
	return entries.map(([key, count], index) => ({
		id: config.generateId(key, index),
		name: config.generateName(key),
		sort_order: config.generateSortOrder(key, index),
		game_count: count,
	}));
}

/**
 * 生成开发商分类列表
 * 支持多开发商拆分（如 "Makura/Frontwing" 会被拆分为两个分组）
 * 使用 useMemo 缓存结果，仅在 allGames 变化时重新计算
 */
export function useDeveloperCategories(allGames: GameData[]): Category[] {
	const { t } = useTranslation();

	return useMemo(
		() =>
			generateVirtualCategories<string>(
				allGames,
				{
					extractKeys: (game, t) => {
						return getDeveloperNames(
							game.developer,
							t("category.unknownDeveloper"),
						);
					},
					generateId: (_, index = 0) => -(index + 101),
					generateName: (name) => name,
					generateSortOrder: () => 0,
					sortResults: (a, b) => b[1] - a[1], // 按游戏数量降序
				},
				t,
			),
		[allGames, t],
	);
}

/**
 * 游戏筛选配置接口
 */
interface GameFilterConfig {
	/** 判断游戏是否属于该分类 */
	matchGame: (game: GameData, t: (key: string) => string) => boolean;
}

/**
 * 通用游戏筛选器
 */
function filterGamesByCategory(
	allGames: GameData[],
	config: GameFilterConfig,
	t: (key: string) => string,
): GameData[] {
	return allGames.filter((game) => config.matchGame(game, t));
}

/**
 * 获取虚拟分类下的游戏列表
 * 根据分类ID类型分发到不同的筛选逻辑
 */
export function getVirtualCategoryGames(
	categoryId: number,
	categoryName: string | null,
	allGames: GameData[],
	t: (key: string) => string,
): GameData[] {
	// 开发商分类（负数ID <= -101）
	if (isDeveloperGroup(categoryId) && categoryName) {
		return filterGamesByCategory(
			allGames,
			{
				matchGame: (game, t) => {
					const developers = getDeveloperNames(
						game.developer,
						t("category.unknownDeveloper"),
					);
					for (const developer of developers) {
						if (developer === categoryName) {
							return true;
						}
					}
					return false;
				},
			},
			t,
		);
	}

	return [];
}

/**
 * 判断是否为虚拟分类
 */
export function isVirtualCategory(categoryId: number): boolean {
	return categoryId < 0;
}

/**
 * 判断是否为开发商分组
 */
export function isDeveloperGroup(categoryId: number): boolean {
	return categoryId <= -101;
}

/**
 * 统一的虚拟分类 Hook
 * 返回所有虚拟分类相关的数据和方法
 */
export function useVirtualCategories(allGames: GameData[]) {
	const developerCategories = useDeveloperCategories(allGames);

	/**
	 * 根据分组ID获取对应的分类列表
	 */
	const getCategoriesByGroupId = (
		groupId: string,
		realCategories: Category[],
	): Category[] => {
		switch (groupId) {
			case "default_developer":
				return developerCategories;
			default:
				return realCategories;
		}
	};

	/**
	 * 获取虚拟分类的名称（用于面包屑）
	 */
	const getVirtualCategoryName = (
		_categoryId: number,
		storedName: string | null,
	): string | null => {
		return storedName;
	};

	return {
		developerCategories,
		getCategoriesByGroupId,
		getVirtualCategoryName,
		isVirtual: isVirtualCategory,
		isDeveloper: isDeveloperGroup,
		getGames: getVirtualCategoryGames,
	};
}
