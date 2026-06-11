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

import { version } from "@pkg";
import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
	ApiRateLimitError,
	AppError,
	HttpResponseError,
	toError,
} from "@/utils/errors";
import { useStore } from "@/store/appStore";
import {
	type ApiRateLimitedRequestOptions,
	type ApiRateLimitSource,
	handleApiRateLimited,
	markApiRequestSucceeded,
	scheduleApiRequest,
} from "./rateLimit";

export const USER_AGENT = `huoshen80/ReinaManager/${version} (https://github.com/huoshen80/ReinaManager)`;

export interface TauriHttpOptions {
	headers?: Record<string, string>;
	params?: Record<string, unknown>;
	allowRetry?: boolean;
	rateLimit?: ApiRateLimitedRequestOptions;
	signal?: AbortSignal;
}

interface TauriHttpResponse<T = unknown> {
	data: T;
	status: number;
	statusText: string;
	headers: [string, string][];
}

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
	const fullUrl = buildUrlWithParams(url, options?.params);
	const rateLimitSource =
		options?.rateLimit?.source ?? inferRateLimitSource(url);

	const fetchResponse = () => {
		const { proxyConfig } = useStore.getState();
		let proxyOption: undefined | { all: string } = undefined;
		
		if (proxyConfig?.enabled && proxyConfig.url) {
			try {
				const host = new URL(fullUrl).hostname;
				const matched = proxyConfig.hosts.some(
					(h) => host === h || host.endsWith(`.${h}`)
				);
				if (matched) {
					proxyOption = { all: proxyConfig.url };
				}
			} catch (e) {
				// ignore url parse error
			}
		}

		if (import.meta.env.DEV) {
			console.log(`[TauriHTTP] ${method} ${fullUrl}`, {
				headers: options?.headers,
				body: data,
				proxy: proxyOption,
			});
		}

		return tauriFetch(fullUrl, {
			method,
			headers: {
				...(method === "GET" ? {} : { "Content-Type": "application/json" }),
				...options?.headers,
			},
			body:
				method === "GET" || data === undefined
					? undefined
					: JSON.stringify(data),
			signal: options?.signal,
			proxy: proxyOption,
		});
	};

	let response: Response;
	let attempt = 0;
	try {
		while (true) {
			response = rateLimitSource
				? await scheduleApiRequest(
						rateLimitSource,
						fetchResponse,
						options?.signal,
					)
				: await fetchResponse();

			if (response.status !== 429 || !rateLimitSource) {
				break;
			}

			const handling = handleApiRateLimited(
				rateLimitSource,
				response.headers,
				attempt,
			);
			if (!handling.shouldRetry) {
				throw new ApiRateLimitError({
					source: rateLimitSource,
					message: getApiRateLimitErrorMessage(rateLimitSource),
					retryAfterMs: handling.retryAfterMs,
					backoffUntil: handling.backoffUntil,
					fatal: handling.fatal,
				});
			}
			attempt += 1;
		}
	} catch (error) {
		if (import.meta.env.DEV) {
			console.error(`[TauriHTTP Failed] ${method} ${fullUrl}`, error);
		}
		throw error;
	}

	if (!response.ok) {
		if (import.meta.env.DEV) {
			console.error(
				`[TauriHTTP Error] ${method} ${fullUrl} ${response.status}`,
				response.statusText,
			);
		}
		throw new HttpResponseError({
			method,
			url: fullUrl,
			status: response.status,
			statusText: response.statusText,
		});
	}
	if (rateLimitSource) {
		markApiRequestSucceeded(rateLimitSource);
	}

	const parsedData = await parseTauriResponse<T>(response, method, fullUrl);

	if (import.meta.env.DEV) {
		console.log(`[TauriHTTP Response] ${method} ${fullUrl}`, parsedData);
	}

	return {
		data: parsedData,
		status: response.status,
		statusText: response.statusText,
		headers: Array.from(response.headers.entries()),
	};
}

function inferRateLimitSource(url: string): ApiRateLimitSource | undefined {
	try {
		const host = new URL(url).host;
		if (host === "api.bgm.tv") return "bgm";
		if (host === "api.vndb.org") return "vndb";
		if (host === "www.ymgal.games") return "ymgal";
		if (host === "www.kungal.com") return "kun";
	} catch {
		return undefined;
	}
}

function getApiRateLimitErrorMessage(source: ApiRateLimitSource): string {
	switch (source) {
		case "bgm":
			return "Bangumi 请求被限速，当前任务已停止，请 1 小时后手动重试";
		case "vndb":
			return "VNDB 请求过于频繁，短暂停顿后仍失败，请稍后重试";
		case "ymgal":
			return "YMGal 请求被限速，请稍后重试";
		case "kun":
			return "Kungal 请求被限速，请稍后重试";
	}
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
 * 默认导出基于 Tauri 插件的 HTTP 客户端实例
 */
export default tauriHttp;
