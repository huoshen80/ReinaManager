import { version } from "@pkg";
import { defaultWindowIcon } from "@tauri-apps/api/app";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import type { TrayIconEvent } from "@tauri-apps/api/tray";
import { TrayIcon } from "@tauri-apps/api/tray";
import { getCurrentWindow } from "@tauri-apps/api/window";
import i18n from "i18next";
import { exitCurrentWindowFromTray } from "@/utils/appExit";

let trayInstance: TrayIcon | null = null;

const showUI = async () => {
	const window = getCurrentWindow();
	try {
		await window.show();
		await window.unminimize();
		await window.setFocus();
	} catch (error) {
		console.error("Failed to show window:", error);
	}
};

const createTrayMenu = async () => {
	// 1. 创建“打开”菜单项
	const openItem = await MenuItem.new({
		id: "open",
		text: i18n.t("components.Tray.open"),
		action: async () => {
			await showUI();
		},
	});

	// 2. 创建“退出”菜单项
	const quitItem = await MenuItem.new({
		id: "exit",
		text: i18n.t("components.Tray.exit"),
		action: async () => {
			console.log("Exiting application...");
			await exitCurrentWindowFromTray();
		},
	});

	// 3. 组合成菜单
	return await Menu.new({
		items: [openItem, quitItem],
	});
};

/**
 * 更新托盘菜单语言
 */
export const updateTrayLanguage = async () => {
	if (!trayInstance) return;
	try {
		const menu = await createTrayMenu();
		await trayInstance.setMenu(menu);
	} catch (error) {
		console.error("Failed to update tray menu:", error);
	}
};

/**
 * 创建并初始化托盘图标
 */
export const initTray = async () => {
	try {
		const menu = await createTrayMenu();
		const windowIcon = await defaultWindowIcon();
		const tooltipText = `ReinaManager v${version}`;

		const tray = await TrayIcon.new({
			id: "main",
			icon: windowIcon ?? undefined,
			tooltip: tooltipText, // 显示软件名和版本号
			menu,
			showMenuOnLeftClick: false, // 左键不显示菜单

			action: async (event: TrayIconEvent) => {
				if (
					event.type === "Click" &&
					event.button === "Left" &&
					event.buttonState === "Up"
				)
					await showUI();
			},
		});

		trayInstance = tray;
		i18n.off("languageChanged", updateTrayLanguage); // 避免重复监听
		i18n.on("languageChanged", updateTrayLanguage);

		return tray;
	} catch (error) {
		console.error("Failed to initialize tray icon:", error);
		return null;
	}
};
