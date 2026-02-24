/**
 * @file RightMenu 组件
 * @description 游戏卡片右键菜单组件，支持启动游戏、进入详情、删除、打开文件夹等操作，适配 Tauri 桌面环境，集成国际化和删除确认弹窗。
 * @module src/components/RightMenu/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - RightMenu：游戏卡片右键菜单组件
 * - CollectionRightMenu：分组/分类右键菜单组件
 *
 * 依赖：
 * - @mui/icons-material
 * - @/store
 * - @/utils
 * - @/components/AlertBox
 * - react-i18next
 * - @tauri-apps/api/core
 */

import ArticleIcon from "@mui/icons-material/Article";
import DeleteIcon from "@mui/icons-material/Delete";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import PlayCircleOutlineIcon from "@mui/icons-material/PlayCircleOutline";
import {
	Divider,
	ListItemIcon,
	ListItemText,
	MenuItem,
	MenuList,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertConfirmBox } from "@/components/AlertBox";
import { useGameStatusActions } from "@/hooks/features/games/useGameStatusActions";
import { useStore } from "@/store";
import { useGamePlayStore } from "@/store/gamePlayStore";
import type { GameData } from "@/types";
import type { PlayStatus } from "@/types/collection";
import { handleOpenFolder } from "@/utils";
import { LinkWithScrollSave } from "../LinkWithScrollSave";
import { BaseRightMenu } from "./BaseRightMenu";
import { PlayStatusSubmenu } from "./PlayStatusSubmenu";

/**
 * RightMenu 组件属性类型
 */
interface RightMenuProps {
	isopen: boolean;
	anchorPosition?: { top: number; left: number };
	setAnchorEl: (value: null) => void;
	id: number | null | undefined;
}

/**
 * 游戏卡片右键菜单组件
 * 支持启动、详情、删除、打开文件夹等操作，适配 Tauri 桌面环境。
 *
 * @param {RightMenuProps} props 组件属性
 * @returns {JSX.Element | null} 右键菜单
 */
const RightMenu: React.FC<RightMenuProps> = ({
	isopen,
	anchorPosition,
	setAnchorEl,
	id,
}) => {
	const { getGameById, deleteGame, isLocalGame } = useStore();
	const { launchGame, isGameRunning } = useGamePlayStore();
	const [openAlert, setOpenAlert] = useState(false);
	const [isDeleting, setIsDeleting] = useState(false);
	const [gameData, setGameData] = useState<GameData | null>(null);
	const { t } = useTranslation();

	// 使用 Feature Facade 更新游戏状态
	const { updatePlayStatus } = useGameStatusActions();

	// 检查该游戏是否正在运行
	const isThisGameRunning = isGameRunning(id === null ? undefined : id);

	// 获取游戏数据以显示游戏状态
	useEffect(() => {
		const fetchGameData = async () => {
			if (id !== null && id !== undefined) {
				try {
					const game = await getGameById(id);
					setGameData(game);
				} catch (error) {
					console.error("获取游戏数据失败:", error);
				}
			}
		};

		if (isopen) {
			fetchGameData();
		}
	}, [id, isopen, getGameById]);

	/**
	 * 判断当前游戏是否可以启动
	 * @returns {boolean}
	 */
	const canUse = () => {
		if (id !== undefined && id !== null)
			return isLocalGame(id) && !isThisGameRunning;
	};

	/**
	 * 删除游戏操作，带删除确认弹窗
	 */
	const handleDeleteGame = async () => {
		if (!id) return;
		try {
			setIsDeleting(true);
			setAnchorEl(null);
			await deleteGame(id);
		} catch (error) {
			console.error("删除游戏失败:", error);
		} finally {
			setAnchorEl(null);
			setIsDeleting(false);
			setOpenAlert(false);
		}
	};

	/**
	 * 启动游戏操作
	 */
	const handleStartGame = async () => {
		if (!id) return;
		try {
			const selectedGame = await getGameById(id);
			if (!selectedGame || !selectedGame.localpath) {
				console.error(t("components.LaunchModal.gamePathNotFound"));
				return;
			}
			await launchGame(selectedGame.localpath, id, {
				le_launch: selectedGame.le_launch === 1,
				magpie: selectedGame.magpie === 1,
			});
		} catch (error) {
			console.error(t("components.LaunchModal.launchFailed"), error);
		}
	};

	/**
	 * 更新游戏状态
	 */
	const handlePlayStatusChange = (newStatus: PlayStatus) => {
		if (id === null || id === undefined) return;
		updatePlayStatus(
			{ gameId: id, newStatus },
			{
				invalidateScope: "all",
				onSuccess: (updatedGame) => {
					// 更新本地状态，不关闭菜单
					setGameData(updatedGame);
				},
			},
		);
	};

	return (
		<BaseRightMenu
			isopen={isopen}
			anchorPosition={anchorPosition}
			onClose={() => setAnchorEl(null)}
			ariaLabel={t("components.RightMenu.label")}
		>
			{/* 删除确认弹窗 */}
			<AlertConfirmBox
				open={openAlert}
				setOpen={setOpenAlert}
				onConfirm={handleDeleteGame}
				isLoading={isDeleting}
			/>

			<MenuList sx={{ py: 1 }}>
				{/* 启动游戏 */}
				<MenuItem
					disabled={!canUse()}
					onClick={() => {
						handleStartGame();
						setAnchorEl(null);
					}}
				>
					<ListItemIcon>
						<PlayCircleOutlineIcon />
					</ListItemIcon>
					<ListItemText primary={t("components.RightMenu.startGame")} />
				</MenuItem>

				{/* 进入详情 */}
				<LinkWithScrollSave
					to={`/libraries/${id}`}
					style={{ textDecoration: "none", color: "inherit" }}
				>
					<MenuItem>
						<ListItemIcon>
							<ArticleIcon />
						</ListItemIcon>
						<ListItemText primary={t("components.RightMenu.enterDetails")} />
					</MenuItem>
				</LinkWithScrollSave>

				{/* 删除游戏 */}
				<MenuItem onClick={() => setOpenAlert(true)}>
					<ListItemIcon>
						<DeleteIcon />
					</ListItemIcon>
					<ListItemText primary={t("components.RightMenu.deleteGame")} />
				</MenuItem>

				<Divider />

				{/* 打开游戏文件夹 */}
				<MenuItem
					disabled={id == null || !isLocalGame(id)}
					onClick={() => {
						if (id != null) {
							handleOpenFolder({ id, getGameById });
						}
						setAnchorEl(null);
					}}
				>
					<ListItemIcon>
						<FolderOpenIcon />
					</ListItemIcon>
					<ListItemText primary={t("components.RightMenu.openGameFolder")} />
				</MenuItem>

				{/* 游戏状态切换 - 二级菜单 */}
				<PlayStatusSubmenu
					currentStatus={gameData?.clear}
					onStatusChange={handlePlayStatusChange}
				/>
			</MenuList>
		</BaseRightMenu>
	);
};

export default RightMenu;
export { CollectionRightMenu } from "./CollectionRightMenu";
