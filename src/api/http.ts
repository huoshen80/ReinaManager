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
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import axios, { type AxiosError } from "axios";
import { AppError, HttpResponseError, toError } from "@/utils/errors";

interface TauriHttpOptions {
	headers?: Record<string, string>;
	params?: Record<string, unknown>;
	allowRetry?: boolean;
}

interface TauriHttpResponse<T = unknown> {
	data: T;
	status: number;
	statusText: string;
}

/**
 * 创建一个带有响应拦截器的 Axios 实例。
 *
 * 该函数会创建一个 Axios 实例，并添加响应拦截器以处理常见的 HTTP 错误。
 * 对 401（未认证）和 400（请求错误）等状态码进行友好提示，其他错误返回通用错误信息。
 *
 * @returns {import('axios').AxiosInstance} 配置好的 Axios 实例，用于发送 HTTP 请求。
 */
export const createHttp = () => {
	const http = axios.create({});

	http.interceptors.response.use(
		(response) => response,
		(error: AxiosError) =>
			Promise.reject(toError(error, "HTTP request failed")),
	);

	return http;
};

function buildUrlWithParams(
	url: string,
	params?: Record<string, unknown>,
): string {
	if (!params) {
		return url;
	}

	const searchParams = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		if (value !== undefined && value !== null) {
			searchParams.append(key, String(value));
		}
	}

	const queryString = searchParams.toString();
	if (!queryString) {
		return url;
	}

	return `${url}${url.includes("?") ? "&" : "?"}${queryString}`;
}

async function parseTauriResponse<T>(
	response: Response,
	method: string,
	url: string,
): Promise<T> {
	const text = await response.text();
	if (!text) {
		return null as T;
	}

	try {
		return JSON.parse(text) as T;
	} catch (error) {
		throw new AppError({
			code: "http_response_parse_failed",
			message: `Failed to parse HTTP response: ${method} ${url}`,
			cause: toError(error, "Failed to parse HTTP response"),
		});
	}
}

async function requestTauriHttp<T>(
	method: "GET" | "POST" | "PATCH",
	url: string,
	options?: TauriHttpOptions,
	data?: unknown,
): Promise<TauriHttpResponse<T>> {
	const fullUrl =
		method === "GET" ? buildUrlWithParams(url, options?.params) : url;

	const response = await tauriFetch(fullUrl, {
		method,
		headers: {
			...(method === "GET" ? {} : { "Content-Type": "application/json" }),
			...options?.headers,
		},
		body:
			method === "GET" || data === undefined ? undefined : JSON.stringify(data),
	});

	if (!response.ok) {
		throw new HttpResponseError({
			method,
			url: fullUrl,
			status: response.status,
			statusText: response.statusText,
		});
	}

	return {
		data: await parseTauriResponse<T>(response, method, fullUrl),
		status: response.status,
		statusText: response.statusText,
	};
}

/**
 * Tauri HTTP 客户端
 * 使用 Tauri 的原生 HTTP 请求，可以绕过浏览器限制，支持自定义 User-Agent
 */
export const tauriHttp = {
	/**
	 * 发送 GET 请求
	 * @param url 请求 URL
	 * @param options 请求选项，包含 headers 和 params 等
	 * @returns Promise<any> 响应数据
	 */
	async get<T = unknown>(url: string, options?: TauriHttpOptions) {
		return requestTauriHttp<T>("GET", url, options);
	},

	/**
	 * 发送 POST 请求
	 * @param url 请求 URL
	 * @param data 请求体数据
	 * @param options 请求选项，包含 headers 等
	 * @returns Promise<any> 响应数据
	 */
	async post<T = unknown>(
		url: string,
		data?: unknown,
		options?: TauriHttpOptions,
	) {
		return requestTauriHttp<T>("POST", url, options, data);
	},

	/**
	 * 发送 PATCH 请求
	 * @param url 请求 URL
	 * @param data 请求体数据
	 * @param options 请求选项，包含 headers 等
	 * @returns Promise<any> 响应数据
	 */
	async patch<T = unknown>(
		url: string,
		data?: unknown,
		options?: TauriHttpOptions,
	) {
		return requestTauriHttp<T>("PATCH", url, options, data);
	},
};

/**
 * 默认导出带拦截器的 Axios 实例。
 */
export default createHttp();
