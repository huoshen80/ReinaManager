/**
 * @file 游戏元数据服务层
 * @description 统一管理所有游戏数据源的搜索和获取逻辑，封装 API 调用细节
 * @module src/api/gameMetadataService
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

import { fetchBgmById, fetchBgmByName } from "@/api/bgm";
import { fetchGalgameById, searchGalgame } from "@/api/kun";
import { fetchMixedData } from "@/api/mixed";
import { fetchVndbById, fetchVndbByName } from "@/api/vndb";
import { fetchYmById, fetchYmByName } from "@/api/ymgal";
import type { FullGameData } from "@/types";
import { AppError, toError } from "@/utils/errors";

interface MixedSourceResult {
	bgm_data?: FullGameData | null;
	vndb_data?: FullGameData | null;
	ymgal_data?: FullGameData | null;
	kun_data?: FullGameData | null;
}

function createMetadataError(
	scope: string,
	error: unknown,
	fallback: string,
): AppError {
	if (error instanceof AppError) {
		return error;
	}

	const normalized = toError(error, fallback);
	return new AppError({
		code: "metadata_request_failed",
		message: `${scope}: ${normalized.message}`,
		cause: normalized,
		name: "MetadataError",
	});
}

function createStableError(
	code: "bgm_token_required" | "invalid_game_id" | "unsupported_source",
	message: string,
): AppError {
	return new AppError({
		code,
		message,
	});
}

/**
 * 从多个数据源的结果中合并日期信息
 * 优先级：BGM > VNDB > YMGal
 */
function mergeDateFromMixedResult(
	result: MixedSourceResult,
): string | undefined {
	// 合并日期信息，优先级：BGM > VNDB > YMGal
	if (result.bgm_data?.bgm_data?.date) {
		return result.bgm_data.bgm_data.date;
	}
	if (result.vndb_data?.vndb_data?.date) {
		return result.vndb_data.vndb_data.date;
	}
	if (result.ymgal_data?.ymgal_data?.date) {
		return result.ymgal_data.ymgal_data.date;
	}
	return undefined;
}

function mergeMixedResult(result: MixedSourceResult): FullGameData | null {
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
	if (result.kun_data) {
		mergedGame.kun_id = result.kun_data.kun_id;
		mergedGame.kun_data = result.kun_data.kun_data;
	}

	const mergedDate = mergeDateFromMixedResult(result);
	if (mergedDate) {
		mergedGame.date = mergedDate;
	}

	if (
		!mergedGame.bgm_id &&
		!mergedGame.vndb_id &&
		!mergedGame.ymgal_id &&
		!mergedGame.kun_id &&
		!mergedGame.kun_data
	) {
		return null;
	}

	return mergedGame;
}

function ensureMixedResult(result: FullGameData | null): FullGameData {
	if (!result) {
		throw new AppError({
			code: "metadata_not_found",
			message: "No metadata result returned from mixed sources",
		});
	}

	return result;
}

/**
 * 支持的数据源类型
 */
export type DataSource = "bgm" | "vndb" | "ymgal" | "kungal";

