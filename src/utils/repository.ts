import type { GameData, SavedataRecord } from '@/types';
import { getDb } from './database';
import {isNsfwGame} from "@/utils/index.ts";

// 处理排序选项的工具函数
function getSortConfig(sortOption = 'addtime', sortOrder: 'asc' | 'desc' = 'asc') {
  let sortField = 'id';
  const sortDirection = sortOrder.toUpperCase();
  let customSortSql = '';

  switch (sortOption) {
    case 'addtime':
      sortField = 'id';
      break;
    case 'datetime':
      sortField = 'date';
      break;
    case 'lastplayed':
      // 使用子查询实现最近游玩排序
        //最近游玩的在前，未游玩的在最后
        customSortSql = `ORDER BY 
          CASE 
            WHEN (SELECT last_played FROM game_statistics WHERE game_statistics.game_id = games.id) IS NULL THEN 0 
            ELSE 1 
          END DESC,
          (SELECT last_played FROM game_statistics WHERE game_statistics.game_id = games.id) DESC,
          games.id DESC`;
      break;
    case 'rank':
      // 修正的综合排序逻辑...
      if (sortOrder.toUpperCase() === 'DESC') {
        customSortSql = `ORDER BY 
          score DESC, 
          CASE 
            WHEN rank IS NULL OR rank = 0 THEN 999999 
            ELSE rank 
          END ASC`;
      } else {
        customSortSql = `ORDER BY 
          score ASC, 
          CASE 
            WHEN rank IS NULL OR rank = 0 THEN -1
            ELSE rank 
          END DESC`;
      }
      break;
    default:
      sortField = 'id';
  }

  return { sortField, sortDirection, customSortSql };
}

// 处理查询结果的工具函数
function processGameRows(rows: GameData[]): GameData[] {
  return rows.map(row => ({
    ...row,
    tags: typeof row.tags === 'string' ? JSON.parse(row.tags) : row.tags,
    all_titles: typeof row.all_titles === 'string' ? JSON.parse(row.all_titles) : row.all_titles,
    aliases: typeof row.aliases === 'string' ? JSON.parse(row.aliases) : row.aliases
  }));
}

// 插入游戏数据，将 tags 序列化存储
export async function insertGame(game: GameData) {
  const db = await getDb();
  await db.execute(
    `
    INSERT INTO games (bgm_id,vndb_id,id_type, date, image, summary, name, name_cn, tags, rank, score, time, localpath, developer, all_titles, aveage_hours, aliases, custom_name, custom_cover)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    `,
    [
      game.bgm_id,
      game.vndb_id,
      game.id_type,
      game.date,
      game.image,
      game.summary,
      game.name,
      game.name_cn,
      JSON.stringify(game.tags),
      game.rank,
      game.score,
      game.time,
      game.localpath,
      game.developer,
      JSON.stringify(game.all_titles),
      game.aveage_hours,
      JSON.stringify(game.aliases || []),
      game.custom_name,
      game.custom_cover || null
    ]
  );
}

// 获取所有游戏数据
export async function getGames(sortOption = 'addtime', sortOrder: 'asc' | 'desc' = 'asc'): Promise<GameData[]> {
  const db = await getDb();
  const { sortField, sortDirection, customSortSql } = getSortConfig(sortOption, sortOrder);

  let query = `
    SELECT id, bgm_id,vndb_id, date, image, summary, name, name_cn, tags, rank, score, time, localpath , savepath, autosave, developer,all_titles,aveage_hours,clear, aliases, custom_name, custom_cover FROM games
  `;

  if (customSortSql) {
    query += ` ${customSortSql};`;
  } else {
    query += ` ORDER BY ${sortField} ${sortDirection};`;
  }

  const rows = await db.select<GameData[]>(query);
  return processGameRows(rows);
}

// 通过tags中的R18来判断是否为NSFW
// Todo 等待到可以用户自定义数据后或应该添加专门的一个key来存储是否为NSFW
export function applyNsfwFilter(data: GameData[], nsfwFilter: boolean): GameData[] {
  if (!nsfwFilter) return data;
  return data.filter(game => {
    const tags = typeof game.tags === "string" ? JSON.parse(game.tags) : game.tags;
    return !isNsfwGame(tags);
  });
}

