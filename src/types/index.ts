/**
 * @file 类型定义
 * @description 定义全局使用的核心数据类型，包括游戏数据、会话、统计等。
 * @module src/types/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

/**
 * 游戏基础表数据 (games 表) - 后端原始数据
 */
export interface RawGameData {
    id?: number;
    bgm_id?: string | null;
    vndb_id?: string | null;
    id_type?: string; // 'bgm' | 'vndb' | 'mixed' | 'custom' | 'Whitecloud'
    date?: string | null;
    localpath?: string | null;
    savepath?: string | null;
    autosave?: number | null;
    clear?: number | null;
    custom_name?: string | null;
    custom_cover?: string | null;
    created_at?: number | null;
    updated_at?: number | null;
}

/**
 * BGM 数据结构(bgm_data 表)
 */
export interface BgmData {
    game_id?: number;
    image?: string;
    name?: string;
    name_cn?: string | null;
    aliases?: string | null; // JSON 字符串
    summary?: string | null;
    tags?: string | null; // JSON 字符串
    rank?: number | null;
    score?: number | null;
    developer?: string | null;
}

export interface ApiBgmData extends BgmData {
  aliases_Array?: string[] | null; // api获取字段
  tags_Array?: string[] | null; // api获取字段
}

/**
 * VNDB 数据结构(vndb_data 表)
 */
export interface VndbData {
    game_id?: number;
    image?: string;
    name?: string;
    name_cn?: string | null;
    all_titles?: string | null; // JSON 字符串
    aliases?: string | null; // JSON 字符串
    summary?: string | null;
    tags?: string | null; // JSON 字符串
    average_hours?: number | null;
    developer?: string | null;
    score?: number | null;
}

export interface ApiVndbData extends VndbData {
  all_titles_Array?: string[] | null; // api获取字段
  aliases_Array?: string[] | null; // api获取字段
  tags_Array?: string[] | null; // api获取字段
}


/**
 * 其他数据结构(other_data 表)
 */
export interface OtherData {
    game_id?: number;
    image?: string | null;
    name?: string | null;
    summary?: string | null;
    tags?: string | null; // JSON 字符串
    developer?: string | null;
}

/**
 * 完整游戏数据 - 包含关联的 BGM/VNDB/Other 数据
 */
export interface FullGameData {
    game: RawGameData;
    bgm_data?: BgmData | null;
    vndb_data?: VndbData | null;
    other_data?: OtherData | null;
}

/**
 * 游戏数据结构 - 最终显示层,所有字段已展平
 * 这是组件使用的统一数据格式
 */
export interface GameData {
    // 基础字段 (来自 games 表)
    id?: number;
    bgm_id?: string | null;
    vndb_id?: string | null;
    id_type?: string;
    date?: string | null;
    localpath?: string | null;
    savepath?: string | null;
    autosave?: number | null;
    clear?: number | null;
    custom_name?: string | null;
    custom_cover?: string | null;
    created_at?: number | null;
    updated_at?: number | null;
    
    // 展平的关联数据字段 (来自 bgm/vndb/other 表)
    image?: string;
    name?: string;
    name_cn?: string | null;
    summary?: string | null;
    tags?: string[];
    rank?: number | null;
    score?: number | null;
    developer?: string | null;
    all_titles?: string[];
    aliases?: string[];
    average_hours?: number | null;
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

