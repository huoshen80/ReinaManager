/**
 * @file 游戏元数据服务层
 * @description 统一管理所有游戏数据源的搜索和获取逻辑，封装API调用细节
 * @module src/api/gameMetadataService
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

import { fetchBgmById, fetchBgmByName } from "@/api/bgm";
import { fetchMixedData } from "@/api/mixed";
import { fetchVndbById, fetchVndbByName } from "@/api/vndb";
import { fetchYmById, fetchYmByName } from "@/api/ymgal";
import type { FullGameData } from "@/types";

/**
 * 检查 YMGal 数据是否完整
 * YMGal 数据完整需要包含 summary 和 aliases 字段
 */
export function isYmgalDataComplete(
	ymgalData?: { summary?: string; aliases?: string[] } | null,
): boolean {
	return !!(ymgalData?.summary && ymgalData?.aliases);
}

/**
 * 从多个数据源的结果中合并日期信息
 * 优先级：BGM > VNDB > YMGal
 * @param result fetchMixedData 的返回结果
 * @returns 合并后的日期字符串或 undefined
 */
function mergeDateFromMixedResult(result: {
	bgm_data?: FullGameData | null;
	vndb_data?: FullGameData | null;
	ymgal_data?: FullGameData | null;
}): string | undefined {
	// 合并日期信息，优先级：BGM > VNDB > YMGal
	if (result.bgm_data?.bgm_data?.date) {
		return result.bgm_data.bgm_data.date;
	} else if (result.vndb_data?.vndb_data?.date) {
		return result.vndb_data.vndb_data.date;
	} else if (result.ymgal_data?.ymgal_data?.date) {
		return result.ymgal_data.ymgal_data.date;
	}
	return undefined;
}

/**
 * 支持的数据源类型
 */
export type DataSource = "bgm" | "vndb" | "ymgal";

/**
 * 游戏搜索参数
 * 新的设计：添加游戏只能输入单id、游戏名称两种
 */
export interface GameSearchParams {
	query: string; // 搜索关键词（可以是ID或名称）
	source?: DataSource; // 数据源（可选，不指定则为mixed）
	bgmToken?: string; // BGM API访问令牌
	defaults?: Partial<FullGameData>; // UI相关默认值，会合并到返回的FullGameData中
	isIdSearch?: boolean; // 是否为ID搜索（由用户通过isID开关控制）
}

/**
 * 游戏元数据服务类
 * 提供统一的游戏数据获取接口，封装各数据源的差异性
 */
class GameMetadataService {
	/**
	 * 游戏搜索主入口
	 * 根据新的设计思路：
	 * - source指定：单数据源搜索（id返回单个游戏，名称返回列表）
	 * - source不指定：mixed搜索（id返回单个结果，名称返回各源第一个结果）
	 * @param params 搜索参数
	 * @returns 游戏数据数组
	 */
	async searchGames(params: GameSearchParams): Promise<FullGameData[]> {
		const { query, source, bgmToken, defaults, isIdSearch } = params;

		// 使用用户传入的 isIdSearch，若未传入则自动判断
		const isId = isIdSearch ?? this.isIdQuery(query); // 自动判断预留
		try {
			if (source) {
				// 单数据源搜索
				return await this.searchSingleSource(
					query,
					source,
					bgmToken,
					defaults,
					isId,
				);
			} else {
				// Mixed搜索
				return await this.searchMixed(query, bgmToken, defaults, isId);
			}
		} catch (error) {
			console.error("Game search failed:", error);
			return [];
		}
	}

	/**
	 * 判断查询字符串是否为ID
	 * @private
	 */
	private isIdQuery(query: string): boolean {
		// 检查是否匹配任何已知ID格式
		return (
			/^\d+$/.test(query) || // BGM ID (纯数字)
			/^v\d+$/i.test(query) || // VNDB ID (v开头+数字)
			/^ga\d+$/i.test(query) // YMGal ID (ga开头+数字)
		);
	}

