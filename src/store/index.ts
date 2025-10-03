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

import {create} from 'zustand';
import {persist} from 'zustand/middleware';
import type { FullGameData, GameData } from '@/types';
import type { Update } from '@tauri-apps/plugin-updater';
import { gameService, settingsService } from '@/services';
import { applyNsfwFilter, getDisplayGameData, getDisplayGameDataList } from '@/utils';
import i18next from 'i18next';
import {
    deleteGame as deleteGameLocal,
    filterGamesByTypeLocal,
    getBgmTokenLocal,
    getGameByIdLocal,
    getGames as getGamesLocal, getSetting,
    insertGame as insertGameLocal,
    searchGamesLocal,
    setBgmTokenLocal,
    setSetting
} from '@/utils/localStorage';
import {isTauri} from '@tauri-apps/api/core';
import {initializeGamePlayTracking} from './gamePlayStore';

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
    // 排序选项
    sortOption: string;
    sortOrder: 'asc' | 'desc';
    // BGM 令牌
    bgmToken: string;
    // UI 状态
    selectedGameId: number | null;
    selectedGame: GameData | null;

    // 关闭应用时的提醒设置，skip=不再提醒，行为为 'hide' 或 'close'
    skipCloseRemind: boolean;
    defaultCloseAction: 'hide' | 'close';
    // 设置不再提醒及默认关闭行为
    setSkipCloseRemind: (skip: boolean) => void;
    setDefaultCloseAction: (action: 'hide' | 'close') => void;


    // 游戏操作方法
    fetchGames: (sortOption?: string, sortOrder?: 'asc' | 'desc', resetSearch?: boolean) => Promise<void>;
    fetchGame: (id: number) => Promise<void>;
    addGame: (fullgame: FullGameData) => Promise<void>;
    deleteGame: (gameId: number) => Promise<void>;
    getGameById: (gameId: number) => Promise<GameData>;
    updateGame: (id: number, gameUpdates: Partial<FullGameData> | Partial<GameData>) => Promise<void>;

    // 排序方法
    setSortOption: (option: string) => void;
    setSortOrder: (order: 'asc' | 'desc') => void;

    // BGM 令牌方法
    fetchBgmToken: () => Promise<void>;
    setBgmToken: (token: string) => Promise<void>;

    // UI 操作方法
    setSelectedGameId: (id: number | null | undefined) => void;
    setSelectedGame: (game: GameData | null) => void;

    // 初始化
    initialize: () => Promise<void>;

    // 搜索相关
    searchKeyword: string;
    setSearchKeyword: (keyword: string) => void;
    searchGames: (keyword: string) => Promise<void>;

    // 通用刷新方法
    refreshGameData: (customSortOption?: string, customSortOrder?: 'asc' | 'desc') => Promise<void>;

    // 筛选相关
    gameFilterType: 'all' | 'local' | 'online' | 'noclear' | 'clear';
    setGameFilterType: (type: 'all' | 'local' | 'online' | 'noclear' | 'clear') => void;
    useIsLocalGame: (gameId: number) => boolean;

    // NSFW相关
    nsfwFilter: boolean;
    setNsfwFilter: (enabled: boolean) => void;
    nsfwCoverReplace: boolean;
    setNsfwCoverReplace: (enabled: boolean) => void;

    // 卡片交互模式
    cardClickMode: 'navigate' | 'select';
    setCardClickMode: (mode: 'navigate' | 'select') => void;

    // 双击启动游戏功能
    doubleClickLaunch: boolean;
    setDoubleClickLaunch: (enabled: boolean) => void;

    // 长按启动游戏功能
    longPressLaunch: boolean;
    setLongPressLaunch: (enabled: boolean) => void;

    // TAG翻译功能
    tagTranslation: boolean;
    setTagTranslation: (enabled: boolean) => void;

    // 更新游戏通关状态
    updateGameClearStatusInStore: (gameId: number, newClearStatus: 1 | 0, skipRefresh?: boolean) => void;

    // 更新窗口状态管理
    showUpdateModal: boolean;
    pendingUpdate: Update | null;
    setShowUpdateModal: (show: boolean) => void;
    setPendingUpdate: (update: Update | null) => void;
    triggerUpdateModal: (update: Update) => void;
}

