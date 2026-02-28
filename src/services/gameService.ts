/**
 * @file 游戏数据服务
 * @description 封装所有游戏相关的后端调用
 *
 * 重构说明:
 * - 采用单表架构，元数据以 JSON 列形式嵌入 games 表
 * - 使用 DTO 模式区分读取、插入、更新操作
 * - InsertGameParams: 新增游戏
 * - UpdateGameParams: 更新游戏（支持三态逻辑）
 * - FullGameData: 读取游戏数据
 */

import type { FullGameData, InsertGameParams, UpdateGameParams } from "@/types";
import { BaseService } from "./base";
import type { GameType, SortOption, SortOrder } from "./types";

class GameService extends BaseService {
	/**
	 * 插入游戏数据（单表架构）
	 * @param game 插入参数（不含 id 和时间戳）
	 */
	async insertGame(game: InsertGameParams): Promise<number> {
		return this.invoke<number>("insert_game", { game });
	}

	/**
	 * 根据 ID 查询游戏数据
	 */
	async getGameById(id: number): Promise<FullGameData | null> {
		return this.invoke<FullGameData | null>("find_game_by_id", { id });
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
	 * 检查 BGM ID 是否已存在
	 */
	async gameExistsByBgmId(bgmId: string): Promise<boolean> {
		return this.invoke<boolean>("game_exists_by_bgm_id", { bgmId });
	}

	/**
	 * 检查 VNDB ID 是否已存在
	 */
	async gameExistsByVndbId(vndbId: string): Promise<boolean> {
		return this.invoke<boolean>("game_exists_by_vndb_id", { vndbId });
	}

	/**
	 * 获取所有游戏的 BGM ID 列表
	 * @returns 返回 [id, bgm_id] 的数组，只包含有 BGM ID 的游戏
	 */
	async getAllBgmIds(): Promise<Array<[number, string]>> {
		return this.invoke<Array<[number, string]>>("get_all_bgm_ids", {});
	}

	/**
	 * 获取所有游戏的 VNDB ID 列表
	 * @returns 返回 [id, vndb_id] 的数组，只包含有 VNDB ID 的游戏
	 */
	async getAllVndbIds(): Promise<Array<[number, string]>> {
		return this.invoke<Array<[number, string]>>("get_all_vndb_ids", {});
	}

	/**
	 * 批量更新游戏数据
	 *
	 * 使用单个事务处理所有更新操作，性能远优于逐个更新
	 *
	 * @param updates 更新列表 [[gameId, updates], ...]
	 * @returns 返回成功更新的游戏数量
	 */
	async updateBatch(
		updates: Array<[number, UpdateGameParams]>,
	): Promise<number> {
		return this.invoke<number>("update_games_batch", { updates });
	}
}

// 导出单例
export const gameService = new GameService();