// 通过内部ID获取游戏数据
export async function getGameById(id: number): Promise<GameData | null> {
  const db = await getDb();
  const rows = await db.select<GameData[]>(`
    SELECT * FROM games WHERE id = ? LIMIT 1;
  `, [id]);

  if (rows.length === 0) return null;
  return processGameRows(rows)[0];
}

// 删除游戏记录
export async function deleteGame(gameId: number) {
  const db = await getDb();
  // 删除相关的会话记录和统计数据
  await db.execute("DELETE FROM game_sessions WHERE game_id = ?", [gameId]);
  await db.execute("DELETE FROM game_statistics WHERE game_id = ?", [gameId]);
  await db.execute("DELETE FROM savedata WHERE game_id = ?", [gameId]);
  //删除游戏数据
  await db.execute("DELETE FROM games WHERE id = ?", [gameId]);
}

// 更新搜索游戏函数，添加类型筛选功能和增强搜索
export async function searchGames(
  keyword: string,
  type: 'all' | 'local' | 'online' | 'clear' = 'all',
  sortOption = 'addtime',
  sortOrder: 'asc' | 'desc' = 'asc'
): Promise<GameData[]> {
  // 关键字为空且不筛选类型时，返回所有游戏
  if ((!keyword || keyword.trim() === '') && type === 'all') {
    return getGames(sortOption, sortOrder);
  }

  // 关键字为空但需要筛选类型时
  if ((!keyword || keyword.trim() === '') && type !== 'all') {
    return filterGamesByType(type, sortOption, sortOrder);
  }

  // 使用增强搜索：先获取所有游戏数据，然后使用客户端搜索
  const { enhancedSearch } = await import('./enhancedSearch');
  
  // 根据类型筛选获取基础数据
  let baseGames: GameData[];
  if (type !== 'all') {
    baseGames = await filterGamesByType(type, sortOption, sortOrder);
  } else {
    baseGames = await getGames(sortOption, sortOrder);
  }

  // 如果没有关键词，直接返回筛选结果
  if (!keyword || keyword.trim() === '') {
    return baseGames;
  }

  // 使用增强搜索
  const searchResults = enhancedSearch(baseGames, keyword, {
    limit: 50,
    threshold: 0.6,
    enablePinyin: true
  });
  
  // 提取搜索结果中的游戏数据
  return searchResults.map(result => result.item);
}

// 根据游戏类型进行筛选（全部/本地/网络）
export async function filterGamesByType(
  type: 'all' | 'local' | 'online' | 'clear',
  sortOption = 'addtime',
  sortOrder: 'asc' | 'desc' = 'asc'
): Promise<GameData[]> {
  if (type === 'all') {
    return getGames(sortOption, sortOrder);
  }

  const db = await getDb();
  const { sortField, sortDirection, customSortSql } = getSortConfig(sortOption, sortOrder);

  let filterCondition = '';
  if (type === 'local') {
    filterCondition = 'WHERE localpath IS NOT NULL AND localpath != ""';
  } else if (type === 'online') {
    filterCondition = 'WHERE localpath IS NULL OR localpath = ""';
  } else if (type === 'clear') {
    filterCondition = 'WHERE clear = 1';
  }

  let query = `
    SELECT id, bgm_id,vndb_id, date, image, summary, name, name_cn, tags, rank, score, time, localpath, savepath, autosave, developer, all_titles, aveage_hours, clear, aliases, custom_name, custom_cover
    FROM games
    ${filterCondition}
  `;

  if (customSortSql) {
    query += ` ${customSortSql};`;
  } else {
    query += ` ORDER BY ${sortField} ${sortDirection};`;
  }

  const rows = await db.select<GameData[]>(query);
  return processGameRows(rows);
}

