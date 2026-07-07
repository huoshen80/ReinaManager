/**
 * @file 游戏数据服务
 * @description 封装所有游戏相关的后端调用
 *
 * 后端使用 sources 数组；本层临时转换为现有前端宽模型，
 * 兼容逻辑移除前不向组件和缓存扩散 V2 wire shape。
 */

import type {
	BatchOperationResult,
	FullGameData,
	FullGameDataV2,
	GameSourceRecord,
	InsertGameParams,
	InsertGameParamsV2,
	JsonValue,
	UpdateGameParams,
	UpdateGameParamsV2,
} from "@/types";
import { isSourceType, SOURCE_FIELD_KEYS } from "@/types";
import { BaseService } from "./base";
import type { GameType, SortOption, SortOrder } from "./types";

type WireBatchOperationResult = Omit<BatchOperationResult, "games"> & {
	games: FullGameDataV2[];
};

function withoutLegacySourceFields<T extends object>(value: T): T {
	const result = { ...value } as Record<string, unknown>;
	for (const fields of Object.values(SOURCE_FIELD_KEYS)) {
		delete result[fields.id];
		delete result[fields.data];
	}
	return result as T;
}

function collectSourceRecords(
	value: Record<string, unknown>,
): GameSourceRecord[] {
	const sources: GameSourceRecord[] = [];
	for (const [source, fields] of Object.entries(SOURCE_FIELD_KEYS)) {
		const externalId = value[fields.id];
		const data = value[fields.data];
		if (externalId == null && data == null) continue;

		sources.push({
			source,
			external_id: typeof externalId === "string" ? externalId : null,
			data: (data ?? null) as JsonValue | null,
		});
	}
	return sources;
}

function toLegacyGame(game: FullGameDataV2): FullGameData {
	const { sources, ...base } = game;
	const result = { ...base } as Record<string, unknown>;

	for (const source of sources) {
		if (!isSourceType(source.source)) continue;
		const fields = SOURCE_FIELD_KEYS[source.source];
		result[fields.id] = source.external_id ?? undefined;
		result[fields.data] = source.data;
	}

	return result as unknown as FullGameData;
}

function toInsertWire(game: InsertGameParams): InsertGameParamsV2 {
	return {
		...withoutLegacySourceFields(game),
		sources: collectSourceRecords(game as unknown as Record<string, unknown>),
	};
}

function toUpdateWire(updates: UpdateGameParams): UpdateGameParamsV2 {
	const raw = updates as Record<string, unknown>;
	const upsertSources: GameSourceRecord[] = [];
	const removeSources: string[] = [];

	for (const [source, fields] of Object.entries(SOURCE_FIELD_KEYS)) {
		const hasId = Object.hasOwn(raw, fields.id);
		const hasData = Object.hasOwn(raw, fields.data);
		if (!hasId && !hasData) continue;
		if (hasId !== hasData) {
			throw new Error(`${source} source 更新必须同时包含 ID 和 data`);
		}

		const externalId = raw[fields.id];
		const data = raw[fields.data];
		if (externalId == null && data == null) {
			removeSources.push(source);
		} else {
			upsertSources.push({
				source,
				external_id: typeof externalId === "string" ? externalId : null,
				data: (data ?? null) as JsonValue | null,
			});
		}
	}

	const wire: UpdateGameParamsV2 = withoutLegacySourceFields(updates);
	if (upsertSources.length > 0) wire.upsert_sources = upsertSources;
	if (removeSources.length > 0) wire.remove_sources = removeSources;
	return wire;
}

class GameService extends BaseService {
	/**
	 * 插入游戏数据（单表架构）
	 * @param game 插入参数（不含 id 和时间戳）
	 */
	async insertGame(game: InsertGameParams): Promise<FullGameData> {
		const result = await this.invoke<FullGameDataV2>("insert_game", {
			game: toInsertWire(game),
		});
		return toLegacyGame(result);
	}

	/**
	 * 批量插入游戏数据
	 */
	async insertGamesBatch(
		games: InsertGameParams[],
	): Promise<BatchOperationResult> {
		const result = await this.invoke<WireBatchOperationResult>(
			"insert_games_batch",
			{ games: games.map(toInsertWire) },
		);
		return {
			...result,
			games: result.games.map(toLegacyGame),
		};
	}

