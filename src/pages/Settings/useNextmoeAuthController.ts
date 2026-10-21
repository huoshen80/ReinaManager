import { listen } from "@tauri-apps/api/event";
import { openUrl as openurl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNextmoeAuth } from "@/hooks/queries/useSettings";
import { snackbar } from "@/providers/snackBar";
import { settingsService } from "@/services/invoke";
import {
	logoutNextmoeAuth,
	setNextmoeAuthCache,
} from "@/services/oauth/nextmoeAuthSession";
import type { OAuthCallbackPayload } from "@/services/oauth/oauthAuthSession";
import { getUserErrorMessage } from "@/utils/errors";

type LoginStatus = "idle" | "waiting" | "exchanging" | "cancelling";
let status: LoginStatus = "idle";
let attemptId = 0;
let unlisteners: Array<() => void> = [];
let startPromise: Promise<string> | null = null;
const subscribers = new Set<(value: LoginStatus) => void>();

function setStatus(value: LoginStatus) {
	status = value;
	for (const subscriber of subscribers) subscriber(value);
}

function clearListeners() {
	for (const unlisten of unlisteners) unlisten();
	unlisteners = [];
}

function isCurrentAttempt(id: number) {
	return id === attemptId && status !== "idle" && status !== "cancelling";
}

async function cancelLogin() {
	const id = ++attemptId;
	clearListeners();
	setStatus("cancelling");
	try {
		// start 尚未完成时先等它结束，再取消其注册，防止取消后迟到的启动留下监听。
		await startPromise?.catch(() => {});
		await settingsService.nextmoeOauthCancelLogin();
	} finally {
		if (id === attemptId) setStatus("idle");
	}
}

export function useNextmoeAuthController() {
	const { t } = useTranslation();
	const { data: nextmoeAuth, isLoading, error: authError } = useNextmoeAuth();
	const [loginStatus, setLoginStatus] = useState(status);
	const [isLoggingOut, setIsLoggingOut] = useState(false);

	useEffect(() => {
		subscribers.add(setLoginStatus);
		setLoginStatus(status);
		return () => {
			subscribers.delete(setLoginStatus);
			// 设置板块关闭时释放回调监听，避免卸载后的登录结果写入新会话。
			if (subscribers.size === 0 && status !== "idle") {
				void cancelLogin().catch(() => {});
			}
		};
	}, []);

	const handleOAuthLogin = useCallback(async () => {
		if (status !== "idle") return;
		const id = ++attemptId;
		setStatus("waiting");
		clearListeners();

		const finish = () => {
			if (!isCurrentAttempt(id)) return;
			clearListeners();
			attemptId += 1;
			setStatus("idle");
		};

		try {
			// 先装好监听再启动服务、打开浏览器，避免快速回调遗漏。
			const codeUnlisten = await listen<OAuthCallbackPayload>(
				"nextmoe-oauth-code",
				async (event) => {
					if (!isCurrentAttempt(id) || status !== "waiting") return;
					clearListeners();
					setStatus("exchanging");
					try {
						const verifier = event.payload.code_verifier?.trim();
						if (!verifier) throw new Error("OAuth PKCE verifier missing");
						const auth = await settingsService.nextmoeOauthExchangeCode(
							event.payload.code,
							verifier,
						);
						if (!isCurrentAttempt(id)) return;
						setNextmoeAuthCache(auth);
						snackbar.success(
							t(
								"pages.Settings.nextmoeAuth.oauthSuccess",
								"Kungal (NextMoe) 登录成功",
							),
						);
					} catch (error) {
						if (!isCurrentAttempt(id)) return;
						snackbar.error(
							t(
								"pages.Settings.nextmoeAuth.oauthError",
								"Kungal (NextMoe) 登录失败: {{error}}",
								{ error: getUserErrorMessage(error, t) },
							),
						);
					} finally {
						finish();
					}
				},
			);
			if (!isCurrentAttempt(id)) {
				codeUnlisten();
				return;
			}
			unlisteners.push(codeUnlisten);
			const errorUnlisten = await listen<string>(
				"nextmoe-oauth-error",
				(event) => {
					if (!isCurrentAttempt(id)) return;
					snackbar.error(
						t(
							"pages.Settings.nextmoeAuth.oauthError",
							"Kungal (NextMoe) 登录失败: {{error}}",
							{ error: event.payload },
						),
					);
					finish();
				},
			);
			if (!isCurrentAttempt(id)) {
				errorUnlisten();
				return;
			}
			unlisteners.push(errorUnlisten);
			const starting = settingsService.nextmoeOauthStartLogin();
			startPromise = starting;
			const authorizeUrl = await starting;
			if (startPromise === starting) startPromise = null;
			if (!isCurrentAttempt(id)) return;
			await openurl(authorizeUrl);
			if (!isCurrentAttempt(id)) return;
			snackbar.info(
				t(
					"pages.Settings.nextmoeAuth.oauthWaiting",
					"请在浏览器中完成 Kungal (NextMoe) 授权...",
				),
			);
		} catch (error) {
			if (!isCurrentAttempt(id)) return;
			await cancelLogin().catch(() => {});
			snackbar.error(
				t(
					"pages.Settings.nextmoeAuth.oauthStartError",
					"启动 Kungal (NextMoe) 登录失败: {{error}}",
					{ error: getUserErrorMessage(error, t) },
				),
			);
		}
	}, [t]);

	const handleCancelOAuth = useCallback(async () => {
		if (status === "idle" || status === "cancelling") return;
		try {
			await cancelLogin();
			snackbar.info(
				t(
					"pages.Settings.nextmoeAuth.oauthCancelled",
					"Kungal (NextMoe) 登录已取消",
				),
			);
		} catch (error) {
			snackbar.error(getUserErrorMessage(error, t));
		}
	}, [t]);

	const handleLogout = useCallback(async () => {
		if (status !== "idle" || isLoggingOut) return;
		setIsLoggingOut(true);
		try {
			await logoutNextmoeAuth();
			snackbar.success(
				t(
					"pages.Settings.nextmoeAuth.logoutSuccess",
					"已退出 Kungal (NextMoe) 登录",
				),
			);
		} catch (error) {
			snackbar.error(getUserErrorMessage(error, t));
		} finally {
			setIsLoggingOut(false);
		}
	}, [isLoggingOut, t]);

	return {
		nextmoeAuth,
		authError,
		isSettingsLoading: isLoading,
		isOAuthLoading: loginStatus !== "idle",
		isSaving:
			loginStatus === "exchanging" ||
			loginStatus === "cancelling" ||
			isLoggingOut,
		handleOAuthLogin,
		handleCancelOAuth,
		handleLogout,
	};
}
