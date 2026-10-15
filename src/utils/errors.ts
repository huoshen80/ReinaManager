/**
 * @file 错误处理工具
 * @description 提供跨层通用的错误归一化、结构化错误类型与轻量判断函数
 */

import type { TFunction } from "i18next";

export type AppErrorCode =
	| "tauri_invoke_failed"
	| "unsupported_source"
	| "deprecated_source"
	| "invalid_game_id"
	| "metadata_not_found"
	| "mixed_sources_failed"
	| "http_response_error"
	| "http_response_parse_failed"
	| "api_rate_limited"
	| "metadata_request_failed";

export type ApiRateLimitSource =
	| "bgm"
	| "vndb"
	| "ymgal"
	| "dlsite"
	| "erogamescape"
	| "hikarinagi"
	| "nextmoe";

export interface ApiRateLimitInfo {
	reason: "rate_limited" | "quota_exhausted";
	status: "retrying" | "retry_exhausted" | "stopped";
	// 保留时间依据，客户端估算不能被描述为服务端保证的恢复时间。
	retryAt?: number;
	retryAtSource?: "retry_after" | "rate_limit_reset" | "estimate";
}

const API_RATE_LIMIT_SOURCE_NAMES = {
	bgm: "Bangumi",
	vndb: "VNDB",
	ymgal: "YMGal",
	dlsite: "DLsite",
	erogamescape: "ErogameScape",
	hikarinagi: "Hikarinagi",
	nextmoe: "Kungal (NextMoe)",
} satisfies Record<ApiRateLimitSource, string>;

interface AppErrorOptions {
	code: AppErrorCode | string;
	message: string;
	cause?: unknown;
	name?: string;
	detail?: string;
	context?: Record<string, unknown>;
}

export class AppError extends Error {
	code: AppErrorCode | string;
	cause?: unknown;
	detail?: string;
	context?: Record<string, unknown>;

	constructor({
		code,
		message,
		cause,
		name = "AppError",
		detail,
		context,
	}: AppErrorOptions) {
		super(message);
		this.name = name;
		this.code = code;
		this.cause = cause;
		this.detail = detail;
		this.context = context;
	}
}

interface TauriErrorContext extends Record<string, unknown> {
	command: string;
	args?: Record<string, unknown>;
}

function getStringField(source: Record<string, unknown>, key: string): string {
	const value = source[key];
	return typeof value === "string" ? value : "";
}

export function normalizeTauriError(
	error: unknown,
	context: TauriErrorContext,
): AppError {
	if (error && typeof error === "object" && !(error instanceof Error)) {
		const errorRecord = error as Record<string, unknown>;
		const message =
			getStringField(errorRecord, "message") ||
			getStringField(errorRecord, "error") ||
			`Tauri command failed: ${context.command}`;
		const code = getStringField(errorRecord, "code") || "tauri_invoke_failed";
		const detail = getStringField(errorRecord, "detail");

		return new AppError({
			code,
			message,
			detail: detail || undefined,
			cause: error,
			context,
		});
	}

	const normalizedError = toError(
		error,
		`Tauri command failed: ${context.command}`,
	);
	const nextmoeCode = context.command.startsWith("nextmoe_oauth_")
		? normalizedError.message.split(":", 1)[0]
		: "";
	return new AppError({
		code: [
			"nextmoe_auth_expired",
			"nextmoe_scope_required",
			"nextmoe_credential_store_error",
		].includes(nextmoeCode)
			? nextmoeCode
			: "tauri_invoke_failed",
		message:
			normalizedError.message || `Tauri command failed: ${context.command}`,
		cause: normalizedError,
		context,
	});
}

interface HttpResponseErrorOptions {
	method: string;
	url: string;
	status: number;
	statusText: string;
	body?: unknown;
	cause?: unknown;
}

export class HttpResponseError extends AppError {
	method: string;
	url: string;
	status: number;
	statusText: string;
	body?: unknown;

	constructor({
		method,
		url,
		status,
		statusText,
		body,
		cause,
	}: HttpResponseErrorOptions) {
		super({
			code: "http_response_error",
			message: `HTTP ${status} ${statusText}: ${method} ${url}`,
			cause,
			name: "HttpResponseError",
		});
		this.method = method;
		this.url = url;
		this.status = status;
		this.statusText = statusText;
		this.body = body;
	}
}

interface ApiRateLimitErrorOptions extends ApiRateLimitInfo {
	source: ApiRateLimitSource;
	message?: string;
	retryAfterMs?: number;
	backoffUntil?: number;
	fatal?: boolean;
	cause?: unknown;
}

export class ApiRateLimitError extends AppError implements ApiRateLimitInfo {
	source: ApiRateLimitSource;
	reason: ApiRateLimitInfo["reason"];
	status: ApiRateLimitInfo["status"];
	retryAt?: number;
	retryAtSource?: ApiRateLimitInfo["retryAtSource"];
	retryAfterMs?: number;
	backoffUntil?: number;
	fatal: boolean;

