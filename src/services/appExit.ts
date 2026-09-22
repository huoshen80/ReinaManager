import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask } from "@tauri-apps/plugin-dialog";
import { StateFlags, saveWindowState } from "@tauri-apps/plugin-window-state";
import i18n from "i18next";
import {
	suspendAutoBackupScheduler,
	waitForScheduledAutoBackup,
} from "@/services/autoBackupScheduler";
import { createAutoBackup } from "@/services/fs/dataMaintenance";
import { useStore } from "@/store/appStore";
import { useGamePlayStore } from "@/store/gamePlayStore";
import { toError } from "@/utils/errors";

const HOUR_MS = 60 * 60 * 1000;
const WINDOW_STATE_FLAGS =
	StateFlags.SIZE |
	StateFlags.POSITION |
	StateFlags.MAXIMIZED |
	StateFlags.DECORATIONS |
	StateFlags.FULLSCREEN;
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
	suspendAutoBackupScheduler();
	await waitForScheduledAutoBackup();
	await invoke("restart_app");
};

function shouldRunAutoBackupOnExit(): boolean {
	const {
		autoBackupLastSuccessAt,
		autoBackupOnExit,
		exitBackupMinIntervalHours,
	} = useStore.getState();

	if (!autoBackupOnExit) {
		return false;
	}

	if (exitBackupMinIntervalHours <= 0) {
		return true;
	}

	if (!autoBackupLastSuccessAt) {
		return true;
	}

	return (
		Date.now() - autoBackupLastSuccessAt >= exitBackupMinIntervalHours * HOUR_MS
	);
}

async function runAutoBackupOnExitIfNeeded(): Promise<void> {
	suspendAutoBackupScheduler();
	await waitForScheduledAutoBackup();

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
			const result = await createAutoBackup(
				"exit",
				autoBackupIncludeCovers,
				autoBackupRetentionCount,
			);
			const warning =
				result.warnings.length > 0 ? result.warnings.join("；") : null;
			useStore.getState().setAutoBackupLastResult(Date.now(), warning);
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
		// 只保存窗口几何和外观，启动显示状态由静默启动设置决定。
		await saveWindowState(WINDOW_STATE_FLAGS);
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
