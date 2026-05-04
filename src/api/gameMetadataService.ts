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
import type { apiSourceType, GameCandidateData, SourceType } from "@/types";
import { SOURCE_FIELD_KEYS } from "@/types";
import { AppError, toError } from "@/utils/errors";
import {
	buildGameFromMixedSelection,
	type MixedSourceCandidates,
	type MixedSourceEnabled,
	type MixedSourceSelection,
	mergeMixedResult,
	pickFirstMixedResult,
} from "@/utils/metadata";

const mixedIdTypePriority: readonly SourceType[] = [
	"kun",
	"ymgal",
	"vndb",
	"bgm",
];

function hasSourceId(
	game: Partial<GameCandidateData>,
	source: SourceType,
): boolean {
	const { id: idKey } = SOURCE_FIELD_KEYS[source];
	return Boolean(game[idKey]);
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

function ensureMixedResult(
	result: GameCandidateData | null,
): GameCandidateData {
	if (!result) {
		throw new AppError({
			code: "metadata_not_found",
			message: "No metadata result returned from mixed sources",
		});
	}

	return result;
}

function assertNever(value: never): never {
	throw new Error(`Unhandled source: ${String(value)}`);
}

/**
 * 游戏搜索参数
 * 新的设计：添加游戏只能输入单 id、游戏名称两种
 */
export interface GameSearchParams {
	query: string; // 搜索关键词（可以是ID或名称）
	source?: SourceType; // 数据源（可选，不指定则为mixed）
	bgmToken?: string; // BGM API访问令牌
	defaults?: Partial<GameCandidateData>; // UI 相关默认值，会合并到返回的候选数据中
	mixedEnabledSources?: readonly SourceType[]; // mixed 模式下允许请求的数据源
}

interface SelectionDetailEnrichRule {
	source: SourceType;
	getId: (game: GameCandidateData) => string | undefined;
}

const selectionDetailEnrichRules: Partial<
	Record<SourceType, SelectionDetailEnrichRule>
> = {
	ymgal: {
		source: "ymgal",
		getId: (game) => game.ymgal_id,
	},
	kun: {
		source: "kun",
		getId: (game) => game.kun_id,
	},
};

/**
 * 游戏元数据服务类
 * 提供统一的游戏数据获取接口，封装各数据源的差异性
 */
class GameMetadataService {
	/**
	 * 游戏搜索主入口
	 * - source 指定：按当前数据源自动判断 ID 搜索，否则按名称返回列表
	 * - source 未指定：mixed 名称搜索，返回各源第一个结果
	 */
	async searchGames(params: GameSearchParams): Promise<GameCandidateData[]> {
		const { query, source, bgmToken, defaults, mixedEnabledSources } = params;

		return source
			? this.searchSingleSource(
					query,
					source,
					bgmToken,
					defaults,
					this.shouldUseIdSearch(query, source),
				)
			: this.searchMixed(query, bgmToken, defaults, mixedEnabledSources);
	}

	/**
	 * 根据当前数据源判断是否启用 ID 搜索。
	 * Mixed 添加链路固定走名称搜索，避免单 ID 隐式扩散到所有源。
	 */
	shouldUseIdSearch(query: string, source: apiSourceType): boolean {
		return source !== "mixed" && this.isValidGameId(query.trim(), source);
	}

	/**
	 * 单数据源搜索
	 */
	private async searchSingleSource(
		query: string,
		source: SourceType,
		bgmToken: string | undefined,
		defaults: Partial<GameCandidateData> | undefined,
		isIdSearch: boolean,
	): Promise<GameCandidateData[]> {
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
		defaults: Partial<GameCandidateData> | undefined,
		mixedEnabledSources?: readonly SourceType[],
	): Promise<GameCandidateData[]> {
		const result = await this.getMixedGameByName(
			query,
			bgmToken,
			mixedEnabledSources,
		);
		if (!result) {
			return [];
		}

		return [this.applyDefaults(result, defaults)];
	}

	/**
	 * 获取 mixed 名称搜索的每源候选列表，供用户逐源选择。
	 */
	async searchMixedSourceCandidates(params: {
		query: string;
		bgmToken?: string;
		defaults?: Partial<GameCandidateData>;
		mixedEnabledSources?: readonly SourceType[];
	}): Promise<MixedSourceCandidates> {
		const { query, bgmToken, defaults, mixedEnabledSources } = params;

		try {
			const result = await fetchMixedData({
				name: query,
				BGM_TOKEN: bgmToken,
				enabledSources: mixedEnabledSources,
			});

			return {
				bgm: (result.bgm_data ?? []).map((game) =>
					this.applyDefaults(game, defaults),
				),
				vndb: (result.vndb_data ?? []).map((game) =>
					this.applyDefaults(game, defaults),
				),
				ymgal: (result.ymgal_data ?? []).map((game) =>
					this.applyDefaults(game, defaults),
				),
				kun: (result.kun_data ?? []).map((game) =>
					this.applyDefaults(game, defaults),
				),
			};
		} catch (error) {
			throw createMetadataError(
				"Failed to search mixed source candidates by name",
				error,
				"Mixed metadata candidate search failed",
			);
		}
	}

	/**
	 * 根据 ID 获取单个数据源的游戏
	 */
	async getGameById(
		id: string,
		source: SourceType,
		bgmToken?: string,
	): Promise<GameCandidateData> {
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
					return await fetchYmById(id);
				case "kun":
					return await fetchGalgameById(id);
				default:
					return assertNever(source);
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
	 * 处理“用户从搜索结果中选择一项”后的详情补全。
	 * 规则：
	 * - mixed 搜索：直接返回原数据
	 * - 单源名称搜索：仅 ymgal/kun 需要按 id 拉取完整详情
	 */
	async enrichSelectedGameDetails(params: {
		selectedGame: GameCandidateData;
		source: apiSourceType;
	}): Promise<GameCandidateData> {
		const { selectedGame, source } = params;

		if (source === "mixed") {
			return selectedGame;
		}

		const enrichRule = selectionDetailEnrichRules[source];
		const selectedId = enrichRule?.getId(selectedGame);
		if (!enrichRule || !selectedId) {
			return selectedGame;
		}

		const detailedData = await this.getGameById(selectedId, enrichRule.source);
		return {
			...selectedGame,
			...detailedData,
			localpath: selectedGame.localpath ?? detailedData.localpath,
		};
	}

	/**
	 * Mixed 候选确认后的详情补全。
	 * Kun 在 mixed 入口下不触发内部 VNDB 补全，避免抢占 VNDB 源选择权。
	 */
	private async enrichMixedSourceSelection(
		selection: MixedSourceSelection,
		enabled: MixedSourceEnabled,
	): Promise<MixedSourceSelection> {
		const nextSelection: MixedSourceSelection = { ...selection };

		await Promise.all(
			mixedIdTypePriority.map(async (source) => {
				if (!enabled[source]) {
					return;
				}

				const selectedGame = selection[source];
				if (!selectedGame) {
					return;
				}

				if (source === "ymgal" && selectedGame.ymgal_id) {
					const detailedData = await this.getGameById(
						selectedGame.ymgal_id,
						"ymgal",
					);
					nextSelection[source] = {
						...selectedGame,
						...detailedData,
						localpath: selectedGame.localpath ?? detailedData.localpath,
					};
				}

				if (source === "kun" && selectedGame.kun_id) {
					const detailedData = await fetchGalgameById(selectedGame.kun_id, {
						enrichVndb: false,
					});
					nextSelection[source] = {
						...selectedGame,
						...detailedData,
						localpath: selectedGame.localpath ?? detailedData.localpath,
					};
				}
			}),
		);

		return nextSelection;
	}

	/**
	 * 解析 mixed 候选确认结果。
	 * 服务层负责补详情，纯数据合并交给 metadata 工具。
	 */
	async resolveMixedSourceSelection(params: {
		selection: MixedSourceSelection;
		enabled: MixedSourceEnabled;
		defaults?: Partial<GameCandidateData>;
	}): Promise<GameCandidateData> {
		const { selection, enabled, defaults } = params;
		const enrichedSelection = await this.enrichMixedSourceSelection(
			selection,
			enabled,
		);
		return buildGameFromMixedSelection({
			selection: enrichedSelection,
			enabled,
			defaults,
		});
	}

	/**
	 * 根据名称搜索单个数据源
	 */
	private async searchByName(
		name: string,
		source: SourceType,
		bgmToken?: string,
	): Promise<GameCandidateData[]> {
		try {
			switch (source) {
				case "bgm":
					return await fetchBgmByName(name, bgmToken);
				case "vndb":
					return await fetchVndbByName(name);
				case "ymgal":
					return await fetchYmByName(name);
				case "kun":
					return await searchGalgame(name);
				default:
					return assertNever(source);
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
	 * 根据名称获取 mixed 游戏数据（各源第一个结果）
	 */
	private async getMixedGameByName(
		name: string,
		bgmToken?: string,
		enabledSources?: readonly SourceType[],
	): Promise<GameCandidateData | null> {
		try {
			const result = await fetchMixedData({
				name,
				BGM_TOKEN: bgmToken,
				enabledSources,
			});

			return mergeMixedResult(pickFirstMixedResult(result));
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
		game: GameCandidateData,
		defaults?: Partial<GameCandidateData>,
	): GameCandidateData {
		return defaults ? { ...defaults, ...game } : game;
	}

	/**
	 * 验证游戏 ID 格式
	 */
	isValidGameId(id: string, source: SourceType): boolean {
		switch (source) {
			case "bgm":
			case "kun":
				return /^\d+$/.test(id);
			case "vndb":
				return /^v\d+$/i.test(id);
			case "ymgal":
				return /^(ga)?\d+$/i.test(id);
			default:
				return assertNever(source);
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
		defaults?: Partial<GameCandidateData>;
	}): Promise<GameCandidateData> {
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
					ensureMixedResult(mergeMixedResult(pickFirstMixedResult(result))),
					defaults,
				);
			}

			const promises: Promise<GameCandidateData | null>[] = [];

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
				promises.push(this.getGameById(kunId, "kun"));
			} else {
				promises.push(Promise.resolve(null));
			}

			const [bgm, vndb, ymgal, kun] = await Promise.all(promises);

			const mergedGame: GameCandidateData = {
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
			if (kun) {
				mergedGame.kun_id = kun.kun_id;
				mergedGame.kun_data = kun.kun_data;
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
	private determineIdType(game: Partial<GameCandidateData>): string {
		const matchedSources = mixedIdTypePriority.filter((source) =>
			hasSourceId(game, source),
		);

		if (matchedSources.length >= 2) {
			return "mixed";
		}

		return matchedSources[0] ?? "unknown";
	}
}

export const gameMetadataService = new GameMetadataService();
export default gameMetadataService;
