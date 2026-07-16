/**
 * @file 用户设置服务
 * @description 封装所有用户设置相关的后端调用
 */

import type { BgmAuth, LogLevel, UpdateSettingsParams } from "@/types";
import { BaseService } from "./base";

export interface UserSettings {
	bgm_auth?: BgmAuth | null;
	vndb_token?: string | null;
	save_root_path?: string | null;
	db_backup_path?: string | null;
	le_path?: string | null;
	magpie_path?: string | null;
	webdav_url?: string | null;
	webdav_username?: string | null;
	webdav_password?: string | null;
	webdav_root?: string | null;
	webdav_enabled?: boolean | null;
}

export interface ProxyConfig {
	url: string;
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

	async updateProxyConfig(config: ProxyConfig): Promise<void> {
		return this.invoke<void>("update_proxy_config", { config });
	}

	async bgmOAuthStartLogin(): Promise<string> {
		return this.invoke<string>("bgm_oauth_start_login");
	}

	async bgmOAuthExchangeCode(code: string): Promise<BgmAuth> {
		return this.invoke<BgmAuth>("bgm_oauth_exchange_code", { code });
	}

	async bgmOAuthRefreshToken(refreshToken: string): Promise<BgmAuth> {
		return this.invoke<BgmAuth>("bgm_oauth_refresh_token", { refreshToken });
	}
}

// 导出单例
export const settingsService = new SettingsService();
