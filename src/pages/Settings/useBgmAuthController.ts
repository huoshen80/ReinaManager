import { listen } from "@tauri-apps/api/event";
import { open as openurl } from "@tauri-apps/plugin-shell";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAllSettings, useUpdateSettings } from "@/hooks/queries/useSettings";
import { buildManualBgmAuth, completeBgmAuth } from "@/metadata/api/bgm";
import { snackbar } from "@/providers/snackBar";
import { logoutBgmAuth } from "@/services/bgmAuthSession";
import { settingsService } from "@/services/invoke";
import { toError } from "@/utils/errors";

let isBgmOAuthRunning = false;
let bgmOAuthUnlisteners: Array<() => void> = [];
const bgmOAuthStatusListeners = new Set<(isLoading: boolean) => void>();

function clearBgmOAuthListeners() {
	for (const unlisten of bgmOAuthUnlisteners) {
		unlisten();
	}
	bgmOAuthUnlisteners = [];
}

function notifyBgmOAuthStatus() {
	for (const listener of bgmOAuthStatusListeners) {
		listener(isBgmOAuthRunning);
	}
}

export function useBgmAuthController() {
	const { t } = useTranslation();
	const { data: settings } = useAllSettings();
	const bgmAuth = settings?.bgm_auth;
	const bgmToken = bgmAuth?.access_token ?? "";
	const updateSettingsMutation = useUpdateSettings();
	const [inputToken, setInputToken] = useState("");
	const [isOAuthLoading, setIsOAuthLoading] = useState(isBgmOAuthRunning);
	const [isCompletingAuth, setIsCompletingAuth] = useState(false);
	const [isSavingToken, setIsSavingToken] = useState(false);
	const isSavingTokenRef = useRef(false);

	useEffect(() => {
		setInputToken(bgmToken);
	}, [bgmToken]);

	useEffect(() => {
		bgmOAuthStatusListeners.add(setIsOAuthLoading);
		setIsOAuthLoading(isBgmOAuthRunning);
		return () => {
			bgmOAuthStatusListeners.delete(setIsOAuthLoading);
		};
	}, []);

	const handleOpenTokenPage = () => {
		openurl("https://next.bgm.tv/demo/access-token/create");
	};

	const handleSaveToken = async () => {
		const accessToken = inputToken.trim();
		if (accessToken === bgmToken || isSavingTokenRef.current) return;

		try {
			isSavingTokenRef.current = true;
			setIsSavingToken(true);
			if (!accessToken) {
				await logoutBgmAuth();
				return;
			}

			const auth = await buildManualBgmAuth(accessToken);

			await updateSettingsMutation.mutateAsync({
				bgmAuth: auth,
			});
			snackbar.success(
				t("pages.Settings.bgmTokenSettings.saveSuccess", "BGM Token 保存成功"),
			);
		} catch (error) {
			console.error(error);
			snackbar.error(
				t(
					"pages.Settings.bgmTokenSettings.saveErrorWithDetail",
					"BGM Token 保存失败: {{error}}",
					{ error: toError(error).message },
				),
			);
		} finally {
			isSavingTokenRef.current = false;
			setIsSavingToken(false);
		}
	};

	const handleClearToken = async () => {
		setInputToken("");
		if (!bgmToken || isSavingTokenRef.current) return;

		try {
			isSavingTokenRef.current = true;
			setIsSavingToken(true);
			await logoutBgmAuth();
			snackbar.success(
				t("pages.Settings.bgmTokenSettings.logoutSuccess", "已退出 BGM 登录"),
			);
		} catch (error) {
			console.error(error);
			setInputToken(bgmToken);
			snackbar.error(
				t("pages.Settings.bgmTokenSettings.logoutError", "退出登录失败"),
			);
		} finally {
			isSavingTokenRef.current = false;
			setIsSavingToken(false);
		}
	};

	const handleOAuthLogin = useCallback(async () => {
		if (isBgmOAuthRunning) {
			snackbar.info(
				t(
					"pages.Settings.bgmTokenSettings.oauthWaiting",
					"请在浏览器中完成授权...",
				),
			);
			return;
		}

		try {
			isBgmOAuthRunning = true;
			notifyBgmOAuthStatus();
			const authorizeUrl = await settingsService.bgmOAuthStartLogin();
			clearBgmOAuthListeners();
			const codeUnlisten = await listen<string>(
				"bgm-oauth-code",
				async (event) => {
					clearBgmOAuthListeners();
					try {
						const auth = await settingsService.bgmOAuthExchangeCode(
							event.payload,
						);
						await updateSettingsMutation.mutateAsync({
							bgmAuth: await completeBgmAuth(auth),
						});
						snackbar.success(
							t(
								"pages.Settings.bgmTokenSettings.oauthSuccess",
								"Bangumi OAuth 登录成功",
							),
						);
					} catch (error) {
						console.error(error);
						snackbar.error(
							t(
								"pages.Settings.bgmTokenSettings.oauthError",
								"OAuth 登录失败: {{error}}",
								{ error: toError(error).message },
							),
						);
					} finally {
						isBgmOAuthRunning = false;
						notifyBgmOAuthStatus();
					}
				},
			);
			const errorUnlisten = await listen<string>("bgm-oauth-error", (event) => {
				clearBgmOAuthListeners();
				isBgmOAuthRunning = false;
				notifyBgmOAuthStatus();
				snackbar.error(
					t(
						"pages.Settings.bgmTokenSettings.oauthError",
						"OAuth 登录失败: {{error}}",
						{ error: event.payload },
					),
				);
			});
			bgmOAuthUnlisteners = [codeUnlisten, errorUnlisten];
			void openurl(authorizeUrl).catch((error) => {
				console.error(error);
				clearBgmOAuthListeners();
				isBgmOAuthRunning = false;
				notifyBgmOAuthStatus();
				snackbar.error(
					t(
						"pages.Settings.bgmTokenSettings.oauthStartError",
						"启动 OAuth 登录失败: {{error}}",
						{ error: toError(error).message },
					),
				);
			});
			snackbar.info(
				t(
					"pages.Settings.bgmTokenSettings.oauthWaiting",
					"请在浏览器中完成授权...",
				),
			);
		} catch (error) {
			console.error(error);
			clearBgmOAuthListeners();
			isBgmOAuthRunning = false;
			notifyBgmOAuthStatus();
			snackbar.error(
				t(
					"pages.Settings.bgmTokenSettings.oauthStartError",
					"启动 OAuth 登录失败: {{error}}",
					{ error: toError(error).message },
				),
			);
		}
	}, [t, updateSettingsMutation]);

	const handleCompleteAuth = useCallback(async () => {
		if (!bgmAuth?.access_token) return;
		try {
			setIsCompletingAuth(true);

			await updateSettingsMutation.mutateAsync({
				bgmAuth: await completeBgmAuth(bgmAuth),
			});
			snackbar.success(
				t(
					"pages.Settings.bgmTokenSettings.tokenStatusSuccess",
					"授权信息已更新",
				),
			);
		} catch (error) {
			console.error(error);
			snackbar.error(
				t(
					"pages.Settings.bgmTokenSettings.tokenStatusError",
					"无法查询 Token 状态: {{error}}",
					{ error: toError(error).message },
				),
			);
		} finally {
			setIsCompletingAuth(false);
		}
	}, [bgmAuth, t, updateSettingsMutation]);

	const handleLogout = useCallback(async () => {
		try {
			await logoutBgmAuth();
			setInputToken("");
			snackbar.success(
				t("pages.Settings.bgmTokenSettings.logoutSuccess", "已退出 BGM 登录"),
			);
		} catch (error) {
			console.error(error);
			snackbar.error(
				t("pages.Settings.bgmTokenSettings.logoutError", "退出登录失败"),
			);
		}
	}, [t]);

	return {
		bgmAuth,
		inputToken,
		isOAuthLoading,
		isCompletingAuth,
		isSavingToken: isSavingToken || updateSettingsMutation.isPending,
		setInputToken,
		handleOpenTokenPage,
		handleSaveToken,
		handleClearToken,
		handleOAuthLogin,
		handleCompleteAuth,
		handleLogout,
	};
}
