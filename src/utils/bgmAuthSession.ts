import i18next from "i18next";
import { settingsKeys } from "@/hooks/queries/useSettings";
import { queryClient } from "@/providers/queryClient";
import { snackbar } from "@/providers/snackBar";
import { settingsService, type UserSettings } from "@/services/invoke";
import type { BgmAuth } from "@/types";
import { AppError, isHttpStatus, toError } from "@/utils/errors";

const BGM_REFRESH_THRESHOLD_SECONDS = 2 * 24 * 60 * 60;

let bgmRefreshPromise: Promise<BgmAuth | null> | null = null;

export function nowUnixSeconds() {
	return Math.floor(Date.now() / 1000);
}

export function isBgmAuthRefreshDue(
	auth: BgmAuth | null | undefined,
	now = nowUnixSeconds(),
) {
	return Boolean(
		auth?.refresh_token &&
			auth.expires_at != null &&
			auth.expires_at <= now + BGM_REFRESH_THRESHOLD_SECONDS,
	);
}

function getCachedSettings() {
	return queryClient.getQueryData<UserSettings>(settingsKeys.allSettings());
}

async function fetchSettings() {
	return queryClient.fetchQuery({
		queryKey: settingsKeys.allSettings(),
		queryFn: () => settingsService.getAllSettings(),
	});
}

function updateCachedBgmAuth(bgmAuth: BgmAuth | null) {
	const settings = getCachedSettings();
	if (settings) {
		queryClient.setQueryData<UserSettings>(settingsKeys.allSettings(), {
			...settings,
			bgm_auth: bgmAuth,
		});
	}
}

function getReloginMessage() {
	return i18next.t(
		"pages.Settings.bgmTokenSettings.reloginRequired",
		"Bangumi 登录已失效，请重新登录。",
	);
}

function isRefreshCredentialError(error: unknown) {
	const message = toError(error).message.toLowerCase();
	return (
		isHttpStatus(error, 400) ||
		isHttpStatus(error, 401) ||
		message.includes("invalid_grant") ||
		message.includes("unauthorized")
	);
}

export async function logoutBgmAuth(options?: { notify?: boolean }) {
	await settingsService.updateSettings({ bgmAuth: null });
	updateCachedBgmAuth(null);
	await queryClient.invalidateQueries({ queryKey: settingsKeys.allSettings() });

	if (options?.notify) {
		snackbar.error(getReloginMessage());
	}
}

async function refreshBgmAuth(auth: BgmAuth): Promise<BgmAuth | null> {
	if (!auth.refresh_token) return auth;

	try {
		const refreshedAuth = await settingsService.bgmOAuthRefreshToken(
			auth.refresh_token,
		);
		updateCachedBgmAuth(refreshedAuth);
		await queryClient.invalidateQueries({
			queryKey: settingsKeys.allSettings(),
		});
		return refreshedAuth;
	} catch (error) {
		if (isRefreshCredentialError(error)) {
			await logoutBgmAuth({ notify: true });
			return null;
		}
		throw error;
	}
}

async function refreshBgmAuthSingleFlight(auth: BgmAuth) {
	bgmRefreshPromise ??= refreshBgmAuth(auth).finally(() => {
		bgmRefreshPromise = null;
	});
	return bgmRefreshPromise;
}

async function getValidBgmAuth() {
	const settings = await fetchSettings();
	const auth = settings.bgm_auth ?? null;

	if (!auth?.access_token) return null;
	if (!isBgmAuthRefreshDue(auth)) return auth;

	return refreshBgmAuthSingleFlight(auth);
}

async function getValidBgmAccessToken() {
	const auth = await getValidBgmAuth();
	return auth?.access_token;
}

export function isBgmAuthExpiredError(error: unknown) {
	return error instanceof Error && error.name === "BgmAuthExpiredError";
}

export async function withBgmAuth<T>(fn: (token?: string) => Promise<T>) {
	const token = await getValidBgmAccessToken();

	try {
		return await fn(token);
	} catch (error) {
		if (token && isHttpStatus(error, 401)) {
			await logoutBgmAuth({ notify: true });
			throw new AppError({
				code: "bgm_auth_expired",
				message: getReloginMessage(),
				cause: error,
				name: "BgmAuthExpiredError",
			});
		}
		throw error;
	}
}

export async function initBgmAuthRefresh() {
	try {
		await getValidBgmAuth();
	} catch (error) {
		console.error("BGM OAuth 自动刷新检查失败:", error);
	}
}
