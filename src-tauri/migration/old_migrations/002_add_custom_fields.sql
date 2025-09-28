-- 迁移 2: 添加自定义字段支持
-- 版本: 2
-- 描述: 为games表添加aliases、custom_name和custom_cover字段
-- 日期: 2025-09-03

-- ========================================
-- 为games表添加新字段
-- ========================================

-- 添加别名字段，用于存储游戏的多个别名
ALTER TABLE games ADD COLUMN aliases TEXT;

-- 添加自定义名称字段，用于用户自定义游戏显示名称
ALTER TABLE games ADD COLUMN custom_name TEXT;

-- 添加自定义封面字段
ALTER TABLE games ADD COLUMN custom_cover TEXT;

-- ========================================
-- 为新字段创建索引以提高查询性能
-- ========================================

-- 为自定义名称创建索引，便于搜索
CREATE INDEX IF NOT EXISTS idx_games_custom_name ON games(custom_name);

-- 为自定义封面标志创建索引，便于筛选
CREATE INDEX IF NOT EXISTS idx_games_custom_cover ON games(custom_cover);
