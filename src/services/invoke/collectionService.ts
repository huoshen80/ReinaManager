/**
 * @file 合集服务
 * @description 封装所有合集相关的后端调用
 */

import type { Category, Group } from "@/types/collection";
import { BaseService } from "./base";

export interface Collection {
	id: number;
	name: string;
	parent_id?: number | null;
	sort_order: number;
	icon?: string | null;
	created_at?: number;
	updated_at?: number;
}

class CollectionService extends BaseService {
	/**
	 * 创建合集
	 */
	async createCollection(
		name: string,
		parentId: number | null = null,
		sortOrder: number = 0,
		icon: string | null = null,
	): Promise<Collection> {
		return this.invoke<Collection>("create_collection", {
			name,
			parentId,
			sortOrder,
			icon,
		});
	}

	/**
	 * 更新合集
	 */
	async updateCollection(
		id: number,
		name?: string,
		parentId?: number | null,
		sortOrder?: number,
		icon?: string | null,
	): Promise<Collection> {
		return this.invoke<Collection>("update_collection", {
			id,
			name: name || null,
			parentId: parentId !== undefined ? parentId : null,
			sortOrder: sortOrder || null,
			icon: icon !== undefined ? icon : null,
		});
	}

	/**
	 * 删除合集
	 */
	async deleteCollection(id: number): Promise<number> {
		return this.invoke<number>("delete_collection", { id });
	}

	/**
	 * 从单个合集中批量移除游戏
	 */
	async removeGamesFromCollection(
		gameIds: number[],
		collectionId: number,
	): Promise<number> {
		return this.invoke<number>("remove_games_from_collection", {
			gameIds,
			collectionId,
		});
	}

	/**
	 * 获取合集中的所有游戏 ID
	 */
	async getGamesInCollection(collectionId: number): Promise<number[]> {
		return this.invoke<number[]>("get_games_in_collection", { collectionId });
	}

	/**
	 * 获取游戏所在的所有合集 ID
	 */
	async getGameCollectionIds(gameId: number): Promise<number[]> {
		return this.invoke<number[]>("get_game_collection_ids", { gameId });
	}

	/**
	 * 批量将多个游戏添加到多个合集
	 */
	async addGamesToCollections(
		gameIds: number[],
		collectionIds: number[],
	): Promise<void> {
		return this.invoke<void>("add_games_to_collections", {
			gameIds,
			collectionIds,
		});
	}

	/**
	 * 设置单个游戏所在的合集列表
	 */
	async setGameCollections(
		gameId: number,
		collectionIds: number[],
	): Promise<void> {
		return this.invoke<void>("set_game_collections", {
			gameId,
			collectionIds,
		});
	}

	/**
	 * 批量更新分类中的游戏列表
	 * 完全替换分类中的游戏
	 */
	async updateCategoryGames(
		gameIds: number[],
		collectionId: number,
	): Promise<void> {
		return this.invoke<void>("update_category_games", {
			gameIds,
			collectionId,
		});
	}

	// ==================== 前端友好的组合 API ====================

	/**
	 * 批量获取多个分组的游戏数量（优化版）
	 * 解决 N+1 查询问题
	 */
	async batchCountGamesInGroups(
		groupIds: number[],
	): Promise<Record<number, number>> {
		return this.invoke<Record<number, number>>("batch_count_games_in_groups", {
			groupIds,
		});
	}

	/**
	 * 获取分组中的游戏总数
	 */
	async countGamesInGroup(groupId: number): Promise<number> {
		return this.invoke<number>("count_games_in_group", { groupId });
	}

	/**
	 * 获取所有分组（不含分类）
	 */
	async getGroups(): Promise<Group[]> {
		return this.invoke<Group[]>("find_root_collections");
	}

	/**
	 * 获取指定分组的分类列表（带游戏数量）
	 */
	async getCategoriesWithCount(groupId: number): Promise<Category[]> {
		return this.invoke<Category[]>("get_categories_with_count", { groupId });
	}
}

// 导出单例
export const collectionService = new CollectionService();
