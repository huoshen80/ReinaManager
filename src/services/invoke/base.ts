/**
 * @file Service 基础类
 * @description 提供统一的错误处理和日志功能
 */

import { invoke } from "@tauri-apps/api/core";

/**
 * 基础 Service 类
 */
export class BaseService {
	/**
	 * 调用 Tauri command
	 * @param command 命令名称
	 * @param args 参数
	 * @returns Promise 结果
	 */
	protected async invoke<T>(
		command: string,
		args?: Record<string, unknown>,
	): Promise<T> {
		try {
			return await invoke<T>(command, args);
		} catch (error) {
			console.error(`[Service Error] ${command}:`, error);
			throw error;
		}
	}
}
