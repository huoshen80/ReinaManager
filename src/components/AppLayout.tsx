import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import KeyboardArrowUpRoundedIcon from "@mui/icons-material/KeyboardArrowUpRounded";
import { Avatar, Fab, Fade, Link } from "@mui/material";
import AppBar from "@mui/material/AppBar";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Stack from "@mui/material/Stack";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DashboardLayout } from "@toolpad/core/DashboardLayout";
import { PageContainer } from "@toolpad/core/PageContainer";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import AddModal from "@/components/AddModal";
import { SearchBox } from "@/components/SearchBox";
import { Toolbars } from "@/components/Toolbar";
import { useStore } from "@/store/appStore";
import { saveScrollPosition, scrollToTop } from "@/utils/scroll";

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
 * @returns {JSX.Element}
 */
const CustomAppTitle = () => {
	const navigate = useNavigate();
	const location = useLocation();
	const { t } = useTranslation();
	const isLibraries = location.pathname === "/libraries";

	const handleBack = () => {
		saveScrollPosition(location.pathname);
		navigate(-1);
	};

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
						onClick={handleBack}
						size="large"
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

const WindowControls = () => {
	const [isMaximized, setIsMaximized] = useState(false);

	useEffect(() => {
		if (!isTauri()) return;
		const w = getCurrentWindow();
		w.isMaximized().then(setIsMaximized);
		const unlisten = w.onResized(async () => {
			setIsMaximized(await w.isMaximized());
		});
		return () => {
			unlisten.then((fn) => fn());
		};
	}, []);

	if (!isTauri()) return null;

	const handleMinimize = () => getCurrentWindow().minimize();
	const handleMaximize = () => getCurrentWindow().toggleMaximize();
	const handleClose = () => getCurrentWindow().close();

	return (
		<Stack direction="row" className="h-full items-center pl-2">
			<IconButton
				size="small"
				onClick={handleMinimize}
				aria-label="最小化"
				sx={{ borderRadius: 1, width: 36, height: 36, opacity: 0.8 }}
			>
				<svg
					viewBox="0 0 10 10"
					width="12"
					height="12"
					stroke="currentColor"
					strokeWidth="1"
					aria-hidden="true"
				>
					<path d="M0,5 L10,5" />
				</svg>
			</IconButton>
			<IconButton
				size="small"
				onClick={handleMaximize}
				aria-label={isMaximized ? "还原" : "最大化"}
				sx={{ borderRadius: 1, width: 36, height: 36, opacity: 0.8 }}
			>
				{isMaximized ? (
					<svg
						viewBox="0 0 10 10"
						width="12"
						height="12"
						fill="none"
						stroke="currentColor"
						strokeWidth="1"
						aria-hidden="true"
					>
						<path d="M2,2 L8,2 L8,8 L2,8 Z M3,2 L3,1 L9,1 L9,7 L8,7" />
					</svg>
				) : (
					<svg
						viewBox="0 0 10 10"
						width="12"
						height="12"
						fill="none"
						stroke="currentColor"
						strokeWidth="1"
						aria-hidden="true"
					>
						<path d="M1,1 L9,1 L9,9 L1,9 Z" />
					</svg>
				)}
			</IconButton>
			<IconButton
				size="small"
				onClick={handleClose}
				aria-label="关闭"
				sx={{
					borderRadius: 1,
					width: 36,
					height: 36,
					opacity: 0.8,
					"&:hover": {
						bgcolor: "error.main",
						color: "error.contrastText",
						opacity: 1,
					},
				}}
			>
				<svg
					viewBox="0 0 10 10"
					width="12"
					height="12"
					stroke="currentColor"
					strokeWidth="1"
					aria-hidden="true"
				>
					<path d="M1,1 L9,9 M1,9 L9,1" />
				</svg>
			</IconButton>
		</Stack>
	);
};

const Header = () => {
	const immersiveTitlebar = useStore((state) => state.immersiveTitlebar);

	const handleDrag = (e: React.PointerEvent) => {
		if (immersiveTitlebar && isTauri() && e.buttons === 1) {
			const target = e.target as HTMLElement;
			if (target.closest('button, input, a, [role="button"], .MuiInputBase-root')) return;
			getCurrentWindow().startDragging().catch(console.error);
		}
	};

	return (
		<AppBar
			color="inherit"
			position="absolute"
			className="print:hidden border-0 border-b border-solid shadow-none"
			sx={{
				borderColor: "divider",
				zIndex: (theme) => theme.zIndex.drawer + 1,
			}}
			onPointerDown={handleDrag}
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
					<CustomAppTitle />
					<Stack
						direction="row"
						alignItems="center"
						spacing={1}
						className="ml-auto"
					>
						<Toolbars />
						{immersiveTitlebar && isTauri() && <WindowControls />}
					</Stack>
				</Stack>
			</Toolbar>
		</AppBar>
	);
};

const BackToTopButton = () => {
	const { t } = useTranslation();
	const location = useLocation();
	const [visible, setVisible] = useState(false);

	useEffect(() => {
		const container = document.querySelector<HTMLElement>("main");
		if (!container) return;

		const updateVisible = () => {
			setVisible(container.scrollTop > 320);
		};

		updateVisible();
		container.addEventListener("scroll", updateVisible, { passive: true });

		return () => {
			container.removeEventListener("scroll", updateVisible);
		};
	}, []);

	const label = t("components.AppLayout.backToTop", "返回顶部");

	return (
		<Fade in={visible} unmountOnExit>
			<Tooltip title={label} enterDelay={1000}>
				<Fab
					color="primary"
					size="small"
					aria-label={label}
					className="print:hidden"
					onClick={() => scrollToTop(location.pathname)}
					sx={{
						position: "fixed",
						right: { xs: 16, sm: 24 },
						bottom: { xs: 16, sm: 24 },
						zIndex: 40,
					}}
				>
					<KeyboardArrowUpRoundedIcon />
				</Fab>
			</Tooltip>
		</Fade>
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
	const location = useLocation();
	const isLibraries = location.pathname === "/libraries";

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
					<PageContainer
						className="max-w-full"
						sx={{
							"& > .MuiStack-root > :not(style) ~ :not(style)": {
								mt: "0 !important",
							},
						}}
					>
						<Outlet />
					</PageContainer>
				) : (
					<Outlet />
				)}
				<BackToTopButton />
			</DashboardLayout>
		</>
	);
};
export default Layout;