	/**
	 * 单数据源搜索
	 * @private
	 */
	private async searchSingleSource(
		query: string,
		source: DataSource,
		bgmToken: string | undefined,
		defaults: Partial<FullGameData> | undefined,
		isIdSearch: boolean,
	): Promise<FullGameData[]> {
		if (isIdSearch) {
			// ID搜索：返回单个确定游戏
			const game = await this.getGameById(query, source, bgmToken);
			if (game) {
				return [this.applyDefaults(game, defaults)];
			}
			return [];
		} else {
			// 名称搜索：返回游戏列表
			const results = await this.searchByName(query, source, bgmToken);
			return results.games.map((game) => this.applyDefaults(game, defaults));
		}
	}

	/**
	 * Mixed搜索
	 * @private
	 */
	private async searchMixed(
		query: string,
		bgmToken: string | undefined,
		defaults: Partial<FullGameData> | undefined,
		isIdSearch: boolean,
	): Promise<FullGameData[]> {
		if (isIdSearch) {
			// 单ID搜索：用ID获取游戏，然后用名称搜索其他源，取第一个结果
			const result = await this.getMixedGameById(query, bgmToken);
			return result ? [this.applyDefaults(result, defaults)] : [];
		} else {
			// 名称搜索：所有源都取第一个结果
			const result = await this.getMixedGameByName(query, bgmToken);
			return result ? [this.applyDefaults(result, defaults)] : [];
		}
	}

	/**
	 * 根据ID获取单个数据源的游戏
	 *
	 */
	async getGameById(
		id: string,
		source: DataSource,
		bgmToken?: string,
	): Promise<FullGameData | null> {
		try {
			switch (source) {
				case "bgm": {
					if (!bgmToken) return null;
					const bgmResult = await fetchBgmById(id, bgmToken);
					return typeof bgmResult === "string" ? null : bgmResult;
				}
				case "vndb": {
					const vndbResult = await fetchVndbById(id);
					return typeof vndbResult === "string" ? null : vndbResult;
				}
				case "ymgal": {
					const ymgalResult = await fetchYmById(Number(id));
					return typeof ymgalResult === "string" ? null : ymgalResult;
				}
				default:
					return null;
			}
		} catch (error) {
			console.error(`Get game by ID failed for ${source}:`, error);
			return null;
		}
	}

	/**
	 * 根据名称搜索单个数据源
	 * @private
	 */
	private async searchByName(
		name: string,
		source: DataSource,
		bgmToken?: string,
	): Promise<{ games: FullGameData[]; error?: string }> {
		try {
			switch (source) {
				case "bgm": {
					const bgmResult = await fetchBgmByName(name, bgmToken);
					const fetchError = typeof bgmResult === "string";
					if (fetchError && !bgmToken)
						return { games: [], error: "BGM Token required" };
					return { games: fetchError ? [] : bgmResult };
				}
				case "vndb": {
					const vndbResult = await fetchVndbByName(name);
					return { games: typeof vndbResult === "string" ? [] : vndbResult };
				}
				case "ymgal": {
					const ymgalResult = await fetchYmByName(name);
					return { games: typeof ymgalResult === "string" ? [] : ymgalResult };
				}
				default:
					return { games: [] };
			}
		} catch (error) {
			console.error(`Search by name failed for ${source}:`, error);
			return {
				games: [],
				error: error instanceof Error ? error.message : "Unknown error",
			};
		}
	}