// 创建持久化的全局状态
export const useStore = create<AppState>()(
    // @ts-ignore
    persist(
        (set, get) => ({
            // 游戏相关状态
            fullGames: [], // 所有完整的游戏数据（包含关联表）
            games: [], // 当前显示的游戏列表（受筛选和排序影响）
            allGames: [], // 所有游戏的完整列表（不受筛选影响，供统计使用）
            loading: false,

            // 排序选项默认值
            sortOption: 'addtime',
            sortOrder: 'asc',

            // BGM 令牌
            bgmToken: '',

            // UI 状态
            selectedGameId: null,
            selectedGame: null,
            // 关闭应用时的提醒设置，skip=不再提醒，行为为 'hide' 或 'close'
            skipCloseRemind: false,
            defaultCloseAction: 'hide',
            // Setter: 不再提醒和默认关闭行为
            setSkipCloseRemind: (skip: boolean) => set({skipCloseRemind: skip}),
            setDefaultCloseAction: (action: 'hide' | 'close') => set({defaultCloseAction: action}),

            searchKeyword: '',

            gameFilterType: 'all',

            // NSFW相关
            nsfwFilter: false,
            setNsfwFilter: async (enabled: boolean) => {
                set({nsfwFilter: enabled});
                await get().refreshGameData();
                setSetting('nsfwFilter', enabled);
            },
            nsfwCoverReplace: false,
            setNsfwCoverReplace: (enabled: boolean) => {
                set({nsfwCoverReplace: enabled});
                setSetting('nsfwCoverReplace', enabled);
            },

            // 卡片交互模式
            cardClickMode: 'navigate',
            setCardClickMode: (mode: 'navigate' | 'select') => {
                set({cardClickMode: mode});
                setSetting('cardClickMode', mode);
            },

            // 双击启动游戏功能
            doubleClickLaunch: false,
            setDoubleClickLaunch: (enabled: boolean) => {
                set({doubleClickLaunch: enabled});
                setSetting('doubleClickLaunch', enabled);
            },

            // 长按启动游戏功能
            longPressLaunch: false,
            setLongPressLaunch: (enabled: boolean) => {
                set({longPressLaunch: enabled});
                setSetting('longPressLaunch', enabled);
            },

            // TAG翻译功能（默认关闭）
            tagTranslation: false,
            setTagTranslation: (enabled: boolean) => {
                set({tagTranslation: enabled});
                setSetting('tagTranslation', enabled);
            },

            // 优化刷新数据的方法，减少状态更新
            refreshGameData: async (customSortOption?: string, customSortOrder?: 'asc' | 'desc') => {
                set({loading: true});

                try {
                    const {searchKeyword, gameFilterType} = get(); // 获取当前筛选类型
                    const option = customSortOption || get().sortOption;
                    const order = customSortOrder || get().sortOrder;

                    let data: GameData[];
                    if (searchKeyword && searchKeyword.trim() !== '') {
                        if (isTauri()) {
                            const fullGames = await gameService.searchFullGames(searchKeyword, gameFilterType, option, order);
                            data = getDisplayGameDataList(fullGames, i18next.language);
                        } else {
                            data = searchGamesLocal(searchKeyword, gameFilterType, option, order);
                        }
                    } else {
                        // 当没有搜索词时，根据筛选类型决定使用哪个函数
                        if (gameFilterType !== 'all') {
                            if (isTauri()) {
                                const fullGames = await gameService.getFullGamesByType(gameFilterType, option, order);
                                data = getDisplayGameDataList(fullGames, i18next.language);
                            } else {
                                data = filterGamesByTypeLocal(gameFilterType, option, order);
                            }
                        } else {
                            if (isTauri()) {
                                const fullGames = await gameService.getAllFullGames(option, order);
                                data = getDisplayGameDataList(fullGames, i18next.language);
                            } else {
                                data = getGamesLocal(option, order);
                            }
                        }
                    }

                    // 同时更新完整的游戏列表（用于统计）
                    let allData: GameData[];
                    if (isTauri()) {
                        const allFullGames = await gameService.getAllFullGames('addtime', 'asc');
                        allData = getDisplayGameDataList(allFullGames, i18next.language);
                    } else {
                        allData = getGamesLocal('addtime', 'asc');
                    }

                    // 应用nsfw筛选
                    const {nsfwFilter} = get();
                    data = applyNsfwFilter(data, nsfwFilter);

                    // 一次性设置数据和状态
                    set({games: data, allGames: allData, loading: false});
                } catch (error) {
                    console.error('刷新游戏数据失败:', error);
                    set({loading: false});
                }
            },

            // 修改 fetchGames 方法，添加覆盖 searchKeyword 的选项
            fetchGames: async (sortOption?: string, sortOrder?: 'asc' | 'desc', resetSearch?: boolean) => {
                set({loading: true});
                try {
                    const option = sortOption || get().sortOption;
                    const order = sortOrder || get().sortOrder;

                    let data: GameData[];
                    if (isTauri()) {
                        // 获取完整数据并转换
                        const fullGames = await gameService.getAllFullGames(option, order);
                        data = getDisplayGameDataList(fullGames, i18next.language);
                    } else {
                        data = getGamesLocal(option, order);
                    }

                    // 获取完整的游戏列表（不排序）用于统计
                    let allData: GameData[];
                    if (isTauri()) {
                        const allFullGames = await gameService.getAllFullGames('addtime', 'asc');
                        allData = getDisplayGameDataList(allFullGames, i18next.language);
                    } else {
                        allData = getGamesLocal('addtime', 'asc');
                    }

                    // 应用nsfw筛选
                    const {nsfwFilter} = get();
                    data = applyNsfwFilter(data, nsfwFilter);

                    // 只有在明确指定 resetSearch=true 时才重置搜索关键字
                    if (resetSearch) {
                        set({games: data, allGames: allData, searchKeyword: ''});
                    } else {
                        set({games: data, allGames: allData});
                    }
                } catch (error) {
                    console.error("获取游戏数据失败", error);
                    set({games: [], allGames: []});
                } finally {
                    set({loading: false});
                }
            },
            fetchGame: async (id: number) => {
                set({loading: true});
                try {
                    if (isTauri()) {
                        // 从后端获取完整游戏数据(包含 BGM/VNDB/Other 数据)
                        const fullGameData = await gameService.getGameById(id);
                        
                        if (fullGameData) {
                            // 转换为展平的 GameData
                            const displayGame = getDisplayGameData(fullGameData, i18next.language);
                            set({selectedGame: displayGame});
                        } else {
                            console.warn(`Game with ID ${id} not found`);
                        }
                    } else {
                        // Web 环境下使用本地存储
                        const game = getGameByIdLocal(id);
                        if (game) {
                            set({selectedGame: game as GameData});
                        } else {
                            console.warn(`Game with ID ${id} not found`);
                        }
                    }
                } catch (error) {
                    console.error('获取游戏数据失败:', error);
                } finally {
                    set({loading: false});
                }
            },

            // 使用通用函数简化 addGame
            addGame: async (fullgame: FullGameData) => {
                try {
                    if (isTauri()) {
                        await gameService.insertGame(fullgame.game, fullgame.bgm_data, fullgame.vndb_data, fullgame.other_data);
                    } else {
                        insertGameLocal(fullgame);
                    }
                    // 使用通用刷新函数
                    await get().refreshGameData();
                } catch (error) {
                    console.error('Error adding game:', error);
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
                } catch (error) {
                    console.error('删除游戏数据失败:', error);
                }
            },

            getGameById: async (gameId: number): Promise<GameData> => {
                if (isTauri()) {
                    const fullData = await gameService.getGameById(gameId);
                    const game = fullData ? getDisplayGameData(fullData, i18next.language) : null;
                    if (game === null) {
                        throw new Error(`Game with ID ${gameId} not found`);
                    }
                    return game;
                }
                return await Promise.resolve(getGameByIdLocal(gameId));
            },

            updateGame: async (id: number, gameUpdates: Partial<FullGameData>) => {
                try {
                    if (isTauri()) {
                        await gameService.updateGameWithRelated(id, gameUpdates);
                        // gameUpdates 的键会在下面被遍历，直接使用 gameUpdates 而不是解构未使用的变量
                        // 只有当更新的字段可能影响游戏列表显示时才刷新列表
                        // 游戏设置类字段（如 savepath, autosave）不需要刷新列表
                        const listAffectingFields = ['name', 'custom_name', 'developer', 'date', 'score', 'rank', 'tags', 'custom_cover'];

                        // 将 gameUpdates 展开为一组字段名（支持一层嵌套：game / bgm_data / vndb_data / other_data）
                        const updatedFieldNames = new Set<string>();

                        // 如果外层直接包含字段（理论上 FullGameData 只有四个键，但保持通用）
                        Object.keys(gameUpdates).forEach(key => {
                            const value = (gameUpdates as any)[key];
                            if (value && typeof value === 'object' && !Array.isArray(value)) {
                                // 展开一层嵌套的字段名
                                Object.keys(value).forEach((subKey) => updatedFieldNames.add(subKey));
                            } else {
                                updatedFieldNames.add(key);
                            }
                        });

                        // 检查是否有任一影响显示的字段被更新
                        const shouldRefreshList = Array.from(updatedFieldNames).some(field => listAffectingFields.includes(field));
                        await get().fetchGame(id);
                        if (shouldRefreshList) {
                            await get().fetchGame(id);
                            await get().refreshGameData();
                        }
                    } else {
                        console.warn("updateGameLocal is not implemented for browser environment.");
                    }
                } catch (error) {
                    console.error('更新游戏数据失败:', error);
                    throw error; 
                }
            },

            setSearchKeyword: (keyword: string) => {
                set({searchKeyword: keyword});
            },

            // 修改 searchGames 函数定义，添加 filterType 参数
            searchGames: async (keyword: string, filterType?: 'all' | 'local' | 'online' | 'clear') => {
                set({loading: true, searchKeyword: keyword});
                const type = filterType || get().gameFilterType;

                // 浏览器环境下的特殊处理
                if (!isTauri() && type === 'local') {
                    set({games: [], loading: false});
                    return;
                }

                try {
                    const option = get().sortOption;
                    const order = get().sortOrder;

                    let data: GameData[];
                    if (isTauri()) {
                        const fullGames = await gameService.searchFullGames(keyword, type, option, order);
                        data = getDisplayGameDataList(fullGames, i18next.language);
                    } else {
                        data = searchGamesLocal(keyword, type, option, order);
                    }

                    // 应用nsfw筛选
                    const {nsfwFilter} = get();
                    data = applyNsfwFilter(data, nsfwFilter);

                    set({games: data});
                } catch (error) {
                    console.error('搜索游戏数据失败:', error);
                    set({games: []});
                } finally {
                    set({loading: false});
                }
            },

// 添加一个统一的排序更新函数，合并所有状态更新
            updateSort: async (option: string, order: 'asc' | 'desc') => {
                set({loading: true}); // 立即进入加载状态，防止闪烁

                try {
                    const {searchKeyword, gameFilterType} = get(); // 获取当前筛选类型
                    let data: GameData[];

                    // 直接获取新排序的数据
                    if (searchKeyword && searchKeyword.trim() !== '') {
                        if (isTauri()) {
                            const fullGames = await gameService.searchFullGames(searchKeyword, gameFilterType, option, order);
                            data = getDisplayGameDataList(fullGames, i18next.language);
                        } else {
                            data = searchGamesLocal(searchKeyword, gameFilterType, option, order);
                        }
                    } else {
                        // 当没有搜索词时，使用筛选类型
                        if (gameFilterType !== 'all') {
                            if (isTauri()) {
                                const fullGames = await gameService.getFullGamesByType(gameFilterType, option, order);
                                data = getDisplayGameDataList(fullGames, i18next.language);
                            } else {
                                data = filterGamesByTypeLocal(gameFilterType, option, order);
                            }
                        } else {
                            if (isTauri()) {
                                const fullGames = await gameService.getAllFullGames(option, order);
                                data = getDisplayGameDataList(fullGames, i18next.language);
                            } else {
                                data = getGamesLocal(option, order);
                            }
                        }
                    }

                    // 一次性更新所有状态
                    set({
                        sortOption: option,
                        sortOrder: order,
                        games: data,
                        loading: false
                    });
                } catch (error) {
                    console.error('更新排序失败:', error);
                    // 更新排序选项，即使数据获取失败
                    set({
                        sortOption: option,
                        sortOrder: order,
                        loading: false
                    });
                }
            },

// 修改这两个方法，让它们调用新的 updateSort 方法
            setSortOption: (option: string) => {
                get().updateSort(option, get().sortOrder);
            },

            setSortOrder: (order: 'asc' | 'desc') => {
                get().updateSort(get().sortOption, order);
            },

            // BGM 令牌方法
            fetchBgmToken: async () => {
                try {
                    let token = '';
                    if (isTauri()) {
                        token = await settingsService.getBgmToken();
                    } else {
                        token = getBgmTokenLocal();
                    }
                    set({bgmToken: token});
                } catch (error) {
                    console.error('Error fetching BGM token:', error);
                }
            },

            setBgmToken: async (token: string) => {
                try {
                    if (isTauri()) {
                        await settingsService.setBgmToken(token);
                    } else {
                        setBgmTokenLocal(token);
                    }
                    set({bgmToken: token});
                } catch (error) {
                    console.error('Error setting BGM token:', error);
                }
            },

            // UI 操作方法
            setSelectedGameId: (id: number | null | undefined) => {
                set({selectedGameId: id});
            },
            setSelectedGame: (game: GameData | null) => {
                set({selectedGame: game});
            },

            // 修改 setGameFilterType 函数，避免循环引用
            setGameFilterType: (type: 'all' | 'local' | 'online' | 'noclear' | 'clear') => {
                const prevType = get().gameFilterType;

                // 如果类型没变，不做任何操作
                if (prevType === type) return;

                // 设置新的筛选类型
                set({gameFilterType: type, loading: true});

                // 获取当前的搜索关键字
                const {searchKeyword, sortOption, sortOrder} = get();

                // 使用修改后的 searchGames 函数，但避免触发额外的状态更新
                try {
                    // 这里直接调用底层的数据获取函数，而不是 searchGames
                    const fetchData = async () => {
                        let data: GameData[];

                        if (!searchKeyword || searchKeyword.trim() === '') {
                            if (type !== 'all') {
                                if (isTauri()) {
                                    const fullGames = await gameService.getFullGamesByType(type, sortOption, sortOrder);
                                    data = getDisplayGameDataList(fullGames, i18next.language);
                                } else {
                                    data = filterGamesByTypeLocal(type, sortOption, sortOrder);
                                }
                            } else {
                                if (isTauri()) {
                                    const fullGames = await gameService.getAllFullGames(sortOption, sortOrder);
                                    data = getDisplayGameDataList(fullGames, i18next.language);
                                } else {
                                    data = getGamesLocal(sortOption, sortOrder);
                                }
                            }
                        } else {
                            if (isTauri()) {
                                const fullGames = await gameService.searchFullGames(searchKeyword, type, sortOption, sortOrder);
                                data = getDisplayGameDataList(fullGames, i18next.language);
                            } else {
                                data = searchGamesLocal(searchKeyword, type, sortOption, sortOrder);
                            }
                        }

                        // 应用nsfw筛选
                        const {nsfwFilter} = get();
                        data = applyNsfwFilter(data, nsfwFilter);

                        set({games: data, loading: false});
                    };

                    fetchData();
                } catch (error) {
                    console.error('应用筛选失败:', error);
                    set({loading: false});
                }
            },
            useIsLocalGame(gameId: number): boolean {
                const allGames = useStore.getState().allGames; // 使用 allGames 而不是 games

                // 查找游戏
                const game = allGames.find(g => g.id === gameId);

                // 检查游戏是否存在并且有localpath属性
                if (!game || !game.localpath) {
                    return false;
                }

                // 检查localpath是否为非空字符串
                return game.localpath.trim() !== '';
            },

// 更新games数组中特定游戏的通关状态
            updateGameClearStatusInStore: async (gameId: number, newClearStatus: 1 | 0, skipRefresh?: boolean) => {
                const {games, allGames} = get();

                // 更新当前显示的游戏列表
                let updatedGames = games.map(game =>
                    game.id === gameId
                        ? {...game, clear: newClearStatus}
                        : game
                );

                // 更新完整的游戏列表
                const updatedAllGames = allGames.map(game =>
                    game.id === gameId
                        ? {...game, clear: newClearStatus}
                        : game
                );
                
                set({games: updatedGames, allGames: updatedAllGames});
                
                // 只有在不跳过刷新时才调用 refreshGameData
                if (!skipRefresh) {
                    await get().refreshGameData();
                }
            },

            // 更新窗口状态管理
            showUpdateModal: false,
            pendingUpdate: null,
            setShowUpdateModal: (show: boolean) => {
                set({showUpdateModal: show});
            },
            setPendingUpdate: (update: Update | null) => {
                set({pendingUpdate: update});
            },
            triggerUpdateModal: (update: Update) => {
                set({
                    pendingUpdate: update,
                    showUpdateModal: true
                });
            },

            // 初始化方法，先初始化数据库，然后加载所有需要的数据
            initialize: async () => {

                // 获取NSFW数据
                const nsfwFilter = getSetting('nsfwFilter') ?? false;
                const nsfwCoverReplace = getSetting('nsfwCoverReplace') ?? false;
                const cardClickMode = getSetting('cardClickMode') ?? 'navigate';
                const doubleClickLaunch = getSetting('doubleClickLaunch') ?? false;
                const longPressLaunch = getSetting('longPressLaunch') ?? false;
                const tagTranslation = getSetting('tagTranslation') ?? false;
                set({
                    nsfwFilter,
                    nsfwCoverReplace,
                    cardClickMode,
                    doubleClickLaunch,
                    longPressLaunch,
                    tagTranslation,
                });

                // 然后并行加载其他数据
                await Promise.all([
                    get().fetchGames(),
                    get().fetchBgmToken()
                ]);

                // 初始化游戏时间跟踪
                if (isTauri()) {
                    initializeGamePlayTracking();
                }
            }
        }),
        {
            name: 'reina-manager-store',
            // 可选：定义哪些字段需要持久化存储
            partialize: (state) => ({
                sortOption: state.sortOption,
                sortOrder: state.sortOrder,
                skipCloseRemind: state.skipCloseRemind,
                defaultCloseAction: state.defaultCloseAction
            })
        }
    )
);

/**
 * initializeStores
 * 初始化全局状态，加载游戏数据与 BGM Token，并初始化游戏时间跟踪（Tauri 环境下）。
 */
export const initializeStores = async (): Promise<void> => {
    await useStore.getState().initialize();
};
