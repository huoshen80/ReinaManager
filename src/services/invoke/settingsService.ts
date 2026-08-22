/**
 * @file 用户设置服务
 * @description 封装所有用户设置相关的后端调用
 */

import type {
	BgmAuth,
	HikarinagiAuth,
	LogLevel,
	UpdateSettingsParams,
} from "@/types";
import { BaseService } from "./base";

export interface UserSettings {
	bgm_auth?: BgmAuth | null;
	hikarinagi_auth?: HikarinagiAuth | null;
	vndb_token?: string | null;
	save_root_path?: string | null;
	db_backup_path?: string | null;
	install_root_path?: string | null;
	le_path?: string | null;
	magpie_path?: string | null;
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

	/**
	 * 获取 Windows 系统代理启用状态
	 */
	async getSystemProxyStatus(): Promise<boolean> {
		return this.invoke<boolean>("get_system_proxy_status");
	}

	async bgmOAuthStartLogin(): Promise<string> {
		return this.invoke<string>("bgm_oauth_start_login");
	}

	async bgmOAuthCancelLogin(): Promise<void> {
		return this.invoke<void>("bgm_oauth_cancel_login");
	}

	async bgmOAuthExchangeCode(code: string): Promise<BgmAuth> {
		return this.invoke<BgmAuth>("bgm_oauth_exchange_code", { code });
	}

	async bgmOAuthRefreshToken(refreshToken: string): Promise<BgmAuth> {
		return this.invoke<BgmAuth>("bgm_oauth_refresh_token", { refreshToken });
	}

	async hikarinagiOAuthStartLogin(): Promise<string> {
		return this.invoke<string>("hikarinagi_oauth_start_login");
	}

	async hikarinagiOAuthCancelLogin(): Promise<void> {
		return this.invoke<void>("hikarinagi_oauth_cancel_login");
	}

	async hikarinagiOAuthExchangeCode(
		code: string,
		codeVerifier: string,
	): Promise<HikarinagiAuth> {
		return this.invoke<HikarinagiAuth>("hikarinagi_oauth_exchange_code", {
			code,
			codeVerifier,
		});
	}

	async hikarinagiOAuthRefreshToken(
		refreshToken: string,
	): Promise<HikarinagiAuth> {
		return this.invoke<HikarinagiAuth>("hikarinagi_oauth_refresh_token", {
			refreshToken,
		});
	}
}

// 导出单例
export const settingsService = new SettingsService();
