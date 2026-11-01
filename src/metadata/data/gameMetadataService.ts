/**
 * @file 游戏元数据服务层
 * @description 统一管理所有游戏数据源的搜索和获取逻辑，封装 API 调用细节
 * @module src/metadata/data/gameMetadataService
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

import type { apiSourceType, GameMetadataDraft, SourceType } from "@/types";
import { isAbortError } from "@/utils/async";
import { AppError, toError } from "@/utils/errors";
import { fetchMixedData } from "../api/mixed";
import { MIXED_SOURCE_MAX_COUNT } from "../constants";
import type { MetadataRequestContext, SourceIdMap } from "../sourceAdapter";
import { resolveAutoSelectedGameDraft } from "../sourceAutoResolve";
import {
	getCandidateSourceData,
	getCandidateSourceId,
	getSourceCandidateFromGame,
	mergeCandidateSources,
	type SourceCandidate,
	sourceCandidateToDraft,
} from "../sourceCandidate";
import {
	type BoundSourceAdapterMap,
	bindSourceAdapters,
	getSourceAdapter,
	MIXED_SOURCE_KEYS,
	REGISTERED_SOURCE_KEYS,
	type RuntimeBoundSourceAdapter,
} from "../sourceRegistry";
import {
	buildGameFromMixedSelection,
	type MetadataFetchResult,
	type MixedSourceCandidates,
	type MixedSourceEnabled,
	type MixedSourceSelection,
	mergeMixedResult,
	pickFirstMixedResult,
} from "./metadata";

const mixedIdTypePriority: readonly SourceType[] = [
	"bgm",
	"hikarinagi",
	"vndb",
	"ymgal",
	"kun",
	"dlsite",
	"erogamescape",
];

function hasSourceData(
	game: Partial<GameMetadataDraft>,
	source: SourceType,
): boolean {
	return getCandidateSourceData(game as GameMetadataDraft, source) != null;
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
		MIXED_SOURCE_KEYS.map((source) => {
			const id =
				!enabled || enabled.has(source) ? getSourceId(sourceIds, source) : "";
			return [source, id || undefined];
		}),
	) as SourceIdMap;
}

function createMetadataError(
	scope: string,
	error: unknown,
	fallback: string,
): Error {
	// 取消必须保持原始类型，调用方才能中止整条搜索链路。
	if (isAbortError(error)) {
		return toError(error);
	}
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
	mixedEnabledSources?: readonly SourceType[]; // mixed 模式下允许请求的数据源
	limit?: number; // 名称搜索返回数量上限
}

/**
 * 单次元数据操作会话。
 * 构造时固定请求上下文，后续业务链路只传递已绑定的数据源适配器。
 */
export class GameMetadataSession {
	private readonly adapters: BoundSourceAdapterMap;
	private readonly context: MetadataRequestContext;

	constructor(context: MetadataRequestContext) {
		this.context = context;
		this.adapters = bindSourceAdapters(context);
	}

	private finalizeResult(
		draft: GameMetadataDraft,
		options: {
			failedSources?: SourceType[];
		} = {},
	): MetadataFetchResult {
		const sources = draft.sources;
		const adoptedIds = Object.fromEntries(
			sources
				.filter((record) => record.data != null)
				.map((record) => [record.source, record.external_id]),
		) as SourceIdMap;
		// 最终采用身份确定后统一收尾；通用流程不解释任何来源的标签规则。
		const data = {
			...draft,
			sources: sources.map((record) => {
				const adapter = this.getRuntimeAdapter(record.source);
				return record.data != null && adapter.finalizeData
					? { ...record, data: adapter.finalizeData(record.data, adoptedIds) }
					: record;
			}),
		};
		data.id_type = this.determineIdType(data);
		return {
			data,
			failedSources: options.failedSources ?? [],
		};
	}

	/** 按会话偏好保留来源身份，供导入流程在增强前去重；此时不做最终数据清洗。 */
	filterSingleSourceDraft(
		draft: GameMetadataDraft,
		origin: SourceType,
	): GameMetadataDraft {
		const allowedSources = new Set<SourceType>([
			origin,
			...(this.context.mixedEnabledSources ?? []),
		]);
		return {
			...draft,
			sources: draft.sources.filter((record) =>
				allowedSources.has(record.source),
			),
		};
	}

	/** 对详情执行增强与清洗；批量匹配可先关闭增强，判重后再复用同一份详情。 */
	async completeSingleSource(
		draft: GameMetadataDraft,
		origin: SourceType,
		options: { expand?: boolean } = {},
	): Promise<MetadataFetchResult> {
		const result =
			options.expand !== false &&
			this.context.autoExpandSources?.includes(origin)
				? await this.expandAssociatedSources(draft, origin)
				: { data: draft, failedSources: [] };
		// 主源始终保留；增强返回的间接关联也不能绕过 Mixed 选择。
		return this.finalizeResult(
			this.filterSingleSourceDraft(result.data, origin),
			{ failedSources: result.failedSources },
		);
	}

