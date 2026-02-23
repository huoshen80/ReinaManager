/**
 * @file Toolbar 组件与工具函数
 * @description 提供应用主界面顶部工具栏、按钮组、弹窗控制等功能，支持添加、排序、筛选、启动、删除、编辑、外链等操作，适配不同页面，集成国际化与 Tauri 桌面环境。
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
import CallMadeIcon from "@mui/icons-material/CallMade";
import DeleteIcon from "@mui/icons-material/Delete";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import OpenInFullIcon from "@mui/icons-material/OpenInFull";
import TurnRightIcon from "@mui/icons-material/TurnRight";
import Button from "@mui/material/Button";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import { open as openurl } from "@tauri-apps/plugin-shell";
import { ThemeSwitcher } from "@toolpad/core/DashboardLayout";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertConfirmBox } from "@/components/AlertBox";
import { FilterModal } from "@/components/FilterModal";
import { LaunchModal } from "@/components/LaunchModal";
import { PathSettingsModal } from "@/components/PathSettingsModal";
import { PlayStatusSubmenu } from "@/components/RightMenu/PlayStatusSubmenu";
import { snackbar } from "@/components/Snackbar";
import SortModal from "@/components/SortModal";
import { useUpdatePlayStatus } from "@/hooks/queries/usePlayStatus";
import { settingsService } from "@/services";
import { useStore } from "@/store";
import type { HanleGamesProps } from "@/types";
import type { PlayStatus } from "@/types/collection";
import { handleOpenFolder } from "@/utils";
import { CollectionToolbar } from "./Collection";

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
const OpenFolder = ({ id, getGameById, canUse }: HanleGamesProps) => {
	const { t } = useTranslation();
	// 订阅 allGames 以确保 localpath 更新时组件重新渲染
	const { allGames } = useStore();

	// 通过使用 allGames.length 确保订阅生效
	const isDisabled =
		allGames.length >= 0 && (typeof canUse === "function" ? !canUse() : true);

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
	const [openAlert, setOpenAlert] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const { deleteGame } = useStore();
	const navigate = useNavigate();

	/**
	 * 删除游戏操作
	 */
	const handleDeleteGame = async () => {
		if (!id) return;

		try {
			setIsDeleting(true);
			await deleteGame(id);
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
	const { selectedGame, setSelectedGame, updateGame } = useStore();
	const { t } = useTranslation();
	const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
	const open = Boolean(anchorEl);
	const [pathSettingsModalOpen, setPathSettingsModalOpen] = useState(false);

	// 使用 react-query mutation 更新游戏状态
	const { mutate: updatePlayStatus } = useUpdatePlayStatus();

	const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
		setAnchorEl(event.currentTarget);
	};

	const handleClose = () => {
		setAnchorEl(null);
	};

	/**
	 * 跳转到外部链接
	 * @param {string} type 链接类型（bgm/vndb/ymgal）
	 */
	const handleView = (type: string) => {
		if (type === "bgm") {
			openurl(`https://bgm.tv/subject/${selectedGame?.bgm_id}`);
		} else if (type === "vndb") {
			openurl(`https://vndb.org/${selectedGame?.vndb_id}`);
		} else if (type === "ymgal") {
			openurl(`https://www.ymgal.games/ga${selectedGame?.ymgal_id}`);
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
	const handleToggleLeLaunch = async (checked: boolean) => {
		if (selectedGame?.id === undefined) return;

		// 检查LE路径是否存在
		try {
			const lePath = await settingsService.getLePath();
			if (!lePath || lePath.trim() === "") {
				// 路径不存在，显示提示并打开路径设置弹窗
				snackbar.warning(
					t(
						"components.Toolbar.lePathNotSet",
						"未设置LE转区软件路径，请先配置路径",
					),
				);
				setPathSettingsModalOpen(true);
				return;
			}
		} catch (error) {
			console.error("检查LE路径失败:", error);
			snackbar.error(
				t("components.Toolbar.lePathCheckFailed", "检查LE路径失败"),
			);
			setPathSettingsModalOpen(true);
			return;
		}

		try {
			await updateGame(selectedGame.id, { le_launch: checked ? 1 : 0 });
			// 更新本地状态
			setSelectedGame({ ...selectedGame, le_launch: checked ? 1 : 0 });
		} catch (error) {
			console.error("更新LE转区启动状态失败:", error);
		}
	};

	/**
	 * 切换Magpie放大状态
	 */
	const handleToggleMagpie = async (checked: boolean) => {
		if (selectedGame?.id === undefined) return;

		// 检查Magpie路径是否存在
		try {
			const magpiePath = await settingsService.getMagpiePath();
			if (!magpiePath || magpiePath.trim() === "") {
				// 路径不存在，显示提示并打开路径设置弹窗
				snackbar.warning(
					t(
						"components.Toolbar.magpiePathNotSet",
						"未设置Magpie软件路径，请先配置路径",
					),
				);
				setPathSettingsModalOpen(true);
				return;
			}
		} catch (error) {
			console.error("检查Magpie路径失败:", error);
			snackbar.error(
				t("components.Toolbar.magpiePathCheckFailed", "检查Magpie路径失败"),
			);
			setPathSettingsModalOpen(true);
			return;
		}

		try {
			await updateGame(selectedGame.id, { magpie: checked ? 1 : 0 });
			// 更新本地状态
			setSelectedGame({ ...selectedGame, magpie: checked ? 1 : 0 });
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
				<MenuItem
					disabled={!selectedGame || !selectedGame.bgm_id}
					onClick={() => {
						handleView("bgm");
						handleClose();
					}}
				>
					<ListItemIcon>
						<CallMadeIcon fontSize="small" />
					</ListItemIcon>
					<ListItemText>{t("components.Toolbar.bgmlink")}</ListItemText>
				</MenuItem>
				<MenuItem
					disabled={!selectedGame || !selectedGame.vndb_id}
					onClick={() => {
						handleView("vndb");
						handleClose();
					}}
				>
					<ListItemIcon>
						<CallMadeIcon fontSize="small" />
					</ListItemIcon>
					<ListItemText>{t("components.Toolbar.vndblink")}</ListItemText>
				</MenuItem>
				<MenuItem
					disabled={!selectedGame || !selectedGame.ymgal_id}
					onClick={() => {
						handleView("ymgal");
						handleClose();
					}}
				>
					<ListItemIcon>
						<CallMadeIcon fontSize="small" />
					</ListItemIcon>
					<ListItemText>
						{t("components.Toolbar.ymgallink", "月幕Gal页面")}
					</ListItemText>
				</MenuItem>
				<MenuItem
					onClick={() => handleToggleLeLaunch(!(selectedGame?.le_launch === 1))}
				>
					<ListItemIcon>
						<TurnRightIcon fontSize="small" />
					</ListItemIcon>
					<ListItemText>{t("components.Toolbar.leLaunch")}</ListItemText>
					<Switch checked={selectedGame?.le_launch === 1} size="small" />
				</MenuItem>
				<MenuItem
					onClick={() => handleToggleMagpie(!(selectedGame?.magpie === 1))}
				>
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
	const { getGameById, isLocalGame, allGames, openAddModal } = useStore();

	/**
	 * 判断当前游戏是否可用（本地且 Tauri 环境）
	 * 订阅 allGames 确保 localpath 更新时按钮状态同步
	 * @returns {boolean}
	 */
	const canUse = () => {
		// 使用 allGames.length 确保订阅生效
		return (
			allGames.length >= 0 && id !== undefined && id !== null && isLocalGame(id)
		);
	};

	return (
		<>
			{isDetail && id && (
				<>
					<LaunchModal />
					<OpenFolder id={id} getGameById={getGameById} canUse={canUse} />
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
