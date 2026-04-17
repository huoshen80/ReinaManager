/**
 * @file Toolbar 组件与工具函数
 * @description 提供应用主界面顶部工具栏、按钮组、弹窗控制等功能，支持添加、排序、筛选、启动、删除、编辑、外链等操作，适配不同页面，集成国际化
 * @module src/components/Toolbar/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - Toolbars：主工具栏组件
 * - Buttongroup：按钮组组件（根据页面类型切换）
 * - Group：分组选择组件
 * - useModal：通用弹窗控制 Hook
 * - ToLibraries：返回游戏库按钮
 * - DeleteModal：删除游戏弹窗
 *
 * 依赖：
 * - @mui/material
 * - @mui/icons-material
 * - @toolpad/core/DashboardLayout
 * - @/components/AddModal
 * - @/components/SortModal
 * - @/components/FilterModal
 * - @/components/LaunchModal
 * - @/components/AlertBox
 * - @/store
 * - @/utils
 * - react-router
 * - react-i18next
 * - @tauri-apps/api/core
 */

import AddIcon from "@mui/icons-material/Add";
import BrightnessAutoIcon from "@mui/icons-material/BrightnessAuto";
import CloseIcon from "@mui/icons-material/Close";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import DeleteIcon from "@mui/icons-material/Delete";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import LightModeIcon from "@mui/icons-material/LightMode";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import TurnRightIcon from "@mui/icons-material/TurnRight";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import { useColorScheme } from "@mui/material/styles";
import Tooltip from "@mui/material/Tooltip";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openurl } from "@tauri-apps/plugin-shell";
import type { MouseEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { AlertConfirmBox } from "@/components/AlertBox";
import { FilterModal } from "@/components/FilterModal";
import { LaunchModal } from "@/components/LaunchModal";
import { PathSettingsModal } from "@/components/PathSettingsModal";
import { PlayStatusSubmenu } from "@/components/RightMenu/PlayStatusSubmenu";
import SortModal from "@/components/SortModal";
import {
	useGetGameById,
	useSelectedGame,
} from "@/hooks/features/games/useGameFacade";
import { useGameStatusActions } from "@/hooks/features/games/useGameStatusActions";
import { useDeleteGame, useUpdateGame } from "@/hooks/queries/useGames";
import { useAllSettings } from "@/hooks/queries/useSettings";
import { snackbar } from "@/providers/snackBar";
import { useStore } from "@/store/appStore";
import type { HanleGamesProps, SourceType } from "@/types";
import type { PlayStatus } from "@/types/collection";
import { handleOpenFolder } from "@/utils/appUtils";
import { CollectionToolbar } from "./Collection";

type ThemeMode = "light" | "dark" | "system";

const SOURCE_ICON_URLS: Record<SourceType, string> = {
	bgm: "https://bgm.tv/img/favicon.ico",
	kun: "https://www.kungal.com/favicon.ico",
	vndb: "https://vndb.org/favicon.ico",
	ymgal: "https://www.ymgal.games/favicon.ico",
};

const SourceLinkIcon = ({ source }: { source: SourceType }) => {
	const [failed, setFailed] = useState(false);

	if (failed) {
		return <CloseIcon fontSize="small" sx={{ color: "error.main" }} />;
	}

	return (
		<Box
			component="img"
			src={SOURCE_ICON_URLS[source]}
			alt={`${source} favicon`}
			onError={() => setFailed(true)}
			sx={{
				width: 16,
				height: 16,
				borderRadius: "4px",
				objectFit: "contain",
			}}
		/>
	);
};

/**
 * 主题切换组件（亮色 / 暗色 / 跟随系统）
 */
const ThemeSwitcher = () => {
	const { t } = useTranslation();
	const { mode, setMode, systemMode, allColorSchemes } = useColorScheme();
	const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
	const menuOpen = Boolean(anchorEl);

	const currentMode = (mode ?? "system") as ThemeMode;
	const resolvedMode = useMemo<"light" | "dark">(() => {
		if (currentMode === "system") return systemMode ?? "light";
		return currentMode;
	}, [currentMode, systemMode]);
	const isDualTheme = allColorSchemes.length > 1;

	const updateWindowTheme = useCallback(async (nextMode: ThemeMode) => {
		try {
			if (nextMode === "system") {
				await getCurrentWindow().setTheme(null);
				return;
			}
			await getCurrentWindow().setTheme(nextMode);
		} catch (error) {
			console.warn("更新窗口主题失败:", error);
		}
	}, []);

	useEffect(() => {
		updateWindowTheme(currentMode);
	}, [currentMode, updateWindowTheme]);

	const handleOpenMenu = (event: MouseEvent<HTMLButtonElement>) => {
		setAnchorEl(event.currentTarget);
	};

	const handleCloseMenu = () => {
		setAnchorEl(null);
	};

	const handleSelectMode = async (nextMode: ThemeMode) => {
		setMode(nextMode);
		handleCloseMenu();
	};

	const currentIcon =
		currentMode === "system" ? (
			<BrightnessAutoIcon />
		) : resolvedMode === "dark" ? (
			<DarkModeIcon />
		) : (
			<LightModeIcon />
		);

	if (!isDualTheme) return null;

	return (
		<>
			<Tooltip title={t("components.Toolbar.theme", "主题")} enterDelay={1000}>
				<IconButton
					aria-label={t("components.Toolbar.theme", "主题")}
					onClick={handleOpenMenu}
					color="primary"
					size="small"
				>
					{currentIcon}
				</IconButton>
			</Tooltip>
			<Menu
				anchorEl={anchorEl}
				open={menuOpen}
				onClose={handleCloseMenu}
				transitionDuration={0}
			>
				<MenuItem
					selected={currentMode === "light"}
					onClick={() => handleSelectMode("light")}
				>
					<ListItemIcon>
						<LightModeIcon fontSize="small" />
					</ListItemIcon>
					<ListItemText>
						{t("components.Toolbar.themeLight", "浅色")}
					</ListItemText>
				</MenuItem>
				<MenuItem
					selected={currentMode === "dark"}
					onClick={() => handleSelectMode("dark")}
				>
					<ListItemIcon>
						<DarkModeIcon fontSize="small" />
					</ListItemIcon>
					<ListItemText>
						{t("components.Toolbar.themeDark", "深色")}
					</ListItemText>
				</MenuItem>
				<MenuItem
					selected={currentMode === "system"}
					onClick={() => handleSelectMode("system")}
				>
					<ListItemIcon>
						<BrightnessAutoIcon fontSize="small" />
					</ListItemIcon>
					<ListItemText>
						{t("components.Toolbar.themeSystem", "跟随系统")}
					</ListItemText>
				</MenuItem>
			</Menu>
		</>
	);
};

/**
 * 按钮组属性类型
 */
interface ButtonGroupProps {
	isLibraries: boolean;
	isDetail: boolean;
	isCollection: boolean;
}

/**
 * 通用弹窗控制 Hook
 * 用于管理弹窗的打开与关闭，并自动处理焦点恢复。
 *
 * @returns {object} 弹窗状态与控制方法
 */
export const useModal = () => {
	const [isopen, setisopen] = useState(false);
	const previousFocus = useRef<HTMLElement | null>(null);

	const handleOpen = () => {
		// 记录当前聚焦元素
		previousFocus.current = document.activeElement as HTMLElement;
		setisopen(true);
	};

	const handleClose = () => {
		setisopen(false);
		// 弹窗关闭后恢复焦点
		if (previousFocus.current) {
			previousFocus.current.focus();
		}
	};
	return { isopen, handleOpen, handleClose };
};

/**
 * 打开游戏文件夹按钮
 * 订阅 allGames 确保当游戏 localpath 更新时按钮状态同步
 * @param {HanleGamesProps} props
 * @returns {JSX.Element}
 */
const OpenFolder = ({ id, getGameById }: HanleGamesProps) => {
	const { t } = useTranslation();
	const { selectedGame } = useSelectedGame(id);
	const isDisabled = selectedGame?.localpath == null;

	return (
		<Button
			startIcon={<FolderOpenIcon />}
			color="primary"
			variant="text"
			disabled={isDisabled}
			onClick={() => handleOpenFolder({ id, getGameById })}
		>
			{t("components.Toolbar.openGameFolder")}
		</Button>
	);
};

/**
 * 删除游戏弹窗组件
 * @param {object} props
 * @param {number} props.id 游戏ID
 * @returns {JSX.Element}
 */
export const DeleteModal: React.FC<{ id: number }> = ({ id }) => {
	const { t } = useTranslation();
	const setSelectedGameId = useStore((state) => state.setSelectedGameId);
	const [openAlert, setOpenAlert] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const deleteGameMutation = useDeleteGame();
	const navigate = useNavigate();

	/**
	 * 删除游戏操作
	 */
	const handleDeleteGame = async () => {
		if (!id) return;

		try {
			setIsDeleting(true);
			await deleteGameMutation.mutateAsync(id);
			setSelectedGameId(null);
			navigate("/libraries");
		} catch (error) {
			console.error("删除游戏失败:", error);
		} finally {
			setIsDeleting(false);
			setOpenAlert(false);
		}
	};

	return (
		<>
			<Button
				startIcon={<DeleteIcon />}
				color="error"
				variant="text"
				disabled={isDeleting}
				onClick={() => setOpenAlert(true)}
			>
				{isDeleting
					? t("components.Toolbar.deleting")
					: t("components.Toolbar.deleteGame")}
			</Button>
			<AlertConfirmBox
				open={openAlert}
				setOpen={setOpenAlert}
				onConfirm={handleDeleteGame}
				isLoading={isDeleting}
			/>
		</>
	);
};

/**
 * 详情页更多操作按钮（外链等）
 * @returns {JSX.Element}
 */
const MoreButton = () => {
	const selectedGameId = useStore((state) => state.selectedGameId);
	const { selectedGame } = useSelectedGame(selectedGameId);
	const updateGameMutation = useUpdateGame();
	const { t } = useTranslation();
	const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
	const open = Boolean(anchorEl);
	const [pathSettingsModalOpen, setPathSettingsModalOpen] = useState(false);
	const { data: settings } = useAllSettings();
	const hasLePath = Boolean(settings?.le_path);
	const hasMagpiePath = Boolean(settings?.magpie_path);

	// 使用 Feature Facade 更新游戏状态
	const { updatePlayStatus } = useGameStatusActions();

	const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
		setAnchorEl(event.currentTarget);
	};

	const handleClose = () => {
		setAnchorEl(null);
	};

	/**
	 * 跳转到外部链接
	 * @param {string} type 链接类型（bgm/vndb/ymgal/kun）
	 */
	const handleView = (type: string) => {
		if (type === "bgm") {
			openurl(`https://bgm.tv/subject/${selectedGame?.bgm_id}`);
		} else if (type === "vndb") {
			openurl(`https://vndb.org/${selectedGame?.vndb_id}`);
		} else if (type === "ymgal") {
			openurl(`https://www.ymgal.games/ga${selectedGame?.ymgal_id}`);
		} else if (type === "kun") {
			openurl(`https://www.kungal.com/galgame/${selectedGame?.kun_id}`);
		}
	};

	/**
	 * 更新游戏状态
	 */
	const handlePlayStatusChange = (newStatus: PlayStatus) => {
		if (selectedGame?.id === undefined) return;
		updatePlayStatus({ gameId: selectedGame.id, newStatus });
	};

	/**
	 * 切换LE转区启动状态
	 */
	const handleToggleLeLaunch = async () => {
		const gameId = selectedGame?.id;
		if (gameId === undefined) return;

		const nextEnabled = selectedGame?.le_launch !== 1;

		if (nextEnabled && !hasLePath) {
			snackbar.warning(
				t(
					"components.Toolbar.lePathNotSet",
					"未设置LE转区软件路径，请先配置路径",
				),
			);
			setPathSettingsModalOpen(true);
			return;
		}

		try {
			await updateGameMutation.mutateAsync({
				gameId,
				updates: { le_launch: nextEnabled ? 1 : 0 },
			});
		} catch (error) {
			console.error("更新LE转区启动状态失败:", error);
		}
	};

	/**
	 * 切换Magpie放大状态
	 */
	const handleToggleMagpie = async () => {
		const gameId = selectedGame?.id;
		if (gameId === undefined) return;

		const nextEnabled = selectedGame?.magpie !== 1;

		if (nextEnabled && !hasMagpiePath) {
			snackbar.warning(
				t(
					"components.Toolbar.magpiePathNotSet",
					"未设置Magpie软件路径，请先配置路径",
				),
			);
			setPathSettingsModalOpen(true);
			return;
		}

		try {
			await updateGameMutation.mutateAsync({
				gameId,
				updates: { magpie: nextEnabled ? 1 : 0 },
			});
		} catch (error) {
			console.error("更新Magpie放大状态失败:", error);
		}
	};

	return (
		<>
			<Button
				startIcon={<MoreVertIcon />}
				color="inherit"
				variant="text"
				onClick={handleClick}
			>
				{t("components.Toolbar.more")}
			</Button>
			<Menu
				id="more-menu"
				anchorEl={anchorEl}
				open={open}
				onClose={handleClose}
				transitionDuration={0}
			>
				{selectedGame?.bgm_id ? (
					<MenuItem
						onClick={() => {
							handleView("bgm");
							handleClose();
						}}
					>
						<ListItemIcon>
							<SourceLinkIcon source="bgm" />
						</ListItemIcon>
						<ListItemText>{t("components.Toolbar.bgmlink")}</ListItemText>
					</MenuItem>
				) : null}
				{selectedGame?.vndb_id ? (
					<MenuItem
						onClick={() => {
							handleView("vndb");
							handleClose();
						}}
					>
						<ListItemIcon>
							<SourceLinkIcon source="vndb" />
						</ListItemIcon>
						<ListItemText>{t("components.Toolbar.vndblink")}</ListItemText>
					</MenuItem>
				) : null}
				{selectedGame?.ymgal_id ? (
					<MenuItem
						onClick={() => {
							handleView("ymgal");
							handleClose();
						}}
					>
						<ListItemIcon>
							<SourceLinkIcon source="ymgal" />
						</ListItemIcon>
						<ListItemText>
							{t("components.Toolbar.ymgallink", "月幕Gal页面")}
						</ListItemText>
					</MenuItem>
				) : null}
				{selectedGame?.kun_id ? (
					<MenuItem
						onClick={() => {
							handleView("kun");
							handleClose();
						}}
					>
						<ListItemIcon>
							<SourceLinkIcon source="kun" />
						</ListItemIcon>
						<ListItemText>
							{t("components.Toolbar.kunlink", "查看Kungal页面")}
						</ListItemText>
					</MenuItem>
				) : null}
				<MenuItem onClick={handleToggleLeLaunch}>
					<ListItemIcon>
						<TurnRightIcon fontSize="small" />
					</ListItemIcon>
					<ListItemText>{t("components.Toolbar.leLaunch")}</ListItemText>
					<Switch checked={selectedGame?.le_launch === 1} size="small" />
				</MenuItem>
				<MenuItem onClick={handleToggleMagpie}>
					<ListItemIcon>
						<OpenInFullIcon fontSize="small" />
					</ListItemIcon>
					<ListItemText>{t("components.Toolbar.magpieZoom")}</ListItemText>
					<Switch checked={selectedGame?.magpie === 1} size="small" />
				</MenuItem>

				{/* 游戏状态切换 - 二级菜单 */}
				<PlayStatusSubmenu
					currentStatus={selectedGame?.clear}
					onStatusChange={handlePlayStatusChange}
					i18nPrefix="components.Toolbar"
					iconSize="small"
					expandDirection="left"
				/>
			</Menu>

			{/* 路径设置弹窗 */}
			<PathSettingsModal
				open={pathSettingsModalOpen}
				onClose={() => setPathSettingsModalOpen(false)}
				inSettingsPage={false}
			/>
		</>
	);
};

