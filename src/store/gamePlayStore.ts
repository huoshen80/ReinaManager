/**
 * @file gamePlayStore
 * @description 管理游戏运行状态、游玩统计、会话记录、实时状态等，支持 Tauri 桌面环境下的游戏启动与时间跟踪。
 * @module src/store/gamePlayStore
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - useGamePlayStore：Zustand 状态管理，包含游戏运行、统计、会话等方法
 * - initializeGamePlayTracking：初始化游戏时间跟踪
 *
 * 依赖：
 * - zustand
 * - @tauri-apps/api/core
 * - @/utils/gameStats
 * - @/store
 * - @/types
 * - @/utils
 */

import { create } from 'zustand';
import { isTauri } from '@tauri-apps/api/core';
import { 
  getFormattedGameStats, 
  getGameSessions,
  initGameTimeTracking,
  getGameStatistics
} from '@/utils/gameStats';
import type { GameSession, GameTimeStats } from '@/types';
import { useStore } from '@/store';
import { getLocalDateString, launchGameWithTracking } from '@/utils';

/**
 * 游戏启动结果类型
 */
interface LaunchGameResult {
  success: boolean;
  message: string;
  process_id?: number;
}

/**
 * 游戏实时状态接口
 */
interface GameRealTimeState {
  isRunning: boolean;
  currentSessionMinutes: number;
  currentSessionSeconds: number;
  startTime: number;
  processId?: number;
}

/**
 * 游戏游玩状态全局管理
 */
interface GamePlayState {
  runningGameIds: Set<number>; // 正在运行的游戏ID集合
  isTrackingInitialized: boolean; // 是否已初始化时间跟踪
  gameTimeStats: Record<string, GameTimeStats>; // 游戏统计缓存
  recentSessions: Record<string, GameSession[]>; // 最近会话缓存
  // trendData: Record<string, GameTimeChartData[]>; // 预留趋势数据
  gameRealTimeStates: Record<string, GameRealTimeState>; // 实时状态

  // 方法
  isGameRunning: (gameId?: number) => boolean;
  launchGame: (gamePath: string, gameId: number, args?: string[]) => Promise<LaunchGameResult>;
  loadGameStats: (gameId: number, forceRefresh?: boolean) => Promise<GameTimeStats | null>;
  loadRecentSessions: (gameId: number, limit?: number) => Promise<GameSession[] | null>;
  initTimeTracking: () => void;
  clearActiveGame: () => void;
  getGameRealTimeState: (gameId: number) => GameRealTimeState | null;
  getTotalPlayTime: () => Promise<number>;
  getWeekPlayTime: () => Promise<number>;
  getTodayPlayTime: () => Promise<number>;
}

// ====== 统计缓存优化：全局作用域 ======
let lastGamesSnapshot: number[] = [];
let lastTotalPlayTime = 0;
let lastWeekPlayTime = 0;
let lastTodayPlayTime = 0;
function getGamesIdSnapshot() {
  const { games } = useStore.getState();
  return games.map(g => g.id ?? 0).sort();
}
// ====== 统计缓存优化 END ======

/**
 * useGamePlayStore
 * 管理游戏运行、统计、会话、实时状态等，支持 Tauri 桌面环境。
 */
