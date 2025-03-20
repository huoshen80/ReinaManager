import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GameData } from '@/types';
import { 
  getGames as getGamesRepository, 
  insertGame as insertGameRepository,
  getGameByGameId as getGameByIdRepository,
  deleteGame as deleteGameRepository,
searchGames as searchGamesRepository 
} from '@/utils/repository';
import { 
  getGames as getGamesLocal, 
  insertGame as insertGameLocal, 
  deleteGame as deleteGameLocal,
  getBgmTokenLocal, 
  setBgmTokenLocal,
  getGameByIdLocal,
  searchGamesLocal
} from '@/utils/localStorage';
import { getBgmTokenRepository, setBgmTokenRepository } from '@/utils/settingsConfig';
import { isTauri } from '@tauri-apps/api/core';

// 定义应用全局状态类型
interface AppState {
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
  selectedGameId: string | null;
  
  // 游戏操作方法
  fetchGames: (sortOption?: string, sortOrder?: 'asc' | 'desc',resetSearch?:boolean) => Promise<void>;
  addGame: (game: GameData) => Promise<void>;
  deleteGame: (gameId: string) => Promise<void>;
  getGameById: (gameId: string) => Promise<GameData>;
  
  // 排序方法
  setSortOption: (option: string) => void;
  setSortOrder: (order: 'asc' | 'desc') => void;
  
  // BGM 令牌方法
  fetchBgmToken: () => Promise<void>;
  setBgmToken: (token: string) => Promise<void>;
  
  // UI 操作方法
  setSelectedGameId: (id: string | null) => void;
  
  // 初始化
  initialize: () => Promise<void>;

  searchKeyword: string;
  
  setSearchKeyword: (keyword: string) => void;
  searchGames: (keyword: string) => Promise<void>;

  // 添加通用刷新方法
  refreshGameData: (customSortOption?: string, customSortOrder?: 'asc' | 'desc') => Promise<void>;

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

      // 优化刷新数据的方法，减少状态更新
refreshGameData: async (customSortOption?: string, customSortOrder?: 'asc' | 'desc') => {
  set({ loading: true });
  
  try {
    const { searchKeyword } = get();
    const option = customSortOption || get().sortOption;
    const order = customSortOrder || get().sortOrder;
    
    let data: GameData[];
    if (searchKeyword && searchKeyword.trim() !== '') {
      data = isTauri()
        ? await searchGamesRepository(searchKeyword, option, order)
        : searchGamesLocal(searchKeyword, option, order);
    } else {
      data = isTauri()
        ? await getGamesRepository(option, order)
        : getGamesLocal(option, order);
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
          console.error('获取游戏数据失败:', error);
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
      deleteGame: async (gameId: string): Promise<void> => {
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
      
      getGameById: async (gameId: string): Promise<GameData> => {
        if (isTauri()) {
          return await getGameByIdRepository(gameId);
        }
        return await Promise.resolve(getGameByIdLocal(gameId));
      },

      setSearchKeyword: (keyword: string) => {
        set({ searchKeyword: keyword });
      },
      
      // 搜索方法逻辑完善
searchGames: async (keyword: string) => {
  set({ loading: true, searchKeyword: keyword });
  try {
    const option = get().sortOption;
    const order = get().sortOrder;
    
    let data: GameData[];
    if (!keyword || keyword.trim() === '') {
      // 如果搜索关键字为空，获取所有游戏
      data = isTauri()
        ? await getGamesRepository(option, order)
        : getGamesLocal(option, order);
    } else {
      // 正常搜索
      data = isTauri()
        ? await searchGamesRepository(keyword, option, order)
        : searchGamesLocal(keyword, option, order);
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
    const { searchKeyword } = get();
    let data: GameData[];
    
    // 直接获取新排序的数据
    if (searchKeyword && searchKeyword.trim() !== '') {
      data = isTauri()
        ? await searchGamesRepository(searchKeyword, option, order)
        : searchGamesLocal(searchKeyword, option, order);
    } else {
      data = isTauri()
        ? await getGamesRepository(option, order)
        : getGamesLocal(option, order);
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
      setSelectedGameId: (id: string | null) => {
        set({ selectedGameId: id });
      },
      
      // 初始化方法，先初始化数据库，然后加载所有需要的数据
      initialize: async () => {        
        // 然后并行加载其他数据
        await Promise.all([
          get().fetchBgmToken(),
          get().fetchGames()
        ]);
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

// 初始化函数保持不变，但内部调用了新的方法
export const initializeStores = async (): Promise<void> => {
  await useStore.getState().initialize();
};