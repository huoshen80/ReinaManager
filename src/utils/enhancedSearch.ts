/**
 * @file 增强搜索功能模块
 * @description 基于 pinyin-pro 和 fuse.js 的高级搜索功能，支持拼音搜索、模糊搜索、权重排序
 * @module src/utils/enhancedSearch
 * @author Pysio<qq593277393@outlook.com>
 * @copyright AGPL-3.0
 */

import { pinyin } from 'pinyin-pro';
import Fuse, { type FuseResult, type IFuseOptions } from 'fuse.js';
import type { GameData } from '@/types';

/**
 * 搜索结果接口
 */
export interface SearchResult {
  item: GameData;
  score: number;
  matches?: FuseResult<GameDataWithSearchFields>['matches'];
}

/**
 * 为游戏数据添加搜索字段
 */
interface GameDataWithSearchFields extends GameData {
  searchKeywords: string;
  pinyinFull: string;
  pinyinFirst: string;
  displayName: string;
}

/**
 * 预处理游戏数据，添加搜索相关字段
 * @param games 原始游戏数据数组
 * @returns 带搜索字段的游戏数据数组
 */
function preprocessGameData(games: GameData[]): GameDataWithSearchFields[] {
  return games.map(game => {
    // 获取显示名称
    const displayName = game.name_cn || game.name || '';
    
    // 生成搜索关键词
    const keywords = [
      game.name || '',
      game.name_cn || '',
      game.developer || '',
      ...(Array.isArray(game.all_titles) ? game.all_titles.filter(title => typeof title === 'string') : [])
    ].filter(Boolean);
    
    const searchKeywords = keywords.join(' ').toLowerCase();
    
    // 生成拼音 - 优化拼音处理
    const chineseTexts = [
      game.name_cn || '',
      game.developer || '',
      ...(Array.isArray(game.all_titles) ? 
        game.all_titles.filter(title => typeof title === 'string' && /[\u4e00-\u9fff]/.test(title)) : [])
    ].filter(text => text && /[\u4e00-\u9fff]/.test(text));
    
    // 完整拼音 (带空格分隔)
    const pinyinFull = chineseTexts.map(text => 
      pinyin(text, {
        toneType: 'none',
        type: 'string',
        separator: ' '
      }).toLowerCase()
    ).join(' ');
    
    // 拼音首字母 (连续)
    const pinyinFirst = chineseTexts.map(text =>
      pinyin(text, {
        pattern: 'first',
        toneType: 'none',
        type: 'string', 
        separator: ''
      }).toLowerCase()
    ).join('');
    
    return {
      ...game,
      searchKeywords,
      pinyinFull,
      pinyinFirst,
      displayName
    };
  });
}

/**
 * 创建 Fuse.js 搜索实例
 * @param processedGames 预处理后的游戏数据
 * @returns Fuse 搜索实例
 */
function createFuseInstance(processedGames: GameDataWithSearchFields[]): Fuse<GameDataWithSearchFields> {
  const fuseOptions: IFuseOptions<GameDataWithSearchFields> = {
    // 搜索阈值：调整为更宽松的匹配
    threshold: 0.6,
    
    // 搜索位置权重 - 匹配开始位置越靠前权重越高
    location: 0,
    distance: 200,
    
    // 最小匹配字符长度
    minMatchCharLength: 1,
    
    // 是否按分数排序
    shouldSort: true,
    
    // 是否包含匹配信息
    includeMatches: true,
    includeScore: true,
    
    // 忽略大小写和位置
    isCaseSensitive: false,
    findAllMatches: false,
    
    // 搜索的字段及其权重
    keys: [
      {
        name: 'displayName',
        weight: 0.35  // 显示名称权重最高
      },
      {
        name: 'name_cn', 
        weight: 0.35  // 中文名权重
      },
      {
        name: 'name',
        weight: 0.25  // 英文名权重
      },
      {
        name: 'pinyinFull',
        weight: 0.3   // 完整拼音权重
      },
      {
        name: 'pinyinFirst', 
        weight: 0.25  // 拼音首字母权重
      },
      {
        name: 'developer',
        weight: 0.15  // 开发商权重较低
      },
      {
        name: 'searchKeywords',
        weight: 0.2   // 其他关键词权重
      }
    ]
  };
  
  return new Fuse(processedGames, fuseOptions);
}

/**
 * 增强搜索函数
 * @param games 游戏数据数组
 * @param keyword 搜索关键词
 * @param options 搜索选项
 * @returns 搜索结果数组，按相关性排序
 */
