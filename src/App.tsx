import "./App.css";
import "@/utils/i18n";
import type { Navigation } from "@toolpad/core/AppProvider";
import { ReactRouterAppProvider } from "@toolpad/core/react-router";
import { SnackbarProvider } from "notistack";
import { AliveScope } from "react-activation";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router-dom";
import { SnackbarUtilsConfigurator } from "@/components/Snackbar";
import WindowsHandler from "@/components/Window";
import { appRoutes } from "@/routes"; // 引入新的统一配置

const App: React.FC = () => {
	const { t } = useTranslation();

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
			<ReactRouterAppProvider navigation={NAVIGATION}>
				<WindowsHandler />
				<AliveScope>
					<Outlet />
				</AliveScope>
			</ReactRouterAppProvider>
		</SnackbarProvider>
	);
};

export default App;
