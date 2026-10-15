import { invoke } from "@tauri-apps/api/core";
import { ask } from "@tauri-apps/plugin-dialog";
import { Update } from "@tauri-apps/plugin-updater";
import i18n from "i18next";
import {
	completeAppTermination,
	requestAppTermination,
} from "@/services/appExit";
import { settingsService } from "@/services/invoke";
import { useStore } from "@/store/appStore";

export interface UpdateProgress {
	downloaded: number;
	contentLength: number;
	percentage: number;
}

export interface UpdateCallbacks {
	onUpdateFound?: (update: Update) => void;
	onProgress?: (progress: UpdateProgress) => void;
	onDownloadComplete?: () => void;
	onError?: (error: unknown) => void;
	onNoUpdate?: () => void;
}

export type UpdateInstallResult = "cancelled" | "started";

export interface PreviousInstallation {
	previousDirectory: string;
	currentDirectory: string;
}

interface UpdateInstallOptions {
	onPreviousInstallation?: (notice: PreviousInstallation) => Promise<boolean>;
}

// 仅在当前进程记住确认结果，安装记录修正后无需再保存提醒状态。
const acknowledgedInstallations = new Set<string>();

function getUpdaterCheckOptions() {
	const { proxyConfig } = useStore.getState();

	return {
		timeout: 5_000,
		...(proxyConfig.url ? { proxy: proxyConfig.url } : {}),
	};
}

async function checkAppUpdate(): Promise<Update | null> {
	const metadata = await invoke<ConstructorParameters<typeof Update>[0] | null>(
		"check_app_update",
		getUpdaterCheckOptions(),
	);
	return metadata ? new Update(metadata) : null;
}

// 检查更新的主函数
export const checkForUpdates = async (callbacks?: UpdateCallbacks) => {
	try {
		if (await settingsService.isDevelopment()) return null;
		const update = await checkAppUpdate();
		if (update) {
			callbacks?.onUpdateFound?.(update);
			return update;
		} else {
			callbacks?.onNoUpdate?.();
			return null;
		}
	} catch (error) {
		callbacks?.onError?.(error);
		return null;
	}
};

// 下载更新，安装动作由调用方在取得应用终止许可后单独触发。
export const downloadUpdate = async (
	update: Update,
	callbacks?: UpdateCallbacks,
) => {
	try {
		if (await settingsService.isDevelopment()) {
			throw new Error("开发版不支持应用更新");
		}
		let downloaded = 0;
		let contentLength = 0;

		await update.download((event) => {
			switch (event.event) {
				case "Started":
					contentLength = event.data.contentLength || 0;
					break;

				case "Progress": {
					downloaded += event.data.chunkLength;
					const percentage =
						contentLength > 0
							? Math.round((downloaded / contentLength) * 100)
							: 0;

					callbacks?.onProgress?.({
						downloaded,
						contentLength,
						percentage,
					});
					break;
				}

				case "Finished":
					callbacks?.onDownloadComplete?.();
					break;
			}
		});
	} catch (error) {
		callbacks?.onError?.(error);
		throw error;
	}
};

export const installDownloadedUpdate = async (
	update: Update,
	options?: UpdateInstallOptions,
): Promise<UpdateInstallResult> => {
	if (await settingsService.isDevelopment()) return "cancelled";
	const notice = await invoke<PreviousInstallation | null>(
		"inspect_update_installation",
	);
	if (notice) {
		const key = JSON.stringify([
			notice.previousDirectory,
			notice.currentDirectory,
		]);
		if (!acknowledgedInstallations.has(key)) {
			const accepted = options?.onPreviousInstallation
				? await options.onPreviousInstallation(notice)
				: await ask(
						i18n.t(
							"components.Window.UpdateModal.previousInstallationMessage",
							"检测到另一份 ReinaManager：\n{{previousDirectory}}\n\n本次更新使用的是：\n{{currentDirectory}}\n\n请确认另一份程序是否还需要，清理前检查其中的用户数据。",
							{
								previousDirectory: notice.previousDirectory,
								currentDirectory: notice.currentDirectory,
							},
						),
						{
							title: i18n.t(
								"components.Window.UpdateModal.previousInstallationTitle",
								"发现旧目录中的程序",
							),
							kind: "warning",
							okLabel: i18n.t(
								"components.Window.UpdateModal.acknowledgeAndUpdate",
								"知道了，继续更新",
							),
							cancelLabel: i18n.t("common.cancel", "取消"),
						},
					);
			if (!accepted) return "cancelled";
			acknowledgedInstallations.add(key);
		}
	}
	const permit = await requestAppTermination("update");
	if (!permit) {
		return "cancelled";
	}

	await completeAppTermination(
		permit,
		async () => {
			// Windows 安装器会结束并重启应用；macOS/Linux 安装完成后需要主动重启。
			await update.install({ restartAfterInstall: true });
			await invoke("restart_app");
		},
		{ runExitBackup: true },
	);

	return "started";
};

// 完整的更新流程（检查 + 安装）
export const autoUpdate = async (callbacks?: UpdateCallbacks) => {
	const update = await checkForUpdates(callbacks);
	if (!update) {
		return;
	}

	try {
		await downloadUpdate(update, callbacks);
	} catch {
		return;
	}

	try {
		const result = await installDownloadedUpdate(update);
		if (result === "cancelled") {
			await update.close();
		}
	} catch (error) {
		callbacks?.onError?.(error);
		await update.close().catch(() => undefined);
	}
};

// 静默检查更新（应用启动时调用）
export const silentCheckForUpdates = async () => {
	try {
		if (await settingsService.isDevelopment()) {
			return null;
		}

		const update = await checkAppUpdate();
		return update;
	} catch (error) {
		// 如果是签名相关错误，在开发环境下忽略
		if (error instanceof Error && error.message.includes("signature")) {
			console.warn("签名验证失败，可能是因为发布版本还未包含签名文件");
		}
		return null;
	}
};

export default checkForUpdates;
