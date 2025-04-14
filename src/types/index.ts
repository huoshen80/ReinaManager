export interface GameData {
    id?: number;
    date?: string;
    image?: string;
    summary?: string;
    name: string;
    name_cn?: string;
    tags?: string[];
    rank?: number|null;
    score?: number;
    bgm_id?: string|null;
    vndb_id?: string|null;
    id_type?: string|'bgm' | 'vndb' | 'mixed' | 'custom';
    time: Date;
    localpath?: string;
    developer?: string|null;
    all_titles?: string[];
    aveage_hours?: number;
}


export interface HanleGamesProps  {
    id: number|undefined|null;
    getGameById: (id: number) => Promise<GameData>;
    canUse?: () => boolean;
}

// 游戏会话记录
export interface GameSession {
  game_id: number; // 游戏的唯一标识符
  start_time: number;
  end_time?: number;
  duration?: number; // 分钟
  date: string;
}

// 游戏统计数据
export interface GameStatistics {
  game_id: number; // 游戏的唯一标识符
  total_time: number; // 分钟
  session_count: number;
  last_played?: number;
  daily_stats?: Array<{date: string; playtime: number}>; // 新格式: [{date: "YYYY-MM-DD", playtime: minutes}, ...]
}

// 格式化后的游戏时间统计
export interface GameTimeStats {
  totalPlayTime: string; // 格式化的总时间，如"10小时20分钟"
  totalMinutes: number;  // 总分钟数
  todayPlayTime: string; // 今天的游戏时间
  todayMinutes: number;  // 今天的分钟数
  sessionCount: number;  // 启动次数
  lastPlayed: Date | null; // 最后一次游玩时间
  daily_stats?: Array<{date: string; playtime: number}>; // 新格式: [{date: "YYYY-MM-DD", playtime: minutes}, ...]
}

// 回调函数类型
export type TimeUpdateCallback = (gameId: number, minutes: number) => void;
export type SessionEndCallback = (gameId: number, minutes: number) => void;