export const useGamePlayStore = create<GamePlayState>((set, get) => ({
  runningGameIds: new Set<number>(),
  isTrackingInitialized: false,
  gameTimeStats: {},
  recentSessions: {},
  trendData: {},
  gameRealTimeStates: {},
  
  /**
   * 判断指定游戏是否正在运行
   * @param gameId 游戏ID（可选，未传则判断是否有任意游戏在运行）
   */
  isGameRunning: (gameId?: number) => {
    const runningGames = get().runningGameIds;
    if (!gameId) return runningGames.size > 0;
    return runningGames.has(gameId);
  },
  
  /**
   * 获取指定游戏的实时状态
   * @param gameId 游戏ID
   */
  getGameRealTimeState: (gameId: number) => {
    const state = get().gameRealTimeStates[gameId];
    return state || null;
  },
  
  /**
   * 启动游戏并跟踪运行状态
   * @param gamePath 游戏路径
   * @param gameId 游戏ID
   * @param args 启动参数
   */
  launchGame: async (gamePath: string, gameId: number, args?: string[]): Promise<LaunchGameResult> => {
    if (!isTauri()) {
      return { success: false, message: '游戏启动功能仅在桌面应用中可用' };
    }
    
    try {
      if (get().isGameRunning(gameId)) {
        return { success: false, message: '该游戏已在运行中' };
      }
      
      // 添加到运行中游戏列表
      set(state => {
        const newRunningGames = new Set(state.runningGameIds);
        newRunningGames.add(gameId);
        
        // 初始化游戏实时状态
        const newRealTimeStates = {
          ...state.gameRealTimeStates,
          [gameId]: {
            isRunning: true,
            currentSessionMinutes: 0,
            currentSessionSeconds: 0,
            startTime: Math.floor(Date.now() / 1000)
          }
        };
        
        return { 
          runningGameIds: newRunningGames,
          gameRealTimeStates: newRealTimeStates
        };
      });
      
      // 确保初始化了事件监听
      if (!get().isTrackingInitialized) {
        get().initTimeTracking();
      }
      
      const result = await launchGameWithTracking(gamePath, gameId, args);
      
      if (!result.success) {
        // 启动失败，恢复状态
        set(state => {
          const newRunningGames = new Set(state.runningGameIds);
          newRunningGames.delete(gameId);
          
          const newRealTimeStates = {...state.gameRealTimeStates};
          delete newRealTimeStates[gameId];
          
          return { 
            runningGameIds: newRunningGames,
            gameRealTimeStates: newRealTimeStates
          };
        });
      } else {
        // 启动成功，更新进程 ID
        set(state => {
          const newRealTimeStates = {
            ...state.gameRealTimeStates,
            [gameId]: {
              ...state.gameRealTimeStates[gameId],
              processId: result.process_id
            }
          };
          return { gameRealTimeStates: newRealTimeStates };
        });
      }
      
      return result;
    } catch (error) {
      // 启动异常，恢复状态
      set(state => {
        const newRunningGames = new Set(state.runningGameIds);
        newRunningGames.delete(gameId);
        
        const newRealTimeStates = {...state.gameRealTimeStates};
        delete newRealTimeStates[gameId];
        
        return { 
          runningGameIds: newRunningGames,
          gameRealTimeStates: newRealTimeStates
        };
      });
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      return { success: false, message: errorMessage };
    }
  },
  
  /**
   * 加载指定游戏的统计数据
   * @param gameId 游戏ID
   * @param forceRefresh 是否强制刷新
   */
  loadGameStats: async (gameId: number, forceRefresh = false): Promise<GameTimeStats | null> => {
    try {
      if (!isTauri()) return null;
      
      // 如果不强制刷新且已有缓存，则使用缓存
      const cached = get().gameTimeStats[gameId];
      if (!forceRefresh && cached) return cached;
      
      // 获取新数据
      const stats = await getFormattedGameStats(gameId);
      
      if (stats) {
        // 更新状态
        set(state => ({
          gameTimeStats: {
            ...state.gameTimeStats,
            [gameId]: stats
          }
        }));
      }
      
      return stats;
    } catch (error) {
      console.error('加载游戏统计失败:', error);
      return null;
    }
  },
  
  /**
   * 加载指定游戏的最近会话
   * @param gameId 游戏ID
   * @param limit 数量限制
   */
  loadRecentSessions: async (gameId: number, limit = 5): Promise<GameSession[] | null> => {
    try {
      if (!isTauri()) return null;
      
      // 获取新数据
      const sessions = await getGameSessions(gameId, limit);
      
      // 更新状态
      set(state => ({
        recentSessions: {
          ...state.recentSessions,
          [gameId]: sessions
        }
      }));
      
      return sessions;
    } catch (error) {
      console.error('加载游戏会话失败:', error);
      return null;
    }
  },
  
  /**
   * 初始化游戏时间跟踪（仅限 Tauri 桌面环境）
   * 设置事件监听，自动管理运行状态与实时时长
   */
  initTimeTracking: () => {
    if (!isTauri() || get().isTrackingInitialized) return;
    
    try {
      // 设置事件监听
      const cleanup = initGameTimeTracking(
        // 时间更新回调
        (gameId: number, minutes: number) => {
          // 更新实时游戏状态
          set(state => {
            if (!state.gameRealTimeStates[gameId]) return state;
            
            const totalSeconds = minutes * 60;
            const newMinutes = Math.floor(totalSeconds / 60);
            const newSeconds = totalSeconds % 60;
            
            return {
              gameRealTimeStates: {
                ...state.gameRealTimeStates,
                [gameId]: {
                  ...state.gameRealTimeStates[gameId],
                  currentSessionMinutes: newMinutes,
                  currentSessionSeconds: newSeconds,
                }
              }
            };
          });
        },
        // 会话结束回调
        async (gameId: number, _minutes: number) => {
          // 只清除运行状态
          set(state => {
            const newRunningGames = new Set(state.runningGameIds);
            newRunningGames.delete(gameId);
            // 移除对应游戏条目
            const newRealTimeStates = {...state.gameRealTimeStates};
            delete newRealTimeStates[gameId];
            return { 
              runningGameIds: newRunningGames,
              gameRealTimeStates: newRealTimeStates
            };
          });
          // ====== 新增：重置统计缓存 ======
          lastTotalPlayTime = 0;
          lastWeekPlayTime = 0;
          lastTodayPlayTime = 0;
          // ====== END ======
          
          // ====== 新增：游戏结束后刷新Cards组件 ======
          // 获取主store的状态，检查当前排序选项
          const store = useStore.getState();
          if (store.sortOption === 'lastplayed') {
            // 如果当前排序是"最近游玩"，刷新游戏数据以更新顺序
            console.log(`游戏 ${gameId} 结束，当前排序为"最近游玩"，刷新游戏列表`);
            await store.refreshGameData();
          }
          // ====== END ======
        }
      );
      
      // 设置初始化标志
      set({ isTrackingInitialized: true });
      
      // 添加全局事件清理函数
      window.addEventListener('beforeunload', cleanup);
      
      return cleanup;
    } catch (error) {
      console.error('初始化游戏时间跟踪失败:', error instanceof Error ? error.message : String(error));
    }
  },
  
  /**
   * 清除所有运行中游戏状态
   */
  clearActiveGame: () => {
    set({ 
      runningGameIds: new Set<number>(),
      gameRealTimeStates: {} 
    });
  },

  /**
   * 获取所有游戏的总游玩时长（分钟）
   */
  getTotalPlayTime: async () => {
    const gamesSnapshot = getGamesIdSnapshot();
    if (JSON.stringify(gamesSnapshot) === JSON.stringify(lastGamesSnapshot) && lastTotalPlayTime !== 0) {
      return lastTotalPlayTime;
    }
    const { allGames } = useStore.getState();
    let total = 0;
    for (const game of allGames) {
      if (!game.id) continue;
      const stats = await getGameStatistics(game.id);
      if (stats && typeof stats.total_time === 'number') {
        total += stats.total_time;
      }
    }
    lastGamesSnapshot = gamesSnapshot;
    lastTotalPlayTime = total;
    return total;
  },  /**
   * 获取本周所有游戏的总游玩时长（分钟）
   * 本周定义：周一凌晨0点0分 到 周日23点59分59秒
   */
  getWeekPlayTime: async () => {
    const gamesSnapshot = getGamesIdSnapshot();
    if (JSON.stringify(gamesSnapshot) === JSON.stringify(lastGamesSnapshot) && lastWeekPlayTime !== 0) {
      return lastWeekPlayTime;
    }
    const { games } = useStore.getState();
    let total = 0;
    const now = new Date();
    
    // 计算本周开始日期（周一为一周的开始）
    const weekStart = new Date(now);
    const dayOfWeek = now.getDay(); // 0 = 周日, 1 = 周一, ..., 6 = 周六
    
    // 计算距离本周周一的天数
    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // 周日时为6天前，其他为 dayOfWeek - 1
    weekStart.setDate(now.getDate() - daysFromMonday);
    weekStart.setHours(0, 0, 0, 0); // 设置为周一凌晨0点0分
    
    // 生成本周开始日期字符串用于比较
    const weekStartDateStr = getLocalDateString(Math.floor(weekStart.getTime() / 1000));
    
    for (const game of games) {
      if (!game.id) continue;
      const stats = await getGameStatistics(game.id);
      if (stats && Array.isArray(stats.daily_stats)) {
        for (const record of stats.daily_stats) {
          // 使用字符串比较，确保准确性
          if (record.date && record.date >= weekStartDateStr) {
            total += record.playtime || 0;
          }
        }
      }
    }
    lastGamesSnapshot = gamesSnapshot;
    lastWeekPlayTime = total;
    return total;
  },

  /**
   * 获取今天所有游戏的总游玩时长（分钟）
   */
  getTodayPlayTime: async () => {
    const gamesSnapshot = getGamesIdSnapshot();
    if (JSON.stringify(gamesSnapshot) === JSON.stringify(lastGamesSnapshot) && lastTodayPlayTime !== 0) {
      return lastTodayPlayTime;
    }
    const { games } = useStore.getState();
    let total = 0;
    const today = getLocalDateString();
    for (const game of games) {
      if (!game.id) continue;
      const stats = await getGameStatistics(game.id);
      if (stats && Array.isArray(stats.daily_stats)) {
        const todayRecord = stats.daily_stats.find((r) => r.date === today);
        if (todayRecord) {
          total += todayRecord.playtime || 0;
        }
      }
    }
    lastGamesSnapshot = gamesSnapshot;
    lastTodayPlayTime = total;
    return total;
  },
}));

/**
 * initializeGamePlayTracking
 * 在应用启动时初始化时间跟踪（Tauri 环境下）
 */
export const initializeGamePlayTracking = (): void => {
  useGamePlayStore.getState().initTimeTracking();
};