	/**
	 * 根据 ID 查询游戏数据
	 */
	async getGameById(id: number): Promise<FullGameData | null> {
		const result = await this.invoke<FullGameDataV2 | null>("find_game_by_id", {
			id,
		});
		return result ? toLegacyGame(result) : null;
	}

	/**
	 * 获取所有游戏数据，支持按类型筛选和排序
	 * @param language - 语言代码，用于名称排序时决定 name_cn 优先级（如 "zh-CN"）
	 */
	async getAllGames(
		gameType: GameType = "all",
		sortOption: SortOption = "addtime",
		sortOrder: SortOrder = "asc",
		language?: string,
	): Promise<FullGameData[]> {
		const result = await this.invoke<FullGameDataV2[]>("find_all_games", {
			gameType,
			sortOption,
			sortOrder,
			language: language ?? null,
		});
		return result.map(toLegacyGame);
	}

	/**
	 * 只返回排序/筛选后的游戏 ID 列表
	 *
	 * 前端已缓存完整游戏数据，切换排序/筛选时只需传输 ID 数组，
	 * IPC 传输量从数 MB 降到数 KB。
	 */
	async getGameIds(
		gameType: GameType = "all",
		sortOption: SortOption = "addtime",
		sortOrder: SortOrder = "asc",
		language?: string,
	): Promise<number[]> {
		return this.invoke<number[]>("find_game_ids", {
			gameType,
			sortOption,
			sortOrder,
			language: language ?? null,
		});
	}

	/**
	 * 更新游戏数据（单表架构）
	 *
	 * 支持三态逻辑：
	 * - undefined: 不修改
	 * - null: 清空字段
	 * - 具体值: 更新为新值
	 *
	 * @param gameId 游戏 ID
	 * @param updates 更新参数
	 */
	async updateGame(
		gameId: number,
		updates: UpdateGameParams,
	): Promise<FullGameData> {
		const result = await this.invoke<FullGameDataV2>("update_game", {
			gameId,
			updates: toUpdateWire(updates),
		});
		return toLegacyGame(result);
	}

	/**
	 * 删除游戏
	 */
	async deleteGame(id: number): Promise<number> {
		return this.invoke<number>("delete_game", { id });
	}

	/**
	 * 批量删除游戏
	 */
	async deleteGames(ids: number[]): Promise<number> {
		return this.invoke<number>("delete_games_batch", { ids });
	}

	/**
	 * 获取游戏总数
	 */
	async countGames(): Promise<number> {
		return this.invoke<number>("count_games");
	}

	/**
	 * 检查指定 source ID 是否已存在
	 */
	async sourceBindingExists(
		source: string,
		externalId: string,
	): Promise<boolean> {
		return this.invoke<boolean>("source_binding_exists", {
			source,
			externalId,
		});
	}

	async gameExistsByBgmId(bgmId: string): Promise<boolean> {
		return this.sourceBindingExists("bgm", bgmId);
	}

	async gameExistsByVndbId(vndbId: string): Promise<boolean> {
		return this.sourceBindingExists("vndb", vndbId);
	}

	/**
	 * 获取指定 source 的游戏绑定
	 */
	async getSourceBindings(source: string): Promise<Array<[number, string]>> {
		return this.invoke<Array<[number, string]>>("get_source_bindings", {
			source,
		});
	}

	async getAllBgmIds(): Promise<Array<[number, string]>> {
		return this.getSourceBindings("bgm");
	}

	async getAllVndbIds(): Promise<Array<[number, string]>> {
		return this.getSourceBindings("vndb");
	}

	/**
	 * 批量更新游戏数据
	 *
	 * 使用单个事务处理所有更新操作，性能远优于逐个更新
	 *
	 * @param updates 更新列表 [[gameId, updates], ...]
	 * @returns 返回更新后的完整游戏数据
	 */
	async updateBatch(
		updates: Array<[number, UpdateGameParams]>,
	): Promise<FullGameData[]> {
		const result = await this.invoke<FullGameDataV2[]>("update_games_batch", {
			updates: updates.map(([gameId, update]) => [
				gameId,
				toUpdateWire(update),
			]),
		});
		return result.map(toLegacyGame);
	}
}

// 导出单例
export const gameService = new GameService();
