/**
 * @file HTTP 请求工具
 * @description 基于 Axios 和 Tauri HTTP 的请求工具，支持浏览器和 Tauri 环境的 HTTP 请求。
 * @module src/api/http
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - createHttp：创建带拦截器的 Axios 实例
 * - tauriHttp：Tauri HTTP 客户端实例
 * - 默认导出 http：全局 HTTP 实例
 *
 * 依赖：
 * - axios
 * - @tauri-apps/plugin-http
 */

import axios, { type AxiosError } from 'axios';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

/**
 * 创建一个带有响应拦截器的 Axios 实例。
 *
 * 该函数会创建一个 Axios 实例，并添加响应拦截器以处理常见的 HTTP 错误。
 * 对 401（未认证）和 400（请求错误）等状态码进行友好提示，其他错误返回通用错误信息。
 *
 * @returns {import('axios').AxiosInstance} 配置好的 Axios 实例，用于发送 HTTP 请求。
 */
export const createHttp = ()=> {
    const http = axios.create({});

    // 添加响应拦截器，处理常见的 HTTP 错误
    http.interceptors.response.use(
        (response) => response,
        /**
         * 响应错误处理拦截器
         * @param {AxiosError} error - Axios 错误对象
         * @returns {string|void} 错误提示字符串或控制台输出
         */
       (error: AxiosError) => {
            if (error.response?.status === 401) {
                // 抛出自定义错误对象
                return Promise.reject(new Error("认证失败，请检查你的BGM_TOKEN是否正确"));
            }
            if (error.response?.status === 400) {
                // 抛出自定义错误对象
                return Promise.reject(new Error("未找到相关条目,请确认ID或游戏名字后重试"));
            }
            // 其他错误
            return Promise.reject(new Error("请求错误，请检查你的网络连接"));
        }
    );

    return http;
};

/**
 * Tauri HTTP 客户端
 * 使用 Tauri 的原生 HTTP 请求，可以绕过浏览器限制，支持自定义 User-Agent
 */
export const tauriHttp = {
    /**
     * 发送 GET 请求
     * @param url 请求 URL
     * @param options 请求选项，包含 headers 等
     * @returns Promise<any> 响应数据
     */
    async get(url: string, options?: { headers?: Record<string, string> }) {
        try {
            const response = await tauriFetch(url, {
                method: 'GET',
                headers: options?.headers || {},
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return {
                data: await response.json(),
                status: response.status,
                statusText: response.statusText,
            };
        } catch (error) {
            return handleTauriHttpError(error);
        }
    },

    /**
     * 发送 POST 请求
     * @param url 请求 URL
     * @param data 请求体数据
     * @param options 请求选项，包含 headers 等
     * @returns Promise<any> 响应数据
     */
    async post(url: string, data?: Record<string, unknown>, options?: { headers?: Record<string, string> }) {
        try {
            const response = await tauriFetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...options?.headers,
                },
                body: data ? JSON.stringify(data) : undefined,
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            return {
                data: await response.json(),
                status: response.status,
                statusText: response.statusText,
            };
        } catch (error) {
            return handleTauriHttpError(error);
        }
    },
};

/**
 * 处理 Tauri HTTP 请求错误
 * @param error 错误对象
 */
function handleTauriHttpError(error: unknown): never {
    const errorMessage = error instanceof Error ? error.message : '请求错误';
    
    if (errorMessage.includes('401')) {
        throw new Error("认证失败，请检查你的BGM_TOKEN是否正确");
    }
    if (errorMessage.includes('400')) {
        throw new Error("未找到相关条目,请确认ID或游戏名字后重试");
    }
    console.error('Tauri HTTP 请求失败:', error);
    throw new Error("请求错误，请检查你的网络连接");
}

/**
 * 默认导出带拦截器的 Axios 实例。
 */
export default createHttp();