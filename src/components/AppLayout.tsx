import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import { Avatar, Link } from "@mui/material";
import AppBar from "@mui/material/AppBar";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import {
	type DashboardHeaderProps,
	DashboardLayout,
} from "@toolpad/core/DashboardLayout";
import { PageContainer } from "@toolpad/core/PageContainer";
import { useMemo } from "react";
import { KeepAlive } from "react-activation";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import AddModal from "@/components/AddModal";
import { SearchBox } from "@/components/SearchBox";
import { Toolbars } from "@/components/Toolbar";

/**
 * 自定义应用标题组件属性类型
 */
interface CustomAppTitleProps {
	isLibraries: boolean;
	currentPath: string;
}

/**
 * 侧边栏底部信息组件
 * @returns {JSX.Element}
 */
function SidebarFooter() {
	return (
		<Typography
			variant="caption"
			className="absolute bottom-0 left-0 right-0 w-full text-center border-t whitespace-nowrap overflow-hidden select-none"
		>
			<Link
				href="https://github.com/huoshen80"
				target="_blank"
				color="textPrimary"
				underline="hover"
			>
				© huoshen80
			</Link>
		</Typography>
	);
}

/**
 * 自定义应用标题组件
 * @param {CustomAppTitleProps} props
 * @returns {JSX.Element}
 */
const CustomAppTitle = ({ isLibraries, currentPath }: CustomAppTitleProps) => {
	const navigate = useNavigate();
	const { t } = useTranslation();
	const canBack = currentPath !== "/";

	return (
		<Stack
			direction="row"
			alignItems="center"
			spacing={2}
			className="select-none"
		>
			<Tooltip title={t("components.AppLayout.back", "返回")} enterDelay={1000}>
				<span>
					<IconButton
						aria-label={t("components.AppLayout.back", "返回")}
						onClick={() => navigate(-1)}
						size="large"
						disabled={!canBack}
					>
						<ArrowBackRoundedIcon />
					</IconButton>
				</span>
			</Tooltip>
			<Avatar
				alt="Reina"
				src="/images/reina.png"
				onDragStart={(event) => event.preventDefault()}
			/>
			<Typography variant="h6">ReinaManager</Typography>
			<Chip size="small" label="BETA" color="info" />
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
	const path = useLocation().pathname;
	const isLibraries = path === "/libraries";
	const AppTitle = useMemo(() => {
		return () => (
			<CustomAppTitle isLibraries={isLibraries} currentPath={path} />
		);
	}, [isLibraries, path]);
	const Header = useMemo(() => {
		return (_props: DashboardHeaderProps) => (
			<AppBar
				color="inherit"
				position="absolute"
				className="print:hidden border-0 border-b border-solid shadow-none"
				sx={{
					borderColor: "divider",
					zIndex: (theme) => theme.zIndex.drawer + 1,
				}}
			>
				<Toolbar
					className="bg-inherit"
					sx={{
						mx: {
							xs: -0.75,
							sm: -1,
						},
					}}
				>
					<Stack
						direction="row"
						justifyContent="space-between"
						alignItems="center"
						className="w-full flex-wrap"
					>
						<AppTitle />
						<Stack
							direction="row"
							alignItems="center"
							spacing={1}
							className="ml-auto"
						>
							<Toolbars />
						</Stack>
					</Stack>
				</Toolbar>
			</AppBar>
		);
	}, [AppTitle]);

	return (
		<>
			<AddModal />
			<DashboardLayout
				slots={{
					header: Header,
					sidebarFooter: SidebarFooter,
				}}
				defaultSidebarCollapsed={true}
			>
				{isLibraries ? (
					<PageContainer className="max-w-full">
						<KeepAlive
							name="libraries"
							cacheKey="libraries"
							saveScrollPosition={false}
						>
							<Outlet />
						</KeepAlive>
					</PageContainer>
				) : (
					<Outlet />
				)}
			</DashboardLayout>
		</>
	);
};
export default Layout;