	/**
	 * 根据单个ID获取mixed游戏数据
	 * @private
	 */
	private async getMixedGameById(
		id: string,
		bgmToken?: string,
	): Promise<FullGameData | null> {
		// 解析ID类型
		const ids = this.parseGameId(id);
		if (!ids.bgmId && !ids.vndbId && !ids.ymgalId) {
			return null;
		}

		try {
			// 调用fetchMixedData
			const result = await fetchMixedData({
				bgm_id: ids.bgmId,
				vndb_id: ids.vndbId,
				ymgal_id: ids.ymgalId,
				BGM_TOKEN: bgmToken,
			});

			// 合并为单个游戏对象
			const mergedGame: FullGameData = {
				id_type: "mixed",
			};

			if (result.bgm_data) {
				mergedGame.bgm_id = result.bgm_data.bgm_id;
				mergedGame.bgm_data = result.bgm_data.bgm_data;
			}
			if (result.vndb_data) {
				mergedGame.vndb_id = result.vndb_data.vndb_id;
				mergedGame.vndb_data = result.vndb_data.vndb_data;
			}
			if (result.ymgal_data) {
				mergedGame.ymgal_id = result.ymgal_data.ymgal_id;
				mergedGame.ymgal_data = result.ymgal_data.ymgal_data;
			}

			// 合并日期信息
			const mergedDate = mergeDateFromMixedResult(result);
			if (mergedDate) {
				mergedGame.date = mergedDate;
			}

			return mergedGame;
		} catch (error) {
			console.error("Get mixed game by ID failed:", error);
			return null;
		}
	}

	/**
	 * 根据名称获取mixed游戏数据（各源第一个结果）
	 * @private
	 */
	private async getMixedGameByName(
		name: string,
		bgmToken?: string,
	): Promise<FullGameData | null> {
		try {
			const result = await fetchMixedData({
				name: name,
				BGM_TOKEN: bgmToken,
			});

			// 合并为单个游戏对象
			const mergedGame: FullGameData = {
				id_type: "mixed",
			};

			if (result.bgm_data) {
				mergedGame.bgm_id = result.bgm_data.bgm_id;
				mergedGame.bgm_data = result.bgm_data.bgm_data;
			}
			if (result.vndb_data) {
				mergedGame.vndb_id = result.vndb_data.vndb_id;
				mergedGame.vndb_data = result.vndb_data.vndb_data;
			}
			if (result.ymgal_data) {
				mergedGame.ymgal_id = result.ymgal_data.ymgal_id;
				mergedGame.ymgal_data = result.ymgal_data.ymgal_data;
			}

			// 合并日期信息
			const mergedDate = mergeDateFromMixedResult(result);
			if (mergedDate) {
				mergedGame.date = mergedDate;
			}
			return mergedGame;
		} catch (error) {
			console.error("Get mixed game by name failed:", error);
			return null;
		}
	}

	/**
	 * 应用默认值到游戏数据
	 * @private
	 */
	private applyDefaults(
		game: FullGameData,
		defaults?: Partial<FullGameData>,
	): FullGameData {
		if (!defaults) return game;
		return { ...defaults, ...game };
	}

	/**
	 * 验证游戏ID格式
	 * @param id 游戏ID
	 * @param source 数据源类型
	 * @returns 是否为有效格式
	 */
	isValidGameId(id: string, source: DataSource): boolean {
		switch (source) {
			case "bgm":
				return /^\d+$/.test(id); // BGM: 纯数字
			case "vndb":
				return /^v\d+$/i.test(id); // VNDB: v开头加数字
			case "ymgal":
				return /^ga\d+$/i.test(id) || /^\d+$/.test(id); // YMGal: ga开头或纯数字
			default:
				return false;
		}
	}

