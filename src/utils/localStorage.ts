import type { GameData } from '@/types/index';
import { getGameDisplayName } from './index';


// 定义本地存储的 key
const STORAGE_KEY = 'reina_manager_games';
const STORAGE_KEY_SETTINGS = 'reina_manager_settings';

// 定义存储下一个ID的键
const NEXT_ID_KEY = 'reina_manager_next_id';

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
  theme?: 'light' | 'dark';
  language?: string;
  // ...
  sort?: string;
  // 新增：添加方式的默认数据源
  apiSource?: 'bgm' | 'vndb' | 'mixed';
  nsfwFilter?:boolean;
  nsfwCoverReplace?:boolean;
}

// 默认设置
const DEFAULT_SETTINGS: Settings = {
  bgmToken: '',
  theme: 'light',
  language: 'zh-CN',
  sort: 'addtime',
  apiSource: 'vndb',
};

// 获取所有游戏数据（增加排序功能）
export function getGames(sortOption = 'addtime', sortOrder: 'asc' | 'desc' = 'asc'): GameData[] {
  const data = localStorage.getItem(STORAGE_KEY);
  let games: GameData[] = [];

  if (data) {
    try {
      games = JSON.parse(data);
    } catch (error) {
      console.error('解析游戏数据失败：', error);
      return [];
    }
  }

  // 根据排序选项进行排序
  return sortGames(games, sortOption, sortOrder);
}

// 排序游戏数据的辅助函数
function sortGames(games: GameData[], sortOption: string, sortOrder: 'asc' | 'desc'): GameData[] {
  // 克隆游戏数组以避免修改原数组
  const gamesCopy = [...games];

  switch (sortOption) {
    case 'addtime': {
      // 创建带索引的副本，索引表示添加顺序
      const indexedGames = gamesCopy.map((game, index) => ({
        ...game,
        _index: index // 添加临时索引，表示在数组中的位置
      }));

      // 按索引排序
      return indexedGames.sort((a, b) => {
        return sortOrder === 'asc' ? a._index - b._index : b._index - a._index;
      });
    }

    case 'datetime':
      return gamesCopy.sort((a, b) => {
        const valueA = a.date ? new Date(a.date).getTime() : 0;
        const valueB = b.date ? new Date(b.date).getTime() : 0;
        return sortOrder === 'asc' ? valueA - valueB : valueB - valueA;
      });

    case 'rank':
      // 综合排序选项 - 与数据库保持一致
      return gamesCopy.sort((a, b) => {
        // 首先按评分排序
        const scoreA = Number(a.score) || 0;
        const scoreB = Number(b.score) || 0;

        if (scoreA !== scoreB) {
          // 评分不同时直接按评分排序
          return sortOrder === 'asc' ? scoreA - scoreB : scoreB - scoreA;
        }

        // 评分相同时，按排名排序
        let rankA = Number(a.rank) || 0;
        let rankB = Number(b.rank) || 0;

        // 将 0 值（无排名）特殊处理
        if (rankA === 0) rankA = sortOrder === 'asc' ? -1 : 999999;
        if (rankB === 0) rankB = sortOrder === 'asc' ? -1 : 999999;

        // 降序时：排名越好（数值越小）越靠前
        // 升序时：排名越差（数值越大）越靠前
        return sortOrder === 'asc' ? rankB - rankA : rankA - rankB;
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
export function insertGame(game: GameData): void {
  const games = getGames();

  // 如果游戏没有ID，分配一个新ID
  if (!game.id) {
    game.id = getNextId();
  }

  games.push(game);
  setGames(games);
}

// 删除一条游戏数据
export function deleteGame(gameId: number): void {
  let games = getGames();
  games = games.filter(game => game.id !== gameId);
  setGames(games);
}

//通过 id 查找本地存储中的游戏数据
export function getGameByIdLocal(gameId: number): GameData {
  const games = getGames();
  const game = games.find(game => game.id === gameId);
  return game as GameData;
}

// 获取设置
export function getSettings(): Settings {
  const data = localStorage.getItem(STORAGE_KEY_SETTINGS);
  if (data) {
    try {
      return {...DEFAULT_SETTINGS, ...JSON.parse(data)};
    } catch (error) {
      console.error('解析设置数据失败:', error);
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
export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  const settings = getSettings();
  settings[key] = value;
  saveSettings(settings);
}

// 纯前端搜索游戏，根据name_cn(为空则搜索name)进行模糊匹配
export function searchGamesLocal(
  keyword: string,
  type: 'all' | 'local' | 'online' | 'clear' = 'all',
  sortOption = 'addtime',
  sortOrder: 'asc' | 'desc' = 'asc'
): GameData[] {
  // 浏览器不支持本地游戏，如果筛选类型是local，直接返回空数组
  if (type === 'local') {
    return [];
  }

  // 如果没有关键字但有类型筛选，使用 filterGamesByTypeLocal
  if (!keyword || keyword.trim() === '') {
    return filterGamesByTypeLocal(type, sortOption, sortOrder);
  }

  // 否则执行关键字搜索
  const searchRegex = new RegExp(keyword.trim(), 'i');
  const games = getGames(sortOption, sortOrder);
  let filteredGames = games.filter(game => {
    const displayName = getGameDisplayName(game);
    return searchRegex.test(displayName);
  });

  // 如果有类型筛选，进一步过滤结果
  if (type === 'clear') {
    filteredGames = filteredGames.filter(game => game.clear === 1);
  }
  // type === 'online' 或 'all' 不需要额外筛选，因为浏览器环境中所有游戏都是在线的

  return filteredGames;
}

export function filterGamesByTypeLocal(
  type: 'all' | 'local' | 'online' | 'clear',
  sortOption = 'addtime',
  sortOrder: 'asc' | 'desc' = 'asc'
): GameData[] {
  // 浏览器环境下简化处理:
  // - 'all': 返回所有游戏
  // - 'local': 在浏览器中无本地游戏，返回空数组
  // - 'online': 浏览器中所有游戏都是在线的，返回所有游戏
  // - 'clear': 返回已通关的游戏

  const games = getGames(sortOption, sortOrder);

  if (type === 'all' || type === 'online') {
    return games;
  }

  if (type === 'clear') {
    return games.filter(game => game.clear === 1);
  }

  // 浏览器环境中没有本地游戏
  return [];
}

// 用于初始化或重置ID计数器的函数
export function resetIdCounter(): void {
  localStorage.setItem(NEXT_ID_KEY, '1');
}

// 用于同步ID计数器的函数，确保新ID大于所有现有ID
export function syncIdCounter(): void {
  const games = getGames();

  if (games.length === 0) {
    resetIdCounter();
    return;
  }

  // 找出当前最大ID
  const maxId = Math.max(...games.map(game => typeof game.id === 'number' ? game.id : 0));

  // 确保下一个ID比最大ID大
  const currentNextId = Number(localStorage.getItem(NEXT_ID_KEY)) || 1;
  if (maxId >= currentNextId) {
    localStorage.setItem(NEXT_ID_KEY, String(maxId + 1));
  }
}
