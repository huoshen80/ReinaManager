/**
 * @file 数据转换工具
 * @description 将后端数据结构转换为前端显示结构,智能合并关联数据
 */

import type { GameData, FullGameData, RawGameData } from '@/types';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getResourceDirPath } from '@/utils';
import i18next from 'i18next';

/**
 * 安全解析 JSON 字符串为数组
 */
function safeParseJSONArray(jsonStr: string | null | undefined): string[] {
  if (!jsonStr) return [];
  try {
    const parsed = JSON.parse(jsonStr);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.warn('JSON 解析失败:', jsonStr, e);
    return [];
  }
}

/**
 * 根据 id_type 智能合并游戏数据
 * 实现类似 api/mixed.ts 的逻辑
 * 
 * @param fullData 完整游戏数据(包含关联表)
 * @param language 当前语言
 * @returns 展平的 GameData
 */
export function getDisplayGameData(fullData: FullGameData, language?: string): GameData {
  const { game, bgm_data, vndb_data, other_data } = fullData;
  const currentLanguage = language || i18next.language;
  
  // 基础数据
  const baseData: GameData = {
    ...game,
    // 初始化展平字段
    image: undefined,
    name: undefined,
    name_cn: undefined,
    summary: undefined,
    tags: [],
    rank: undefined,
    score: undefined,
    developer: undefined,
    all_titles: undefined,
    aliases: undefined,
    average_hours: undefined,
  };

  // 根据 id_type 决定数据来源
  switch (game.id_type) {
    case 'bgm':
      // 纯 BGM 数据
      if (bgm_data) {
        baseData.image = bgm_data.image || undefined;
        baseData.name = bgm_data.name;
        baseData.name_cn = bgm_data.name_cn || undefined;
        baseData.summary = bgm_data.summary || undefined;
        baseData.tags = safeParseJSONArray(bgm_data.tags);
        baseData.rank = bgm_data.rank || undefined;
        baseData.score = bgm_data.score || undefined;
        baseData.developer = bgm_data.developer || undefined;
        baseData.aliases = safeParseJSONArray(bgm_data.aliases);
      }
      break;

    case 'vndb':
      // 纯 VNDB 数据
      if (vndb_data) {
        baseData.image = vndb_data.image || undefined;
        baseData.name = vndb_data.name;
        baseData.name_cn = vndb_data.name_cn || undefined;
        baseData.summary = vndb_data.summary || undefined;
        baseData.tags = safeParseJSONArray(vndb_data.tags);
        baseData.score = vndb_data.score || undefined;
        baseData.developer = vndb_data.developer || undefined;
        baseData.all_titles = safeParseJSONArray(vndb_data.all_titles);
        baseData.aliases = safeParseJSONArray(vndb_data.aliases);
        baseData.average_hours = vndb_data.average_hours || undefined;
      }
      break;

    case 'mixed':
      // 混合数据 - 参考 api/mixed.ts 的逻辑
      // 优先使用 BGM 数据,VNDB 补充
      if (bgm_data || vndb_data) {
        // 封面: BGM 优先
        baseData.image = bgm_data?.image || vndb_data?.image || undefined;
        
        // 名称: BGM 优先
        baseData.name = bgm_data?.name || vndb_data?.name || undefined;
        baseData.name_cn = bgm_data?.name_cn || vndb_data?.name_cn || undefined;

        // 简介: BGM 优先,如果为空则用 VNDB
        baseData.summary = bgm_data?.summary || vndb_data?.summary || undefined;

        // 标签: 合并两者,去重
        const bgmTags = safeParseJSONArray(bgm_data?.tags);
        const vndbTags = safeParseJSONArray(vndb_data?.tags);
        baseData.tags = Array.from(new Set([...bgmTags, ...vndbTags]));
        
        // 排名: 只有 BGM 有
        baseData.rank = bgm_data?.rank || undefined;

        // 评分: BGM 优先
        baseData.score = bgm_data?.score || vndb_data?.score || undefined;

        // 开发商: BGM 优先
        baseData.developer = bgm_data?.developer || vndb_data?.developer || undefined;

        // VNDB 特有字段
        baseData.all_titles = safeParseJSONArray(vndb_data?.all_titles);
        baseData.average_hours = vndb_data?.average_hours || undefined;

        // 别名: 合并两者
        const bgmAliases = safeParseJSONArray(bgm_data?.aliases);
        const vndbAliases = safeParseJSONArray(vndb_data?.aliases);
        baseData.aliases = Array.from(new Set([...bgmAliases, ...vndbAliases]));
      }
      break;

    case 'custom':
    case 'Whitecloud':
      // 使用 other 表数据
      if (other_data) {
        baseData.image = other_data.image || undefined;
        baseData.name = other_data.name || undefined;
        baseData.summary = other_data.summary || undefined;
        baseData.tags = safeParseJSONArray(other_data.tags);
        baseData.developer = other_data.developer || undefined;
      }
      break;

    default:
      // 未知类型,尝试使用任何可用数据
      const anyData = bgm_data || vndb_data || other_data;
      if (anyData) {
        baseData.image = anyData.image || undefined;
        baseData.name = anyData.name || undefined;
        baseData.summary = anyData.summary || undefined;
        baseData.tags = safeParseJSONArray(anyData.tags);
        baseData.developer = anyData.developer || undefined;
      }
      break;
  }

  // 处理自定义名称和封面
  if (game.custom_name) {
    baseData.name = game.custom_name;
  }
  
  // 处理自定义封面
  if (game.custom_cover && game.id) {
    baseData.image = getCustomCoverUrl(game.id, game.custom_cover);
  }
  
  // 处理显示名称 (根据语言)
  baseData.name = getGameDisplayName(baseData, currentLanguage);

  return baseData;
}