	/**
	 * 根据多个ID获取游戏数据（用于更新场景）
	 * @param params 多ID参数
	 * @returns 游戏数据
	 */
	async getGameByIds(params: {
		bgmId?: string;
		vndbId?: string;
		ymgalId?: string;
		bgmToken?: string;
		defaults?: Partial<FullGameData>;
	}): Promise<FullGameData | null> {
		const { bgmId, vndbId, ymgalId, bgmToken, defaults } = params;

		// 计算有多少个ID被提供
		const providedIds = [bgmId, vndbId, ymgalId].filter(Boolean).length;

		if (providedIds === 0) {
			return null;
		}

		try {
			if (providedIds === 1) {
				// 单个ID：使用fetchMixedData的逻辑获取多个数据源的数据
				const result = await fetchMixedData({
					bgm_id: bgmId,
					vndb_id: vndbId,
					ymgal_id: ymgalId,
					BGM_TOKEN: bgmToken,
				});

				// 合并为单个游戏对象
				const mergedGame: FullGameData = {
					id_type: "mixed",
				};

				if (result.bgm_data) {
					mergedGame.bgm_id = result.bgm_data.bgm_id;
					mergedGame.bgm_data = result.bgm_data.bgm_data;
				}
				if (result.vndb_data) {
					mergedGame.vndb_id = result.vndb_data.vndb_id;
					mergedGame.vndb_data = result.vndb_data.vndb_data;
				}
				if (result.ymgal_data) {
					mergedGame.ymgal_id = result.ymgal_data.ymgal_id;
					mergedGame.ymgal_data = result.ymgal_data.ymgal_data;
				}

				// 合并日期信息
				const mergedDate = mergeDateFromMixedResult(result);
				if (mergedDate) {
					mergedGame.date = mergedDate;
				}

				return this.applyDefaults(mergedGame, defaults);
			} else {
				// 多个ID：并行获取所有数据源，然后合并
				const promises: Promise<FullGameData | null>[] = [];

				if (bgmId && bgmToken) {
					promises.push(this.getGameById(bgmId, "bgm", bgmToken));
				} else {
					promises.push(Promise.resolve(null));
				}

				if (vndbId) {
					promises.push(this.getGameById(vndbId, "vndb"));
				} else {
					promises.push(Promise.resolve(null));
				}

				if (ymgalId) {
					promises.push(this.getGameById(ymgalId, "ymgal"));
				} else {
					promises.push(Promise.resolve(null));
				}

				const [bgm, vndb, ymgal] = await Promise.all(promises);

				// 合并结果
				const mergedGame: FullGameData = {
					...defaults,
					id_type: this.determineIdType({
						bgm_id: bgmId,
						vndb_id: vndbId,
						ymgal_id: ymgalId,
					}),
				};

				if (bgm) {
					mergedGame.bgm_id = bgm.bgm_id;
					mergedGame.bgm_data = bgm.bgm_data;
				}
				if (vndb) {
					mergedGame.vndb_id = vndb.vndb_id;
					mergedGame.vndb_data = vndb.vndb_data;
				}
				if (ymgal) {
					mergedGame.ymgal_id = ymgal.ymgal_id;
					mergedGame.ymgal_data = ymgal.ymgal_data;
				}

				return mergedGame;
			}
		} catch (error) {
			console.error("Get game by IDs failed:", error);
			return null;
		}
	}

	/**
	 * 根据游戏数据确定ID类型
	 * 只要有任意2个id就应该归为mixed
	 * @private
	 * @param game 游戏数据
	 * @returns ID类型
	 */
	private determineIdType(game: Partial<FullGameData>): string {
		const hasBgm = !!game.bgm_id;
		const hasVndb = !!game.vndb_id;
		const hasYmgal = !!game.ymgal_id;

		// 计算有多少个ID存在
		const idCount = (hasBgm ? 1 : 0) + (hasVndb ? 1 : 0) + (hasYmgal ? 1 : 0);

		// 只要有2个或以上ID，就认为是mixed
		if (idCount >= 2) return "mixed";
		if (hasYmgal) return "ymgal";
		if (hasVndb) return "vndb";
		if (hasBgm) return "bgm";

		return "unknown";
	}

	/**
	 * 解析复合游戏ID，返回各数据源的ID
	 * @param input 用户输入的ID字符串
	 * @returns 各数据源的ID映射
	 */
	parseGameId(input: string): {
		bgmId?: string;
		vndbId?: string;
		ymgalId?: string;
	} {
		const result: { bgmId?: string; vndbId?: string; ymgalId?: string } = {};

		// VNDB ID格式：v + 数字
		if (/^v\d+$/i.test(input)) {
			result.vndbId = input;
		}
		// YMGal ID格式：ga + 数字（去除ga前缀，只返回数字部分）
		else if (/^ga\d+$/i.test(input)) {
			result.ymgalId = input.replace(/^ga/i, "");
		}
		// BGM ID格式：纯数字
		else if (/^\d+$/.test(input)) {
			result.bgmId = input;
		}

		return result;
	}
}

// 导出单例实例
export const gameMetadataService = new GameMetadataService();
export default gameMetadataService;