// 更新游戏数据 - 智能部分更新，只更新提供的字段
export const updateGame = async (id: number, gameUpdates: Partial<GameData>) => {
  const db = await getDb();
  
  // 构建动态SQL语句，只更新提供的字段
  const updateFields: string[] = [];
  const values: any[] = [];
  
  // 定义字段映射
  const fieldMap: Record<keyof GameData, string> = {
    id: 'id',
    bgm_id: 'bgm_id',
    vndb_id: 'vndb_id', 
    id_type: 'id_type',
    date: 'date',
    image: 'image',
    summary: 'summary',
    name: 'name',
    name_cn: 'name_cn',
    tags: 'tags',
    rank: 'rank',
    score: 'score',
    developer: 'developer',
    all_titles: 'all_titles',
    aveage_hours: 'aveage_hours',
    localpath: 'localpath',
    savepath: 'savepath',
    autosave: 'autosave',
    clear: 'clear',
    time: 'time',
    custom_name: 'custom_name',
    custom_cover: 'custom_cover',
    aliases: 'aliases'
  } as const;
  
  // 构建更新字段（排除不应该直接更新的字段）
  const excludeFields = ['id', 'time']; // id是主键，time可能有特殊处理逻辑
  
  for (const [key, dbField] of Object.entries(fieldMap)) {
    if (excludeFields.includes(key)) continue;
    
    if (gameUpdates.hasOwnProperty(key) && gameUpdates[key as keyof GameData] !== undefined) {
      updateFields.push(`${dbField} = ?`);
      
      // 对于数组字段需要JSON序列化
      if (key === 'tags' || key === 'all_titles' || key === 'aliases') {
        values.push(JSON.stringify(gameUpdates[key as keyof GameData]));
      } else {
        values.push(gameUpdates[key as keyof GameData]);
      }
    }
  }
  
  if (updateFields.length === 0) {
    throw new Error('No fields to update');
  }
  
  // 添加WHERE条件的ID参数
  values.push(id);
  
  const sql = `UPDATE games SET ${updateFields.join(', ')} WHERE id = ?`;
  
  await db.execute(sql, values);
};

// ==================== 备份相关数据库操作 ====================

/**
 * 保存备份记录到数据库
 * @param gameId 游戏ID
 * @param fileName 备份文件名
 * @param backupTime 备份时间戳
 * @param fileSize 文件大小
 * @returns 新插入记录的ID
 */
export async function saveSavedataRecord(
  gameId: number,
  fileName: string,
  backupTime: number,
  fileSize: number
): Promise<number> {
  const db = await getDb();
  const result = await db.execute(
    `INSERT INTO savedata (game_id, file, backup_time, file_size) 
     VALUES (?, ?, ?, ?)`,
    [gameId, fileName, backupTime, fileSize]
  );
  return result.lastInsertId as number;
}

/**
 * 获取指定游戏的备份数量
 * @param gameId 游戏ID
 * @returns 备份数量
 */
export async function getSavedataCount(gameId: number): Promise<number> {
  const db = await getDb();
  const result = await db.select<{ count: number }[]>(
    "SELECT COUNT(*) as count FROM savedata WHERE game_id = ?",
    [gameId]
  );
  return result[0]?.count || 0;
}

/**
 * 获取指定游戏的所有备份记录
 * @param gameId 游戏ID
 * @returns 备份记录列表
 */
export async function getSavedataRecords(gameId: number): Promise<SavedataRecord[]> {
  const db = await getDb();
  const records = await db.select<SavedataRecord[]>(
    `SELECT id, game_id, file, backup_time, file_size 
     FROM savedata 
     WHERE game_id = ? 
     ORDER BY backup_time DESC`,
    [gameId]
  );
  return records;
}

/**
 * 删除备份记录
 * @param backupId 备份记录ID
 */
export async function deleteSavedataRecord(backupId: number): Promise<void> {
  const db = await getDb();
  await db.execute(
    "DELETE FROM savedata WHERE id = ?",
    [backupId]
  );
}

/**
 * 根据ID获取备份记录
 * @param backupId 备份记录ID
 * @returns 备份记录或null
 */
export async function getSavedataRecordById(backupId: number): Promise<SavedataRecord | null> {
  const db = await getDb();
  const records = await db.select<SavedataRecord[]>(
    `SELECT id, game_id, file, backup_time, file_size 
     FROM savedata 
     WHERE id = ?`,
    [backupId]
  );
  return records.length > 0 ? records[0] : null;
}