export function enhancedSearch(
  games: GameData[],
  keyword: string,
  options: {
    limit?: number;          // 返回结果数量限制
    threshold?: number;      // 搜索阈值 (0-1)
    enablePinyin?: boolean;  // 是否启用拼音搜索
  } = {}
): SearchResult[] {
  // 如果没有关键词，返回所有游戏
  if (!keyword || keyword.trim() === '') {
    return games.map(game => ({
      item: game,
      score: 1
    }));
  }

  const {
    limit = 50,
    threshold = 0.4,
    enablePinyin = true
  } = options;

  // 预处理游戏数据
  const processedGames = preprocessGameData(games);
  
  // 创建搜索实例
  const fuse = createFuseInstance(processedGames);
  
  // 更新搜索阈值
  fuse.setCollection(processedGames);
  
  // 执行搜索
  const searchTerm = keyword.trim().toLowerCase();
  let fuseResults = fuse.search(searchTerm, { limit });
  
  // 如果启用拼音搜索且结果较少，尝试拼音搜索
  if (enablePinyin && fuseResults.length < 5) {
    // 将搜索词转换为拼音进行二次搜索
    const keywordPinyin = pinyin(searchTerm, {
      toneType: 'none',
      type: 'string',
      separator: ''
    }).toLowerCase();
    
    if (keywordPinyin !== searchTerm) {
      const pinyinResults = fuse.search(keywordPinyin, { limit });
      
      // 合并结果并去重
      const existingIds = new Set(fuseResults.map(r => r.item.id));
      const newResults = pinyinResults.filter(r => !existingIds.has(r.item.id));
      fuseResults = [...fuseResults, ...newResults];
    }
  }
  
  // 转换为统一的搜索结果格式
  const results: SearchResult[] = fuseResults
    .filter(result => (result.score || 0) <= threshold)
    .map(result => ({
      item: result.item,
      score: 1 - (result.score || 0), // Fuse.js 的 score 越小越好，转换为越大越好
      matches: result.matches
    }))
    .slice(0, limit);

  return results;
}

/**
 * 获取搜索建议（自动补全）
 * @param games 游戏数据数组
 * @param input 输入的部分关键词
 * @param limit 返回建议数量限制
 * @returns 搜索建议数组
 */
export function getSearchSuggestions(
  games: GameData[],
  input: string,
  limit: number = 8
): string[] {
  if (!input || input.trim() === '') {
    return [];
  }

  const inputLower = input.toLowerCase().trim();
  
  // 优先级排序的建议
  const prioritySuggestions: Array<{ name: string, priority: number }> = [];
  
  for (const game of games) {
    const names = [
      game.name_cn,
      game.name,
      game.developer,
      ...(Array.isArray(game.all_titles) ? game.all_titles.filter(title => typeof title === 'string') : [])
    ].filter(Boolean);
    
    // 直接名称匹配
    for (const name of names) {
      if (name && name.toLowerCase().includes(inputLower)) {
        let priority = 1;
        if (name.toLowerCase().startsWith(inputLower)) {
          priority = 3; // 开头匹配优先级高
        } else if (name.toLowerCase() === inputLower) {
          priority = 4; // 精确匹配优先级最高
        }
        prioritySuggestions.push({ name, priority });
      }
    }
    
    // 拼音匹配建议
    if (game.name_cn && /[\u4e00-\u9fff]/.test(game.name_cn)) {
      try {
        // 完整拼音
        const pinyinFull = pinyin(game.name_cn, {
          toneType: 'none',
          type: 'string',
          separator: ''
        }).toLowerCase();
        
        // 带空格拼音
        const pinyinSpaced = pinyin(game.name_cn, {
          toneType: 'none',
          type: 'string',
          separator: ' '
        }).toLowerCase();
        
        // 拼音首字母
        const pinyinFirst = pinyin(game.name_cn, {
          pattern: 'first',
          toneType: 'none',
          type: 'string',
          separator: ''
        }).toLowerCase();
        
        if (pinyinFull.includes(inputLower) || pinyinSpaced.includes(inputLower)) {
          prioritySuggestions.push({ name: game.name_cn, priority: 2 });
        } else if (pinyinFirst.includes(inputLower) && inputLower.length >= 2) {
          prioritySuggestions.push({ name: game.name_cn, priority: 1 });
        }
      } catch (error) {
        console.warn('拼音建议生成失败:', error);
      }
    }
  }
  
  // 按优先级排序并去重
  const sortedSuggestions = prioritySuggestions
    .sort((a, b) => b.priority - a.priority)
    .map(s => s.name)
    .filter((name, index, arr) => arr.indexOf(name) === index) // 去重
    .slice(0, limit);
  
  return sortedSuggestions;
}

