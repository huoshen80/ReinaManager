/**
 * @file Layout 组件
 * @description 应用主布局组件，集成侧边栏、顶部工具栏、页面容器等，支持自定义标题、国际化和响应式布局。
 * @module src/components/Layout/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - Layout：应用主布局组件
 *
 * 依赖：
 * - @mui/material
 * - @toolpad/core
 * - @toolpad/core/DashboardLayout
 * - @/components/Toolbar
 * - @/components/SearchBox
 * - react-router
 * - react-i18next
 */

import { Avatar } from "@mui/material";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import type { NavigationPageItem } from "@toolpad/core/AppProvider";
import {
	DashboardLayout,
	DashboardSidebarPageItem,
	type SidebarFooterProps,
} from "@toolpad/core/DashboardLayout";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useOutlet } from "react-router-dom";
import { SearchBox } from "@/components/SearchBox";
import { Toolbars } from "@/components/Toolbar";
import { LinkWithScrollSave } from "../LinkWithScrollSave";

/**
 * 自定义应用标题组件属性类型
 */
interface CustomAppTitleProps {
	isLibraries: boolean;
}

/**
 * 侧边栏底部信息组件
 * @param {SidebarFooterProps} props
 * @returns {JSX.Element}
 */
function SidebarFooter({ mini }: SidebarFooterProps) {
	return (
		<Typography
			variant="caption"
			className="absolute bottom-0 left-0 right-0 w-full text-center border-t whitespace-nowrap overflow-hidden select-none"
		>
			{mini
				? `© ${new Date().getFullYear()}`
				: `© ${new Date().getFullYear()} Made by huoshen80`}
		</Typography>
	);
}

/**
 * 自定义应用标题组件
 * @param {CustomAppTitleProps} props
 * @returns {JSX.Element}
 */
const CustomAppTitle = ({ isLibraries }: CustomAppTitleProps) => {
	return (
		<Stack
			direction="row"
			alignItems="center"
			spacing={2}
			className="select-none"
		>
			<Avatar
				alt="Reina"
				src="/images/reina.png"
				onDragStart={(event) => event.preventDefault()}
			/>
			<Typography variant="h6">ReinaManager</Typography>
			<Chip size="small" label="BETA" color="primary" />
			{isLibraries && <SearchBox />}
		</Stack>
	);
};

/**
 * 应用主布局组件
 * 集成侧边栏、顶部工具栏、页面容器等，支持自定义标题、国际化和响应式布局。
 *
 * @component
 * @returns {JSX.Element} 应用主布局
 */
export const Layout: React.FC = () => {
	const { i18n } = useTranslation();
	const isja_JP = i18n.language === "ja-JP";
	const path = useLocation().pathname;
	const outlet = useOutlet();
	const isLibraries = path === "/libraries";
	const AppTitle = useMemo(() => {
		return () => <CustomAppTitle isLibraries={isLibraries} />;
	}, [isLibraries]);

	const handleRenderPageItem = useCallback((item: NavigationPageItem) => {
		const to = `/${item.segment || ""}`;
		// 外层不渲染 <a>，而是使用可访问的 span 进行编程式导航，
		// 在导航前 LinkWithScrollSave 会保存滚动位置，避免嵌套 <a>。
		return (
			<LinkWithScrollSave
				to={to}
				style={{ textDecoration: "none", color: "inherit" }}
			>
				<DashboardSidebarPageItem item={item} />
			</LinkWithScrollSave>
		);
	}, []);

	return (
		<DashboardLayout
			slots={{
				appTitle: AppTitle,
				toolbarActions: Toolbars,
				sidebarFooter: SidebarFooter,
			}}
			sidebarExpandedWidth={isja_JP ? 250 : 220}
			defaultSidebarCollapsed={true}
			renderPageItem={handleRenderPageItem}
		>
			<AnimatePresence mode="wait">
				<motion.div
					key={path}
					initial={{ opacity: 0, y: 15 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -15 }}
					transition={{ duration: 0.25, ease: "easeInOut" }}
					style={{ width: "100%", height: "100%" }}
				>
					{outlet}
				</motion.div>
			</AnimatePresence>
		</DashboardLayout>
	);
};
export default Layout;
