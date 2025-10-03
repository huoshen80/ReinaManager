/**
 * @file 合集服务
 * @description 封装所有合集相关的后端调用
 */

import { BaseService } from './base';

export interface Collection {
  id: number;
  name: string;
  parent_id?: number | null;
  sort_order: number;
  icon?: string | null;
  created_at?: number;
  updated_at?: number;
}

export interface GameCollectionLink {
  id: number;
  game_id: number;
  collection_id: number;
  sort_order: number;
  created_at?: number;
}

class CollectionService extends BaseService {
  /**
   * 创建合集
   */
  async createCollection(
    name: string,
    parentId: number | null = null,
    sortOrder: number = 0,
    icon: string | null = null
  ): Promise<Collection> {
    return this.invoke<Collection>('create_collection', {
      name,
      parentId,
      sortOrder,
      icon,
    });
  }

  /**
   * 根据 ID 查询合集
   */
  async getCollectionById(id: number): Promise<Collection | null> {
    return this.invoke<Collection | null>('find_collection_by_id', { id });
  }

  /**
   * 获取所有合集
   */
  async getAllCollections(): Promise<Collection[]> {
    return this.invoke<Collection[]>('find_all_collections');
  }

  /**
   * 获取根合集
   */
  async getRootCollections(): Promise<Collection[]> {
    return this.invoke<Collection[]>('find_root_collections');
  }

  /**
   * 获取子合集
   */
  async getChildCollections(parentId: number): Promise<Collection[]> {
    return this.invoke<Collection[]>('find_child_collections', { parentId });
  }

  /**
   * 更新合集
   */
  async updateCollection(
    id: number,
    name?: string,
    parentId?: number | null,
    sortOrder?: number,
    icon?: string | null
  ): Promise<Collection> {
    return this.invoke<Collection>('update_collection', {
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
    return this.invoke<number>('delete_collection', { id });
  }

  /**
   * 检查合集是否存在
   */
  async collectionExists(id: number): Promise<boolean> {
    return this.invoke<boolean>('collection_exists', { id });
  }

  /**
   * 将游戏添加到合集
   */
  async addGameToCollection(
    gameId: number,
    collectionId: number,
    sortOrder: number = 0
  ): Promise<GameCollectionLink> {
    return this.invoke<GameCollectionLink>('add_game_to_collection', {
      gameId,
      collectionId,
      sortOrder,
    });
  }

  /**
   * 从合集中移除游戏
   */
  async removeGameFromCollection(
    gameId: number,
    collectionId: number
  ): Promise<number> {
    return this.invoke<number>('remove_game_from_collection', {
      gameId,
      collectionId,
    });
  }

  /**
   * 根据关联 ID 删除
   */
  async removeCollectionLinkById(linkId: number): Promise<number> {
    return this.invoke<number>('remove_collection_link_by_id', { linkId });
  }

  /**
   * 获取合集中的所有游戏 ID
   */
  async getGamesInCollection(collectionId: number): Promise<number[]> {
    return this.invoke<number[]>('get_games_in_collection', { collectionId });
  }

  /**
   * 获取游戏所属的所有合集 ID
   */
  async getCollectionsForGame(gameId: number): Promise<number[]> {
    return this.invoke<number[]>('get_collections_for_game', { gameId });
  }

  /**
   * 获取合集中的游戏数量
   */
  async countGamesInCollection(collectionId: number): Promise<number> {
    return this.invoke<number>('count_games_in_collection', { collectionId });
  }

  /**
   * 批量添加游戏到合集
   */
  async addGamesToCollection(
    gameIds: number[],
    collectionId: number
  ): Promise<void> {
    return this.invoke<void>('add_games_to_collection', {
      gameIds,
      collectionId,
    });
  }

  /**
   * 更新游戏在合集中的排序
   */
  async updateGameSortOrderInCollection(
    linkId: number,
    newSortOrder: number
  ): Promise<GameCollectionLink> {
    return this.invoke<GameCollectionLink>(
      'update_game_sort_order_in_collection',
      {
        linkId,
        newSortOrder,
      }
    );
  }

  /**
   * 检查游戏是否在合集中
   */
  async isGameInCollection(gameId: number, collectionId: number): Promise<boolean> {
    return this.invoke<boolean>('is_game_in_collection', {
      gameId,
      collectionId,
    });
  }

  /**
   * 获取所有游戏-合集关联
   */
  async getAllCollectionLinks(): Promise<GameCollectionLink[]> {
    return this.invoke<GameCollectionLink[]>('get_all_collection_links');
  }

  /**
   * 清空合集中的所有游戏
   */
  async clearCollectionGames(collectionId: number): Promise<number> {
    return this.invoke<number>('clear_collection_games', { collectionId });
  }
}

// 导出单例
export const collectionService = new CollectionService();
