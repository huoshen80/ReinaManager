/**
 * @file main.tsx
 * @description 应用入口文件，初始化全局状态，设置全局事件监听，挂载根组件。
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * Emotion 缓存配置:
 * - 使用官方推荐的 CacheProvider + prepend: true 方案
 * - 确保 MUI 的 Emotion 样式被正确注入到 <head> 的开头
 * - 防止后来加载的样式(如 @mui/x-charts)覆盖 MUI 基础样式
 */

import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { routers } from "@/routes";
import "virtual:uno.css";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { initTray } from "@/components/Tray";
import { queryClient } from "@/lib/queryClient";
import { initPathCache } from "@/utils";
import { initializeStores } from "./store";

// 创建 Emotion 缓存,确保样式注入顺序正确
// 根据官方文档: https://github.com/mui/material-ui/blob/master/docs/data/material/integrations/interoperability/interoperability.md
// prepend: true 会让 Emotion 的 <style> 标签插入到 <head> 的开头
// 这确保了 MUI 的基础样式优先级高于后来动态加载的组件样式(如 @mui/x-charts)
const emotionCache = createCache({
	key: "mui",
	prepend: true,
});

// 禁止拖拽、右键菜单和部分快捷键，提升桌面体验
document.addEventListener("drop", (e) => e.preventDefault());
document.addEventListener("dragover", (e) => e.preventDefault());
document.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("keydown", (e) => {
	if (["F3", "F5", "F7"].includes(e.key.toUpperCase())) {
		e.preventDefault();
	}

	if (
		e.ctrlKey &&
		["r", "u", "p", "l", "j", "g", "f", "s"].includes(e.key.toLowerCase())
	) {
		e.preventDefault();
	}
});

// 初始化全局状态后，挂载 React 应用
initializeStores().then(async () => {
	await initTray();

	// 初始化所有路径缓存（包括便携模式判断和数据库配置读取）
	try {
		await initPathCache();
	} catch (error) {
		console.error("路径缓存初始化失败:", error);
	}

	createRoot(document.getElementById("root") as HTMLElement).render(
		<StrictMode>
			<CacheProvider value={emotionCache}>
				<QueryClientProvider client={queryClient}>
					<ReactQueryDevtools initialIsOpen={false} />
					<RouterProvider router={routers} />
				</QueryClientProvider>
			</CacheProvider>
		</StrictMode>,
	);
});
