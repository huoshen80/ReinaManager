import type { Update } from "@tauri-apps/plugin-updater";
import { check } from "@tauri-apps/plugin-updater";

export interface UpdateProgress {
	downloaded: number;
	contentLength: number;
	percentage: number;
}

export interface UpdateCallbacks {
	onUpdateFound?: (update: Update) => void;
	onProgress?: (progress: UpdateProgress) => void;
	onDownloadComplete?: () => void;
	onError?: (error: string) => void;
	onNoUpdate?: () => void;
}

// 检查更新的主函数
export const checkForUpdates = async (callbacks?: UpdateCallbacks) => {
	try {
		const update = await check();
		if (update) {
			callbacks?.onUpdateFound?.(update);
			return update;
		} else {
			callbacks?.onNoUpdate?.();
			return null;
		}
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "检查更新失败";
		callbacks?.onError?.(errorMessage);
		return null;
	}
};

// 下载并安装更新
export const downloadAndInstallUpdate = async (
	update: Update,
	callbacks?: UpdateCallbacks,
) => {
	try {
		let downloaded = 0;
		let contentLength = 0;

		await update.downloadAndInstall((event) => {
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

		// 注意：在 Windows 上，应用会自动退出并重启
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "下载/安装更新失败";
		callbacks?.onError?.(errorMessage);
	}
};

// 完整的更新流程（检查 + 安装）
export const autoUpdate = async (callbacks?: UpdateCallbacks) => {
	const update = await checkForUpdates(callbacks);
	if (update) {
		await downloadAndInstallUpdate(update, callbacks);
	}
};

// 静默检查更新（应用启动时调用）
export const silentCheckForUpdates = async () => {
	try {
		// 开发环境下可能没有签名，先跳过检查
		if (import.meta.env.DEV) {
			return { hasUpdate: false };
		}

		const update = await check();
		if (update) {
			// 可以存储到状态管理中，在适当时候提醒用户
			return {
				hasUpdate: true,
				version: update.version,
				body: update.body,
				date: update.date,
			};
		}
		return { hasUpdate: false };
	} catch (error) {
		// 如果是签名相关错误，在开发环境下忽略
		if (error instanceof Error && error.message.includes("signature")) {
			console.warn("签名验证失败，可能是因为发布版本还未包含签名文件");
		}
		return { hasUpdate: false };
	}
};

export default checkForUpdates;
