/**
 * @file HTTP 请求工具
 * @description 基于 Axios 和 Tauri HTTP 的请求工具，支持浏览器和 Tauri 环境的 HTTP 请求。
 * @module src/metadata/api/http
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
import {
	ApiRateLimitError,
	AppError,
	HttpResponseError,
	toError,
} from "@/utils/errors";
import {
	type ApiRateLimitedRequestOptions,
	createApiRateLimitRequest,
	handleApiRateLimited,
	markApiRequestSucceeded,
	readApiResponseCode,
	scheduleApiRequest,
} from "./rateLimit";

const LOCAL_PROXY_BYPASS =
	"localhost,127.0.0.0/8,::1,0.0.0.0,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,169.254.0.0/16,fc00::/7,fe80::/10,.local";

export interface TauriHttpOptions {
	headers?: Record<string, string>;
	params?: Record<string, unknown>;
	allowRetry?: boolean;
	rateLimit?: ApiRateLimitedRequestOptions;
	signal?: AbortSignal;
	responseType?: "json" | "text";
	proxyUrl?: string;
}

export type NetworkRequestContext = Pick<
	TauriHttpOptions,
	"proxyUrl" | "signal"
>;

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
	method: "GET" | "POST" | "PATCH" | "PUT",
	url: string,
	options?: TauriHttpOptions,
	data?: unknown,
): Promise<TauriHttpResponse<T>> {
	const fullUrl = buildUrlWithParams(url, options?.params);
	const rateLimitRequest = options?.rateLimit
		? createApiRateLimitRequest(options.rateLimit)
		: undefined;

	const fetchResponse = () => {
		const proxyUrl = options?.proxyUrl?.trim();
		const proxyOption = proxyUrl
			? {
					all: {
						url: proxyUrl,
						noProxy: LOCAL_PROXY_BYPASS,
					},
				}
			: undefined;

		if (import.meta.env.DEV) {
			console.log(`[TauriHTTP] ${method} ${fullUrl}`, {
				headers: options?.headers
					? Object.fromEntries(
							Object.entries(options.headers).map(([key, value]) => [
								key,
								/authorization|cookie|api[-_]?key/i.test(key)
									? "[REDACTED]"
									: value,
							]),
						)
					: undefined,
				body: data,
				proxy: proxyOption,
			});
		}

		const headers = new Headers(options?.headers);
		if (method !== "GET" && !headers.has("Content-Type")) {
			headers.set("Content-Type", "application/json");
		}
		// 配合 unsafe-headers，用空值移除插件自动添加的 WebView Origin，避免原生请求被跨域校验拒绝。
		if (!headers.has("Origin")) {
			headers.set("Origin", "");
		}

		return tauriFetch(fullUrl, {
			method,
			headers,
			body:
				method === "GET" || data === undefined
					? undefined
					: JSON.stringify(data),
			signal: options?.signal,
			proxy: proxyOption,
		});
	};

	let attempt = 0;
	const executeAttempt = async (): Promise<TauriHttpResponse<T>> => {
		const response = await fetchResponse();
		let parsedData: T | undefined;
		let errorBody: unknown;
		if (response.ok) {
			parsedData =
				options?.responseType === "text"
					? ((await response.text()) as T)
					: await parseTauriResponse<T>(response, method, fullUrl);
		} else {
			errorBody = await response.json().catch(() => undefined);
		}
		if (rateLimitRequest) {
			const policy = rateLimitRequest.options;
			const body = response.ok ? parsedData : errorBody;
			const reason =
				policy.classifyResponse?.(response.status, body) ??
				(response.status === 429 ? "rate_limited" : undefined);
			if (reason) {
				const handling = handleApiRateLimited(
					rateLimitRequest,
					response.headers,
					attempt,
					reason,
				);
				if (import.meta.env.DEV) {
					console.warn("[TauriHTTP Rate Limited]", {
						source: policy.source,
						responseStatus: response.status,
						responseCode: readApiResponseCode(body),
						retryAfter: response.headers.get("Retry-After"),
						rateLimit: response.headers.get("RateLimit"),
						rateLimitReset: response.headers.get("X-RateLimit-Reset"),
						rateLimitPolicy: response.headers.get("RateLimit-Policy"),
						reason,
						status: handling.status,
						attempt,
						retryAt: handling.retryAt,
						retryAtSource: handling.retryAtSource,
						backoffUntil: handling.backoffUntil,
					});
				}
				throw new ApiRateLimitError({ source: policy.source, ...handling });
			}
		}
		if (!response.ok) {
			throw new HttpResponseError({
				method,
				url: fullUrl,
				status: response.status,
				statusText: response.statusText,
				body: errorBody,
			});
		}
		if (rateLimitRequest) markApiRequestSucceeded(rateLimitRequest);
		if (import.meta.env.DEV) console.log("[TauriHTTP Response]", parsedData);
		return {
			data: parsedData as T,
			status: response.status,
			statusText: response.statusText,
			headers: Array.from(response.headers.entries()),
		};
	};

	while (true) {
		try {
			return rateLimitRequest
				? await scheduleApiRequest(
						rateLimitRequest,
						executeAttempt,
						options?.signal,
					)
				: await executeAttempt();
		} catch (error) {
			if (error instanceof ApiRateLimitError && error.status === "retrying") {
				attempt += 1;
				continue;
			}
			if (import.meta.env.DEV)
				console.error("[TauriHTTP Failed]", method, error);
			throw error;
		}
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
	 * @returns Promise<TauriHttpResponse<T>> 响应数据
	 */
	async get<T = unknown>(url: string, options?: TauriHttpOptions) {
		return requestTauriHttp<T>("GET", url, options);
	},

	async getText(url: string, options?: TauriHttpOptions) {
		return requestTauriHttp<string>("GET", url, {
			...options,
			responseType: "text",
		});
	},

	/**
	 * 发送 POST 请求
	 * @param url 请求 URL
	 * @param data 请求体数据
	 * @param options 请求选项，包含 headers 等
	 * @returns Promise<TauriHttpResponse<T>> 响应数据
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
	 * @returns Promise<TauriHttpResponse<T>> 响应数据
	 */
	async patch<T = unknown>(
		url: string,
		data?: unknown,
		options?: TauriHttpOptions,
	) {
		return requestTauriHttp<T>("PATCH", url, options, data);
	},

	async put<T = unknown>(
		url: string,
		data?: unknown,
		options?: TauriHttpOptions,
	) {
		return requestTauriHttp<T>("PUT", url, options, data);
	},
};

/**
 * 默认导出基于 Tauri 插件的 HTTP 客户端实例
 */
export default tauriHttp;
