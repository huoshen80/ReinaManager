/**
 * @file 错误处理工具
 * @description 提供跨层通用的错误归一化、结构化错误类型与轻量判断函数
 */

import type { TFunction } from "i18next";

export type AppErrorCode =
	| "tauri_invoke_failed"
	| "unsupported_source"
	| "invalid_game_id"
	| "bgm_token_required"
	| "metadata_not_found"
	| "mixed_sources_failed"
	| "http_response_error"
	| "http_response_parse_failed"
	| "metadata_request_failed";

interface AppErrorOptions {
	code: AppErrorCode | string;
	message: string;
	cause?: unknown;
	name?: string;
}

export class AppError extends Error {
	code: AppErrorCode | string;
	cause?: unknown;

	constructor({ code, message, cause, name = "AppError" }: AppErrorOptions) {
		super(message);
		this.name = name;
		this.code = code;
		this.cause = cause;
	}
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

export function isHttpStatus(error: unknown, status: number): boolean {
	if (error instanceof HttpResponseError) {
		return error.status === status;
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
	for (const message of [
		error.message,
		error.cause ? toError(error.cause, "").message : "",
	]) {
		if (message && !message.startsWith("Tauri command failed:")) {
			return message;
		}
	}

	return "";
}

export function getUserErrorMessage(
	error: unknown,
	t: TFunction,
	fallback?: string,
): string {
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
			case "bgm_token_required":
				return t("errors.bgmTokenRequired", "缺少 BGM Token，请先配置后重试");
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
			case "http_response_parse_failed":
				return t("errors.responseParseFailed", "响应解析失败，请稍后重试");
			case "tauri_invoke_failed":
				return (
					getAppErrorDetailMessage(error) ||
					t("errors.invokeFailed", "应用内部调用失败，请稍后重试")
				);
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
