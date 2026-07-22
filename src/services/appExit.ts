import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask } from "@tauri-apps/plugin-dialog";
import { StateFlags, saveWindowState } from "@tauri-apps/plugin-window-state";
import i18n from "i18next";
import { createAutoBackup } from "@/services/fs/dataMaintenance";
import { useStore } from "@/store/appStore";
import { useGamePlayStore } from "@/store/gamePlayStore";
import { toError } from "@/utils/errors";

const HOUR_MS = 60 * 60 * 1000;
let exitAutoBackupPromise: Promise<void> | null = null;

const confirmTrayExitIfNeeded = async (): Promise<boolean> => {
	const runningGameCount = getRunningGameCount();

	if (runningGameCount <= 0) {
		return true;
	}

	return ask(
		i18n.t(
			"components.Window.runningExitDialog.message",
			"当前仍有 {{count}} 个游戏正在运行。退出应用后不会关闭这些游戏，但会丢失游戏时长记录。确定要退出应用吗？",
			{
				count: runningGameCount,
			},
		),
		{
			title: i18n.t("components.Window.runningExitDialog.title", "退出提醒"),
			kind: "warning",
			okLabel: i18n.t(
				"components.Window.runningExitDialog.exitApp",
				"仍然退出",
			),
			cancelLabel: i18n.t("common.cancel", "取消"),
		},
	);
};

export const getRunningGameCount = (): number => {
	return useGamePlayStore.getState().runningGameIds.size;
};

export const restartApp = async (): Promise<void> => {
	await invoke("restart_app");
};

function shouldRunAutoBackupOnExit(): boolean {
	const {
		autoBackupLastSuccessAt,
		autoBackupMinIntervalHours,
		autoBackupOnExit,
	} = useStore.getState();

	if (!autoBackupOnExit) {
		return false;
	}

	if (autoBackupMinIntervalHours <= 0) {
		return true;
	}

	if (!autoBackupLastSuccessAt) {
		return true;
	}

	return (
		Date.now() - autoBackupLastSuccessAt >= autoBackupMinIntervalHours * HOUR_MS
	);
}

async function runAutoBackupOnExitIfNeeded(): Promise<void> {
	if (!shouldRunAutoBackupOnExit()) {
		return;
	}

	if (exitAutoBackupPromise) {
		return exitAutoBackupPromise;
	}

	exitAutoBackupPromise = (async () => {
		const { autoBackupIncludeCovers, autoBackupRetentionCount } =
			useStore.getState();

		try {
			await createAutoBackup(autoBackupIncludeCovers, autoBackupRetentionCount);
			useStore.getState().setAutoBackupLastResult(Date.now(), null);
		} catch (error) {
			const message = toError(error, "自动备份失败").message;
			console.error("退出时自动备份失败:", error);
			useStore.getState().setAutoBackupLastResult(null, message);
		} finally {
			exitAutoBackupPromise = null;
		}
	})();

	return exitAutoBackupPromise;
}

export const destroyCurrentWindow = async (): Promise<void> => {
	await runAutoBackupOnExitIfNeeded();

	try {
		// 统一在销毁前手动保存窗口状态，避免依赖 CloseRequested 的自动缓存刷新。
		await saveWindowState(StateFlags.ALL);
	} catch (error) {
		console.error("Failed to save window state before exit:", error);
	}

	await getCurrentWindow().destroy();
};

export const exitCurrentWindowFromTray = async (): Promise<void> => {
	if (await confirmTrayExitIfNeeded()) {
		await destroyCurrentWindow();
	}
};