	constructor({
		source,
		reason,
		status,
		retryAt,
		retryAtSource,
		message = `API request limited: ${source} (${reason}, ${status})`,
		retryAfterMs,
		backoffUntil,
		fatal = false,
		cause,
	}: ApiRateLimitErrorOptions) {
		super({
			code: "api_rate_limited",
			message,
			cause,
			name: "ApiRateLimitError",
		});
		this.source = source;
		this.reason = reason;
		this.status = status;
		this.retryAt = retryAt;
		this.retryAtSource = retryAtSource;
		this.retryAfterMs = retryAfterMs;
		this.backoffUntil = backoffUntil;
		this.fatal = fatal;
	}
}

export function isApiRateLimitError(
	error: unknown,
	depth = 0,
): error is ApiRateLimitError {
	return getApiRateLimitError(error, depth) !== null;
}

function getApiRateLimitError(
	error: unknown,
	depth = 0,
): ApiRateLimitError | null {
	if (depth > 8) {
		return null;
	}

	if (error instanceof ApiRateLimitError) {
		return error;
	}

	if (error instanceof AppError && error.cause) {
		return getApiRateLimitError(error.cause, depth + 1);
	}

	return null;
}

export function toError(error: unknown, fallback = "Unknown error"): Error {
	if (error instanceof Error) {
		return error;
	}

	if (typeof error === "string" && error.trim()) {
		return new Error(error);
	}

	if (error && typeof error === "object") {
		try {
			return new Error(JSON.stringify(error));
		} catch {
			return new Error(fallback);
		}
	}

	return new Error(fallback);
}

export function isHttpStatus(
	error: unknown,
	status: number,
	depth = 0,
): boolean {
	if (depth > 8) {
		return false;
	}

	if (error instanceof HttpResponseError) {
		return error.status === status;
	}

	if (error instanceof AppError && error.cause) {
		return isHttpStatus(error.cause, status, depth + 1);
	}

	if (
		error &&
		typeof error === "object" &&
		"response" in error &&
		error.response &&
		typeof error.response === "object" &&
		"status" in error.response
	) {
		return error.response.status === status;
	}

	return false;
}

export function isHttpStatusFromHost(
	error: unknown,
	status: number,
	hostname: string,
	depth = 0,
): boolean {
	if (depth > 8) return false;

	if (error instanceof AppError && !(error instanceof HttpResponseError)) {
		return error.cause
			? isHttpStatusFromHost(error.cause, status, hostname, depth + 1)
			: false;
	}

	const response =
		error instanceof HttpResponseError
			? error
			: error && typeof error === "object" && "response" in error
				? error.response
				: undefined;
	if (
		!response ||
		typeof response !== "object" ||
		!("status" in response) ||
		response.status !== status ||
		!("url" in response) ||
		typeof response.url !== "string"
	) {
		return false;
	}
	try {
		// 无法确认请求归属时不注销账号，避免混合请求中其他站点的 401 误伤登录状态。
		return new URL(response.url).hostname === hostname;
	} catch {
		return false;
	}
}

function getAppErrorDetailMessage(error: AppError): string {
	const messages = [
		error.message,
		error.detail ?? "",
		error.cause ? toError(error.cause, "").message : "",
	].filter(
		(message, index, allMessages) =>
			message &&
			!message.startsWith("Tauri command failed:") &&
			allMessages.indexOf(message) === index,
	);

	if (messages.length > 0) {
		return messages.join(": ");
	}

	return "";
}

export function getApiRateLimitMessage(
	info: ApiRateLimitInfo & { source: ApiRateLimitSource },
	t: TFunction,
): string {
	const options = { source: API_RATE_LIMIT_SOURCE_NAMES[info.source] };
	let message: string;
	if (info.reason === "quota_exhausted") {
		message = t(
			"errors.requestQuotaExhausted",
			"{{source}} 请求配额已耗尽",
			options,
		);
	} else if (info.status === "retrying") {
		message = t(
			"errors.rateLimitRetrying",
			"{{source}} 请求受限，正在等待后重试",
			options,
		);
	} else if (info.status === "retry_exhausted") {
		message = t(
			"errors.rateLimitRetryExhausted",
			"{{source}} 请求受限，自动重试后仍未成功，请稍后重试",
			options,
		);
	} else {
		message = t(
			"errors.sourceRateLimited",
			"{{source}} 请求受限，请稍后重试",
			options,
		);
	}

	const remainingMs =
		info.retryAt !== undefined ? info.retryAt - Date.now() : 0;
	if (remainingMs > 0) {
		if (info.retryAtSource === "estimate") {
			return t(
				"errors.rateLimitEstimatedRetryAfter",
				"{{message}}；客户端预计冷却 {{seconds}} 秒后可再次尝试",
				{ message, seconds: Math.ceil(remainingMs / 1000) },
			);
		}
		return t(
			"errors.rateLimitRetryAfter",
			"{{message}}；服务端建议等待 {{seconds}} 秒后重试",
			{ message, seconds: Math.ceil(remainingMs / 1000) },
		);
	}
	return message;
}

