/**
 * @file 用户设置服务
 * @description 封装所有用户设置相关的后端调用
 */

import { BaseService } from './base';

export interface UserSettings {
  bgm_token?: string | null;
  save_root_path?: string | null;
}

class SettingsService extends BaseService {
  /**
   * 获取 BGM Token
   */
  async getBgmToken(): Promise<string> {
    return this.invoke<string>('get_bgm_token');
  }

  /**
   * 设置 BGM Token
   */
  async setBgmToken(token: string): Promise<void> {
    return this.invoke<void>('set_bgm_token', { token });
  }

  /**
   * 获取存档根路径
   */
  async getSaveRootPath(): Promise<string> {
    return this.invoke<string>('get_save_root_path');
  }

  /**
   * 设置存档根路径
   */
  async setSaveRootPath(path: string): Promise<void> {
    return this.invoke<void>('set_save_root_path', { path });
  }

  /**
   * 获取所有设置
   */
  async getAllSettings(): Promise<UserSettings> {
    return this.invoke<UserSettings>('get_all_settings');
  }

  /**
   * 批量更新设置
   */
  async updateSettings(
    bgmToken?: string | null,
    saveRootPath?: string | null
  ): Promise<void> {
    return this.invoke<void>('update_settings', {
      bgmToken,
      saveRootPath,
    });
  }

  /**
   * 清除 BGM Token
   */
  async clearBgmToken(): Promise<void> {
    return this.invoke<void>('clear_bgm_token');
  }

  /**
   * 清除存档根路径
   */
  async clearSaveRootPath(): Promise<void> {
    return this.invoke<void>('clear_save_root_path');
  }
}

// 导出单例
export const settingsService = new SettingsService();
