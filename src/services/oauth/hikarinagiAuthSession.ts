import i18next from "i18next";
import { settingsKeys } from "@/hooks/queries/useSettings";
import { queryClient } from "@/providers/queryClient";
import { snackbar } from "@/providers/snackBar";
import { settingsService, type UserSettings } from "@/services/invoke";
import {
	isOAuthAuthRefreshDue,
	isRefreshCredentialError,
	nowUnixSeconds,
} from "@/services/oauth/oauthAuthSession";
import type { HikarinagiAuth } from "@/types";
import { AppError, isHttpStatus } from "@/utils/errors";

let hikarinagiRefreshPromise: Promise<HikarinagiAuth | null> | null = null;

export function isHikarinagiAuthRefreshDue(
	auth: HikarinagiAuth | null | undefined,
	now = nowUnixSeconds(),
) {
	return isOAuthAuthRefreshDue(auth, now);
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

function updateCachedHikarinagiAuth(auth: HikarinagiAuth | null) {
	const settings = getCachedSettings();
	if (settings) {
		queryClient.setQueryData<UserSettings>(settingsKeys.allSettings(), {
			...settings,
			hikarinagi_auth: auth,
		});
	}
}

function getReloginMessage() {
	return i18next.t(
		"pages.Settings.hikarinagiAuth.reloginRequired",
		"Hikarinagi 登录已失效，请重新登录。",
	);
}

export async function logoutHikarinagiAuth(options?: { notify?: boolean }) {
	await settingsService.updateSettings({ hikarinagiAuth: null });
	updateCachedHikarinagiAuth(null);
	await queryClient.invalidateQueries({ queryKey: settingsKeys.allSettings() });

	if (options?.notify) {
		snackbar.error(getReloginMessage());
	}
}

async function refreshHikarinagiAuth(
	auth: HikarinagiAuth,
): Promise<HikarinagiAuth | null> {
	if (!auth.refresh_token) return auth;

	try {
		const refreshedAuth = await settingsService.hikarinagiOAuthRefreshToken(
			auth.refresh_token,
		);
		updateCachedHikarinagiAuth(refreshedAuth);
		await queryClient.invalidateQueries({
			queryKey: settingsKeys.allSettings(),
		});
		return refreshedAuth;
	} catch (error) {
		if (isRefreshCredentialError(error)) {
			await logoutHikarinagiAuth({ notify: true });
			return null;
		}
		throw error;
	}
}

async function refreshHikarinagiAuthSingleFlight(auth: HikarinagiAuth) {
	hikarinagiRefreshPromise ??= refreshHikarinagiAuth(auth).finally(() => {
		hikarinagiRefreshPromise = null;
	});
	return hikarinagiRefreshPromise;
}

async function getValidHikarinagiAuth() {
	const settings = await fetchSettings();
	const auth = settings.hikarinagi_auth ?? null;

	if (!auth?.access_token) return null;
	if (!isHikarinagiAuthRefreshDue(auth)) return auth;

	return refreshHikarinagiAuthSingleFlight(auth);
}

export function isHikarinagiAuthExpiredError(error: unknown) {
	return error instanceof Error && error.name === "HikarinagiAuthExpiredError";
}

export async function withHikarinagiAuth<T>(
	fn: (token?: string, auth?: HikarinagiAuth) => Promise<T>,
) {
	const auth = await getValidHikarinagiAuth();
	const token = auth?.access_token;

	try {
		return await fn(token, auth ?? undefined);
	} catch (error) {
		if (token && isHttpStatus(error, 401)) {
			await logoutHikarinagiAuth({ notify: true });
			throw new AppError({
				code: "hikarinagi_auth_expired",
				message: getReloginMessage(),
				cause: error,
				name: "HikarinagiAuthExpiredError",
			});
		}
		throw error;
	}
}

export function hasHikarinagiScope(
	auth: HikarinagiAuth | null | undefined,
	requiredScope: string,
) {
	return new Set(auth?.scope?.split(/\s+/).filter(Boolean) ?? []).has(
		requiredScope,
	);
}

export async function initHikarinagiAuthRefresh() {
	try {
		await getValidHikarinagiAuth();
	} catch (error) {
		console.error("Hikarinagi OAuth 自动刷新检查失败:", error);
	}
}