/**
 * 批量转换 FullGameData 数组
 */
export function getDisplayGameDataList(fullDataList: FullGameData[], language?: string): GameData[] {
  return fullDataList.map(fullData => getDisplayGameData(fullData, language));
}

/**
 * 获取自定义封面 URL
 */
function getCustomCoverUrl(gameId: number, customCover: string): string {
  const resourceFolder = getResourceDirPath();
  if (!resourceFolder) {
    return '';
  }
  
  const customCoverFolder = `${resourceFolder}\\resources\\covers\\game_${gameId}`;
  const customCoverPath = `${customCoverFolder}\\cover_${gameId}_${customCover}`;
  
  try {
    return convertFileSrc(customCoverPath);
  } catch (error) {
    return `asset://localhost/resources/covers/game_${gameId}/cover_${gameId}_${customCover}`;
  }
}

/**
 * 获取游戏显示名称
 * 优先级: custom_name > name_cn (中文环境) > name
 */
function getGameDisplayName(game: GameData, language: string): string {
  if (game.custom_name) {
    return game.custom_name;
  }
  
  // 只有当语言为zh-CN时才使用name_cn
  if (language === 'zh-CN' && game.name_cn) {
    return game.name_cn;
  }
  
  return game.name || '';
}


/**
 * 将简单的 RawGameData 转换为 GameData
 * 用于只有基础数据没有关联数据的场景
 */
export function rawGameDataToDisplay(game: RawGameData): GameData {
  return {
    ...game,
    name: game.custom_name || '',
    tags: [],
  };
}

/**
 * 时间戳转 Date 对象
 */
export function timestampToDate(timestamp?: number | null): Date | null {
  if (!timestamp) return null;
  return new Date(timestamp * 1000);
}

/**
 * Date 对象转时间戳
 */
export function dateToTimestamp(date?: Date | null): number | null {
  if (!date) return null;
  return Math.floor(date.getTime() / 1000);
}

/**
 * 格式化时间戳为本地日期字符串
 */
export function formatTimestamp(timestamp?: number | null, format: 'date' | 'datetime' = 'date'): string {
  if (!timestamp) return '';
  const date = new Date(timestamp * 1000);
  
  if (format === 'date') {
    return date.toLocaleDateString('zh-CN');
  }
  return date.toLocaleString('zh-CN');
}

// 兼容旧的导出名称
export const toDisplayGameData = getDisplayGameData;
export const toDisplayGameDataList = getDisplayGameDataList;
export const gameDataToDisplay = rawGameDataToDisplay;
