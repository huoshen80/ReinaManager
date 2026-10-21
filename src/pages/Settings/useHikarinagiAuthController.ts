import { listen } from "@tauri-apps/api/event";
import { openUrl as openurl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	useAllSettings,
	useHikarinagiCurrentUserProfile,
	useUpdateSettings,
} from "@/hooks/queries/useSettings";
import { completeHikarinagiAuth } from "@/metadata/api/hikarinagi";
import { snackbar } from "@/providers/snackBar";
import { settingsService } from "@/services/invoke";
import { logoutHikarinagiAuth } from "@/services/oauth/hikarinagiAuthSession";
import type { OAuthCallbackPayload } from "@/services/oauth/oauthAuthSession";
import { getNetworkRequestContext } from "@/services/requestContext";
import { toError } from "@/utils/errors";

let isHikarinagiOAuthRunning = false;
let hikarinagiOAuthAttemptId = 0;
let hikarinagiOAuthUnlisteners: Array<() => void> = [];
const hikarinagiOAuthStatusListeners = new Set<(isLoading: boolean) => void>();

function clearHikarinagiOAuthListeners() {
	for (const unlisten of hikarinagiOAuthUnlisteners) {
		unlisten();
	}
	hikarinagiOAuthUnlisteners = [];
}

function notifyHikarinagiOAuthStatus() {
	for (const listener of hikarinagiOAuthStatusListeners) {
		listener(isHikarinagiOAuthRunning);
	}
}

function isCurrentHikarinagiOAuthAttempt(attemptId: number) {
	return isHikarinagiOAuthRunning && attemptId === hikarinagiOAuthAttemptId;
}