export function getUserErrorMessage(
	error: unknown,
	t: TFunction,
	fallback?: string,
): string {
	const rateLimitError = getApiRateLimitError(error);
	if (rateLimitError) {
		return getApiRateLimitMessage(rateLimitError, t);
	}

	if (error instanceof HttpResponseError) {
		if (error.status === 429) {
			return t("errors.requestRateLimited", "请求受限，请稍后重试");
		}
		if (error.status === 401) {
			return t("errors.authFailed", "认证失败，请检查凭证或权限");
		}
		if (error.status === 404) {
			return t("errors.notFound", "未找到相关内容");
		}
		if (error.status === 400) {
			return t("errors.badRequest", "请求参数有误，请检查后重试");
		}
		return t("errors.requestFailed", "请求失败，请稍后重试");
	}

	if (error instanceof AppError) {
		switch (error.code) {
			case "nextmoe_auth_missing":
				return t(
					"errors.nextmoeAuthMissing",
					"请先在账号设置中登录 Kungal (NextMoe)。",
				);
			case "nextmoe_rating_required":
				return t(
					"errors.nextmoeRatingRequired",
					"Kungal 暂不支持单独清空评分，请填写 1–10 分或取消勾选 Kungal。",
				);
			case "nextmoe_playtime_invalid":
				return t(
					"errors.nextmoePlaytimeInvalid",
					"Kungal 游玩时长须为 0–60000 分钟（最多 1000 小时）。",
				);
			case "nextmoe_review_too_long":
				return t(
					"errors.nextmoeReviewTooLong",
					"Kungal 短评不能超过 2000 字，请缩短后重试。",
				);
			case "nextmoe_auth_expired":
				return t(
					"errors.nextmoeAuthExpired",
					"Kungal (NextMoe) 登录已失效，请重新登录。",
				);
			case "nextmoe_scope_required":
				return t(
					"errors.nextmoeScopeRequired",
					"Kungal 授权缺少目录读取权限，请重新登录。",
				);
			case "nextmoe_credential_store_error":
				return t(
					"errors.nextmoeCredentialStore",
					"保存或读取 Kungal 授权信息失败，请重试。",
				);
			case "metadata_not_found":
				return t("errors.metadataNotFound", "未找到对应的元数据");
			case "invalid_game_id":
				return t("errors.invalidGameId", "游戏 ID 格式无效");
			case "unsupported_source":
				return t("errors.unsupportedSource", "不支持的数据源");
			case "deprecated_source":
				return t(
					"errors.deprecatedSource",
					"该数据源已废弃，已有数据仍可查看，但不能再搜索或更新。请选择其他可用数据源。",
				);
			case "mixed_sources_failed":
				return t("errors.mixedSourcesFailed", "所有数据源请求均失败");
			case "metadata_request_failed":
				return t("errors.metadataRequestFailed", "获取元数据失败，请稍后重试");
			case "api_rate_limited":
				return t("errors.requestRateLimited", "请求受限，请稍后重试");
			case "http_response_parse_failed":
				return t("errors.responseParseFailed", "响应解析失败，请稍后重试");
			case "tauri_invoke_failed":
				return (
					getAppErrorDetailMessage(error) ||
					t("errors.invokeFailed", "应用内部调用失败，请稍后重试")
				);
			case "path_empty":
				return t("errors.pathEmpty", "路径不能为空");
			case "path_variable_syntax":
				return t("errors.pathVariableSyntax", "路径变量语法无效");
			case "path_variable_undefined":
				return t("errors.pathVariableUndefined", "路径使用了未定义的环境变量");
			case "path_variable_non_unicode":
				return t("errors.pathVariableNonUnicode", "环境变量不是有效文本");
			case "path_variable_cycle":
				return t("errors.pathVariableCycle", "环境变量存在循环引用");
			case "path_variable_depth_exceeded":
				return t("errors.pathVariableDepth", "环境变量递归展开层数过多");
			case "path_not_absolute":
				return t("errors.pathNotAbsolute", "路径解析结果必须是绝对路径");
			case "path_inspection_failed":
				return (
					getAppErrorDetailMessage(error) ||
					t("errors.pathInspectionFailed", "无法读取路径状态")
				);
		}

		const detailMessage = getAppErrorDetailMessage(error);
		if (detailMessage) {
			return detailMessage;
		}
	}

	if (isHttpStatus(error, 429)) {
		return t("errors.requestRateLimited", "请求受限，请稍后重试");
	}
	if (isHttpStatus(error, 401)) {
		return t("errors.authFailed", "认证失败，请检查凭证或权限");
	}
	if (isHttpStatus(error, 404)) {
		return t("errors.notFound", "未找到相关内容");
	}
	if (isHttpStatus(error, 400)) {
		return t("errors.badRequest", "请求参数有误，请检查后重试");
	}

	const normalized = toError(
		error,
		fallback ?? t("errors.unknownError", "未知错误"),
	);
	return normalized.message || fallback || t("errors.unknownError", "未知错误");
}
