import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { load } from "@tauri-apps/plugin-store";

export const SETTINGS_STORE_PATH = "settings.json";
export const SILENT_STARTUP_STORE_KEY = "silent_startup";
export const APP_WINDOW_CONTROLS_STORE_KEY = "app_window_controls";
export const LINUX_LAUNCH_COMMAND_STORE_KEY = "linux_launch_command";

const DEFAULT_LINUX_LAUNCH_COMMAND = "wine";
const APP_WINDOW_CONTROLS_ENABLED = false;

export const isAppWindowControlsSupported = () =>
	APP_WINDOW_CONTROLS_ENABLED &&
	isTauri() &&
	import.meta.env.TAURI_ENV_PLATFORM === "linux";

export const loadSettingsStore = () =>
	load(SETTINGS_STORE_PATH, {
		autoSave: false,
		defaults: {
			[SILENT_STARTUP_STORE_KEY]: false,
			[APP_WINDOW_CONTROLS_STORE_KEY]: false,
			[LINUX_LAUNCH_COMMAND_STORE_KEY]: DEFAULT_LINUX_LAUNCH_COMMAND,
		},
	});

export const loadAppWindowControlsSetting = async (): Promise<boolean> => {
	if (!isTauri()) {
		return false;
	}

	const store = await loadSettingsStore();
	const storedValue =
		(await store.get<boolean>(APP_WINDOW_CONTROLS_STORE_KEY)) ?? false;

	if (storedValue) {
		await store.set(APP_WINDOW_CONTROLS_STORE_KEY, false);
		await store.save();
	}

	return false;
};

export const applyAppWindowControlsSetting = async (
	_enabled: boolean,
): Promise<boolean> => {
	if (!isTauri()) {
		return false;
	}

	const currentWindow = getCurrentWindow();
	await currentWindow.setDecorations(true);
	return false;
};
