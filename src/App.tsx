import "./App.css";
import "@/providers/i18n";
import Box from "@mui/material/Box";
import { isTauri } from "@tauri-apps/api/core";
import { SnackbarProvider } from "notistack";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router-dom";
import { InstallRequestHandler } from "@/components/InstallRequestHandler";
import { ThemeBackgroundLayer } from "@/components/ThemeBackgroundLayer";
import WindowsHandler from "@/components/Windows";
import { appRoutes } from "@/providers/router"; // 引入新的统一配置
import { SnackbarUtilsConfigurator } from "@/providers/snackBar";
import { ToolpadReactRouterAppProvider } from "@/providers/ToolpadReactRouterAppProvider";
import { initBgmAuthRefresh } from "@/services/bgmAuthSession";

const App: React.FC = () => {
	const { t } = useTranslation();

	useEffect(() => {
		void initBgmAuthRefresh();
	}, []);

	// 从路由配置动态生成导航菜单
	const Navigation = appRoutes
		.filter((route) => !route.hideInMenu) // 过滤掉标记为隐藏的路由
		.map((route) => ({
			segment: route.path,
			title: t(route.title), // 使用 t 函数翻译标题
			icon: route.icon,
			pattern: route.navPattern, // 使用 navPattern
		}));

	return (
		<SnackbarProvider
			maxSnack={3}
			autoHideDuration={3000}
			anchorOrigin={{ vertical: "top", horizontal: "center" }}
		>
			<SnackbarUtilsConfigurator />
				<ToolpadReactRouterAppProvider navigation={Navigation}>
					<ThemeBackgroundLayer />
					<Box sx={{ position: "relative", zIndex: 1, minHeight: "100vh" }}>
						{isTauri() && <WindowsHandler />}
						{isTauri() && <InstallRequestHandler />}
						<Outlet />
					</Box>
				</ToolpadReactRouterAppProvider>
		</SnackbarProvider>
	);
};

export default App;
