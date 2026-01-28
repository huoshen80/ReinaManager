import "./App.css";
import "@/utils/i18n";
import { isTauri } from "@tauri-apps/api/core";
import { useMediaQuery } from "@mui/material";
import type { Navigation } from "@toolpad/core/AppProvider";
import { ReactRouterAppProvider } from "@toolpad/core/react-router";
import { SnackbarProvider } from "notistack";
import { AliveScope } from "react-activation";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router-dom";
import { SnackbarUtilsConfigurator } from "@/components/Snackbar";
import WindowsHandler from "@/components/Window";
import { useMemo } from "react";
import { useStore } from "@/store";
import { createAppTheme } from "@/theme";
import { appRoutes } from "@/routes"; // 引入新的统一配置

const App: React.FC = () => {
	const { t } = useTranslation();
	const themeMode = useStore((s) => s.themeMode);
	const themeColor = useStore((s) => s.themeColor);
	const themeStyle = useStore((s) => s.themeStyle);

	// 检测系统亮暗模式
	const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");

	const theme = useMemo(() => {
		// 计算实际应该使用的模式
		const effectiveMode =
			themeMode === "system"
				? prefersDarkMode
					? "dark"
					: "light"
				: themeMode;

		return createAppTheme(effectiveMode, themeColor, themeStyle);
	}, [themeMode, themeColor, themeStyle, prefersDarkMode]);

	// 从路由配置动态生成导航菜单
	const generatedNavigation = appRoutes
		.filter((route) => !route.hideInMenu) // 过滤掉标记为隐藏的路由
		.map((route) => ({
			segment: route.path,
			title: t(route.title), // 使用 t 函数翻译标题
			icon: route.icon,
			pattern: route.navPattern, // 使用 navPattern
		}));

	// 最终的导航配置
	const NAVIGATION: Navigation = [
		{
			kind: "header",
			title: t("app.NAVIGATION.menu"),
		},
		...generatedNavigation,
	];

	return (
		<SnackbarProvider
			maxSnack={3}
			autoHideDuration={3000}
			anchorOrigin={{ vertical: "top", horizontal: "center" }}
		>
			<SnackbarUtilsConfigurator />
			<ReactRouterAppProvider navigation={NAVIGATION} theme={theme}>
				{isTauri() && <WindowsHandler />}
				<AliveScope>
					<Outlet />
				</AliveScope>
			</ReactRouterAppProvider>
		</SnackbarProvider>
	);
};

export default App;