export function useHikarinagiAuthController() {
	const { t } = useTranslation();
	const { data: settings, isLoading: isSettingsLoading } = useAllSettings();
	const hikarinagiAuth = settings?.hikarinagi_auth;
	const { data: hikarinagiProfile } = useHikarinagiCurrentUserProfile();
	const updateSettingsMutation = useUpdateSettings();
	const [isOAuthLoading, setIsOAuthLoading] = useState(
		isHikarinagiOAuthRunning,
	);

	useEffect(() => {
		hikarinagiOAuthStatusListeners.add(setIsOAuthLoading);
		setIsOAuthLoading(isHikarinagiOAuthRunning);
		return () => {
			hikarinagiOAuthStatusListeners.delete(setIsOAuthLoading);
		};
	}, []);

	const handleOAuthLogin = useCallback(async () => {
		if (isHikarinagiOAuthRunning) {
			snackbar.info(
				t(
					"pages.Settings.hikarinagiAuth.oauthWaiting",
					"请在浏览器中完成 Hikarinagi 授权...",
				),
			);
			return;
		}

		const attemptId = ++hikarinagiOAuthAttemptId;
		try {
			isHikarinagiOAuthRunning = true;
			notifyHikarinagiOAuthStatus();
			const authorizeUrl = await settingsService.hikarinagiOAuthStartLogin();
			if (!isCurrentHikarinagiOAuthAttempt(attemptId)) {
				await settingsService.hikarinagiOAuthCancelLogin();
				return;
			}
			clearHikarinagiOAuthListeners();
			const codeUnlisten = await listen<OAuthCallbackPayload>(
				"hikarinagi-oauth-code",
				async (event) => {
					if (!isCurrentHikarinagiOAuthAttempt(attemptId)) return;
					clearHikarinagiOAuthListeners();
					try {
						const codeVerifier = event.payload.code_verifier?.trim();
						if (!codeVerifier) {
							throw new Error("Hikarinagi OAuth 回调缺少 PKCE verifier");
						}
						const auth = await settingsService.hikarinagiOAuthExchangeCode(
							event.payload.code,
							codeVerifier,
						);
						if (!isCurrentHikarinagiOAuthAttempt(attemptId)) return;
						await updateSettingsMutation.mutateAsync({
							hikarinagiAuth: await completeHikarinagiAuth(
								auth,
								getNetworkRequestContext(),
							),
						});
						if (!isCurrentHikarinagiOAuthAttempt(attemptId)) return;
						snackbar.success(
							t(
								"pages.Settings.hikarinagiAuth.oauthSuccess",
								"Hikarinagi OAuth 登录成功",
							),
						);
					} catch (error) {
						if (!isCurrentHikarinagiOAuthAttempt(attemptId)) return;
						console.error(error);
						snackbar.error(
							t(
								"pages.Settings.hikarinagiAuth.oauthError",
								"Hikarinagi OAuth 登录失败: {{error}}",
								{ error: toError(error).message },
							),
						);
					} finally {
						if (isCurrentHikarinagiOAuthAttempt(attemptId)) {
							isHikarinagiOAuthRunning = false;
							hikarinagiOAuthAttemptId += 1;
							notifyHikarinagiOAuthStatus();
						}
					}
				},
			);
			if (!isCurrentHikarinagiOAuthAttempt(attemptId)) {
				codeUnlisten();
				await settingsService.hikarinagiOAuthCancelLogin();
				return;
			}
			const errorUnlisten = await listen<string>(
				"hikarinagi-oauth-error",
				(event) => {
					if (!isCurrentHikarinagiOAuthAttempt(attemptId)) return;
					clearHikarinagiOAuthListeners();
					isHikarinagiOAuthRunning = false;
					hikarinagiOAuthAttemptId += 1;
					notifyHikarinagiOAuthStatus();
					snackbar.error(
						t(
							"pages.Settings.hikarinagiAuth.oauthError",
							"Hikarinagi OAuth 登录失败: {{error}}",
							{ error: event.payload },
						),
					);
				},
			);
			if (!isCurrentHikarinagiOAuthAttempt(attemptId)) {
				codeUnlisten();
				errorUnlisten();
				await settingsService.hikarinagiOAuthCancelLogin();
				return;
			}
			hikarinagiOAuthUnlisteners = [codeUnlisten, errorUnlisten];
			void openurl(authorizeUrl).catch(async (error) => {
				if (!isCurrentHikarinagiOAuthAttempt(attemptId)) return;
				console.error(error);
				clearHikarinagiOAuthListeners();
				const failedAttemptId = ++hikarinagiOAuthAttemptId;
				await settingsService
					.hikarinagiOAuthCancelLogin()
					.catch((cancelError) => {
						console.error(cancelError);
					});
				if (failedAttemptId !== hikarinagiOAuthAttemptId) return;
				isHikarinagiOAuthRunning = false;
				notifyHikarinagiOAuthStatus();
				snackbar.error(
					t(
						"pages.Settings.hikarinagiAuth.oauthStartError",
						"启动 Hikarinagi OAuth 登录失败: {{error}}",
						{ error: toError(error).message },
					),
				);
			});
			snackbar.info(
				t(
					"pages.Settings.hikarinagiAuth.oauthWaiting",
					"请在浏览器中完成 Hikarinagi 授权...",
				),
			);
		} catch (error) {
			if (!isCurrentHikarinagiOAuthAttempt(attemptId)) {
				await settingsService
					.hikarinagiOAuthCancelLogin()
					.catch((cancelError) => {
						console.error(cancelError);
					});
				return;
			}
			console.error(error);
			clearHikarinagiOAuthListeners();
			const failedAttemptId = ++hikarinagiOAuthAttemptId;
			await settingsService
				.hikarinagiOAuthCancelLogin()
				.catch((cancelError) => {
					console.error(cancelError);
				});
			if (failedAttemptId !== hikarinagiOAuthAttemptId) return;
			isHikarinagiOAuthRunning = false;
			notifyHikarinagiOAuthStatus();
			snackbar.error(
				t(
					"pages.Settings.hikarinagiAuth.oauthStartError",
					"启动 Hikarinagi OAuth 登录失败: {{error}}",
					{ error: toError(error).message },
				),
			);
		}
	}, [t, updateSettingsMutation]);

	const handleCancelOAuth = useCallback(async () => {
		if (!isHikarinagiOAuthRunning) return;

		const cancelAttemptId = ++hikarinagiOAuthAttemptId;
		clearHikarinagiOAuthListeners();
		try {
			await settingsService.hikarinagiOAuthCancelLogin();
			if (cancelAttemptId !== hikarinagiOAuthAttemptId) return;
			snackbar.info(
				t(
					"pages.Settings.hikarinagiAuth.oauthCancelled",
					"Hikarinagi OAuth 登录已取消",
				),
			);
		} catch (error) {
			if (cancelAttemptId !== hikarinagiOAuthAttemptId) return;
			console.error(error);
			snackbar.error(
				t(
					"pages.Settings.hikarinagiAuth.oauthCancelError",
					"取消 Hikarinagi OAuth 登录失败: {{error}}",
					{ error: toError(error).message },
				),
			);
		} finally {
			if (cancelAttemptId === hikarinagiOAuthAttemptId) {
				isHikarinagiOAuthRunning = false;
				hikarinagiOAuthAttemptId += 1;
				notifyHikarinagiOAuthStatus();
			}
		}
	}, [t]);

	const handleLogout = useCallback(async () => {
		try {
			await logoutHikarinagiAuth();
			snackbar.success(
				t(
					"pages.Settings.hikarinagiAuth.logoutSuccess",
					"已退出 Hikarinagi 登录",
				),
			);
		} catch (error) {
			console.error(error);
			snackbar.error(
				t(
					"pages.Settings.hikarinagiAuth.logoutError",
					"退出 Hikarinagi 登录失败",
				),
			);
		}
	}, [t]);

	return {
		hikarinagiAuth,
		hikarinagiProfile,
		isSettingsLoading,
		isOAuthLoading,
		isSaving: updateSettingsMutation.isPending,
		handleOAuthLogin,
		handleCancelOAuth,
		handleLogout,
	};
}
