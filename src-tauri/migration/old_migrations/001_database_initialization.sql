-- 迁移 1: 数据库重置和初始化
-- 版本: 1
-- 描述: 重置迁移系统并创建完整的表结构

-- ========================================
-- 创建完整的表结构（兼容现有数据库）
-- ========================================

-- 创建存储游戏数据的表
CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bgm_id TEXT,
    vndb_id TEXT,
    id_type TEXT NOT NULL,
    date TEXT,
    image TEXT,
    summary TEXT,
    name TEXT,
    name_cn TEXT,
    all_titles TEXT,
    tags TEXT,
    rank INTEGER,
    score REAL,
    time TEXT,
    localpath TEXT,
    savepath TEXT,
    autosave INTEGER DEFAULT 0,
    developer TEXT,
    aveage_hours REAL,
    clear INTEGER DEFAULT 0
);

-- 创建 user 表
CREATE TABLE IF NOT EXISTS user (
    id INTEGER PRIMARY KEY,
    BGM_TOKEN TEXT,
    save_root_path TEXT
);

-- 游戏会话表
CREATE TABLE IF NOT EXISTS game_sessions (
    session_id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    duration INTEGER NOT NULL,
    date TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY(game_id) REFERENCES games(id)
);

-- 游戏统计表
CREATE TABLE IF NOT EXISTS game_statistics (
    game_id INTEGER PRIMARY KEY,
    total_time INTEGER DEFAULT 0,
    session_count INTEGER DEFAULT 0,
    last_played INTEGER,
    daily_stats TEXT DEFAULT '{}',
    FOREIGN KEY(game_id) REFERENCES games(id)
);

-- 存档备份表
CREATE TABLE IF NOT EXISTS savedata (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    file TEXT NOT NULL,
    backup_time INTEGER NOT NULL,
    file_size INTEGER NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY(game_id) REFERENCES games(id)
);

-- ========================================
-- 创建索引
-- ========================================

CREATE INDEX IF NOT EXISTS idx_games_autosave ON games(autosave);
CREATE INDEX IF NOT EXISTS idx_savedata_game_id ON savedata(game_id);
CREATE INDEX IF NOT EXISTS idx_savedata_backup_time ON savedata(backup_time);
CREATE INDEX IF NOT EXISTS idx_game_sessions_game_id ON game_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_date ON game_sessions(date);
CREATE INDEX IF NOT EXISTS idx_games_clear ON games(clear);           -- 按通关状态筛选
CREATE INDEX IF NOT EXISTS idx_games_score ON games(score);           -- 按评分排序
CREATE INDEX IF NOT EXISTS idx_games_localpath ON games(localpath);   -- 检查本地路径
CREATE INDEX IF NOT EXISTS idx_game_statistics_last_played ON game_statistics(last_played); -- 最近游玩时间
