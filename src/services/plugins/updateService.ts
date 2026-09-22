import { invoke } from "@tauri-apps/api/core";
import type { Update } from "@tauri-apps/plugin-updater";
import { check } from "@tauri-apps/plugin-updater";
import {
	completeAppTermination,
	requestAppTermination,
} from "@/services/appExit";
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

function getUpdaterCheckOptions() {
	const { proxyConfig } = useStore.getState();

	return {
		timeout: 5_000,
		...(proxyConfig.url ? { proxy: proxyConfig.url } : {}),
	};
}

// 检查更新的主函数
export const checkForUpdates = async (callbacks?: UpdateCallbacks) => {
	try {
		const update = await check(getUpdaterCheckOptions());
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
): Promise<UpdateInstallResult> => {
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
		// 开发环境下可能没有签名，先跳过检查
		if (import.meta.env.DEV) {
			return null;
		}

		const update = await check(getUpdaterCheckOptions());
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
