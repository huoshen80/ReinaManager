/**
 * @file 全局状态管理
 * @description 使用 Zustand 管理应用全局状态，包括游戏列表、排序、筛选、BGM Token、搜索、UI 状态等，适配 Tauri 与 Web 环境。
 * @module src/store/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - useStore：Zustand 全局状态管理
 * - initializeStores：初始化全局状态
 *
 * 依赖：
 * - zustand
 * - zustand/middleware
 * - @/types
 * - @/utils/repository
 * - @/utils/localStorage
 * - @/utils/settingsConfig
 * - @tauri-apps/api/core
 * - @/store/gamePlayStore
 */

import { isTauri } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";
import i18next from "i18next";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getVirtualCategoryGames } from "@/hooks/common/useVirtualCollections";
import { collectionService, gameService, settingsService } from "@/services";
import type {
	Category,
	FullGameData,
	GameData,
	Group,
	InsertGameParams,
	LogLevel,
	UpdateGameParams,
} from "@/types";
import {
	applyNsfwFilter,
	getDisplayGameData,
	getDisplayGameDataList,
	getGameDisplayName,
} from "@/utils";
import { enhancedSearch } from "@/utils/enhancedSearch";
import {
	deleteGame as deleteGameLocal,
	filterGamesByTypeLocal,
	getBgmTokenLocal,
	getGameByIdLocal,
	getGames as getGamesLocal,
	insertGame as insertGameLocal,
	searchGamesLocal,
	setBgmTokenLocal,
} from "@/utils/localStorage";
import { initializeGamePlayTracking } from "./gamePlayStore";

/**
 * AppState 全局状态类型定义
 */
export interface AppState {
	updateSort(option: string, sortOrder: string): Promise<void>;

	// 游戏相关状态与方法
	fullGames: FullGameData[]; // 所有完整的游戏数据（包含关联表）
	games: GameData[]; // 当前显示的游戏列表（受筛选和排序影响）
	allGames: GameData[]; // 所有游戏的完整列表（不受筛选影响，供统计使用）
	loading: boolean;
	// BGM 令牌
	bgmToken: string;
	// UI 状态
	selectedGameId: number | null;
	selectedGame: GameData | null;
	addModalOpen: boolean;
	addModalPath: string;

	// 日志级别（运行时，不持久化）
	logLevel: LogLevel;
	setLogLevel: (level: LogLevel) => void;

	// 排序选项
	sortOption: string;
	sortOrder: "asc" | "desc";

	// 关闭应用时的提醒设置，skip=不再提醒，行为为 'hide' 或 'close'
	skipCloseRemind: boolean;
	defaultCloseAction: "hide" | "close";
	// 设置不再提醒及默认关闭行为
	setSkipCloseRemind: (skip: boolean) => void;
	setDefaultCloseAction: (action: "hide" | "close") => void;

	// 游戏操作方法
	fetchGames: (
		sortOption?: string,
		sortOrder?: "asc" | "desc",
		resetSearch?: boolean,
	) => Promise<void>;
	fetchGame: (id: number) => Promise<void>;
	addGame: (gameParams: InsertGameParams) => Promise<void>;
	deleteGame: (gameId: number) => Promise<void>;
	getGameById: (gameId: number) => Promise<GameData>;
	updateGame: (id: number, gameUpdates: UpdateGameParams) => Promise<void>;

	// BGM 令牌方法
	fetchBgmToken: () => Promise<void>;
	setBgmToken: (token: string) => Promise<void>;

	// UI 操作方法
	setSelectedGameId: (id: number | null | undefined) => void;
	setSelectedGame: (game: GameData | null) => void;
	openAddModal: (path?: string) => void;
	closeAddModal: () => void;
	setAddModalPath: (path: string) => void;

	// 初始化
	initialize: () => Promise<void>;

	// 搜索相关
	searchKeyword: string;
	setSearchKeyword: (keyword: string) => void;

	// 通用刷新方法
	refreshGameData: (
		customSortOption?: string,
		customSortOrder?: "asc" | "desc",
	) => Promise<void>;

	// 筛选相关
	gameFilterType: "all" | "local" | "online" | "noclear" | "clear";
	setGameFilterType: (
		type: "all" | "local" | "online" | "noclear" | "clear",
	) => void;
	isLocalGame: (gameId: number) => boolean;

	// 数据来源选择
	apiSource: "bgm" | "vndb" | "ymgal" | "mixed";
	setApiSource: (source: "bgm" | "vndb" | "ymgal" | "mixed") => void;

	// NSFW相关
	nsfwFilter: boolean;
	setNsfwFilter: (enabled: boolean) => Promise<void>;
	nsfwCoverReplace: boolean;
	setNsfwCoverReplace: (enabled: boolean) => void;

	// 卡片交互模式
	cardClickMode: "navigate" | "select";
	setCardClickMode: (mode: "navigate" | "select") => void;

	// 双击启动游戏功能
	doubleClickLaunch: boolean;
	setDoubleClickLaunch: (enabled: boolean) => void;

	// 长按启动游戏功能
	longPressLaunch: boolean;
	setLongPressLaunch: (enabled: boolean) => void;

	// TAG翻译功能
	tagTranslation: boolean;
	setTagTranslation: (enabled: boolean) => void;

