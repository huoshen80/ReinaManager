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

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GameData } from '@/types';
import { 
  getGames as getGamesRepository, 
  insertGame as insertGameRepository,
  getGameById as getGameByIdRepository,
  deleteGame as deleteGameRepository,
  searchGames as searchGamesRepository,
  filterGamesByType as filterGamesByTypeRepository 
} from '@/utils/repository';
import { 
  getGames as getGamesLocal, 
  insertGame as insertGameLocal, 
  deleteGame as deleteGameLocal,
  getBgmTokenLocal, 
  setBgmTokenLocal,
  getGameByIdLocal,
  searchGamesLocal,
  filterGamesByTypeLocal
} from '@/utils/localStorage';
import { getBgmTokenRepository, setBgmTokenRepository } from '@/utils/settingsConfig';
import { isTauri } from '@tauri-apps/api/core';
// import { getGamePlatformId } from '@/utils';
import { initializeGamePlayTracking } from './gamePlayStore';

/**
 * AppState 全局状态类型定义
 */
export interface AppState {
  updateSort(option: string, sortOrder: string): Promise<void>;
  // 游戏相关状态与方法
  games: GameData[];
  loading: boolean;
  // 排序选项
  sortOption: string;
  sortOrder: 'asc' | 'desc';
  // BGM 令牌
  bgmToken: string;
  // UI 状态
  selectedGameId: number | null;
  
  // 游戏操作方法
  fetchGames: (sortOption?: string, sortOrder?: 'asc' | 'desc', resetSearch?: boolean) => Promise<void>;
  addGame: (game: GameData) => Promise<void>;
  deleteGame: (gameId: number) => Promise<void>;
  getGameById: (gameId: number) => Promise<GameData>;
  
  // 排序方法
  setSortOption: (option: string) => void;
  setSortOrder: (order: 'asc' | 'desc') => void;
  
  // BGM 令牌方法
  fetchBgmToken: () => Promise<void>;
  setBgmToken: (token: string) => Promise<void>;
  
  // UI 操作方法
  setSelectedGameId: (id: number | null | undefined) => void;
  
  // 初始化
  initialize: () => Promise<void>;

  // 搜索相关
  searchKeyword: string;
  setSearchKeyword: (keyword: string) => void;
  searchGames: (keyword: string) => Promise<void>;

  // 通用刷新方法
  refreshGameData: (customSortOption?: string, customSortOrder?: 'asc' | 'desc') => Promise<void>;

  // 筛选相关
  gameFilterType: 'all' | 'local' | 'online';
  setGameFilterType: (type: 'all' | 'local' | 'online') => void;
  useIsLocalGame: (gameId: number) => boolean;
}

// 创建持久化的全局状态
export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      // 游戏相关状态
      games: [],
      loading: false,
      
      // 排序选项默认值
      sortOption: 'addtime',
      sortOrder: 'asc',
      
      // BGM 令牌
      bgmToken: '',
      
      // UI 状态
      selectedGameId: null,

      searchKeyword: '',

      gameFilterType: 'all',

      // 优化刷新数据的方法，减少状态更新