	private async expandAssociatedSources(
		draft: GameMetadataDraft,
		origin: SourceType,
	): Promise<MetadataFetchResult> {
		const targets = this.getEnabledMixedAdapters(
			this.context.mixedEnabledSources ?? [],
		)
			.flatMap((adapter) => {
				const id = getCandidateSourceId(draft, adapter.key);
				return adapter.key !== origin &&
					getCandidateSourceData(draft, adapter.key) == null &&
					id &&
					adapter.validateId(id)
					? [{ adapter, id }]
					: [];
			})
			.slice(0, MIXED_SOURCE_MAX_COUNT);
		const results = await Promise.all(
			targets.map(async ({ adapter, id }) => {
				try {
					// 直接请求 Adapter，不重新进入单源流程，避免关联扩展递归。
					const data = await adapter.fetchById(id);
					if (getCandidateSourceData(data, adapter.key) != null)
						return { source: adapter.key, data };
				} catch (error) {
					if (isAbortError(error) || this.context.signal?.aborted) throw error;
				}
				return { source: adapter.key, data: null };
			}),
		);
		const expansions = results.flatMap((result) =>
			result.data ? [result.data] : [],
		);
		// 定位源同样保留完整元数据，更新时可同时替换其旧快照和来源 ID。
		const sources = mergeCandidateSources([draft, ...expansions]);
		return {
			data: { ...draft, sources },
			failedSources: results
				.filter((result) => !result.data)
				.map((result) => result.source),
		};
	}

	private getRuntimeAdapter(source: SourceType): RuntimeBoundSourceAdapter {
		return this.adapters[source] as RuntimeBoundSourceAdapter;
	}

	private getEnabledMixedAdapters(
		enabledSources?: readonly SourceType[],
	): RuntimeBoundSourceAdapter[] {
		const enabledSet = enabledSources ? new Set(enabledSources) : undefined;
		return MIXED_SOURCE_KEYS.filter(
			(source) => !enabledSet || enabledSet.has(source),
		).map((source) => this.getRuntimeAdapter(source));
	}

	/**
	 * 游戏搜索主入口
	 * - source 指定：按当前数据源自动判断 ID 搜索，否则按名称返回列表
	 * - source 未指定：mixed 名称搜索，返回各源第一个结果
	 */
	async searchGames(params: GameSearchParams): Promise<GameMetadataDraft[]> {
		const { query, source, mixedEnabledSources, limit } = params;

		return source
			? this.searchSingleSource(
					query,
					source,
					this.shouldUseIdSearch(query, source),
					limit,
				)
			: this.searchMixed(query, mixedEnabledSources);
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
		isIdSearch: boolean,
		limit?: number,
	): Promise<GameMetadataDraft[]> {
		if (isIdSearch) {
			const game = await this.getGameById(query, source);
			return [game];
		}

		const candidates = await this.searchByName({
			query,
			source,
			limit,
		});
		return candidates.map(sourceCandidateToDraft);
	}

	/**
	 * 根据名称搜索单个数据源
	 */
	async searchByName(params: {
		query: string;
		source: SourceType;
		limit?: number;
	}): Promise<SourceCandidate[]> {
		const { query, source, limit } = params;
		try {
			return await this.getRuntimeAdapter(source).searchByName(query, {
				limit,
			});
		} catch (error) {
			throw createMetadataError(
				`Failed to search ${source} metadata by name`,
				error,
				`Metadata request failed for ${source} name search`,
			);
		}
	}

	async searchBestMatchResult(params: {
		query: string;
		source: SourceType;
		expand?: boolean;
	}): Promise<MetadataFetchResult | null> {
		const { query, source, expand } = params;
		if (source === "dlsite" && this.shouldUseIdSearch(query, source)) {
			return this.completeSingleSource(
				await this.getGameByIdDraft(query, source),
				source,
				{ expand },
			);
		}

		const draft = await resolveAutoSelectedGameDraft({
			query,
			adapter: this.getRuntimeAdapter(source),
		});

		return draft
			? this.completeSingleSource(
					this.filterSingleSourceDraft(draft, source),
					source,
					{ expand },
				)
			: null;
	}

	/**
	 * Mixed 搜索
	 */
	private async searchMixed(
		query: string,
		mixedEnabledSources?: readonly SourceType[],
	): Promise<GameMetadataDraft[]> {
		const result = await this.getMixedGameByName(query, mixedEnabledSources);
		if (!result) {
			return [];
		}

		return [result];
	}

