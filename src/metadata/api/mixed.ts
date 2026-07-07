/**
 * @file 多数据源混合获取 API 封装
 * @description 同时从 Bangumi、VNDB、YMGal 和 Kungal 获取游戏信息，返回各源原始数据
 * @module src/metadata/api/mixed
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 逻辑说明：
 * 1. 根据传入的参数智能获取：
 *    - 只有单个数据源ID：获取该数据，用其名称搜索其他数据源
 *    - 多个数据源ID：并行获取所有指定的数据源
 *    - 只有名称：同时搜索所有数据源
 * 2. 使用安全模式避免单个数据源失败导致整体失败
 * 3. 按 source 返回候选列表 { bgm, vndb, ymgal, kun }
 *
 * 主要导出：
 * - fetchMixedData：通用混合数据获取，返回按 source 分组的候选列表
 * - fetchMultiSourceData：多数据源搜索和获取的统一接口
 */

import type { SourceType } from "@/types";
import {
	AppError,
	isApiRateLimitError,
	isHttpStatus,
	toError,
} from "@/utils/errors";
import { resolveAutoSelectedSourceCandidate } from "../sourceAutoResolve";
import type { SourceCandidate } from "../sourceCandidate";
import {
	getEnabledMixedAdapters,
	type RuntimeSourceAdapter,
} from "../sourceRegistry";

interface SafeFetchResult {
	source: SourceType;
	data: SourceCandidate[];
	failed: boolean;
	attempted: boolean;
}

export type MixedSourceCandidateResult = Partial<
	Record<SourceType, SourceCandidate[]>
>;

interface FetchMixedDataOptions {
	sourceIds?: Partial<Record<SourceType, string>>;
	name?: string;
	bgmToken?: string;
	enabledSources?: readonly SourceType[];
	signal?: AbortSignal;
}

async function fetchAdapterSafely(
	adapter: RuntimeSourceAdapter,
	task: () => Promise<SourceCandidate[]>,
): Promise<SafeFetchResult> {
	try {
		return {
			source: adapter.key,
			data: await task(),
			failed: false,
			attempted: true,
		};
	} catch (error) {
		if (isApiRateLimitError(error)) throw error;
		if (adapter.key === "bgm" && isHttpStatus(error, 401)) throw error;
		return { source: adapter.key, data: [], failed: true, attempted: true };
	}
}

function createEmptyResult(adapter: RuntimeSourceAdapter): SafeFetchResult {
	return { source: adapter.key, data: [], failed: false, attempted: false };
}

function assertNotAllAttemptedSourcesFailed(
	results: SafeFetchResult[],
	message: string,
	cause?: Error,
) {
	const attemptedResults = results.filter((result) => result.attempted);
	if (
		attemptedResults.length > 0 &&
		attemptedResults.every((result) => result.failed)
	) {
		throw new AppError({
			code: "mixed_sources_failed",
			message,
			cause,
		});
	}
}

function toSourceResult(
	results: SafeFetchResult[],
): MixedSourceCandidateResult {
	const mixedResult: MixedSourceCandidateResult = {};

	for (const result of results) {
		mixedResult[result.source] = result.data;
	}

	return mixedResult;
}

function extractNameFromApi(
	candidate: SourceCandidate | undefined,
): string | undefined {
	if (!candidate) return undefined;

	return candidate.display.name || candidate.display.name_cn;
}

function getProvidedSourceIds(
	options: FetchMixedDataOptions,
	adapters: RuntimeSourceAdapter[],
) {
	return adapters
		.map((adapter) => ({
			adapter,
			id: options.sourceIds?.[adapter.key],
		}))
		.filter((entry): entry is { adapter: RuntimeSourceAdapter; id: string } =>
			Boolean(entry.id),
		);
}

/**
 * 多数据源混合数据获取函数
 * 根据新的设计思路：添加游戏只能输入单id、游戏名称两种
 * - 单id：对应源返回单元素列表，并用其名称搜索其他源候选列表
 * - 游戏名称：所有源都返回候选列表
 *
 * @param options 配置选项
 * @param options.sourceIds 按 source 传入的外部 ID（可选）
 * @param options.name 游戏名称（可选）
 * @param options.bgmToken Bangumi API 访问令牌（可选）
 * @returns 返回按 source 分组的候选列表
 */
export async function fetchMixedData(options: FetchMixedDataOptions) {
	const { name, bgmToken, enabledSources, signal } = options;
	const adapters = getEnabledMixedAdapters(enabledSources);
	const providedSourceIds = getProvidedSourceIds(options, adapters);
	const providedIds = providedSourceIds.length;

	// 场景1: 单个ID提供 - 获取该数据源，然后用名称搜索其他数据源（取第一个结果）
	if (providedIds === 1) {
		let searchName: string | undefined;
		const [{ adapter: sourceAdapter, id: sourceId }] = providedSourceIds;
		let sourceResult = createEmptyResult(sourceAdapter);

		sourceResult = await fetchAdapterSafely(sourceAdapter, async () => [
			await sourceAdapter.fetchById(sourceId, {
				bgmToken,
				enrichCrossSource: false,
				signal,
			}),
		]);
		searchName = extractNameFromApi(sourceResult.data[0]);

		const results: SafeFetchResult[] = searchName
			? await Promise.all(
					adapters.map((adapter) => {
						if (adapter.key === sourceAdapter.key) {
							return Promise.resolve(sourceResult);
						}

						return fetchAdapterSafely(adapter, async () => {
							const candidate = await resolveAutoSelectedSourceCandidate({
								query: searchName,
								source: adapter.key,
								bgmToken,
								enrichCrossSource: false,
								signal,
							});
							return candidate ? [candidate] : [];
						});
					}),
				)
			: adapters.map((adapter) =>
					adapter.key === sourceAdapter.key
						? sourceResult
						: createEmptyResult(adapter),
				);
		assertNotAllAttemptedSourcesFailed(
			results,
			"All mixed source requests failed for single-id lookup",
		);

		return toSourceResult(results);
	}

	// 场景2: 只有名称（用于搜索）- 同时搜索所有数据源候选列表
	if (name?.trim()) {
		const searchName = name.trim();
		const results = await Promise.all(
			adapters.map((adapter) => {
				return fetchAdapterSafely(adapter, () =>
					adapter.searchByName(searchName, {
						bgmToken,
						signal,
					}),
				);
			}),
		);

		assertNotAllAttemptedSourcesFailed(
			results,
			`All mixed source requests failed for search: ${searchName}`,
			toError(undefined, "Mixed search failed"),
		);

		return toSourceResult(results);
	}

	throw new AppError({
		code: "invalid_game_id",
		message: "Mixed fetch requires a single source id or a name query",
	});
}