/**
 * 顶部按钮组组件，根据页面类型切换显示内容
 * @param {ButtonGroupProps} props
 * @returns {JSX.Element}
 */
export const Buttongroup = ({
	isLibraries,
	isDetail,
	isCollection,
}: ButtonGroupProps) => {
	const id = Number(useLocation().pathname.split("/").pop());
	const { t } = useTranslation();
	const { openAddModal } = useStore(
		useShallow((state) => ({
			selectedGameId: state.selectedGameId,
			openAddModal: state.openAddModal,
		})),
	);
	const getGameById = useGetGameById();

	return (
		<>
			{isDetail && id && (
				<>
					<LaunchModal />
					<OpenFolder id={id} getGameById={getGameById} />
					<DeleteModal id={id} />
					<MoreButton />
					<ThemeSwitcher />
				</>
			)}
			{isLibraries && (
				<>
					<LaunchModal />
					<Button onClick={() => openAddModal("")} startIcon={<AddIcon />}>
						{t("components.AddModal.addGame")}
					</Button>
					<SortModal />
					<FilterModal />
					<ThemeSwitcher />
				</>
			)}
			{isCollection && (
				<>
					<CollectionToolbar />
					<ThemeSwitcher />
				</>
			)}
		</>
	);
};

/**
 * 主工具栏组件，根据路由自动切换按钮组
 * @returns {JSX.Element}
 */
export const Toolbars = () => {
	const path = useLocation().pathname;
	const isLibraries = path === "/libraries";
	const isDetail = path.startsWith("/libraries/") && path !== "/libraries/";
	const isCollection = path === "/collection";
	return (
		<Stack direction="row">
			<Buttongroup
				isLibraries={isLibraries}
				isDetail={isDetail}
				isCollection={isCollection}
			/>
			{!isLibraries && !isDetail && !isCollection && <ThemeSwitcher />}
		</Stack>
	);
};
