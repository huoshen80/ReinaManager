/**
 * @file 游戏数据服务
 * @description 封装所有游戏相关的后端调用
 */

import type { BgmData, FullGameData, OtherData, RawGameData, VndbData } from '@/types';
import type { GameType, SortOption, SortOrder } from './types';
import { BaseService } from './base';

class GameService extends BaseService {
  /**
   * 插入游戏数据（包含关联数据）
   */
  async insertGame(
    game: RawGameData,
    bgm?: BgmData|null,
    vndb?: VndbData|null,
    other?: OtherData|null
  ): Promise<number> {
    return this.invoke<number>('insert_game_with_related', {
      game,
      bgm: bgm || null,
      vndb: vndb || null,
      other: other || null,
    });
  }

  /**
   * 根据 ID 查询完整游戏数据（包含关联数据）
   */
  async getGameById(id: number): Promise<FullGameData | null> {
    return this.invoke<FullGameData | null>('find_full_game_by_id', { id });
  }

  /**
   * 获取所有完整游戏数据（包含关联）
   */
  async getAllFullGames(
    sortOption: SortOption = 'addtime',
    sortOrder: SortOrder = 'asc'
  ): Promise<FullGameData[]> {
    return this.invoke<FullGameData[]>('find_all_full_games', {
      sortOption,
      sortOrder,
    });
  }

  /**
   * 根据类型筛选完整游戏数据（包含关联）
   */
  async getFullGamesByType(
    gameType: GameType,
    sortOption: SortOption = 'addtime',
    sortOrder: SortOrder = 'asc'
  ): Promise<FullGameData[]> {
    return this.invoke<FullGameData[]>('find_full_games_by_type', {
      gameType,
      sortOption,
      sortOrder,
    });
  }

  /**
   * 搜索完整游戏数据（包含关联）
   */
  async searchFullGames(
    keyword: string,
    gameType: GameType = 'all',
    sortOption: SortOption = 'addtime',
    sortOrder: SortOrder = 'asc'
  ): Promise<FullGameData[]> {
    return this.invoke<FullGameData[]>('search_full_games', {
      keyword,
      gameType,
      sortOption,
      sortOrder,
    });
  }

  /**
   * 批量更新游戏数据（包含关联数据）
   */
  async updateGameWithRelated(
    gameId: number,
    updates: Partial<FullGameData>
  ): Promise<void> {
    return this.invoke<void>('update_game_with_related', {
      gameId,
      updates,
    });
  }

  /**
   * 删除游戏
   */
  async deleteGame(id: number): Promise<number> {
    return this.invoke<number>('delete_game', { id });
  }

  
  /**
   * 删除指定游戏的 BGM 关联数据
   */
  async deleteBgmData(gameId: number): Promise<number> {
    return this.invoke<number>('delete_bgm_data', { gameId });
  }

  /**
   * 删除指定游戏的 VNDB 关联数据
   */
  async deleteVndbData(gameId: number): Promise<number> {
    return this.invoke<number>('delete_vndb_data', { gameId });
  }

  /**
   * 删除指定游戏的 Other 关联数据
   */
  async deleteOtherData(gameId: number): Promise<number> {
    return this.invoke<number>('delete_other_data', { gameId });
  }

  /**
   * 批量删除游戏
   */
  async deleteGames(ids: number[]): Promise<number> {
    return this.invoke<number>('delete_games_batch', { ids });
  }

  /**
   * 获取游戏总数
   */
  async countGames(): Promise<number> {
    return this.invoke<number>('count_games');
  }

  /**
   * 检查 BGM ID 是否已存在
   */
  async gameExistsByBgmId(bgmId: string): Promise<boolean> {
    return this.invoke<boolean>('game_exists_by_bgm_id', { bgmId });
  }

  /**
   * 检查 VNDB ID 是否已存在
   */
  async gameExistsByVndbId(vndbId: string): Promise<boolean> {
    return this.invoke<boolean>('game_exists_by_vndb_id', { vndbId });
  }
}

// 导出单例
export const gameService = new GameService();
