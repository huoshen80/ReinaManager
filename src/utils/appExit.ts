import { getCurrentWindow } from "@tauri-apps/api/window";
import { ask } from "@tauri-apps/plugin-dialog";
import i18n from "i18next";
import { useGamePlayStore } from "@/store/gamePlayStore";

const confirmTrayExitIfNeeded = async (): Promise<boolean> => {
	const runningGameCount = getRunningGameCount();

	if (runningGameCount <= 0) {
		return true;
	}

	return ask(
		i18n.t("components.Window.runningExitDialog.message", {
			count: runningGameCount,
		}),
		{
			title: i18n.t("components.Window.runningExitDialog.title"),
			kind: "warning",
			okLabel: i18n.t("components.Window.runningExitDialog.exitApp"),
			cancelLabel: i18n.t("common.cancel"),
		},
	);
};

export const getRunningGameCount = (): number => {
	return useGamePlayStore.getState().runningGameIds.size;
};

export const destroyCurrentWindow = async (): Promise<void> => {
	await getCurrentWindow().destroy();
};

export const exitCurrentWindowFromTray = async (): Promise<void> => {
	if (await confirmTrayExitIfNeeded()) {
		await destroyCurrentWindow();
	}
};
