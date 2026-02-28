/**
 * @file 用户设置服务
 * @description 封装所有用户设置相关的后端调用
 */

import type { LogLevel } from "@/types";
import { BaseService } from "./base";

export interface UserSettings {
	bgm_token?: string | null;
	save_root_path?: string | null;
	db_backup_path?: string | null;
	portable_mode?: number | null;
}

export interface PortableModeResult {
	requires_restart: boolean;
	database_migrated: boolean;
	database_backups_count: number;
	savedata_backups_count: number;
	total_files: number;
	message: string;
}

class SettingsService extends BaseService {
	/**
	 * 获取 BGM Token
	 */
	async getBgmToken(): Promise<string> {
		return this.invoke<string>("get_bgm_token");
	}

	/**
	 * 设置 BGM Token
	 */
	async setBgmToken(token: string): Promise<void> {
		return this.invoke<void>("set_bgm_token", { token });
	}

	/**
	 * 获取 BGM Profile
	 */
	async getBgmProfile(): Promise<[string, string]> {
		return this.invoke<[string, string]>("get_bgm_profile");
	}

	/**
	 * 设置 BGM Profile
	 */
	async setBgmProfile(
		username?: string | null,
		avatar?: string | null,
	): Promise<void> {
		return this.invoke<void>("set_bgm_profile", { username, avatar });
	}

	/**
	 * 获取存档根路径
	 */
	async getSaveRootPath(): Promise<string> {
		return this.invoke<string>("get_save_root_path");
	}

	/**
	 * 设置存档根路径
	 */
	async setSaveRootPath(path: string): Promise<void> {
		return this.invoke<void>("set_save_root_path", { path });
	}

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
	 * 获取数据库备份保存路径
	 */
	async getDbBackupPath(): Promise<string> {
		return this.invoke<string>("get_db_backup_path");
	}

	/**
	 * 设置数据库备份保存路径
	 */
	async setDbBackupPath(path: string): Promise<void> {
		return this.invoke<void>("set_db_backup_path", { path });
	}

	/**
	 * 获取便携模式状态
	 */
	async getPortableMode(): Promise<boolean> {
		return this.invoke<boolean>("get_portable_mode");
	}

	/**
	 * 设置便携模式
	 *
	 * 切换便携模式会自动迁移配置文件并返回迁移结果
	 */
	async setPortableMode(enabled: boolean): Promise<PortableModeResult> {
		return this.invoke<PortableModeResult>("set_portable_mode", { enabled });
	}

	/**
	 * 获取LE转区软件路径
	 */
	async getLePath(): Promise<string> {
		return this.invoke<string>("get_le_path");
	}

	/**
	 * 设置LE转区软件路径
	 */
	async setLePath(path: string): Promise<void> {
		return this.invoke<void>("set_le_path", { path });
	}

	/**
	 * 获取Magpie转区软件路径
	 */
	async getMagpiePath(): Promise<string> {
		return this.invoke<string>("get_magpie_path");
	}

	/**
	 * 设置Magpie转区软件路径
	 */
	async setMagpiePath(path: string): Promise<void> {
		return this.invoke<void>("set_magpie_path", { path });
	}

	// 暂时无用开始
	/**
	 * 获取所有设置
	 */
	async getAllSettings(): Promise<UserSettings> {
		return this.invoke<UserSettings>("get_all_settings");
	}

	/**
	 * 批量更新设置
	 */
	async updateSettings(
		bgmToken?: string | null,
		saveRootPath?: string | null,
		dbBackupPath?: string | null,
	): Promise<void> {
		return this.invoke<void>("update_settings", {
			bgmToken,
			saveRootPath,
			dbBackupPath,
		});
	}
}
// 暂时无用结束

// 导出单例
export const settingsService = new SettingsService();
