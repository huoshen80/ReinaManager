import { PlayStatus } from "@/types/collection";
import type { FullGameData, GameData } from "@/types/index";
import { enhancedSearch } from "./enhancedSearch";
import { getGameDisplayName } from "./index";

// 定义本地存储的 key
const STORAGE_KEY = "reina_manager_games";
const STORAGE_KEY_SETTINGS = "reina_manager_settings";

// 定义存储下一个ID的键
const NEXT_ID_KEY = "reina_manager_next_id";

// 获取下一个可用ID
export function getNextId(): number {
	// 读取当前ID值
	const nextId = Number(localStorage.getItem(NEXT_ID_KEY)) || 1;

	// 增加ID并保存
	localStorage.setItem(NEXT_ID_KEY, String(nextId + 1));

	return nextId;
}

// 设置类型定义
interface Settings {
	bgmToken: string;
	// 其他设置项可在此添加
	theme?: "light" | "dark";
	language?: string;
	// ...
	sort?: string;
}

// 默认设置
const DEFAULT_SETTINGS: Settings = {
	bgmToken: "",
	theme: "light",
	language: "zh-CN",
	sort: "addtime",
};

// 获取所有游戏数据（增加排序功能）
export function getGames(
	sortOption = "addtime",
	sortOrder: "asc" | "desc" = "asc",
): GameData[] {
	const data = localStorage.getItem(STORAGE_KEY);
	let games: GameData[] = [];

	if (data) {
		try {
			games = JSON.parse(data);
		} catch (error) {
			console.error("解析游戏数据失败：", error);
			return [];
		}
	}

	// 根据排序选项进行排序
	return sortGames(games, sortOption, sortOrder);
}

// 排序游戏数据的辅助函数
function sortGames(
	games: GameData[],
	sortOption: string,
	sortOrder: "asc" | "desc",
): GameData[] {
	// 克隆游戏数组以避免修改原数组
	const gamesCopy = [...games];

	switch (sortOption) {
		case "addtime": {
			// 创建带索引的副本，索引表示添加顺序
			const indexedGames = gamesCopy.map((game, index) => ({
				...game,
				_index: index, // 添加临时索引，表示在数组中的位置
			}));

			// 按索引排序
			return indexedGames.sort((a, b) => {
				return sortOrder === "asc" ? a._index - b._index : b._index - a._index;
			});
		}

		case "datetime":
			return gamesCopy.sort((a, b) => {
				const valueA = a.date ? new Date(a.date).getTime() : 0;
				const valueB = b.date ? new Date(b.date).getTime() : 0;
				return sortOrder === "asc" ? valueA - valueB : valueB - valueA;
			});

		case "rank":
			// 综合排序选项 - 与数据库保持一致
			return gamesCopy.sort((a, b) => {
				// 首先按评分排序
				const scoreA = Number(a.score) || 0;
				const scoreB = Number(b.score) || 0;

				if (scoreA !== scoreB) {
					// 评分不同时直接按评分排序
					return sortOrder === "asc" ? scoreA - scoreB : scoreB - scoreA;
				}

				// 评分相同时，按排名排序
				let rankA = Number(a.rank) || 0;
				let rankB = Number(b.rank) || 0;

				// 将 0 值（无排名）特殊处理
				if (rankA === 0) rankA = sortOrder === "asc" ? -1 : 999999;
				if (rankB === 0) rankB = sortOrder === "asc" ? -1 : 999999;

				// 降序时：排名越好（数值越小）越靠前
				// 升序时：排名越差（数值越大）越靠前
				return sortOrder === "asc" ? rankB - rankA : rankA - rankB;
			});

		default:
			// 默认情况下，按添加时间排序
			return gamesCopy;
	}
}

// 保存游戏数据集合到 localStorage
function setGames(games: GameData[]): void {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
}

// 插入一条游戏数据
export function insertGame(fullgame: FullGameData): void {
	const games = getGames();

	// 如果游戏没有ID，分配一个新ID
	if (!fullgame.id) {
		fullgame.id = getNextId();
	}

	// games.push(fullgame);纯前端摆烂~
	setGames(games);
}

// 删除一条游戏数据
export function deleteGame(gameId: number): void {
	let games = getGames();
	games = games.filter((game) => game.id !== gameId);
	setGames(games);
}

