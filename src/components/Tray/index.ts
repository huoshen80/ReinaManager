import { version } from "@pkg";
import { defaultWindowIcon } from "@tauri-apps/api/app";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import type { TrayIconEvent } from "@tauri-apps/api/tray";
import { TrayIcon } from "@tauri-apps/api/tray";
import { getCurrentWindow } from "@tauri-apps/api/window";
import i18n from "i18next";

let trayInstance: TrayIcon | null = null;

/**
 * 更新托盘菜单语言
 */
export const updateTrayLanguage = async () => {
	if (!trayInstance) return;

	try {
		// 创建新的退出菜单项，使用新的语言
		const quitItem = await MenuItem.new({
			id: "exit",
			text: i18n.t("components.Tray.exit"),
			action: async () => {
				console.log("Exiting application...");
				const window = getCurrentWindow();
				await window.destroy();
			},
		});

		// 更新菜单
		const menu = await Menu.new({
			items: [quitItem],
		});

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
		// 创建退出菜单项
		const quitItem = await MenuItem.new({
			id: "exit",
			text: i18n.t("components.Tray.exit"),
			action: async () => {
				console.log("Exiting application...");
				const window = getCurrentWindow();
				await window.destroy();
			},
		});
		const openItem = await MenuItem.new({
			id: "open",
			text: i18n.t("components.Tray.open"),
			action: async () => {
				const window = getCurrentWindow();
				try {
					await window.show();
					await window.unminimize();
					await window.setFocus();
				} catch (error) {
					console.error("Failed to open window from tray:", error);
				}
			},
		});
		// 创建菜单
		const menu = await Menu.new({
			items: [openItem, quitItem],
		});

		// 获取默认窗口图标
		const windowIcon = await defaultWindowIcon();
		const tooltipText = `ReinaManager v${version}`;
		// 创建托盘图标
		const tray = await TrayIcon.new({
			id: "main",
			icon: windowIcon ?? undefined,
			tooltip: tooltipText, // 显示软件名和版本号
			menu,
			showMenuOnLeftClick: false, // 左键不显示菜单

			action: async (event: TrayIconEvent) => {
				// 处理托盘图标点击事件
				if (
					event.type === "Click" &&
					event.button === "Left" &&
					event.buttonState === "Up"
				) {
					const window = getCurrentWindow();
					try {
						await window.show();
						await window.unminimize();
						await window.setFocus();
					} catch (error) {
						console.error("Failed to toggle window visibility:", error);
					}
				}
			},
		});

		trayInstance = tray;

		// 监听语言切换事件
		i18n.on("languageChanged", updateTrayLanguage);

		return tray;
	} catch (error) {
		console.error("Failed to initialize tray icon:", error);
		return null;
	}
};
