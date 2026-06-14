/**
 * @file 错误处理工具
 * @description 提供跨层通用的错误归一化、结构化错误类型与轻量判断函数
 */

import type { TFunction } from "i18next";

export type AppErrorCode =
	| "tauri_invoke_failed"
	| "unsupported_source"
	| "invalid_game_id"
	| "metadata_not_found"
	| "mixed_sources_failed"
	| "http_response_error"
	| "http_response_parse_failed"
	| "api_rate_limited"
	| "metadata_request_failed";

type ApiRateLimitSource = "bgm" | "vndb" | "ymgal" | "kun";

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
	return new AppError({
		code: "tauri_invoke_failed",
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
	cause?: unknown;
}

export class HttpResponseError extends AppError {
	method: string;
	url: string;
	status: number;
	statusText: string;

	constructor({
		method,
		url,
		status,
		statusText,
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
	}
}

interface ApiRateLimitErrorOptions {
	source: ApiRateLimitSource;
	message: string;
	retryAfterMs?: number;
	backoffUntil?: number;
	fatal?: boolean;
	cause?: unknown;
}

export class ApiRateLimitError extends AppError {
	source: ApiRateLimitSource;
	retryAfterMs?: number;
	backoffUntil?: number;
	fatal: boolean;

	constructor({
		source,
		message,
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

function getRateLimitUserMessage(error: ApiRateLimitError, t: TFunction) {
	switch (error.source) {
		case "bgm":
			return t(
				"errors.bgmRateLimited",
				"Bangumi 请求被限速，当前任务已停止，请 1 小时后手动重试",
			);
		case "vndb":
			return t(
				"errors.vndbRateLimited",
				"VNDB 请求过于频繁，短暂停顿后仍失败，请稍后重试",
			);
		default:
			return t("errors.requestRateLimited", "请求过于频繁，请稍后重试");
	}
}

export function getUserErrorMessage(
	error: unknown,
	t: TFunction,
	fallback?: string,
): string {
	const rateLimitError = getApiRateLimitError(error);
	if (rateLimitError) {
		return getRateLimitUserMessage(rateLimitError, t);
	}

	if (error instanceof HttpResponseError) {
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
			case "metadata_not_found":
				return t("errors.metadataNotFound", "未找到对应的元数据");
			case "invalid_game_id":
				return t("errors.invalidGameId", "游戏 ID 格式无效");
			case "unsupported_source":
				return t("errors.unsupportedSource", "不支持的数据源");
			case "mixed_sources_failed":
				return t("errors.mixedSourcesFailed", "所有数据源请求均失败");
			case "metadata_request_failed":
				return t("errors.metadataRequestFailed", "获取元数据失败，请稍后重试");
			case "api_rate_limited":
				return t("errors.requestRateLimited", "请求过于频繁，请稍后重试");
			case "http_response_parse_failed":
				return t("errors.responseParseFailed", "响应解析失败，请稍后重试");
			case "tauri_invoke_failed":
				return (
					getAppErrorDetailMessage(error) ||
					t("errors.invokeFailed", "应用内部调用失败，请稍后重试")
				);
		}

		const detailMessage = getAppErrorDetailMessage(error);
		if (detailMessage) {
			return detailMessage;
		}
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
