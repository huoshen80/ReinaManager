import CategoryIcon from "@mui/icons-material/Category";
import GamesIcon from "@mui/icons-material/Games";
import HomeIcon from "@mui/icons-material/Home";
import SettingsIcon from "@mui/icons-material/Settings";
import { Box, CircularProgress } from "@mui/material";
import React, { lazy, Suspense } from "react";
import { createHashRouter, type RouteObject } from "react-router-dom";
import App from "@/App";
import Layout from "@/components/Layout";

// 使用 React.lazy 懒加载页面组件
const Home = lazy(() =>
	import("@/pages/Home/").then((module) => ({ default: module.Home })),
);
const Libraries = lazy(() =>
	import("@/pages/Libraries").then((module) => ({ default: module.Libraries })),
);
const Detail = lazy(() =>
	import("@/pages/Detail").then((module) => ({ default: module.Detail })),
);
const Collection = lazy(() =>
	import("@/pages/Collection").then((module) => ({
		default: module.Collection,
	})),
);
const Settings = lazy(() =>
	import("@/pages/Settings").then((module) => ({ default: module.Settings })),
);

// 加载指示器组件
const PageLoader = () => (
	<Box
		display="flex"
		justifyContent="center"
		alignItems="center"
		minHeight="50vh"
	>
		<CircularProgress />
	</Box>
);

export interface AppRoute {
	// 路由路径
	path: string;
	// 页面组件
	component: React.ComponentType;
	// 页面标题 (用于导航菜单, 建议使用 i18n key)
	title: string;
	// 导航菜单图标
	icon?: React.ReactNode;
	// 是否在导航菜单中隐藏
	hideInMenu?: boolean;
	// 子路由
	children?: AppRoute[];
	// 是否为索引路由 (index route)
	index?: boolean;
	// 用于导航匹配的特殊 pattern (对应 @toolpad/core 的 pattern 属性)
	navPattern?: string;
}

// 统一的路由配置数组
export const appRoutes: AppRoute[] = [
	{
		path: "",
		title: "app.NAVIGATION.home", // 使用 i18n key
		component: Home,
		icon: <HomeIcon />,
	},
	{
		path: "libraries",
		title: "app.NAVIGATION.gameLibrary",
		icon: <GamesIcon />,
		navPattern: "libraries/:id",
		component: Libraries,
	},
	{
		path: "libraries/:id",
		title: "Game Detail",
		component: Detail,
		hideInMenu: true, // 详情页，不在侧边栏显示
	},
	{
		path: "collection",
		title: "app.NAVIGATION.collection",
		icon: <CategoryIcon />,
		component: Collection,
	},
	{
		path: "settings",
		title: "app.NAVIGATION.settings",
		component: Settings,
		icon: <SettingsIcon />,
	},
];

const buildRouterObjects = (routes: AppRoute[]): RouteObject[] => {
	return routes.map((route) => {
		// 如果是索引路由 (Index Route)
		if (route.index) {
			return {
				index: true,
				element: (
					<Suspense fallback={<PageLoader />}>
						{React.createElement(route.component)}
					</Suspense>
				),
				// 索引路由不能有 path 或 children
			};
		}

		// 否则，是非索引路由 (Path Route)
		return {
			path: route.path,
			element: (
				<Suspense fallback={<PageLoader />}>
					{React.createElement(route.component)}
				</Suspense>
			),
			children: route.children ? buildRouterObjects(route.children) : undefined,
			// 非索引路由的 index 属性不能为 true
		};
	});
};

// 顶层路由配置
const routeConfig: RouteObject[] = [
	{
		Component: App,
		children: [
			{
				path: "/",
				Component: Layout,
				children: buildRouterObjects(appRoutes), // 直接使用转换后的配置
			},
		],
	},
];

/**
 * routers 路由对象
 */
export const routers = createHashRouter(routeConfig);