	/**
	 * 获取 mixed 名称搜索的每源候选列表，供用户逐源选择。
	 */
	async searchMixedSourceCandidates(params: {
		query: string;
		mixedEnabledSources?: readonly SourceType[];
	}): Promise<{
		candidates: MixedSourceCandidates;
		failedSources: SourceType[];
	}> {
		const { query, mixedEnabledSources } = params;

		try {
			const result = await fetchMixedData({
				name: query,
				adapters: this.getEnabledMixedAdapters(mixedEnabledSources),
			});

			return {
				candidates: Object.fromEntries(
					REGISTERED_SOURCE_KEYS.map((source) => [
						source,
						result.candidates[source] ?? [],
					]),
				) as MixedSourceCandidates,
				failedSources: result.failedSources,
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
	): Promise<GameMetadataDraft> {
		return (await this.getGameByIdResult(id, source)).data;
	}

	async getGameByIdResult(
		id: string,
		source: SourceType,
	): Promise<MetadataFetchResult> {
		const draft = await this.getGameByIdDraft(id, source);
		return this.completeSingleSource(draft, source);
	}

	/** 仅获取主源详情与允许的关联身份，增强和最终清洗由采用流程决定。 */
	async getGameByIdDraft(
		id: string,
		source: SourceType,
	): Promise<GameMetadataDraft> {
		if (import.meta.env.DEV) {
			console.log(`[MetadataService] getGameById called:`, {
				id,
				source,
			});
		}
		try {
			const candidate = await this.getRuntimeAdapter(source).fetchById(id);
			return this.filterSingleSourceDraft(candidate, source);
		} catch (error) {
			throw createMetadataError(
				`Failed to fetch ${source} metadata by id`,
				error,
				`Metadata request failed for ${source} id lookup`,
			);
		}
	}

	/**
	 * 单源候选确认：补全详情、按会话偏好扩展，再返回统一获取结果。
	 */
	async resolveSourceCandidateSelection(params: {
		candidate: SourceCandidate;
	}): Promise<MetadataFetchResult> {
		const draft = await this.resolveSourceCandidateDraft(params.candidate);
		return this.completeSingleSource(draft, params.candidate.source);
	}

	private async resolveSourceCandidateDraft(
		candidate: SourceCandidate,
	): Promise<GameMetadataDraft> {
		const adapter = this.getRuntimeAdapter(candidate.source);
		// BGM 未实现 enrichOnSelect，确认阶段不会发起 BGM 请求，
		// 因此调用方无需为 resolve 单独获取 BGM token。
		if (!adapter.enrichOnSelect || !candidate.externalId) {
			return sourceCandidateToDraft(candidate);
		}

		return adapter.enrichOnSelect(candidate);
	}

	private async enrichSourceCandidateDetails(
		candidate: SourceCandidate,
	): Promise<SourceCandidate> {
		const draft = await this.resolveSourceCandidateDraft(candidate);
		const adapter = this.getRuntimeAdapter(candidate.source);
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
	 * 仅补全在线源，历史废弃源的候选不能进入新获取链路。
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

				nextSelection[source] =
					await this.enrichSourceCandidateDetails(selectedCandidate);
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
		failedSources?: SourceType[];
	}): Promise<MetadataFetchResult> {
		const { selection, enabled } = params;
		const enrichedSelection = await this.enrichMixedSourceSelection(
			selection,
			enabled,
		);
		return this.finalizeResult(
			buildGameFromMixedSelection({
				selection: enrichedSelection,
				enabled,
			}),
			{ failedSources: params.failedSources },
		);
	}

	/**
	 * 根据名称获取 mixed 游戏数据（各源第一个结果）
	 */
	private async getMixedGameByName(
		name: string,
		enabledSources?: readonly SourceType[],
	): Promise<GameMetadataDraft | null> {
		try {
			const result = await fetchMixedData({
				name,
				adapters: this.getEnabledMixedAdapters(enabledSources),
			});

			const draft = mergeMixedResult(pickFirstMixedResult(result.candidates));
			return draft
				? this.finalizeResult(draft, { failedSources: result.failedSources })
						.data
				: null;
		} catch (error) {
			throw createMetadataError(
				"Failed to search mixed metadata by name",
				error,
				"Mixed metadata search failed",
			);
		}
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
		enabledSources?: readonly SourceType[];
	}): Promise<MetadataFetchResult> {
		const { sourceIds, enabledSources } = params;
		const enabledSourceIds = getEnabledSourceIds(sourceIds, enabledSources);
		const providedSources = MIXED_SOURCE_KEYS.filter((source) =>
			getSourceId(enabledSourceIds, source),
		);

		if (providedSources.length === 0) {
			throw createStableError(
				"invalid_game_id",
				"At least one metadata source id is required",
			);
		}

		try {
			const result = await fetchMixedData({
				sourceIds: enabledSourceIds,
				adapters: this.getEnabledMixedAdapters(enabledSources),
			});
			const mergedResult = ensureMixedResult(
				mergeMixedResult(pickFirstMixedResult(result.candidates)),
			);
			return this.finalizeResult(
				{
					...mergedResult,
					// Mixed 按 ID 的结果仅包含明确填写的来源，关联身份不补回已清空项。
					sources: mergedResult.sources.filter(
						(record) =>
							providedSources.includes(record.source) &&
							(record.data != null ||
								record.external_id === enabledSourceIds[record.source]),
					),
				},
				{ failedSources: result.failedSources },
			);
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
	 * 关联身份不等于元数据，至少两份真实数据才归为 mixed。
	 */
	private determineIdType(game: Partial<GameMetadataDraft>): string {
		const matchedSources = mixedIdTypePriority.filter((source) =>
			hasSourceData(game, source),
		);

		if (matchedSources.length >= 2) {
			return "mixed";
		}

		return matchedSources[0] ?? "unknown";
	}
}
