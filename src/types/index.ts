/**
 * @file 类型定义
 * @description 定义全局使用的核心数据类型，包括游戏数据、会话、统计等。
 * @module src/types/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

/**
 * 游戏数据结构
 */
export interface GameData {
    id?: number;
    date?: string;
    image?: string;
    summary?: string;
    name: string;
    name_cn?: string;
    tags?: string[];
    rank?: number | null;
    score?: number;
    bgm_id?: string | null;
    vndb_id?: string | null;
    id_type?: string | string | 'bgm' | 'vndb' | 'mixed' | 'custom' | 'Whitecloud';
    time?: Date;
    localpath?: string;
    savepath?: string;
    autosave?: 1 | 0; // 是否自动保存，1表示是，0表示否
    developer?: string | null;
    all_titles?: string[];
    aveage_hours?: number;
    clear?: 1 | 0;
    custom_name?: string;
    custom_cover?: string | null; // 存储自定义封面的文件扩展名，如 'jpg', 'png', 'webp' 等
    aliases?: string[];
}

export interface BgmGameData {
  id: number;
  image: string;
  name: string;
  name_cn: string;
  aliases: string[];
  summary: string;
  tags: string[];
  rank: number | null;
  score: number;
  developer: string | null;
}

export interface VndbGameData {
  id: number;
  image: string;
  name: string;
  name_cn: string;
  all_titles: string[];
  aliases: string[];
  summary: string;
  tags: Object[];//多类型标签，待扩展
  aveage_hours: number;
  developer: string | null;
  score: number;
}

/**
 * 操作游戏相关属性类型
 */
export interface HanleGamesProps  {
    id: number | undefined | null;
    getGameById: (id: number) => Promise<GameData>;
    canUse?: () => boolean;
}

/**
 * 游戏会话记录
 */
export interface GameSession {
  session_id: number; // 会话的唯一标识符
  game_id: number;    // 游戏的唯一标识符
  start_time: number;
  end_time?: number;
  duration?: number;  // 分钟
  date: string;
}

/**
 * 游戏统计数据（原始）
 */
export interface GameStatistics {
  game_id: number; // 游戏的唯一标识符
  total_time: number; // 分钟
  session_count: number;
  last_played?: number;
  daily_stats?: Array<{date: string; playtime: number}>; // 新格式: [{date: "YYYY-MM-DD", playtime: minutes}, ...]
}

/**
 * 格式化后的游戏时间统计
 */
export interface GameTimeStats {
  totalPlayTime: string; // 格式化的总时间，如"10小时20分钟"
  totalMinutes: number;  // 总分钟数
  todayPlayTime: string; // 今天的游戏时间
  todayMinutes: number;  // 今天的分钟数
  sessionCount: number;  // 启动次数
  lastPlayed: Date | null; // 最后一次游玩时间
  daily_stats?: Array<{date: string; playtime: number}>; // 新格式: [{date: "YYYY-MM-DD", playtime: minutes}, ...]
}

/**
 * 游戏时间更新回调类型
 * @param gameId 游戏ID
 * @param minutes 已游玩分钟数
 */
export type TimeUpdateCallback = (gameId: number, minutes: number) => void;

/**
 * 游戏会话结束回调类型
 * @param gameId 游戏ID
 * @param minutes 本次会话时长（分钟）
 */
export type SessionEndCallback = (gameId: number, minutes: number) => void;

/**
 * 存档备份记录
 */
export interface SavedataRecord {
  id: number;
  game_id: number;
  file: string;  // 对应数据库中的 file 列（备份文件名）
  backup_time: number;
  file_size: number;
}

