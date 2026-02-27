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
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { SortOption, SortOrder } from "@/services/types";
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

	// 分组分类选择状态
	currentGroupId: string | null; // 当前选中的分组ID
	selectedCategoryId: number | null; // 当前选中的分类ID
	selectedCategoryName: string | null; // 当前选中的分类名称
	setCurrentGroup: (groupId: string | null) => void; // 设置当前分组
	setSelectedCategory: (
		categoryId: number | null,
		categoryName?: string,
	) => void; // 设置当前选中的分类
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

			// 分组分类选择状态初始值
			currentGroupId: null,
			selectedCategoryId: null,
			selectedCategoryName: null,

			// 设置当前分组
			setCurrentGroup: (groupId: string | null) => {
				set({
					currentGroupId: groupId,
					selectedCategoryId: null,
					selectedCategoryName: null,
				});
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
			},

			// 初始化方法
			initialize: async () => {
				// 初始化游戏时间跟踪（数据获取由 React Query 自动触发）
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
				// 分组分类选择状态
				currentGroupId: state.currentGroupId,
				selectedCategoryId: state.selectedCategoryId,
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