/**
 * 高亮搜索关键词
 * @param text 原文本
 * @param keyword 搜索关键词
 * @returns 带有高亮标记的文本
 */
export function highlightSearchTerm(text: string, keyword: string): string {
  if (!keyword || keyword.trim() === '' || !text) {
    return text;
  }

  const searchTerm = keyword.trim();
  
  // 创建正则表达式，忽略大小写
  const regex = new RegExp(
    `(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,
    'gi'
  );
  
  return text.replace(regex, '<mark>$1</mark>');
}

/**
 * 检查是否包含中文字符
 * @param text 文本
 * @returns 是否包含中文
 */
export function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

/**
 * 智能搜索 - 根据输入内容自动选择最佳搜索策略
 * @param games 游戏数据数组  
 * @param keyword 搜索关键词
 * @param limit 结果数量限制
 * @returns 搜索结果
 */
export function smartSearch(
  games: GameData[],
  keyword: string,
  limit: number = 20
): SearchResult[] {
  if (!keyword || keyword.trim() === '') {
    return games.map(game => ({ item: game, score: 1 }));
  }

  const searchTerm = keyword.trim().toLowerCase();
  
  // 简化的直接搜索逻辑 - 更可靠
  const results: SearchResult[] = [];
  
  for (const game of games) {
    let score = 0;
    const displayName = (game.name_cn || game.name || '').toLowerCase();
    const englishName = (game.name || '').toLowerCase();
    const developer = (game.developer || '').toLowerCase();
    
    // 1. 精确匹配检查
    if (displayName === searchTerm || englishName === searchTerm) {
      score = 1.0;
    }
    // 2. 开头匹配
    else if (displayName.startsWith(searchTerm) || englishName.startsWith(searchTerm)) {
      score = 0.9;
    }
    // 3. 包含匹配
    else if (displayName.includes(searchTerm) || englishName.includes(searchTerm)) {
      score = 0.8;
    }
    // 4. 开发商匹配
    else if (developer.includes(searchTerm)) {
      score = 0.6;
    }
    
    // 5. 拼音匹配 (仅对中文游戏名)
    if (score === 0 && game.name_cn && /[\u4e00-\u9fff]/.test(game.name_cn)) {
      try {
        // 完整拼音匹配 (不带空格)
        const pinyinFull = pinyin(game.name_cn, {
          toneType: 'none',
          type: 'string',
          separator: ''
        }).toLowerCase();
        
        // 拼音匹配 (带空格)
        const pinyinSpaced = pinyin(game.name_cn, {
          toneType: 'none',
          type: 'string',
          separator: ' '
        }).toLowerCase();
        
        // 拼音首字母匹配
        const pinyinFirst = pinyin(game.name_cn, {
          pattern: 'first',
          toneType: 'none',
          type: 'string',
          separator: ''
        }).toLowerCase();
        
        // 检查各种拼音匹配方式
        if (pinyinFull === searchTerm) {
          score = 0.9; // 完整拼音精确匹配
        } else if (pinyinSpaced.includes(searchTerm)) {
          score = 0.8; // 拼音包含匹配
        } else if (pinyinFull.includes(searchTerm) && searchTerm.length >= 2) {
          score = 0.7; // 连续拼音部分匹配
        } else if (pinyinFirst === searchTerm && searchTerm.length >= 2) {
          score = 0.6; // 拼音首字母精确匹配
        } else if (pinyinFirst.includes(searchTerm) && searchTerm.length >= 2) {
          score = 0.5; // 拼音首字母部分匹配
        }
      } catch (error) {
        console.warn('拼音转换失败:', error);
      }
    }
    
    // 6. 模糊匹配 (编辑距离)
    if (score === 0 && searchTerm.length >= 3) {
      const distance = levenshteinDistance(searchTerm, displayName);
      const similarity = 1 - distance / Math.max(searchTerm.length, displayName.length);
      if (similarity > 0.6) {
        score = similarity * 0.4;
      }
    }
    
    if (score > 0) {
      results.push({ item: game, score });
    }
  }
  
  // 按分数排序并限制结果数量
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

// 简单的编辑距离计算
function levenshteinDistance(str1: string, str2: string): number {
  const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));

  for (let i = 0; i <= str1.length; i++) {
    matrix[0][i] = i;
  }

  for (let j = 0; j <= str2.length; j++) {
    matrix[j][0] = j;
  }

  for (let j = 1; j <= str2.length; j++) {
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }

  return matrix[str2.length][str1.length];
}
