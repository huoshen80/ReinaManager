import "./App.css";
import "@/utils/i18n";
import { SnackbarProvider } from "notistack";
import { useTranslation } from "react-i18next";
import { Outlet } from "react-router-dom";
import WindowsHandler from "@/components/Windows";
import { SnackbarUtilsConfigurator } from "@/providers/snackBar";
import { ToolpadReactRouterAppProvider } from "@/providers/ToolpadReactRouterAppProvider";
import { appRoutes } from "@/routes/router"; // 引入新的统一配置

const App: React.FC = () => {
	const { t } = useTranslation();

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
				<WindowsHandler />
				<Outlet />
			</ToolpadReactRouterAppProvider>
		</SnackbarProvider>
	);
};

export default App;