	// 剧透等级
	spoilerLevel: number;
	setSpoilerLevel: (level: number) => void;

	// 计时模式：playtime = 真实游戏时间（仅活跃时），elapsed = 游戏启动时间（从启动到结束）
	timeTrackingMode: "playtime" | "elapsed";
	setTimeTrackingMode: (mode: "playtime" | "elapsed") => void;

	// 前端名称排序
	sortGamesByName: (games: GameData[], order: "asc" | "desc") => GameData[];

	// 更新游戏状态 (PlayStatus 1-5)
	updateGamePlayStatusInStore: (
		gameId: number,
		newStatus: number,
		skipRefresh?: boolean,
	) => void;

	// 更新窗口状态管理
	showUpdateModal: boolean;
	pendingUpdate: Update | null;
	setShowUpdateModal: (show: boolean) => void;
	setPendingUpdate: (update: Update | null) => void;
	triggerUpdateModal: (update: Update) => void;

	// 分组分类相关状态与方法
	groups: Group[]; // 所有分组（包括默认分组和自定义分组）
	currentGroupId: string | null; // 当前选中的分组ID
	currentCategories: Category[]; // 当前分组下的分类列表（带游戏数量）
	categoryGames: GameData[]; // 当前分类下的游戏列表
	selectedCategoryId: number | null; // 当前选中的分类ID
	selectedCategoryName: string | null; // 当前选中的分类名称
	// 分类游戏ID缓存（仅真实分类，虚拟分类从 allGames 派生）
	categoryGamesCache: Record<number, number[]>; // key: categoryId, value: gameIds

	// 分组操作方法
	fetchGroups: () => Promise<void>; // 获取所有分组
	setCurrentGroup: (groupId: string | null) => void; // 设置当前分组
	fetchCategoriesByGroup: (groupId: string) => Promise<void>; // 获取指定分组下的分类
	fetchGamesByCategory: (
		categoryId: number,
		categoryName?: string,
	) => Promise<void>; // 获取指定分类下的游戏
	setSelectedCategory: (
		categoryId: number | null,
		categoryName?: string,
	) => void; // 设置当前选中的分类

	// 分类 CRUD 操作
	createGroup: (name: string, icon?: string) => Promise<void>; // 创建分组
	createCategory: (
		name: string,
		groupId: number,
		icon?: string,
	) => Promise<void>; // 创建分类
	deleteGroup: (groupId: number) => Promise<void>; // 删除分组
	deleteCategory: (categoryId: number) => Promise<void>; // 删除分类
	updateGroup: (
		groupId: number,
		updates: { name?: string; icon?: string },
	) => Promise<void>; // 更新分组
	updateCategory: (
		categoryId: number,
		updates: { name?: string; icon?: string },
	) => Promise<void>; // 更新分类
	renameGroup: (groupId: number, newName: string) => Promise<void>; // 重命名分组
	renameCategory: (categoryId: number, newName: string) => Promise<void>; // 重命名分类

	// 游戏-分类关联操作
	addGameToCategory: (gameId: number, categoryId: number) => Promise<void>; // 添加游戏到分类
	removeGameFromCategory: (gameId: number, categoryId: number) => Promise<void>; // 从分类移除游戏
	updateCategoryGames: (gameIds: number[], categoryId: number) => Promise<void>; // 批量更新分类中的游戏列表
}

