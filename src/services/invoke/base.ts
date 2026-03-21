/**
 * @file Service 基础类
 * @description 提供统一的错误归一化能力
 */

import { invoke } from "@tauri-apps/api/core";
import { AppError, toError } from "@/utils/errors";

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
			const normalizedError = toError(
				error,
				`Tauri command failed: ${command}`,
			);
			throw new AppError({
				code: "tauri_invoke_failed",
				message: normalizedError.message || `Tauri command failed: ${command}`,
				cause: normalizedError,
			});
		}
	}
}
