/**
 * @file 游戏数据服务
 * @description 封装所有游戏相关的后端调用
 */

import type {
	BatchOperationResult,
	FullGameData,
	InsertGameParams,
	UpdateGameParams,
} from "@/types";
import { BaseService } from "./base";
import type { GameType, SortOption, SortOrder } from "./types";

type WireBatchOperationResult = Omit<BatchOperationResult, "games"> & {
	games: FullGameData[];
};

class GameService extends BaseService {
	/**
	 * 插入游戏数据（单表架构）
	 * @param game 插入参数（不含 id 和时间戳）
	 */
	async insertGame(game: InsertGameParams): Promise<FullGameData> {
		return this.invoke<FullGameData>("insert_game", {
			game,
		});
	}

	/**
	 * 批量插入游戏数据
	 */
	async insertGamesBatch(
		games: InsertGameParams[],
	): Promise<BatchOperationResult> {
		const result = await this.invoke<WireBatchOperationResult>(
			"insert_games_batch",
			{ games },
		);
		return result;
	}

	/**
	 * 根据 ID 查询游戏数据
	 */
	async getGameById(id: number): Promise<FullGameData | null> {
		return this.invoke<FullGameData | null>("find_game_by_id", {
			id,
		});
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
		return this.invoke<FullGameData[]>("find_all_games", {
			gameType,
			sortOption,
			sortOrder,
			language: language ?? null,
		});
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
		return this.invoke<FullGameData>("update_game", {
			gameId,
			updates,
		});
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
		return this.invoke<FullGameData[]>("update_games_batch", {
			updates,
		});
	}
}

// 导出单例
export const gameService = new GameService();
