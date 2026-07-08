/**
 * @file 游戏元数据服务层
 * @description 统一管理所有游戏数据源的搜索和获取逻辑，封装 API 调用细节
 * @module src/metadata/data/gameMetadataService
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

import type { apiSourceType, GameMetadataDraft, SourceType } from "@/types";
import { AppError, toError } from "@/utils/errors";
import { fetchMixedData } from "../api/mixed";
import type { MetadataSourceContext, SourceIdMap } from "../sourceAdapter";
import { resolveAutoSelectedGameDraft } from "../sourceAutoResolve";
import {
	getCandidateSourceData,
	getCandidateSourceId,
	getCandidateSourceRecord,
	getSourceCandidateFromGame,
	mergeCandidateSources,
	type SourceCandidate,
	sourceCandidateToDraft,
} from "../sourceCandidate";
import {
	getRuntimeSourceAdapter,
	getSourceAdapter,
	REGISTERED_SOURCE_KEYS,
} from "../sourceRegistry";
import {
	buildGameFromMixedSelection,
	type MixedSourceCandidates,
	type MixedSourceEnabled,
	type MixedSourceSelection,
	mergeMixedResult,
	pickFirstMixedResult,
} from "./metadata";

const mixedIdTypePriority: readonly SourceType[] = [
	"kun",
	"ymgal",
	"vndb",
	"bgm",
];

function hasSourceId(
	game: Partial<GameMetadataDraft>,
	source: SourceType,
): boolean {
	return Boolean(getCandidateSourceId(game as GameMetadataDraft, source));
}

function getSourceId(sourceIds: SourceIdMap | undefined, source: SourceType) {
	return sourceIds?.[source]?.trim();
}

function getEnabledSourceIds(
	sourceIds: SourceIdMap | undefined,
	enabledSources?: readonly SourceType[],
): SourceIdMap {
	const enabled = enabledSources ? new Set(enabledSources) : undefined;

	return Object.fromEntries(
		REGISTERED_SOURCE_KEYS.map((source) => {
			const id =
				!enabled || enabled.has(source) ? getSourceId(sourceIds, source) : "";
			return [source, id || undefined];
		}),
	) as SourceIdMap;
}

function mergeSourceFields(
	target: GameMetadataDraft,
	sourceGame: GameMetadataDraft,
	source: SourceType,
) {
	const record = getCandidateSourceRecord(sourceGame, source);
	if (!record) {
		return;
	}

	target.sources = mergeCandidateSources([
		target,
		{
			sources: [record],
		},
	]);
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
	code: "invalid_game_id" | "unsupported_source",
	message: string,
): AppError {
	return new AppError({
		code,
		message,
	});
}

function ensureMixedResult(
	result: GameMetadataDraft | null,
): GameMetadataDraft {
	if (!result) {
		throw new AppError({
			code: "metadata_not_found",
			message: "No metadata result returned from mixed sources",
		});
	}

	return result;
}

/**
 * 游戏搜索参数
 * 新的设计：添加游戏只能输入单 id、游戏名称两种
 */
