/**
 * @file Bangumi 游戏信息 API 封装
 * @description 提供与 Bangumi API 交互的函数，包括通过名称或 ID 获取游戏条目，并对标签进行敏感词过滤。
 * @module src/api/bgm
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - fetchBgmById：根据 Bangumi ID 获取游戏详细信息
 * - fetchBgmByName：根据游戏名称搜索获取游戏详细信息
 *
 * 依赖：
 * - http: 封装的 HTTP 请求工具
 */

import { tauriHttp } from './http'
import pkg from '../../package.json'
import i18n from '@/utils/i18n'
import { ApiBgmData, RawGameData } from '@/types';

/**
 * 过滤掉包含敏感关键词的标签。
 *
 * @param tags 标签字符串数组。
 * @returns 过滤后的标签字符串数组，不包含敏感词。
 */
function filterSensitiveTags(tags: string[]): string[] {
  const sensitiveKeywords = [
    '台独', '港独', '藏独', '分裂', '反华', '辱华',
  ];
  return tags.filter(tag => {
    return !sensitiveKeywords.some(keyword => tag.includes(keyword));
  });
}

// 新增：将 BGM API 返回对象转换为统一的结构
const transformBgmData = (BGMdata: any) => {
  const game: RawGameData = {
    bgm_id: String(BGMdata.id),
    id_type: 'bgm',
    date: BGMdata.date,
  };

  const bgm_data: ApiBgmData = {
    image: BGMdata.images?.large || null,
    summary: BGMdata.summary || null,
    name: BGMdata.name || null,
    name_cn: BGMdata.name_cn || null,
    aliases: BGMdata.infobox?.find((k: { key: string }) => k.key === '别名')?.value?.map((k: { v: string }) => k.v) || [],
    tags_Array: filterSensitiveTags(
      (BGMdata.tags || []).map((tag: { name: string }) => tag.name)
    ),
    rank: BGMdata.rating?.rank ?? null,
    score: BGMdata.rating?.score ?? null,
    developer: BGMdata.infobox?.find((k: { key: string }) => k.key === '开发' || k.key === '游戏开发商')?.value || null,
  };

  return { game, bgm_data };
}

/**
 * 根据 Bangumi ID 获取游戏详细信息
 *
 * @param id Bangumi 条目 ID
 * @param BGM_TOKEN Bangumi API 访问令牌
 * @returns 返回游戏详细信息对象，若失败则返回错误提示字符串
 */
export async function fetchBgmById(id: string, BGM_TOKEN: string) {
  // 使用 Tauri HTTP 客户端，支持自定义 User-Agent
  const BGM_HEADER = {
    headers: {
      'Accept': 'application/json',
      'User-Agent': `huoshen80/ReinaManager/${pkg.version} (https://github.com/huoshen80/ReinaManager)`,
      ...(BGM_TOKEN ? { Authorization: `Bearer ${BGM_TOKEN}` } : {}),
    },
  };

  try {
    const BGMdata = (await tauriHttp.get(
      `https://api.bgm.tv/v0/subjects/${id}`,
      BGM_HEADER
    )).data;

    if (!BGMdata?.id) {
      return i18n.t('api.bgm.notFound', '未找到相关条目，请确认游戏ID后重试');
    }

    const transformed = transformBgmData(BGMdata);
    return {
      ...transformed,
      vndb_data: null,
      other_data: null,
    };
  } catch (error) {
    console.error('BGM API调用失败:', error);
    return i18n.t('api.bgm.fetchByIdFailed', 'BGM数据获取失败，请检查ID或网络连接');
  }
}

/**
 * 根据游戏名称搜索获取游戏详细信息
 *
 * @param name 游戏名称
 * @param BGM_TOKEN Bangumi API 访问令牌
 * @returns 返回游戏详细信息对象，若失败则返回错误提示字符串
 */
export async function fetchBgmByName(name: string, BGM_TOKEN: string) {
  // 使用 Tauri HTTP 客户端，支持自定义 User-Agent
  const BGM_HEADER = {
    headers: {
      'Accept': 'application/json',
      'User-Agent': `huoshen80/ReinaManager/${pkg.version} (https://github.com/huoshen80/ReinaManager)`,
      ...(BGM_TOKEN ? { Authorization: `Bearer ${BGM_TOKEN}` } : {}),
    },
  };

  try {
    const keyword = name.trim();
    const resp = (await tauriHttp.post(
      'https://api.bgm.tv/v0/search/subjects',
      {
        "keyword": keyword,
        "filter": {
          "type": [4] // 4 = 游戏类型
        }
      },
      BGM_HEADER
    )).data;
    const BGMdata = Array.isArray(resp.data) ? resp.data[0] : undefined;

    if (!BGMdata?.id) {
      return i18n.t('api.bgm.notFound', '未找到相关条目，请确认游戏名字后重试，或未设置BGM_TOKEN');
    }

    const transformed = transformBgmData(BGMdata);
    return {
      ...transformed,
      vndb_data: null,
      other_data: null,
    };
  } catch (error) {
    console.error('BGM API调用失败:', error);
    return i18n.t('api.bgm.fetchByNameFailed', 'BGM数据搜索失败，请检查游戏名称或网络连接');
  }
}
