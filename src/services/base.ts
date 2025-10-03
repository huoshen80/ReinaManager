/**
 * @file Service 基础类
 * @description 提供统一的错误处理和日志功能
 */

import { invoke } from '@tauri-apps/api/core';

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
  protected async invoke<T>(command: string, args?: Record<string, any>): Promise<T> {
    try {
      const result = await invoke<T>(command, args);
      return result;
    } catch (error) {
      console.error(`[Service Error] ${command}:`, error);
      throw error;
    }
  }

  /**
   * 带错误处理的调用
   * @param command 命令名称
   * @param args 参数
   * @param errorMessage 自定义错误消息
   * @returns Promise 结果
   */
  protected async invokeWithErrorHandling<T>(
    command: string,
    args?: Record<string, any>,
    errorMessage?: string
  ): Promise<T> {
    try {
      return await this.invoke<T>(command, args);
    } catch (error) {
      const message = errorMessage || `调用 ${command} 失败`;
      console.error(message, error);
      throw new Error(`${message}: ${error}`);
    }
  }
}
