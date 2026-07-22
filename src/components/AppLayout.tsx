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
import { DashboardLayout } from "@toolpad/core/DashboardLayout";
import { PageContainer } from "@toolpad/core/PageContainer";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import AddModal from "@/components/AddModal";
import { SearchBox } from "@/components/SearchBox";
import { Toolbars } from "@/components/Toolbar";
import {
	saveScrollPosition,
	scrollToTop,
	setScrollPosition,
} from "@/hooks/common/useScrollRestore";
import { useGameIndex } from "@/hooks/features/games/useGameListFacade";
import { type SelectedCategory, useStore } from "@/store/appStore";
import { DefaultGroup } from "@/types/collection";
import { getDeveloperCategoryGameIds } from "@/utils/game/gameIndex";

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

function DeveloperGameSearchBox({ categoryKey }: { categoryKey: string }) {
	const { index: gameIndex } = useGameIndex();
	const developerGameIds = getDeveloperCategoryGameIds(categoryKey, gameIndex);

	return <SearchBox scopeGameIds={developerGameIds} applyNsfwFilter={false} />;
}

type CollectionEntitySearchKind = "groups" | "categories" | "developers";

type CollectionTitleMode =
	| {
			type: "entity-search";
			kind: CollectionEntitySearchKind;
			scrollKey: string;
	  }
	| { type: "developer-game-search"; categoryKey: string }
	| { type: "none" };

function getCollectionTitleMode(
	pathname: string,
	currentGroupId: string | null,
	selectedCategory: SelectedCategory,
): CollectionTitleMode {
	if (pathname !== "/collection") {
		return { type: "none" };
	}

	if (
		currentGroupId === DefaultGroup.DEVELOPER &&
		selectedCategory?.type === "developer"
	) {
		return {
			type: "developer-game-search",
			categoryKey: selectedCategory.key,
		};
	}

	if (selectedCategory !== null) {
		return { type: "none" };
	}

	switch (currentGroupId) {
		case null:
			return { type: "entity-search", kind: "groups", scrollKey: "groups" };
		case DefaultGroup.DEVELOPER:
			return {
				type: "entity-search",
				kind: "developers",
				scrollKey: `categories:${DefaultGroup.DEVELOPER}`,
			};
		default:
			return currentGroupId.startsWith("default_")
				? { type: "none" }
				: {
						type: "entity-search",
						kind: "categories",
						scrollKey: `categories:${currentGroupId}`,
					};
	}
}

interface CollectionEntitySearchBoxProps {
	kind: CollectionEntitySearchKind;
	scrollKey: string;
}

function CollectionEntitySearchBox({
	kind,
	scrollKey,
}: CollectionEntitySearchBoxProps) {
	const { t } = useTranslation();
	const value = useStore((state) => {
		switch (kind) {
			case "groups":
				return state.collectionGroupSearch;
			case "categories":
				return state.collectionCategorySearch;
			case "developers":
				return state.developerCategorySearch;
		}
	});
	const setValue = useStore((state) => {
		switch (kind) {
			case "groups":
				return state.setCollectionGroupSearch;
			case "categories":
				return state.setCollectionCategorySearch;
			case "developers":
				return state.setDeveloperCategorySearch;
		}
	});
	const ariaLabel = (() => {
		switch (kind) {
			case "groups":
				return t("pages.Collection.entitySearch.groups", "搜索分组");
			case "categories":
				return t("pages.Collection.entitySearch.categories", "搜索分类");
			case "developers":
				return t("pages.Collection.developerSearch.label", "搜索开发商");
		}
	})();

	const handleValueChange = (nextValue: string) => {
		setScrollPosition(scrollKey, 0);
		document.querySelector<HTMLElement>("main")?.scrollTo({ top: 0 });
		setValue(nextValue);
	};

	return (
		<SearchBox
			mode="controlled"
			value={value}
			onValueChange={handleValueChange}
			ariaLabel={ariaLabel}
		/>
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
	const currentGroupId = useStore((state) => state.currentGroupId);
	const selectedCategory = useStore((state) => state.selectedCategory);
	const collectionTitleMode = getCollectionTitleMode(
		location.pathname,
		currentGroupId,
		selectedCategory,
	);

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
			{isLibraries ? (
				<SearchBox />
			) : collectionTitleMode.type === "entity-search" ? (
				<CollectionEntitySearchBox
					kind={collectionTitleMode.kind}
					scrollKey={collectionTitleMode.scrollKey}
				/>
			) : collectionTitleMode.type === "developer-game-search" ? (
				<DeveloperGameSearchBox categoryKey={collectionTitleMode.categoryKey} />
			) : null}
		</Stack>
	);
};

const Header = () => (
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
				<CustomAppTitle />
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
