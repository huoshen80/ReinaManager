/**
 * @file 存档备份服务
 * @description 封装所有存档备份相关的后端调用
 */

import type { SavedataRecord } from '@/types';
import { BaseService } from './base';

class SavedataService extends BaseService {
  /**
   * 保存存档备份记录
   */
  async saveSavedataRecord(
    gameId: number,
    fileName: string,
    backupTime: number,
    fileSize: number
  ): Promise<number> {
    return this.invoke<number>('save_savedata_record', {
      gameId,
      fileName,
      backupTime,
      fileSize,
    });
  }

  /**
   * 获取指定游戏的备份数量
   */
  async getSavedataCount(gameId: number): Promise<number> {
    return this.invoke<number>('get_savedata_count', { gameId });
  }

  /**
   * 获取指定游戏的所有备份记录
   */
  async getSavedataRecords(gameId: number): Promise<SavedataRecord[]> {
    return this.invoke<SavedataRecord[]>('get_savedata_records', { gameId });
  }

  /**
   * 根据 ID 获取备份记录
   */
  async getSavedataRecordById(backupId: number): Promise<SavedataRecord | null> {
    return this.invoke<SavedataRecord | null>('get_savedata_record_by_id', {
      backupId,
    });
  }

  /**
   * 删除备份记录
   */
  async deleteSavedataRecord(backupId: number): Promise<number> {
    return this.invoke<number>('delete_savedata_record', { backupId });
  }

  /**
   * 批量删除指定游戏的所有备份记录
   */
  async deleteAllSavedataByGame(gameId: number): Promise<number> {
    return this.invoke<number>('delete_all_savedata_by_game', { gameId });
  }
}

// 导出单例
export const savedataService = new SavedataService();
