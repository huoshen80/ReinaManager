/**
 * @file 用户设置服务
 * @description 封装所有用户设置相关的后端调用
 */

import type { LogLevel, UpdateSettingsParams } from "@/types";
import { BaseService } from "./base";

export interface UserSettings {
	bgm_token?: string | null;
	vndb_token?: string | null;
	save_root_path?: string | null;
	db_backup_path?: string | null;
	le_path?: string | null;
	magpie_path?: string | null;
}

class SettingsService extends BaseService {
	/**
	 * 动态设置日志输出级别（不持久化）
	 */
	async setLogLevel(level: LogLevel): Promise<void> {
		return this.invoke<void>("set_reina_log_level", { level });
	}

	/**
	 * 获取当前日志输出级别
	 */
	async getLogLevel(): Promise<LogLevel> {
		return this.invoke<LogLevel>("get_reina_log_level");
	}

	/**
	 * 获取所有设置
	 */
	async getAllSettings(): Promise<UserSettings> {
		return this.invoke<UserSettings>("get_all_settings");
	}

	/**
	 * 批量更新设置
	 */
	async updateSettings(updates: UpdateSettingsParams): Promise<void> {
		return this.invoke<void>("update_settings", {
			data: updates,
		});
	}
}

// 导出单例
export const settingsService = new SettingsService();