refreshGameData: async (customSortOption?: string, customSortOrder?: 'asc' | 'desc') => {
  set({ loading: true });
  
  try {
    const { searchKeyword, gameFilterType } = get(); // 获取当前筛选类型
    const option = customSortOption || get().sortOption;
    const order = customSortOrder || get().sortOrder;
    
    let data: GameData[];
    if (searchKeyword && searchKeyword.trim() !== '') {
      data = isTauri()
        ? await searchGamesRepository(searchKeyword, gameFilterType, option, order) // 使用gameFilterType
        : searchGamesLocal(searchKeyword, gameFilterType, option, order); // 使用gameFilterType
    } else {
      // 当没有搜索词时，根据筛选类型决定使用哪个函数
      if (gameFilterType !== 'all') {
        data = isTauri()
          ? await filterGamesByTypeRepository(gameFilterType, option, order)
          : filterGamesByTypeLocal(gameFilterType, option, order);
      } else {
        data = isTauri()
          ? await getGamesRepository(option, order)
          : getGamesLocal(option, order);
      }
    }
    
    // 一次性设置数据和状态
    set({ games: data, loading: false });
  } catch (error) {
    console.error('刷新游戏数据失败:', error);
    set({ loading: false });
  }
},
      
      // 修改 fetchGames 方法，添加覆盖 searchKeyword 的选项
      fetchGames: async (sortOption?: string, sortOrder?: 'asc' | 'desc', resetSearch?:boolean) => {
        set({ loading: true });
        try {
          const option = sortOption || get().sortOption;
          const order = sortOrder || get().sortOrder;
          
          const data = isTauri()
            ? await getGamesRepository(option, order)
            : getGamesLocal(option, order);
          
          // 只有在明确指定 resetSearch=true 时才重置搜索关键字
          if (resetSearch) {
            set({ games: data, searchKeyword: '' });
          } else {
            set({ games: data });
          }
        } catch (error) {
          console.error("获取游戏数据失败", error);
          set({ games: [] });
        } finally {
          set({ loading: false });
        }
      },

      
      // 使用通用函数简化 addGame
      addGame: async (game: GameData) => {
        try {
          if (isTauri()) {
            await insertGameRepository(game);
          } else {
            insertGameLocal(game);
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
            await deleteGameRepository(gameId);
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
          const game = await getGameByIdRepository(gameId);
          if (game === null) {
            throw new Error(`Game with ID ${gameId} not found`);
          }
          return game;
        }
        return await Promise.resolve(getGameByIdLocal(gameId));
      },

      setSearchKeyword: (keyword: string) => {
        set({ searchKeyword: keyword });
      },
      
      // 修改 searchGames 函数定义，添加 filterType 参数
searchGames: async (keyword: string, filterType?: 'all' | 'local' | 'online') => {
  set({ loading: true, searchKeyword: keyword });
  const type = filterType || get().gameFilterType;
  
  // 浏览器环境下的特殊处理
  if (!isTauri() && type === 'local') {
    set({ games: [], loading: false });
    return;
  }
  
  try {
    const option = get().sortOption;
    const order = get().sortOrder;
    
    let data: GameData[];
    if (isTauri()) {
      data = await searchGamesRepository(keyword, type, option, order);
    } else {
      data = searchGamesLocal(keyword, type, option, order);
    }
    
    set({ games: data });
  } catch (error) {
    console.error('搜索游戏数据失败:', error);
    set({ games: [] });
  } finally {
    set({ loading: false });
  }
},
      
// 添加一个统一的排序更新函数，合并所有状态更新
updateSort: async (option: string, order: 'asc' | 'desc') => {
  set({ loading: true }); // 立即进入加载状态，防止闪烁
  
  try {
    const { searchKeyword, gameFilterType } = get(); // 获取当前筛选类型
    let data: GameData[];
    
    // 直接获取新排序的数据
    if (searchKeyword && searchKeyword.trim() !== '') {
      data = isTauri()
        ? await searchGamesRepository(searchKeyword, gameFilterType, option, order) // 使用gameFilterType
        : searchGamesLocal(searchKeyword, gameFilterType, option, order); // 使用gameFilterType
    } else {
      // 当没有搜索词时，使用筛选类型
      if (gameFilterType !== 'all') {
        data = isTauri()
          ? await filterGamesByTypeRepository(gameFilterType, option, order)
          : filterGamesByTypeLocal(gameFilterType, option, order);
      } else {
        data = isTauri()
          ? await getGamesRepository(option, order)
          : getGamesLocal(option, order);
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
            token = await getBgmTokenRepository();
          } else {
            token = getBgmTokenLocal();
          }
          set({ bgmToken: token });
        } catch (error) {
          console.error('Error fetching BGM token:', error);
        }
      },
      
      setBgmToken: async (token: string) => {
        try {
          if (isTauri()) {
            await setBgmTokenRepository(token);
          } else {
            setBgmTokenLocal(token);
          }
          set({ bgmToken: token });
        } catch (error) {
          console.error('Error setting BGM token:', error);
        }
      },
      
      // UI 操作方法
      setSelectedGameId: (id: number | null|undefined) => {
        set({ selectedGameId: id });
      },

      // 修改 setGameFilterType 函数，避免循环引用
setGameFilterType: (type: 'all' | 'local' | 'online') => {
  const prevType = get().gameFilterType;
  
  // 如果类型没变，不做任何操作
  if (prevType === type) return;
  
  // 设置新的筛选类型
  set({ gameFilterType: type, loading: true });
  
  // 获取当前的搜索关键字
  const { searchKeyword, sortOption, sortOrder } = get();
  
  // 使用修改后的 searchGames 函数，但避免触发额外的状态更新
  try {
    // 这里直接调用底层的数据获取函数，而不是 searchGames
    const fetchData = async () => {
      let data: GameData[];
      
      if (!searchKeyword || searchKeyword.trim() === '') {
        if (type !== 'all') {
          data = isTauri()
            ? await filterGamesByTypeRepository(type, sortOption, sortOrder)
            : filterGamesByTypeLocal(type, sortOption, sortOrder);
        } else {
          data = isTauri()
            ? await getGamesRepository(sortOption, sortOrder)
            : getGamesLocal(sortOption, sortOrder);
        }
      } else {
        data = isTauri()
          ? await searchGamesRepository(searchKeyword, type, sortOption, sortOrder)
          : searchGamesLocal(searchKeyword, type, sortOption, sortOrder);
      }
      
      set({ games: data, loading: false });
    };
    
    fetchData();
  } catch (error) {
    console.error('应用筛选失败:', error);
    set({ loading: false });
  }
},
useIsLocalGame(gameId: number  ): boolean {
    const games = useStore.getState().games; // 使用getState()而不是闭包中的state
    
    // 查找游戏
    const game = games.find(g => g.id===gameId);
    
    // 检查游戏是否存在并且有localpath属性
    if (!game || !game.localpath){
      return false;
    } 
    
    // 检查localpath是否为非空字符串
    return game.localpath.trim() !== '';
},
      // 初始化方法，先初始化数据库，然后加载所有需要的数据
      initialize: async () => {        
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
        sortOrder: state.sortOrder
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