/**
 * 游戏搜索参数
 * 新的设计：添加游戏只能输入单 id、游戏名称两种
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
	 * - source 指定：单数据源搜索（id 返回单个游戏，名称返回列表）
	 * - source 未指定：mixed 搜索（id 返回单个结果，名称返回各源第一个结果）
	 */
	async searchGames(params: GameSearchParams): Promise<FullGameData[]> {
		const { query, source, bgmToken, defaults, isIdSearch } = params;

		// 使用用户传入的 isIdSearch，若未传入则自动判断
		const isId = isIdSearch ?? this.isIdQuery(query); // 自动判断预留

		if (source) {
			return this.searchSingleSource(query, source, bgmToken, defaults, isId);
		}

		return this.searchMixed(query, bgmToken, defaults, isId);
	}

	/**
	 * 判断查询字符串是否为 ID
	 */
	private isIdQuery(query: string): boolean {
		return (
			/^\d+$/.test(query) || // BGM 和 Kungal ID (纯数字)
			/^v\d+$/i.test(query) || // VNDB ID (v开头+数字)
			/^ga\d+$/i.test(query) // YMGal ID (ga开头+数字)
		);
	}

	/**
	 * 单数据源搜索
	 */
	private async searchSingleSource(
		query: string,
		source: DataSource,
		bgmToken: string | undefined,
		defaults: Partial<FullGameData> | undefined,
		isIdSearch: boolean,
	): Promise<FullGameData[]> {
		if (isIdSearch) {
			const game = await this.getGameById(query, source, bgmToken);
			return [this.applyDefaults(game, defaults)];
		}

		const results = await this.searchByName(query, source, bgmToken);
		return results.map((game) => this.applyDefaults(game, defaults));
	}

	/**
	 * Mixed 搜索
	 */
	private async searchMixed(
		query: string,
		bgmToken: string | undefined,
		defaults: Partial<FullGameData> | undefined,
		isIdSearch: boolean,
	): Promise<FullGameData[]> {
		if (isIdSearch) {
			const result = await this.getMixedGameById(query, bgmToken);
			return [this.applyDefaults(result, defaults)];
		}

		const result = await this.getMixedGameByName(query, bgmToken);
		if (!result) {
			return [];
		}

		return [this.applyDefaults(result, defaults)];
	}

	/**
	 * 根据 ID 获取单个数据源的游戏
	 */
	async getGameById(
		id: string,
		source: DataSource,
		bgmToken?: string,
	): Promise<FullGameData> {
		if (import.meta.env.DEV) {
			console.log(`[MetadataService] getGameById called:`, {
				id,
				source,
				hasBgmToken: !!bgmToken,
			});
		}
		try {
			switch (source) {
				case "bgm":
					if (!bgmToken) {
						throw createStableError(
							"bgm_token_required",
							"Bangumi token is required for Bangumi lookup",
						);
					}
					return await fetchBgmById(id, bgmToken);
				case "vndb":
					return await fetchVndbById(id);
				case "ymgal":
					return await fetchYmById(Number(id));
				case "kungal":
					return await fetchGalgameById(id);
				default:
					throw createStableError(
						"unsupported_source",
						`Unsupported metadata source: ${source}`,
					);
			}
		} catch (error) {
			throw createMetadataError(
				`Failed to fetch ${source} metadata by id`,
				error,
				`Metadata request failed for ${source} id lookup`,
			);
		}
	}

	/**
	 * 根据名称搜索单个数据源
	 */
	private async searchByName(
		name: string,
		source: DataSource,
		bgmToken?: string,
	): Promise<FullGameData[]> {
		try {
			switch (source) {
				case "bgm":
					return await fetchBgmByName(name, bgmToken);
				case "vndb":
					return await fetchVndbByName(name);
				case "ymgal":
					return await fetchYmByName(name);
				case "kungal":
					return await searchGalgame(name);
				default:
					throw createStableError(
						"unsupported_source",
						`Unsupported metadata source: ${source}`,
					);
			}
		} catch (error) {
			throw createMetadataError(
				`Failed to search ${source} metadata by name`,
				error,
				`Metadata request failed for ${source} name search`,
			);
		}
	}

	/**
	 * 根据单个 ID 获取 mixed 游戏数据
	 */
	private async getMixedGameById(
		id: string,
		bgmToken?: string,
	): Promise<FullGameData> {
		const ids = this.parseGameId(id);
		if (!ids.bgmId && !ids.vndbId && !ids.ymgalId) {
			throw createStableError(
				"invalid_game_id",
				`Invalid mixed game id format: ${id}`,
			);
		}

		try {
			const result = await fetchMixedData({
				bgm_id: ids.bgmId,
				vndb_id: ids.vndbId,
				ymgal_id: ids.ymgalId,
				BGM_TOKEN: bgmToken,
			});

			return ensureMixedResult(mergeMixedResult(result));
		} catch (error) {
			throw createMetadataError(
				"Failed to fetch mixed metadata by id",
				error,
				"Mixed metadata lookup failed",
			);
		}
	}

	/**
	 * 根据名称获取 mixed 游戏数据（各源第一个结果）
	 */
	private async getMixedGameByName(
		name: string,
		bgmToken?: string,
	): Promise<FullGameData | null> {
		try {
			const result = await fetchMixedData({
				name,
				BGM_TOKEN: bgmToken,
			});

			return mergeMixedResult(result);
		} catch (error) {
			throw createMetadataError(
				"Failed to search mixed metadata by name",
				error,
				"Mixed metadata search failed",
			);
		}
	}

	/**
	 * 应用默认值到游戏数据
	 */
	private applyDefaults(
		game: FullGameData,
		defaults?: Partial<FullGameData>,
	): FullGameData {
		if (!defaults) return game;
		return { ...defaults, ...game };
	}

	/**
	 * 验证游戏 ID 格式
	 */
	isValidGameId(id: string, source: DataSource): boolean {
		switch (source) {
			case "bgm":
			case "kungal":
				return /^\d+$/.test(id);
			case "vndb":
				return /^v\d+$/i.test(id);
			case "ymgal":
				return /^ga\d+$/i.test(id) || /^\d+$/.test(id);
			default:
				return false;
		}
	}

	/**
	 * 根据多个 ID 获取游戏数据（用于更新场景）
	 */
	async getGameByIds(params: {
		bgmId?: string;
		vndbId?: string;
		ymgalId?: string;
		kunId?: string;
		bgmToken?: string;
		defaults?: Partial<FullGameData>;
	}): Promise<FullGameData> {
		const { bgmId, vndbId, ymgalId, kunId, bgmToken, defaults } = params;
		const providedIds = [bgmId, vndbId, ymgalId, kunId].filter(Boolean).length;

		if (providedIds === 0) {
			throw createStableError(
				"invalid_game_id",
				"At least one metadata source id is required",
			);
		}

		try {
			if (providedIds === 1) {
				const result = await fetchMixedData({
					bgm_id: bgmId,
					vndb_id: vndbId,
					ymgal_id: ymgalId,
					kun_id: kunId,
					BGM_TOKEN: bgmToken,
				});

				return this.applyDefaults(
					ensureMixedResult(mergeMixedResult(result)),
					defaults,
				);
			}

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

			if (kunId) {
				promises.push(this.getGameById(kunId, "kungal"));
			} else {
				promises.push(Promise.resolve(null));
			}

			const [bgm, vndb, ymgal, kungal] = await Promise.all(promises);

			const mergedGame: FullGameData = {
				...defaults,
				id_type: this.determineIdType({
					bgm_id: bgmId,
					vndb_id: vndbId,
					ymgal_id: ymgalId,
					kun_id: kunId,
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
			if (kungal) {
				mergedGame.kun_id = kungal.kun_id;
				mergedGame.kun_data = kungal.kun_data;
			}

			if (
				!mergedGame.bgm_id &&
				!mergedGame.vndb_id &&
				!mergedGame.ymgal_id &&
				!mergedGame.kun_id
			) {
				throw new AppError({
					code: "metadata_not_found",
					message: "No metadata result returned from requested sources",
				});
			}

			return mergedGame;
		} catch (error) {
			throw createMetadataError(
				"Failed to fetch metadata by multiple ids",
				error,
				"Metadata request failed for multi-id lookup",
			);
		}
	}

	/**
	 * 根据游戏数据确定 ID 类型
	 * 只要有任意 2 个 id 就应归为 mixed
	 */
	private determineIdType(game: Partial<FullGameData>): string {
		const hasBgm = !!game.bgm_id;
		const hasVndb = !!game.vndb_id;
		const hasYmgal = !!game.ymgal_id;
		const hasKun = !!game.kun_id;
		const idCount =
			(hasBgm ? 1 : 0) +
			(hasVndb ? 1 : 0) +
			(hasYmgal ? 1 : 0) +
			(hasKun ? 1 : 0);

		if (idCount >= 2) return "mixed";
		if (hasKun) return "kungal";
		if (hasYmgal) return "ymgal";
		if (hasVndb) return "vndb";
		if (hasBgm) return "bgm";
		return "unknown";
	}

	/**
	 * 解析复合游戏 ID，返回各数据源的 ID
	 */
	parseGameId(input: string): {
		bgmId?: string;
		vndbId?: string;
		ymgalId?: string;
	} {
		const result: { bgmId?: string; vndbId?: string; ymgalId?: string } = {};

		if (/^v\d+$/i.test(input)) {
			result.vndbId = input;
		} else if (/^ga\d+$/i.test(input)) {
			result.ymgalId = input.replace(/^ga/i, "");
		} else if (/^\d+$/.test(input)) {
			result.bgmId = input;
		}

		return result;
	}
}

export const gameMetadataService = new GameMetadataService();
export default gameMetadataService;
