-- 迁移 2: 自定义名字和封面功能
-- 版本: 2
-- 描述: 为games表添加自定义名字和自定义封面字段，封面以BASE64格式存储减少外部依赖

-- ========================================
-- 添加自定义名字和封面功能
-- ========================================

-- 为games表添加自定义名字字段
ALTER TABLE games ADD COLUMN custom_name TEXT;

-- 为games表添加自定义封面字段 (存储BASE64编码的图片数据)
ALTER TABLE games ADD COLUMN custom_image_base64 TEXT;

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_games_custom_name ON games(custom_name);