//通过 id 查找本地存储中的游戏数据
export function getGameByIdLocal(gameId: number): GameData {
	const games = getGames();
	const game = games.find((game) => game.id === gameId);
	return game as GameData;
}

// 获取设置
export function getSettings(): Settings {
	const data = localStorage.getItem(STORAGE_KEY_SETTINGS);
	if (data) {
		try {
			return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
		} catch (error) {
			console.error("解析设置数据失败:", error);
			return DEFAULT_SETTINGS;
		}
	}
	return DEFAULT_SETTINGS;
}

// 保存设置
export function saveSettings(settings: Settings): void {
	localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
}

// 获取 BGM_TOKEN
export function getBgmTokenLocal(): string {
	const settings = getSettings();
	return settings.bgmToken;
}

// 保存 BGM_TOKEN
export function setBgmTokenLocal(token: string): void {
	const settings = getSettings();
	settings.bgmToken = token;
	saveSettings(settings);
}

// 获取设置中的单个值
export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
	const settings = getSettings();
	return settings[key];
}

// 更新设置中的单个值
export function setSetting<K extends keyof Settings>(
	key: K,
	value: Settings[K],
): void {
	const settings = getSettings();
	settings[key] = value;
	saveSettings(settings);
}

// 纯前端搜索游戏，使用增强搜索功能
export function searchGamesLocal(
	keyword: string,
	type: "all" | "local" | "online" | "noclear" | "clear" = "all",
	sortOption = "addtime",
	sortOrder: "asc" | "desc" = "asc",
): GameData[] {
	// 浏览器不支持本地游戏，如果筛选类型是local，直接返回空数组
	if (type === "local") {
		return [];
	}

	// 如果没有关键字但有类型筛选，使用 filterGamesByTypeLocal
	if (!keyword || keyword.trim() === "") {
		return filterGamesByTypeLocal(type, sortOption, sortOrder);
	}

	// 使用增强搜索功能
	try {
		const games = getGames(sortOption, sortOrder);

		// 根据类型进行预筛选
		let baseGames = games;
		if (type === "clear") {
			// "clear" 现在表示"玩过"状态 (PlayStatus.PLAYED = 3)
			baseGames = games.filter((game) => game.clear === PlayStatus.PLAYED);
		}
		// type === 'online' 或 'all' 不需要额外筛选，因为浏览器环境中所有游戏都是在线的

		// 使用完整的增强搜索算法
		const searchResults = enhancedSearch(baseGames, keyword, {
			limit: 50,
			threshold: 0.6,
			enablePinyin: true,
		});

		// 提取搜索结果中的游戏数据
		return searchResults.map((result) => result.item);
	} catch (error) {
		console.error(
			"Enhanced search failed, falling back to basic search:",
			error,
		);

		// Fallback到原来的搜索逻辑
		const searchRegex = new RegExp(keyword.trim(), "i");
		const games = getGames(sortOption, sortOrder);
		let filteredGames = games.filter((game) => {
			const displayName = getGameDisplayName(game);
			return searchRegex.test(displayName);
		});

		if (type === "clear") {
			// "clear" 现在表示"玩过"状态 (PlayStatus.PLAYED = 3)
			filteredGames = filteredGames.filter(
				(game) => game.clear === PlayStatus.PLAYED,
			);
		}

		return filteredGames;
	}
}

export function filterGamesByTypeLocal(
	type: "all" | "local" | "online" | "noclear" | "clear",
	sortOption = "addtime",
	sortOrder: "asc" | "desc" = "asc",
): GameData[] {
	// 浏览器环境下简化处理:
	// - 'all': 返回所有游戏
	// - 'local': 在浏览器中无本地游戏，返回空数组
	// - 'online': 浏览器中所有游戏都是在线的，返回所有游戏
	// - 'clear': 返回已玩过的游戏 (PlayStatus.PLAYED)
	// - 'noclear': 返回未玩过的游戏 (非 PlayStatus.PLAYED)

	const games = getGames(sortOption, sortOrder);

	if (type === "all" || type === "online") {
		return games;
	}

	if (type === "noclear") {
		// "noclear" 表示非"玩过"状态
		return games.filter((game) => game.clear !== PlayStatus.PLAYED);
	}
	if (type === "clear") {
		// "clear" 表示"玩过"状态 (PlayStatus.PLAYED = 3)
		return games.filter((game) => game.clear === PlayStatus.PLAYED);
	}
	// 浏览器环境中没有本地游戏
	return [];
}