// 创建持久化的全局状态
export const useStore = create<AppState>()(
	persist(
		(set, get) => ({
			// 游戏相关状态
			fullGames: [], // 所有完整的游戏数据（包含关联表）
			games: [], // 当前显示的游戏列表（受筛选和排序影响）
			allGames: [], // 所有游戏的完整列表（不受筛选影响，供统计使用）
			loading: false,

			// BGM 令牌
			bgmToken: "",

			// UI 状态
			selectedGameId: null,
			selectedGame: null,
			addModalOpen: false,
			addModalPath: "",

			searchKeyword: "",

			gameFilterType: "all",

			// 日志级别（运行时，不持久化）
			logLevel: "error",
			setLogLevel: (level: LogLevel) => set({ logLevel: level }),

			// 排序选项默认值
			sortOption: "addtime",
			sortOrder: "asc",

			// 关闭应用时的提醒设置，skip=不再提醒，行为为 'hide' 或 'close'
			skipCloseRemind: false,
			defaultCloseAction: "hide",
			// Setter: 不再提醒和默认关闭行为
			setSkipCloseRemind: (skip: boolean) => set({ skipCloseRemind: skip }),
			setDefaultCloseAction: (action: "hide" | "close") =>
				set({ defaultCloseAction: action }),

			// 数据来源选择
			apiSource: "vndb",
			setApiSource: (source: "bgm" | "vndb" | "ymgal" | "mixed") => {
				set({ apiSource: source });
			},

			openAddModal: (path?: string) => {
				const nextPath = path ?? get().addModalPath;
				const { addModalOpen, addModalPath } = get();
				if (addModalOpen && addModalPath === nextPath) return;
				set({ addModalOpen: true, addModalPath: nextPath });
			},
			closeAddModal: () => {
				set({ addModalOpen: false });
			},
			setAddModalPath: (path: string) => {
				set({ addModalPath: path });
			},

			// NSFW相关
			nsfwFilter: false,
			setNsfwFilter: async (enabled: boolean) => {
				set({ nsfwFilter: enabled });

				// 如果当前在分类页面，刷新 categoryGames 以应用新的 NSFW 筛选
				const { selectedCategoryId, selectedCategoryName } = get();
				if (selectedCategoryId !== null) {
					await get().fetchGamesByCategory(
						selectedCategoryId,
						selectedCategoryName || undefined,
					);
				}
			},
			nsfwCoverReplace: false,
			setNsfwCoverReplace: (enabled: boolean) => {
				set({ nsfwCoverReplace: enabled });
			},

			// 卡片交互模式
			cardClickMode: "navigate",
			setCardClickMode: (mode: "navigate" | "select") => {
				set({ cardClickMode: mode });
			},

			// 双击启动游戏功能
			doubleClickLaunch: false,
			setDoubleClickLaunch: (enabled: boolean) => {
				set({ doubleClickLaunch: enabled });
			},

			// 长按启动游戏功能
			longPressLaunch: false,
			setLongPressLaunch: (enabled: boolean) => {
				set({ longPressLaunch: enabled });
			},

			// TAG翻译功能（默认关闭）
			tagTranslation: false,
			setTagTranslation: (enabled: boolean) => {
				set({ tagTranslation: enabled });
			},

			// 剧透等级
			spoilerLevel: 0,
			setSpoilerLevel: (level: number) => {
				set({ spoilerLevel: level });
			},

			// 计时模式：默认使用活跃时间（真实游戏时间）
			timeTrackingMode: "playtime",
			setTimeTrackingMode: (mode: "playtime" | "elapsed") => {
				set({ timeTrackingMode: mode });
			},

			/**
			 * 前端名称排序辅助函数
			 * 使用与 dataTransform 相同的名称优先级
			 * 优先级: custom_name > name_cn (中文环境) > name
			 */
			sortGamesByName: (
				games: GameData[],
				order: "asc" | "desc",
			): GameData[] => {
				const currentLanguage = i18next.language;

				return [...games].sort((a, b) => {
					// 直接使用 getGameDisplayName 获取显示名称，确保逻辑一致
					const nameA = getGameDisplayName(a, currentLanguage).toLowerCase();
					const nameB = getGameDisplayName(b, currentLanguage).toLowerCase();

					// 使用 localeCompare 进行本地化排序（支持中文、日文等）
					const comparison = nameA.localeCompare(nameB, currentLanguage, {
						numeric: true,
						sensitivity: "base",
					});

					return order === "asc" ? comparison : -comparison;
				});
			}, // 通用刷新函数，统一处理搜索、筛选、排序、NSFW筛选
			refreshGameData: async (
				customSortOption?: string,
				customSortOrder?: "asc" | "desc",
			) => {
				set({ loading: true });

				try {
					const { searchKeyword, gameFilterType, nsfwFilter } = get();
					const option = customSortOption || get().sortOption;
					const order = customSortOrder || get().sortOrder;

					let data: GameData[];
					let allData: GameData[];

					if (isTauri()) {
						// 名称排序在前端处理，后端按添加时间获取
						const backendSortOption =
							option === "namesort" ? "addtime" : option;
						const backendSortOrder = option === "namesort" ? "asc" : order;

						// 优化：如果 gameFilterType 是 "all"，只请求一次
						if (gameFilterType === "all") {
							const fullGames = await gameService.getAllGames(
								"all",
								backendSortOption,
								backendSortOrder,
							);
							const baseData = getDisplayGameDataList(
								fullGames,
								i18next.language,
							);

							// allData 保持完整数据（不筛选），用于统计和管理
							allData = baseData;

							// 显示数据需要排序和筛选
							let displayData =
								option === "namesort"
									? get().sortGamesByName(baseData, order)
									: baseData;

							displayData = applyNsfwFilter(displayData, nsfwFilter);

							// 搜索处理
							if (searchKeyword && searchKeyword.trim() !== "") {
								const searchResults = enhancedSearch(
									displayData,
									searchKeyword,
								);
								data = searchResults.map((result) => result.item);
							} else {
								data = displayData;
							}
						} else {
							// 需要两次请求：一次获取筛选数据，一次获取全部
							const fullGames = await gameService.getAllGames(
								gameFilterType,
								backendSortOption,
								backendSortOrder,
							);
							let baseData = getDisplayGameDataList(
								fullGames,
								i18next.language,
							);

							if (option === "namesort") {
								baseData = get().sortGamesByName(baseData, order);
							}

							baseData = applyNsfwFilter(baseData, nsfwFilter);

							if (searchKeyword && searchKeyword.trim() !== "") {
								const searchResults = enhancedSearch(baseData, searchKeyword);
								data = searchResults.map((result) => result.item);
							} else {
								data = baseData;
							}

							// 第二次请求获取全部游戏
							const allFullGames = await gameService.getAllGames();
							allData = getDisplayGameDataList(allFullGames, i18next.language);
						}
					} else {
						// Web 环境逻辑保持不变
						let baseData =
							gameFilterType !== "all"
								? filterGamesByTypeLocal(gameFilterType, option, order)
								: getGamesLocal(option, order);

						baseData = applyNsfwFilter(baseData, nsfwFilter);

						if (searchKeyword && searchKeyword.trim() !== "") {
							data = searchGamesLocal(
								searchKeyword,
								gameFilterType,
								option,
								order,
							);
							data = applyNsfwFilter(data, nsfwFilter);
						} else {
							data = baseData;
						}

						allData = getGamesLocal("addtime", "asc");
					}

					// 一次性设置数据和状态
					set({ games: data, allGames: allData, loading: false });
				} catch (error) {
					console.error("刷新游戏数据失败:", error);
					set({ loading: false });
				}
			},

			// 修改 fetchGames 方法，添加覆盖 searchKeyword 的选项
			fetchGames: async (
				sortOption?: string,
				sortOrder?: "asc" | "desc",
				resetSearch?: boolean,
			) => {
				set({ loading: true });
				try {
					const option = sortOption || get().sortOption;
					const order = sortOrder || get().sortOrder;

					let data: GameData[];
					let allData: GameData[];

					if (isTauri()) {
						// 名称排序在前端处理，后端按添加时间获取
						const backendSortOption =
							option === "namesort" ? "addtime" : option;
						const backendSortOrder = option === "namesort" ? "asc" : order;

						// 只调用一次，获取所有游戏
						const fullGames = await gameService.getAllGames(
							"all",
							backendSortOption,
							backendSortOrder,
						);

						// 转换为显示数据
						const displayData = getDisplayGameDataList(
							fullGames,
							i18next.language,
						);

						// data 使用排序后的数据
						data =
							option === "namesort"
								? get().sortGamesByName(displayData, order)
								: displayData;

						// allData 直接复用，不需要第二次请求
						allData = displayData;
					} else {
						data = getGamesLocal(option, order);
						allData = getGamesLocal("addtime", "asc");
					}

					// 应用nsfw筛选
					const { nsfwFilter } = get();
					data = applyNsfwFilter(data, nsfwFilter);

					// 只有在明确指定 resetSearch=true 时才重置搜索关键字
					if (resetSearch) {
						set({ games: data, allGames: allData, searchKeyword: "" });
					} else {
						set({ games: data, allGames: allData });
					}
				} catch (error) {
					console.error("获取游戏数据失败", error);
					set({ games: [], allGames: [] });
				} finally {
					set({ loading: false });
				}
			},
			fetchGame: async (id: number) => {
				set({ loading: true });
				try {
					if (isTauri()) {
						// 从后端获取完整游戏数据(包含 BGM/VNDB/Other 数据)
						const fullGameData = await gameService.getGameById(id);

						if (fullGameData) {
							// 转换为展平的 GameData
							const displayGame = getDisplayGameData(
								fullGameData,
								i18next.language,
							);
							set({ selectedGame: displayGame });
						} else {
							console.warn(`Game with ID ${id} not found`);
						}
					} else {
						// Web 环境下使用本地存储
						const game = getGameByIdLocal(id);
						if (game) {
							set({ selectedGame: game });
						} else {
							console.warn(`Game with ID ${id} not found`);
						}
					}
				} catch (error) {
					console.error("获取游戏数据失败:", error);
				} finally {
					set({ loading: false });
				}
			},

			// 使用通用函数简化 addGame
			addGame: async (gameParams: InsertGameParams) => {
				try {
					if (isTauri()) {
						// 确保 id_type 有值
						const gameToInsert = {
							...gameParams,
							id_type: gameParams.id_type || "custom",
						};
						await gameService.insertGame(gameToInsert);
					} else {
						insertGameLocal(gameParams);
					}
					// 使用通用刷新函数
					await get().refreshGameData();
				} catch (error) {
					console.error("Error adding game:", error);
				}
			},

			// 使用通用函数简化 deleteGame
			deleteGame: async (gameId: number): Promise<void> => {
				try {
					if (isTauri()) {
						await gameService.deleteGame(gameId);
					} else {
						deleteGameLocal(gameId);
					}
					// 使用通用刷新函数
					await get().refreshGameData();
					get().setSelectedGameId(null);

					// 如果当前在分类页面，也需要刷新 categoryGames 和 currentCategories
					const {
						selectedCategoryId,
						selectedCategoryName,
						currentGroupId,
						categoryGamesCache,
					} = get();
					if (selectedCategoryId !== null) {
						// 更新缓存：从缓存中移除被删除的游戏
						if (
							selectedCategoryId > 0 &&
							categoryGamesCache[selectedCategoryId]
						) {
							const updatedCache = categoryGamesCache[
								selectedCategoryId
							].filter((id) => id !== gameId);
							set((state) => ({
								categoryGamesCache: {
									...state.categoryGamesCache,
									[selectedCategoryId]: updatedCache,
								},
								// 同时更新 currentCategories 中对应分类的 game_count
								currentCategories: state.currentCategories.map((cat) =>
									cat.id === selectedCategoryId
										? { ...cat, game_count: updatedCache.length }
										: cat,
								),
							}));
						}

						await get().fetchGamesByCategory(
							selectedCategoryId,
							selectedCategoryName || undefined,
						);
					}

					// 如果当前在分组页面（查看分类列表），刷新分类列表以更新游戏数量
					if (currentGroupId && selectedCategoryId === null) {
						await get().fetchCategoriesByGroup(currentGroupId);
					}
				} catch (error) {
					console.error("删除游戏数据失败:", error);
				}
			},

			getGameById: async (gameId: number): Promise<GameData> => {
				if (isTauri()) {
					const fullData = await gameService.getGameById(gameId);
					const game = fullData
						? getDisplayGameData(fullData, i18next.language)
						: null;
					if (game === null) {
						throw new Error(`Game with ID ${gameId} not found`);
					}
					return game;
				}
				return await Promise.resolve(getGameByIdLocal(gameId));
			},

			updateGame: async (id: number, gameUpdates: UpdateGameParams) => {
				try {
					if (isTauri()) {
						await gameService.updateGame(id, gameUpdates);
						// gameUpdates 的键会在下面被遍历，直接使用 gameUpdates 而不是解构未使用的变量
						// 只有当更新的字段可能影响游戏列表显示时才刷新列表
						// 游戏设置类字段（如 savepath, autosave）不需要刷新列表
						// 注意：localpath 字段虽然不影响列表显示，但会影响 isLocalGame 判断，因此需要刷新
						const listAffectingFields = [
							"name",
							"developer",
							"date",
							"score",
							"rank",
							"tags",
							"localpath", // 添加 localpath，确保更新后 allGames 也同步更新
							"custom_data", // 自定义数据可能影响封面和名称
						]; // 将 gameUpdates 展开为一组字段名（支持一层嵌套：game / bgm_data / vndb_data / custom_data）
						const updatedFieldNames = new Set<string>();

						// 如果外层直接包含字段
						Object.keys(gameUpdates).forEach((key) => {
							const value = gameUpdates[key as keyof UpdateGameParams];
							if (value && typeof value === "object" && !Array.isArray(value)) {
								// 展开一层嵌套的字段名
								Object.keys(value).forEach((subKey) => {
									updatedFieldNames.add(subKey);
								});
							} else {
								updatedFieldNames.add(key);
							}
						});

						// 检查是否有任一影响显示的字段被更新
						const shouldRefreshList = Array.from(updatedFieldNames).some(
							(field) => listAffectingFields.includes(field),
						);

						// 更新当前选中的游戏数据
						await get().fetchGame(id);

						// 如果更新的字段影响列表显示或游戏可用性，刷新游戏列表
						if (shouldRefreshList) {
							await get().refreshGameData();
						}
					} else {
						console.warn(
							"updateGameLocal is not implemented for browser environment.",
						);
					}
				} catch (error) {
					console.error("更新游戏数据失败:", error);
					throw error;
				}
			},

			setSearchKeyword: (keyword: string) => {
				set({ searchKeyword: keyword });
				get().refreshGameData();
			},

			// 排序更新函数：设置排序选项，然后调用 refreshGameData 统一处理
			updateSort: async (option: string, order: "asc" | "desc") => {
				const prevOption = get().sortOption;
				const prevOrder = get().sortOrder;

				// 如果排序选项和顺序都没变，不做任何操作
				if (prevOption === option && prevOrder === order) return;

				// 设置排序选项
				set({
					sortOption: option,
					sortOrder: order,
				});

				// 调用统一的刷新函数，会自动应用当前的搜索、筛选和排序
				await get().refreshGameData();
			},

			// BGM 令牌方法
			fetchBgmToken: async () => {
				try {
					let token = "";
					if (isTauri()) {
						token = await settingsService.getBgmToken();
					} else {
						token = getBgmTokenLocal();
					}
					set({ bgmToken: token });
				} catch (error) {
					console.error("Error fetching BGM token:", error);
				}
			},

			setBgmToken: async (token: string) => {
				try {
					if (isTauri()) {
						await settingsService.setBgmToken(token);
					} else {
						setBgmTokenLocal(token);
					}
					set({ bgmToken: token });
				} catch (error) {
					console.error("Error setting BGM token:", error);
				}
			},

			// UI 操作方法
			setSelectedGameId: (id: number | null | undefined) => {
				set({ selectedGameId: id });
			},
			setSelectedGame: (game: GameData | null) => {
				set({ selectedGame: game });
			},

			// 筛选类型设置函数：设置筛选类型，然后调用 refreshGameData 统一处理
			setGameFilterType: async (
				type: "all" | "local" | "online" | "noclear" | "clear",
			) => {
				const prevType = get().gameFilterType;

				// 如果类型没变，不做任何操作
				if (prevType === type) return;

				// 设置新的筛选类型
				set({ gameFilterType: type });

				// 调用统一的刷新函数，会自动应用当前的搜索、筛选和排序
				await get().refreshGameData();
			},
			isLocalGame(gameId: number): boolean {
				const allGames = useStore.getState().allGames;
				const game = allGames.find((g) => g.id === gameId);
				if (!game || !game.localpath) {
					return false;
				}
				return game.localpath.trim() !== "";
			},

			// 更新games数组中特定游戏的状态 (PlayStatus 1-5)
			updateGamePlayStatusInStore: async (
				gameId: number,
				newStatus: number,
				skipRefresh?: boolean,
			) => {
				const { games, allGames } = get();

				// 更新当前显示的游戏列表
				const updatedGames = games.map((game) =>
					game.id === gameId ? { ...game, clear: newStatus } : game,
				);

				// 更新完整的游戏列表
				const updatedAllGames = allGames.map((game) =>
					game.id === gameId ? { ...game, clear: newStatus } : game,
				);

				set({ games: updatedGames, allGames: updatedAllGames });

				// 只有在不跳过刷新时才调用 refreshGameData
				if (!skipRefresh) {
					await get().refreshGameData();
				}

				// 如果当前在分类页面，也需要刷新 categoryGames
				const { selectedCategoryId, selectedCategoryName } = get();
				if (selectedCategoryId !== null) {
					await get().fetchGamesByCategory(
						selectedCategoryId,
						selectedCategoryName || undefined,
					);
				}
			},

			// 更新窗口状态管理
			showUpdateModal: false,
			pendingUpdate: null,
			setShowUpdateModal: (show: boolean) => {
				set({ showUpdateModal: show });
			},
			setPendingUpdate: (update: Update | null) => {
				set({ pendingUpdate: update });
			},
			triggerUpdateModal: (update: Update) => {
				set({
					pendingUpdate: update,
					showUpdateModal: true,
				});
			},

			// 分组分类相关状态初始值
			groups: [],
			currentGroupId: null,
			currentCategories: [],
			categoryGames: [],
			selectedCategoryId: null,
			selectedCategoryName: null, // 仅用于虚拟分类（开发商分类）的名称存储
			categoryGamesCache: {}, // 分类游戏ID缓存

			// 获取所有分组（包括默认分组和自定义分组）
			fetchGroups: async () => {
				try {
					if (!isTauri()) {
						console.warn("fetchGroups: Web environment not supported");
						return;
					}

					const groups = await collectionService.getGroups();
					set({ groups });
				} catch (error) {
					console.error("Failed to fetch groups:", error);
				}
			},

			// 设置当前分组
			setCurrentGroup: (groupId: string | null) => {
				set({
					currentGroupId: groupId,
					currentCategories: [],
					categoryGames: [],
				});
				if (groupId) {
					get().fetchCategoriesByGroup(groupId);
				}
			},

			// 获取指定分组下的分类
			fetchCategoriesByGroup: async (groupId: string) => {
				try {
					if (!isTauri()) {
						console.warn(
							"fetchCategoriesByGroup: Web environment not supported",
						);
						return;
					}

					// 如果是默认分组，不需要从数据库查询
					// 默认分组（DEVELOPER、PLAY_STATUS）由前端动态生成
					if (groupId.startsWith("default_")) {
						set({ currentCategories: [] });
						return;
					}

					// 自定义分组直接从数据库查询
					const groupIdNum = Number.parseInt(groupId, 10);
					if (Number.isNaN(groupIdNum)) {
						console.error("Invalid group ID:", groupId);
						return;
					}

					const categories =
						await collectionService.getCategoriesWithCount(groupIdNum);
					set({ currentCategories: categories });
				} catch (error) {
					console.error("Failed to fetch categories:", error);
				}
			},

			// 获取指定分类下的游戏
			fetchGamesByCategory: async (
				categoryId: number,
				categoryName?: string,
			) => {
				try {
					if (!isTauri()) {
						console.warn("fetchGamesByCategory: Web environment not supported");
						return;
					}

					let gameDataList: GameData[];
					const allGames = get().allGames;

					// 处理虚拟分类（负数ID）- 使用提取的工具函数
					if (categoryId < 0) {
						gameDataList = getVirtualCategoryGames(
							categoryId,
							categoryName || null,
							allGames,
							(key: string) => i18next.t(key),
						);
					} else {
						// 真实分类（正数ID），使用 store 缓存优化
						const cache = get().categoryGamesCache;
						const cachedGameIds = cache[categoryId];

						let gameIds: number[];
						if (cachedGameIds) {
							gameIds = cachedGameIds;
						} else {
							// 缓存缺失，重新获取
							gameIds =
								await collectionService.getGamesInCollection(categoryId);

							// 更新 store 缓存
							set((state) => ({
								categoryGamesCache: {
									...state.categoryGamesCache,
									[categoryId]: gameIds,
								},
							}));
						}

						// 按照 gameIds 的顺序从 allGames 中获取游戏（保持排序）
						gameDataList = gameIds
							.map((id) => allGames.find((game) => game.id === id))
							.filter((game): game is GameData => !!game);
					} // 应用NSFW筛选
					const filteredGames = applyNsfwFilter(gameDataList, get().nsfwFilter);
					// 只在首次设置时更新 selectedCategoryId 和 selectedCategoryName
					// 后续调用 fetchGamesByCategory 只更新 categoryGames，避免覆盖名称
					// setSelectedCategory 会先行设置这两个字段，fetchGamesByCategory 只需要加载游戏

					set({
						categoryGames: filteredGames,
					});
				} catch (error) {
					console.error("Failed to fetch games by category:", error);
				}
			},

			// 设置当前选中的分类
			setSelectedCategory: (
				categoryId: number | null,
				categoryName?: string,
			) => {
				set({
					selectedCategoryId: categoryId,
					selectedCategoryName: categoryName || null,
				});
				if (categoryId) {
					get().fetchGamesByCategory(categoryId, categoryName);
				} else {
					set({ categoryGames: [] });
				}
			},

			// 创建分组
			createGroup: async (name: string, icon?: string) => {
				try {
					if (!isTauri()) {
						console.warn("createGroup: Web environment not supported");
						return;
					}

					await collectionService.createCollection(name, null, 0, icon || null);
					// 刷新分组列表
					await get().fetchGroups();
				} catch (error) {
					console.error("Failed to create group:", error);
				}
			},

			// 创建分类
			createCategory: async (name: string, groupId: number, icon?: string) => {
				try {
					if (!isTauri()) {
						console.warn("createCategory: Web environment not supported");
						return;
					}

					await collectionService.createCollection(
						name,
						groupId,
						0,
						icon || null,
					);
					// 刷新当前分组的分类列表
					await get().fetchCategoriesByGroup(groupId.toString());
				} catch (error) {
					console.error("Failed to create category:", error);
				}
			},

			// 删除分组
			deleteGroup: async (groupId: number) => {
				try {
					if (!isTauri()) {
						console.warn("deleteGroup: Web environment not supported");
						return;
					}

					await collectionService.deleteCollection(groupId);
					// 分组删除，清空所有缓存
					set({ categoryGamesCache: {} });
					// 刷新分组列表
					await get().fetchGroups();
					// 如果删除的是当前分组，清空当前分组
					if (get().currentGroupId === groupId.toString()) {
						set({ currentGroupId: null, currentCategories: [] });
					}
				} catch (error) {
					console.error("Failed to delete group:", error);
				}
			},

			// 删除分类
			deleteCategory: async (categoryId: number) => {
				try {
					if (!isTauri()) {
						console.warn("deleteCategory: Web environment not supported");
						return;
					}

					await collectionService.deleteCollection(categoryId);
					// 分类删除，清理该分类缓存
					set((state) => {
						const newCache = { ...state.categoryGamesCache };
						delete newCache[categoryId];
						return { categoryGamesCache: newCache };
					});
					// 刷新当前分组的分类列表
					const currentGroupId = get().currentGroupId;
					if (currentGroupId) {
						await get().fetchCategoriesByGroup(currentGroupId);
					}
					// 如果删除的是当前分类，清空当前分类
					if (get().selectedCategoryId === categoryId) {
						set({
							selectedCategoryId: null,
							categoryGames: [],
							selectedCategoryName: null,
						});
					}
				} catch (error) {
					console.error("Failed to delete category:", error);
				}
			},

			// 更新分组
			updateGroup: async (
				groupId: number,
				updates: { name?: string; icon?: string },
			) => {
				try {
					if (!isTauri()) {
						console.warn("updateGroup: Web environment not supported");
						return;
					}

					await collectionService.updateCollection(
						groupId,
						updates.name,
						undefined,
						undefined,
						updates.icon,
					);
					// 刷新分组列表
					await get().fetchGroups();
				} catch (error) {
					console.error("Failed to update group:", error);
				}
			},

			// 更新分类
			updateCategory: async (
				categoryId: number,
				updates: { name?: string; icon?: string },
			) => {
				try {
					if (!isTauri()) {
						console.warn("updateCategory: Web environment not supported");
						return;
					}

					await collectionService.updateCollection(
						categoryId,
						updates.name,
						undefined,
						undefined,
						updates.icon,
					);
					// 刷新当前分组的分类列表
					const currentGroupId = get().currentGroupId;
					if (currentGroupId) {
						await get().fetchCategoriesByGroup(currentGroupId);
					}
				} catch (error) {
					console.error("Failed to update category:", error);
				}
			},

			// 重命名分组（基于 updateGroup 的简化版本）
			renameGroup: async (groupId: number, newName: string) => {
				try {
					if (!isTauri()) {
						console.warn("renameGroup: Web environment not supported");
						return;
					}

					await collectionService.updateCollection(
						groupId,
						newName,
						undefined,
						undefined,
						undefined,
					);
					// 刷新分组列表
					await get().fetchGroups();
				} catch (error) {
					console.error("Failed to rename group:", error);
				}
			},

			// 重命名分类（基于 updateCategory 的简化版本）
			renameCategory: async (categoryId: number, newName: string) => {
				try {
					if (!isTauri()) {
						console.warn("renameCategory: Web environment not supported");
						return;
					}

					await collectionService.updateCollection(
						categoryId,
						newName,
						undefined,
						undefined,
						undefined,
					);
					// 刷新当前分组的分类列表
					const currentGroupId = get().currentGroupId;
					if (currentGroupId) {
						await get().fetchCategoriesByGroup(currentGroupId);
					}
				} catch (error) {
					console.error("Failed to rename category:", error);
				}
			},

			// 添加游戏到分类（保留单个添加，供向后兼容）
			addGameToCategory: async (gameId: number, categoryId: number) => {
				try {
					if (!isTauri()) {
						console.warn("addGameToCategory: Web environment not supported");
						return;
					}

					await collectionService.addGameToCollection(gameId, categoryId);
					// 更新关联后清理该分类缓存
					set((state) => {
						const newCache = { ...state.categoryGamesCache };
						delete newCache[categoryId];
						return { categoryGamesCache: newCache };
					});
					// 如果当前选中的是这个分类，刷新游戏列表
					if (get().selectedCategoryId === categoryId) {
						await get().fetchGamesByCategory(categoryId);
					}
					// 刷新当前分组的分类列表（更新游戏数量）
					const currentGroupId = get().currentGroupId;
					if (currentGroupId) {
						await get().fetchCategoriesByGroup(currentGroupId);
					}
				} catch (error) {
					console.error("Failed to add game to category:", error);
				}
			},

			// 从分类移除游戏（保留单个删除，供向后兼容）
			removeGameFromCategory: async (gameId: number, categoryId: number) => {
				try {
					if (!isTauri()) {
						console.warn(
							"removeGameFromCategory: Web environment not supported",
						);
						return;
					}

					await collectionService.removeGameFromCollection(gameId, categoryId);
					// 更新关联后清理该分类缓存
					set((state) => {
						const newCache = { ...state.categoryGamesCache };
						delete newCache[categoryId];
						return { categoryGamesCache: newCache };
					});
					// 如果当前选中的是这个分类，刷新游戏列表
					if (get().selectedCategoryId === categoryId) {
						await get().fetchGamesByCategory(categoryId);
					}
					// 刷新当前分组的分类列表（更新游戏数量）
					const currentGroupId = get().currentGroupId;
					if (currentGroupId) {
						await get().fetchCategoriesByGroup(currentGroupId);
					}
				} catch (error) {
					console.error("Failed to remove game from category:", error);
				}
			},

			// 批量更新分类中的游戏列表
			updateCategoryGames: async (gameIds: number[], categoryId: number) => {
				try {
					if (!isTauri()) {
						console.warn("updateCategoryGames: Web environment not supported");
						return;
					}

					// 1. 乐观更新：先更新前端状态，防止列表闪烁
					const { allGames, nsfwFilter, currentCategories } = get();
					// 根据 ID 列表重新排序当前分类的游戏
					const newOrderGames = gameIds
						.map((id) => allGames.find((g) => g.id === id))
						.filter((g): g is GameData => !!g);

					// 应用 NSFW 筛选
					const filteredGames = applyNsfwFilter(newOrderGames, nsfwFilter);

					// 同时更新 currentCategories 中对应分类的 game_count
					const updatedCategories = currentCategories.map((cat) =>
						cat.id === categoryId
							? { ...cat, game_count: gameIds.length }
							: cat,
					);

					// 立即更新状态
					set((state) => ({
						categoryGames: filteredGames,
						categoryGamesCache: {
							...state.categoryGamesCache,
							[categoryId]: gameIds,
						},
						currentCategories: updatedCategories,
					}));

					// 2. 后台异步更新数据库
					await collectionService.updateCategoryGames(gameIds, categoryId);
				} catch (error) {
					console.error("Failed to update category games:", error);
					// 更新失败，回滚状态（重新获取）
					await get().fetchGamesByCategory(categoryId);
					// 同时刷新分类列表以恢复正确的 game_count
					const currentGroupId = get().currentGroupId;
					if (currentGroupId) {
						await get().fetchCategoriesByGroup(currentGroupId);
					}
					throw error;
				}
			},

			// 初始化方法，先初始化数据库，然后加载所有需要的数据
			initialize: async () => {
				// 然后并行加载其他数据
				await Promise.all([
					get().fetchGames(),
					get().fetchBgmToken(),
					get().fetchGroups(),
				]);

				// 初始化游戏时间跟踪
				if (isTauri()) {
					initializeGamePlayTracking();
				}
			},
		}),
		{
			name: "reina-manager-store",
			// 可选：定义哪些字段需要持久化存储
			partialize: (state) => ({
				// 排序偏好
				sortOption: state.sortOption,
				sortOrder: state.sortOrder,
				// 筛选偏好
				gameFilterType: state.gameFilterType,
				// 关闭应用相关
				skipCloseRemind: state.skipCloseRemind,
				defaultCloseAction: state.defaultCloseAction,
				// 数据来源选择
				apiSource: state.apiSource,
				// nsfw相关
				nsfwFilter: state.nsfwFilter,
				nsfwCoverReplace: state.nsfwCoverReplace,
				// 卡片点击模式
				cardClickMode: state.cardClickMode,
				doubleClickLaunch: state.doubleClickLaunch,
				longPressLaunch: state.longPressLaunch,
				// VNDB标签翻译
				tagTranslation: state.tagTranslation,
				// 剧透等级
				spoilerLevel: state.spoilerLevel,
				// 计时模式：playtime 或 elapsed
				timeTrackingMode: state.timeTrackingMode,
				// 分组分类相关（优化存储）
				currentGroupId: state.currentGroupId,
				selectedCategoryId: state.selectedCategoryId,
				// selectedCategoryName 只用于开发商分类，页面刷新时会重新获取
				selectedCategoryName: state.selectedCategoryName,
			}),
		},
	),
);

/**
 * initializeStores
 * 初始化全局状态，加载游戏数据与 BGM Token，并初始化游戏时间跟踪（Tauri 环境下）。
 */
export const initializeStores = async (): Promise<void> => {
	await useStore.getState().initialize();
};
