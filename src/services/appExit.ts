import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask } from "@tauri-apps/plugin-dialog";
import { StateFlags, saveWindowState } from "@tauri-apps/plugin-window-state";
import i18n from "i18next";
import {
	resumeAutoBackupScheduler,
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
let activeTerminationPermit: AppTerminationPermit | null = null;

export type AppTerminationReason = "exit" | "restart" | "update";

export interface AppTerminationPermit {
	readonly id: symbol;
	readonly reason: AppTerminationReason;
}

interface TerminationPreparationOptions {
	runExitBackup: boolean;
}

const getTerminationDialogContent = (
	reason: AppTerminationReason,
	count: number,
) => {
	switch (reason) {
		case "restart":
			return {
				title: i18n.t(
					"components.Window.runningRestartDialog.title",
					"重启提醒",
				),
				message: i18n.t(
					"components.Window.runningRestartDialog.message",
					"当前仍有 {{count}} 个游戏正在运行。重启应用后不会关闭这些游戏，但会丢失游戏时长记录。确定要重启应用吗？",
					{ count },
				),
				confirmLabel: i18n.t(
					"components.Window.runningRestartDialog.restartApp",
					"仍然重启",
				),
			};
		case "update":
			return {
				title: i18n.t(
					"components.Window.runningUpdateDialog.title",
					"更新提醒",
				),
				message: i18n.t(
					"components.Window.runningUpdateDialog.message",
					"当前仍有 {{count}} 个游戏正在运行。安装更新会重启应用，但不会关闭这些游戏，并会丢失游戏时长记录。确定要继续更新吗？",
					{ count },
				),
				confirmLabel: i18n.t(
					"components.Window.runningUpdateDialog.updateApp",
					"仍然更新",
				),
			};
		case "exit":
			return {
				title: i18n.t("components.Window.runningExitDialog.title", "退出提醒"),
				message: i18n.t(
					"components.Window.runningExitDialog.message",
					"当前仍有 {{count}} 个游戏正在运行。退出应用后不会关闭这些游戏，但会丢失游戏时长记录。确定要退出应用吗？",
					{ count },
				),
				confirmLabel: i18n.t(
					"components.Window.runningExitDialog.exitApp",
					"仍然退出",
				),
			};
	}
};

const confirmTerminationIfNeeded = async (
	reason: AppTerminationReason,
): Promise<boolean> => {
	const runningGameCount = getRunningGameCount();

	if (runningGameCount <= 0) {
		return true;
	}
	const content = getTerminationDialogContent(reason, runningGameCount);

	return ask(content.message, {
		title: content.title,
		kind: "warning",
		okLabel: content.confirmLabel,
		cancelLabel: i18n.t("common.cancel", "取消"),
	});
};

export const getRunningGameCount = (): number => {
	return useGamePlayStore.getState().runningGameIds.size;
};

export const requestAppTermination = async (
	reason: AppTerminationReason,
): Promise<AppTerminationPermit | null> => {
	if (activeTerminationPermit) {
		return null;
	}

	const permit: AppTerminationPermit = {
		id: Symbol(reason),
		reason,
	};
	activeTerminationPermit = permit;

	try {
		if (await confirmTerminationIfNeeded(reason)) {
			return permit;
		}
	} catch (error) {
		activeTerminationPermit = null;
		throw error;
	}

	activeTerminationPermit = null;
	return null;
};

export const releaseAppTermination = (
	permit: AppTerminationPermit | null,
): void => {
	if (permit && activeTerminationPermit?.id === permit.id) {
		activeTerminationPermit = null;
	}
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

async function saveCurrentWindowState(): Promise<void> {
	try {
		// 只保存窗口几何和外观，启动显示状态由静默启动设置决定。
		await saveWindowState(WINDOW_STATE_FLAGS);
	} catch (error) {
		console.error("Failed to save window state before exit:", error);
	}
}

export const completeAppTermination = async (
	permit: AppTerminationPermit,
	action: () => Promise<void>,
	options: TerminationPreparationOptions,
): Promise<void> => {
	if (activeTerminationPermit?.id !== permit.id) {
		throw new Error("应用终止许可已失效");
	}

	try {
		suspendAutoBackupScheduler();
		await waitForScheduledAutoBackup();

		if (options.runExitBackup) {
			await runAutoBackupOnExitIfNeeded();
		}

		await saveCurrentWindowState();
		await action();
	} catch (error) {
		resumeAutoBackupScheduler();
		throw error;
	} finally {
		releaseAppTermination(permit);
	}
};

export const restartApp = async (
	permit?: AppTerminationPermit,
): Promise<boolean> => {
	const restartPermit = permit ?? (await requestAppTermination("restart"));
	if (!restartPermit) {
		return false;
	}

	await completeAppTermination(
		restartPermit,
		async () => {
			await invoke("restart_app");
		},
		{ runExitBackup: false },
	);
	return true;
};

export const destroyCurrentWindow = async (): Promise<boolean> => {
	const permit = await requestAppTermination("exit");
	if (!permit) {
		return false;
	}

	await completeAppTermination(
		permit,
		async () => {
			await getCurrentWindow().destroy();
		},
		{ runExitBackup: true },
	);
	return true;
};

export const exitCurrentWindowFromTray = async (): Promise<void> => {
	await destroyCurrentWindow();
};
