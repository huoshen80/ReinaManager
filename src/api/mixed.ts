/**
 * @file 混合数据获取 API 封装
 * @description 同时从 Bangumi 和 VNDB 获取游戏信息，返回两份原始数据
 * @module src/api/mixed
 * @author ReinaManager
 * @copyright AGPL-3.0
 * 
 * 逻辑说明：
 * 1. 根据传入的参数智能获取：
 *    - 只有 BGM ID：获取 BGM 数据，用其名称搜索 VNDB
 *    - 只有 VNDB ID：获取 VNDB 数据，用其名称搜索 BGM  
 *    - 两个 ID 都有：并行获取两个数据源
 *    - 只有名称：同时搜索 BGM 和 VNDB
 * 2. 使用安全模式避免单个数据源失败导致整体失败
 * 3. 返回两份原始数据 { bgm, vndb }
 * 
 * 主要导出：
 * - fetchMixedData：通用混合数据获取，返回 { bgm, vndb }
 */

import { fetchBgmById, fetchBgmByName } from "./bgm";
import { fetchVndbById, fetchVndbByName } from "./vndb";
import type { FullGameData } from "../types";
import i18n from '@/utils/i18n';

// 辅助函数：安全获取 BGM 数据
async function getBangumiDataSafely(name: string, BGM_TOKEN: string, bgm_id?: string): Promise<FullGameData | null> {
  try {
    let result;
    if (bgm_id) {
      result = await fetchBgmById(bgm_id, BGM_TOKEN);
    } else {
      result = await fetchBgmByName(name, BGM_TOKEN);
    }
    return (result && typeof result !== "string") ? result : null;
  } catch {
    return null;
  }
}

// 辅助函数：安全获取 VNDB 数据
async function getVNDBDataSafely(searchName: string, vndb_id?: string): Promise<FullGameData | null> {
  try {
    let result;
    if (vndb_id) {
      result = await fetchVndbById(vndb_id);
    } else {
      result = await fetchVndbByName(searchName);
    }
    return (result && typeof result !== "string") ? result : null;
  } catch {
    return null;
  }
}

function extractNameFromApi(apiData: FullGameData | null): string | undefined {
  if (!apiData) return undefined;
  // 优先使用 bgm 或 vndb 的 name 字段
  const bgmName = apiData.bgm_data?.name;
  if (bgmName) return bgmName as string;
  const vndbName = apiData.vndb_data?.name;
  if (vndbName) return vndbName as string;
  // 其次使用游戏基础数据中的 custom_name
  const custom = apiData.game?.custom_name;
  if (custom) return custom as string;
  return undefined;
}

/**
 * 通用混合数据获取函数
 * 同时获取 BGM 和 VNDB 数据，返回两份原始响应
 * 
 * @param options 配置选项
 * @param options.bgm_id Bangumi 条目 ID（可选）
 * @param options.vndb_id VNDB 游戏 ID（可选）
 * @param options.name 游戏名称（可选）
 * @param options.BGM_TOKEN Bangumi API 访问令牌（可选）
 * @returns 返回 { bgm, vndb } 对象，至少有一个数据源成功
 */
export async function fetchMixedData(options: {
  bgm_id?: string;
  vndb_id?: string;
  name?: string;
  BGM_TOKEN?: string;
}) {
  const { bgm_id, vndb_id, name, BGM_TOKEN } = options;

  let BGMdata: FullGameData | null = null;
  let VNDBdata: FullGameData | null = null;

  try {
    // 场景1: 只有 BGM ID
    if (bgm_id && !vndb_id && !name) {
      BGMdata = await getBangumiDataSafely('', BGM_TOKEN || '', bgm_id);
      const bgmName = extractNameFromApi(BGMdata);
      if (bgmName) {
        VNDBdata = await getVNDBDataSafely(bgmName);
      }
    }
    // 场景2: 只有 VNDB ID
    else if (vndb_id && !bgm_id && !name) {
      VNDBdata = await getVNDBDataSafely('', vndb_id);
      const vndbName = extractNameFromApi(VNDBdata);
      if (BGM_TOKEN && vndbName) {
        BGMdata = await getBangumiDataSafely(vndbName, BGM_TOKEN);
      }
    }
    // 场景3: 同时有 BGM ID 和 VNDB ID
    else if (bgm_id && vndb_id) {
  const promises: Promise<FullGameData | null>[] = [];
      if (BGM_TOKEN) {
        promises.push(getBangumiDataSafely('', BGM_TOKEN, bgm_id));
      } else {
        promises.push(Promise.resolve(null));
      }
      promises.push(getVNDBDataSafely('', vndb_id));

      const [bgm, vndb] = await Promise.all(promises);
      BGMdata = bgm;
      VNDBdata = vndb;
    }
    // 场景4: 只有名称（用于搜索）
    else if (name && name.trim()) {
      const searchName = name.trim();
  const promises: Promise<FullGameData | null>[] = [];
      
      if (BGM_TOKEN) {
        promises.push(getBangumiDataSafely(searchName, BGM_TOKEN));
      } else {
        promises.push(Promise.resolve(null));
      }
      promises.push(getVNDBDataSafely(searchName));

      const [bgm, vndb] = await Promise.all(promises);
      BGMdata = bgm;
      VNDBdata = vndb;
    }
    // 场景5: 没有任何参数
    else {
      throw new Error(i18n.t('api.mixed.noParameterProvided', '必须提供 BGM ID、VNDB ID 或游戏名称'));
    }

    // 确保至少有一个数据源成功
    if (!BGMdata && !VNDBdata) {
      throw new Error(i18n.t('api.mixed.noDataSource', '无法从任何数据源获取游戏信息'));
    }

    return { bgm_data: BGMdata, vndb_data: VNDBdata };
  } catch (error) {
    console.error("Mixed API 调用失败:", error instanceof Error ? error.message : error);
    throw error;
  }
}