export interface GameSearchParams {
	query: string; // 搜索关键词（可以是ID或名称）
	source?: SourceType; // 数据源（可选，不指定则为mixed）
	bgmToken?: string; // BGM API访问令牌
	defaults?: Partial<GameMetadataDraft>; // UI 相关默认值，会合并到返回的候选数据中
	mixedEnabledSources?: readonly SourceType[]; // mixed 模式下允许请求的数据源
	limit?: number; // 名称搜索返回数量上限
	signal?: AbortSignal;
}

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
	async searchGames(params: GameSearchParams): Promise<GameMetadataDraft[]> {
		const {
			query,
			source,
			bgmToken,
			defaults,
			mixedEnabledSources,
			limit,
			signal,
		} = params;

		return source
			? this.searchSingleSource(
					query,
					source,
					bgmToken,
					defaults,
					this.shouldUseIdSearch(query, source),
					limit,
					signal,
				)
			: this.searchMixed(
					query,
					bgmToken,
					defaults,
					mixedEnabledSources,
					signal,
				);
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
		defaults: Partial<GameMetadataDraft> | undefined,
		isIdSearch: boolean,
		limit?: number,
		signal?: AbortSignal,
	): Promise<GameMetadataDraft[]> {
		if (isIdSearch) {
			const game = await this.getGameById(query, source, bgmToken, signal);
			return [this.applyDefaults(game, defaults)];
		}

		const candidates = await this.searchByName({
			query,
			source,
			bgmToken,
			limit,
			signal,
		});
		return candidates.map((candidate) =>
			this.applyDefaults(sourceCandidateToDraft(candidate), defaults),
		);
	}

	/**
	 * 根据名称搜索单个数据源
	 */
	async searchByName(params: {
		query: string;
		source: SourceType;
		bgmToken?: string;
		limit?: number;
		signal?: AbortSignal;
	}): Promise<SourceCandidate[]> {
		const { query, source, bgmToken, limit, signal } = params;
		try {
			return await getSourceAdapter(source).searchByName(query, {
				bgmToken,
				limit,
				signal,
			});
		} catch (error) {
			throw createMetadataError(
				`Failed to search ${source} metadata by name`,
				error,
				`Metadata request failed for ${source} name search`,
			);
		}
	}

	async searchBestMatch(params: {
		query: string;
		source: SourceType;
		bgmToken?: string;
		defaults?: Partial<GameMetadataDraft>;
		signal?: AbortSignal;
	}): Promise<GameMetadataDraft | null> {
		const { query, source, bgmToken, defaults, signal } = params;
		const draft = await resolveAutoSelectedGameDraft({
			query,
			source,
			bgmToken,
			signal,
		});

		return draft ? this.applyDefaults(draft, defaults) : null;
	}

	/**
	 * Mixed 搜索
	 */
	private async searchMixed(
		query: string,
		bgmToken: string | undefined,
		defaults: Partial<GameMetadataDraft> | undefined,
		mixedEnabledSources?: readonly SourceType[],
		signal?: AbortSignal,
	): Promise<GameMetadataDraft[]> {
		const result = await this.getMixedGameByName(
			query,
			bgmToken,
			mixedEnabledSources,
			signal,
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
		defaults?: Partial<GameMetadataDraft>;
		mixedEnabledSources?: readonly SourceType[];
		signal?: AbortSignal;
	}): Promise<MixedSourceCandidates> {
		const { query, bgmToken, mixedEnabledSources, signal } = params;

		try {
			const result = await fetchMixedData({
				name: query,
				bgmToken,
				enabledSources: mixedEnabledSources,
				signal,
			});

			return Object.fromEntries(
				REGISTERED_SOURCE_KEYS.map((source) => [source, result[source] ?? []]),
			) as MixedSourceCandidates;
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
		signal?: AbortSignal,
	): Promise<GameMetadataDraft> {
		if (import.meta.env.DEV) {
			console.log(`[MetadataService] getGameById called:`, {
				id,
				source,
				hasBgmToken: !!bgmToken,
			});
		}
		try {
			const candidate = await getSourceAdapter(source).fetchById(id, {
				bgmToken,
				signal,
			});
			return candidate;
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
	 * - 单源名称搜索：仅特定数据源（如 ymgal/kun）需要按 id 拉取完整详情
	 */
	async resolveSourceCandidateSelection(params: {
		candidate: SourceCandidate;
		defaults?: Partial<GameMetadataDraft>;
	}): Promise<GameMetadataDraft> {
		const { candidate, defaults } = params;
		const draft = await this.resolveSourceCandidateDraft(candidate);
		return this.applyDefaults(draft, defaults);
	}

	private async resolveSourceCandidateDraft(
		candidate: SourceCandidate,
		ctx: MetadataSourceContext = {},
	): Promise<GameMetadataDraft> {
		const adapter = getRuntimeSourceAdapter(candidate.source);
		if (!adapter.enrichOnSelect || !candidate.externalId) {
			return sourceCandidateToDraft(candidate);
		}

		return adapter.enrichOnSelect(candidate, ctx);
	}

	private async enrichSourceCandidateDetails(
		candidate: SourceCandidate,
		ctx: MetadataSourceContext = {},
	): Promise<SourceCandidate> {
		const draft = await this.resolveSourceCandidateDraft(candidate, ctx);
		const adapter = getRuntimeSourceAdapter(candidate.source);
		return getSourceCandidateFromGame(
			draft,
			adapter,
			adapter.toDisplayFields(
				getCandidateSourceData(draft, candidate.source) ?? candidate.data,
			),
		);
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

				const selectedCandidate = selection[source];
				if (!selectedCandidate) {
					return;
				}

				nextSelection[source] = await this.enrichSourceCandidateDetails(
					selectedCandidate,
					{
						enrichCrossSource: false,
					},
				);
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
		defaults?: Partial<GameMetadataDraft>;
	}): Promise<GameMetadataDraft> {
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
	 * 根据名称获取 mixed 游戏数据（各源第一个结果）
	 */
	private async getMixedGameByName(
		name: string,
		bgmToken?: string,
		enabledSources?: readonly SourceType[],
		signal?: AbortSignal,
	): Promise<GameMetadataDraft | null> {
		try {
			const result = await fetchMixedData({
				name,
				bgmToken,
				enabledSources,
				signal,
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
		game: GameMetadataDraft,
		defaults?: Partial<GameMetadataDraft>,
	): GameMetadataDraft {
		return defaults ? { ...defaults, ...game } : game;
	}

	/**
	 * 验证游戏 ID 格式
	 */
	isValidGameId(id: string, source: SourceType): boolean {
		return getSourceAdapter(source).validateId(id);
	}

	/**
	 * 根据多个 ID 获取游戏数据（用于更新场景）
	 */
	async getGameByIds(params: {
		sourceIds?: SourceIdMap;
		bgmToken?: string;
		enabledSources?: readonly SourceType[];
		defaults?: Partial<GameMetadataDraft>;
	}): Promise<GameMetadataDraft> {
		const { sourceIds, bgmToken, enabledSources, defaults } = params;
		const enabledSourceIds = getEnabledSourceIds(sourceIds, enabledSources);
		const providedSources = REGISTERED_SOURCE_KEYS.filter((source) =>
			getSourceId(enabledSourceIds, source),
		);

		if (providedSources.length === 0) {
			throw createStableError(
				"invalid_game_id",
				"At least one metadata source id is required",
			);
		}

		try {
			if (providedSources.length === 1) {
				const result = await fetchMixedData({
					sourceIds: enabledSourceIds,
					bgmToken,
					enabledSources,
				});
				const mergedResult = ensureMixedResult(
					mergeMixedResult(pickFirstMixedResult(result)),
				);
				mergedResult.id_type = this.determineIdType(mergedResult);

				return this.applyDefaults(mergedResult, defaults);
			}

			const results = await Promise.all(
				REGISTERED_SOURCE_KEYS.map((source) => {
					const sourceId = getSourceId(enabledSourceIds, source);
					return sourceId
						? this.getGameById(
								sourceId,
								source,
								source === "bgm" ? bgmToken : undefined,
							)
						: Promise.resolve(null);
				}),
			);

			const mergedGame: GameMetadataDraft = {
				...defaults,
				id_type: "mixed",
				sources: defaults?.sources ?? [],
			};

			REGISTERED_SOURCE_KEYS.forEach((source, index) => {
				const game = results[index];
				if (!game) {
					return;
				}
				mergeSourceFields(mergedGame, game, source);
			});

			if (
				!REGISTERED_SOURCE_KEYS.some((source) =>
					hasSourceId(mergedGame, source),
				)
			) {
				throw new AppError({
					code: "metadata_not_found",
					message: "No metadata result returned from requested sources",
				});
			}
			mergedGame.id_type = this.determineIdType(mergedGame);

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
	private determineIdType(game: Partial<GameMetadataDraft>): string {
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
