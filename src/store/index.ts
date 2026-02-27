/**
 * @file 全局状态管理
 * @description 使用 Zustand 管理应用全局状态，包括游戏列表、排序、筛选、搜索、UI 状态等，适配 Tauri 与 Web 环境。
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
 * - @/utils/settingsConfig
 * - @tauri-apps/api/core
 * - @/store/gamePlayStore
 */

import type { Update } from "@tauri-apps/plugin-updater";
import i18next from "i18next";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { getVirtualCategoryGames } from "@/hooks/common/useVirtualCollections";
import { collectionService, gameService } from "@/services";
import type { SortOption, SortOrder } from "@/services/types";
import type { Category, GameData, Group } from "@/types";
import { applyNsfwFilter, getDisplayGameDataList } from "@/utils";
import { initializeGamePlayTracking } from "./gamePlayStore";

/**
 * AppState 全局状态类型定义
 */
export interface AppState {
	updateSort(option: SortOption, sortOrder: SortOrder): void;

	// UI 状态
	selectedGameId: number | null;
	addModalOpen: boolean;
	addModalPath: string;

	// 排序选项
	sortOption: SortOption;
	sortOrder: SortOrder;

	// 关闭应用时的提醒设置，skip=不再提醒，行为为 'hide' 或 'close'
	skipCloseRemind: boolean;
	defaultCloseAction: "hide" | "close";
	// 设置不再提醒及默认关闭行为
	setSkipCloseRemind: (skip: boolean) => void;
	setDefaultCloseAction: (action: "hide" | "close") => void;

	// UI 操作方法
	setSelectedGameId: (id: number | null | undefined) => void;
	openAddModal: (path?: string) => void;
	closeAddModal: () => void;
	setAddModalPath: (path: string) => void;

	// 初始化
	initialize: () => Promise<void>;

	// 搜索相关
	/** 搜索输入框的原始输入值（即时更新，仅 SearchBox 订阅） */
	searchInput: string;
	setSearchInput: (input: string) => void;
	/** 防抖后的搜索关键词（用于游戏列表过滤） */
	searchKeyword: string;
	setSearchKeyword: (keyword: string) => void;

	// 筛选相关
	gameFilterType: "all" | "local" | "online" | "noclear" | "clear";
	setGameFilterType: (
		type: "all" | "local" | "online" | "noclear" | "clear",
	) => void;

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

	// 更新游戏状态 (PlayStatus 1-5)
	updateGamePlayStatusInStore: (
		gameId: number,
		newStatus: number,
		skipRefresh?: boolean,
	) => Promise<void>;

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
			// UI 状态
			selectedGameId: null,
			addModalOpen: false,
			addModalPath: "",

			searchInput: "",
			searchKeyword: "",

			gameFilterType: "all",

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
			apiSource: "mixed",
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
			doubleClickLaunch: true,
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
			setSearchInput: (input: string) => {
				set({ searchInput: input });
			},
			setSearchKeyword: (keyword: string) => {
				set({ searchKeyword: keyword });
			},

			// 排序偏好更新（数据刷新由 React Query 参数驱动）
			updateSort: (option: SortOption, order: SortOrder) => {
				const prevOption = get().sortOption;
				const prevOrder = get().sortOrder;

				// 如果排序选项和顺序都没变，不做任何操作
				if (prevOption === option && prevOrder === order) return;

				// 设置排序选项
				set({
					sortOption: option,
					sortOrder: order,
				});
			},

			// UI 操作方法
			setSelectedGameId: (id: number | null | undefined) => {
				set({ selectedGameId: id });
			},

			// 筛选偏好更新（数据刷新由 React Query 参数驱动）
			setGameFilterType: (
				type: "all" | "local" | "online" | "noclear" | "clear",
			) => {
				const prevType = get().gameFilterType;

				// 如果类型没变，不做任何操作
				if (prevType === type) return;

				// 设置新的筛选类型
				set({ gameFilterType: type });
			},

			// 更新games数组中特定游戏的状态 (PlayStatus 1-5)
			updateGamePlayStatusInStore: async (
				_gameId: number,
				_newStatus: number,
				skipRefresh?: boolean,
			) => {
				void _gameId;
				void _newStatus;
				void skipRefresh;

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
					let gameDataList: GameData[];
					const allGames = getDisplayGameDataList(
						await gameService.getAllGames(
							"all",
							get().sortOption,
							get().sortOrder,
							i18next.language,
						),
						i18next.language,
					);

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
					// 1. 乐观更新：先更新前端状态，防止列表闪烁
					const { nsfwFilter, currentCategories } = get();
					const allGames = getDisplayGameDataList(
						await gameService.getAllGames(
							"all",
							get().sortOption,
							get().sortOrder,
							i18next.language,
						),
						i18next.language,
					);
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
				// React Query 负责游戏数据获取，这里只保留分组初始化
				await get().fetchGroups();

				// 初始化游戏时间跟踪
				initializeGamePlayTracking();
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
 * 初始化全局状态，加载游戏与分类数据，并初始化游戏时间跟踪（Tauri 环境下）。
 */
export const initializeStores = async (): Promise<void> => {
	await useStore.getState().initialize();
};
