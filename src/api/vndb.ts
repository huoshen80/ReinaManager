/**
 * @file VNDB 游戏信息 API 封装
 * @description 提供与 VNDB API 交互的函数和类型定义，用于获取视觉小说信息，返回结构化数据，便于前端统一处理。
 * @module src/api/vndb
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - fetchFromVNDB：根据名称或 VNDB ID 获取游戏详细信息
 * - fetchVNDBById：通过 ID 直接获取游戏详细信息
 *
 * 依赖：
 * - http: 封装的 HTTP 请求工具
 * - time_now: 获取当前时间的工具函数
 */

import http from './http'
import { time_now } from "@/utils";

/**
 * VNDB 标题对象接口。
 */
interface VNDB_title {
  title: string;
  lang: string;
  main: boolean;
}

/**
 * 从 VNDB API 获取游戏信息。
 *
 * 该函数根据游戏名称或 VNDB 游戏 ID，调用 VNDB API 获取游戏详细信息。
 * 若未找到条目，则返回错误提示字符串。返回数据结构与 Bangumi 保持一致，便于统一处理。
 *
 * @param {string} name 游戏名称，用于搜索 VNDB 条目。
 * @param {string} [id] 可选，VNDB 游戏 ID，若提供则优先通过 ID 查询。
 * @returns {Promise<object | string>} 包含游戏详细信息的对象，若未找到则返回错误提示字符串。
 */
export async function fetchFromVNDB(name: string, id?: string) {
  try {
    // 构建 API 请求体
    const requestBody = {
      filters: id ? ['id', '=', id] : ['search', '=', name],
      fields: 'id, titles.title, titles.lang, titles.main, image.url, released, rating, tags.name,tags.rating, description,developers.name,length_minutes'
    };
    
    // 调用 VNDB API
    const VNDBdata = (await http.post('https://api.vndb.org/kana/vn', requestBody, {
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      }
    })).data.results[0];
    if(!VNDBdata) return "未找到相关条目，请确认游戏名字后重试";
    
    // 处理标题信息
    const titles = VNDBdata.titles.map((title:VNDB_title) => ({
      title: title.title,
      lang: title.lang,
      main: title.main
    }));
    
    const mainTitle: string = titles.find((title: VNDB_title) => title.main)?.title || '';
    const chineseTitle = titles.find((title:VNDB_title )=> 
      title.lang === 'zh-Hans' || title.lang === 'zh-Hant' || title.lang === 'zh'
    )?.title || "";
    
    // 提取所有标题
    const allTitles: string[] = titles.map((title: VNDB_title) => title.title);
    
    // 格式化返回数据，与 bgm.ts 的返回格式保持一致
    return {
      bgm_id: null,
      vndb_id: VNDBdata.id,
      id_type: 'vndb',
      date: VNDBdata.released,
      image: VNDBdata.image?.url||null ,
      summary: VNDBdata.description,
      name: mainTitle,
      name_cn: chineseTitle,
      all_titles: allTitles,
      tags: (VNDBdata.tags as { rating: number; name: string }[])
      .filter((tag) => tag.rating >= 2)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 30)
      .map(({ name }) => name),
      rank: null,
      score: Number((VNDBdata.rating/10).toFixed(2)),
      time: time_now(),
      developer: VNDBdata.developers?.[0]?.name || null,
      aveage_hours: Number((VNDBdata.length_minutes / 60).toFixed(1)),
    };
  } catch (error) {
    console.error("VNDB API 调用失败:", error);
    if (error instanceof Error) {
      console.error("错误消息:", error.message);
    }
    return "获取数据失败，请稍后重试";
  }
}

/**
 * 通过 ID 直接获取 VNDB 游戏信息。
 *
 * @param {string} id VNDB 游戏 ID（如 "v17"）。
 * @returns {Promise<object | string>} 包含游戏详细信息的对象，若未找到则返回错误提示字符串。
 */
export async function fetchVNDBById(id: string) {
  return fetchFromVNDB("", id);
}