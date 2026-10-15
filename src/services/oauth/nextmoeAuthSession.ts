import { isTauri } from "@tauri-apps/api/core";
import i18next from "i18next";
import { settingsKeys } from "@/hooks/queries/useSettings";
import { queryClient } from "@/providers/queryClient";
import { snackbar } from "@/providers/snackBar";
import { settingsService } from "@/services/invoke";
import {
	nowUnixSeconds,
	OAUTH_REFRESH_THRESHOLD_SECONDS,
} from "@/services/oauth/oauthAuthSession";
import type { NextmoeAuth } from "@/types";
import { AppError, isHttpStatusFromHost } from "@/utils/errors";

const SESSION_CACHE_SECONDS = 30;
let authCheckedAt = 0;
let authGeneration = 0;
let authPromise: Promise<NextmoeAuth | null> | null = null;
let pendingForceRefresh = false;
let expiryNotified = false;

function getCachedAuth() {
	return queryClient.getQueryData<NextmoeAuth | null>(
		settingsKeys.nextmoeAuth(),
	);
}

function isRefreshDue(auth: NextmoeAuth | null | undefined) {
	return Boolean(
		auth?.access_token &&
			auth.expires_at <= nowUnixSeconds() + OAUTH_REFRESH_THRESHOLD_SECONDS,
	);
}

function getReloginMessage() {
	return i18next.t(
		"pages.Settings.nextmoeAuth.reloginRequired",
		"Kungal (NextMoe) 登录已失效，请重新登录。",
	);
}

export function setNextmoeAuthCache(auth: NextmoeAuth | null) {
	authGeneration += 1;
	authCheckedAt = nowUnixSeconds();
	queryClient.setQueryData<NextmoeAuth | null>(
		settingsKeys.nextmoeAuth(),
		auth,
	);
	if (auth) expiryNotified = false;
}

export function clearNextmoeAuthCache() {
	setNextmoeAuthCache(null);
}

function handleExpiredAuth(error: unknown) {
	if (!(error instanceof AppError) || error.code !== "nextmoe_auth_expired") {
		return;
	}
	clearNextmoeAuthCache();
	if (!expiryNotified) {
		expiryNotified = true;
		snackbar.error(getReloginMessage());
	}
}

export async function getNextmoeAuth(options?: {
	forceRefresh?: boolean;
	expiredAccessToken?: string;
}): Promise<NextmoeAuth | null> {
	if (!isTauri()) return null;
	const cached = getCachedAuth();
	if (
		!options?.forceRefresh &&
		cached !== undefined &&
		!isRefreshDue(cached) &&
		nowUnixSeconds() - authCheckedAt < SESSION_CACHE_SECONDS
	) {
		return cached;
	}

	if (authPromise) {
		// 普通读取尚未结束时，401 必须继续执行一次强制刷新，不能复用旧 token。
		if (options?.forceRefresh && !pendingForceRefresh) {
			await authPromise;
			return getNextmoeAuth(options);
		}
		return authPromise;
	}

	const generation = authGeneration;
	pendingForceRefresh = options?.forceRefresh ?? false;
	authPromise = settingsService
		.nextmoeOauthGetAuth(options)
		.then((auth) => {
			// 登录、退出或清缓存之后，旧请求结果不能恢复已注销的会话。
			if (generation !== authGeneration) return getCachedAuth() ?? null;
			setNextmoeAuthCache(auth);
			return auth;
		})
		.catch((error) => {
			if (generation === authGeneration) handleExpiredAuth(error);
			throw error;
		})
		.finally(() => {
			authPromise = null;
			pendingForceRefresh = false;
		});
	return authPromise;
}

export async function logoutNextmoeAuth() {
	await settingsService.nextmoeOauthLogout();
	clearNextmoeAuthCache();
}

function isNextmoeAuthRejected(error: unknown) {
	return (
		isHttpStatusFromHost(error, 401, "api.nextmoe.dev") ||
		isHttpStatusFromHost(error, 403, "api.nextmoe.dev")
	);
}

/** 用户数据必须保持登录身份，不能像公开目录一样退回匿名请求。 */
export async function withNextmoeUserAuth<T>(
	fn: (token: string, auth: NextmoeAuth) => Promise<T>,
): Promise<T> {
	const auth = await getNextmoeAuth();
	if (!auth?.access_token) {
		throw new AppError({
			code: "nextmoe_auth_missing",
			message: "请先在账号设置中登录 Kungal (NextMoe)。",
		});
	}
	try {
		return await fn(auth.access_token, auth);
	} catch (error) {
		if (!isHttpStatusFromHost(error, 401, "api.nextmoe.dev")) throw error;
		const refreshed = await getNextmoeAuth({
			forceRefresh: true,
			expiredAccessToken: auth.access_token,
		});
		if (!refreshed?.access_token) {
			throw new AppError({
				code: "nextmoe_auth_expired",
				message: getReloginMessage(),
				cause: error,
			});
		}
		return fn(refreshed.access_token, refreshed);
	}
}

/** 公开目录优先使用登录额度，凭据不可用时退回匿名读取。 */
export async function withNextmoeAuth<T>(
	fn: (token?: string, auth?: NextmoeAuth) => Promise<T>,
): Promise<T> {
	let auth: NextmoeAuth | null;
	try {
		auth = await getNextmoeAuth();
	} catch {
		auth = null;
	}
	if (!auth?.access_token) return fn();
	try {
		return await fn(auth.access_token, auth);
	} catch (error) {
		if (!isNextmoeAuthRejected(error)) throw error;
		// 401 尝试刷新一次；权限不足和失效后仍被拒绝的凭据不妨碍公开目录读取。
		if (isHttpStatusFromHost(error, 401, "api.nextmoe.dev")) {
			let refreshed: NextmoeAuth | null;
			try {
				refreshed = await getNextmoeAuth({
					forceRefresh: true,
					expiredAccessToken: auth.access_token,
				});
			} catch {
				refreshed = null;
			}
			if (refreshed?.access_token) {
				try {
					return await fn(refreshed.access_token, refreshed);
				} catch (retryError) {
					if (!isNextmoeAuthRejected(retryError)) throw retryError;
				}
			}
		}
		return fn();
	}
}

export function initNextmoeAuthRefresh() {
	if (!isTauri()) return () => {};
	let disposed = false;
	let checking = false;
	const check = async () => {
		if (disposed || checking) return;
		checking = true;
		try {
			await getNextmoeAuth();
		} catch {
			// 短暂断网保留会话，由下次检查重试；失效授权由统一入口提示。
		} finally {
			checking = false;
		}
	};
	void check();
	const timer = window.setInterval(() => void check(), 60_000);
	const onFocus = () => void check();
	window.addEventListener("focus", onFocus);
	return () => {
		disposed = true;
		window.clearInterval(timer);
		window.removeEventListener("focus", onFocus);
	};
}
