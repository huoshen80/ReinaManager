/**
 * @file RightMenu 组件
 * @description 游戏卡片右键菜单组件，支持启动游戏、进入详情、删除、打开文件夹等操作，适配 Tauri 桌面环境，集成国际化和删除确认弹窗。
 * @module src/components/RightMenu/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - RightMenu：游戏卡片右键菜单组件
 *
 * 依赖：
 * - @mui/icons-material
 * - @/store
 * - @/utils
 * - @/components/AlertBox
 * - react-i18next
 * - @tauri-apps/api/core
 */

import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import ArticleIcon from '@mui/icons-material/Article';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DeleteIcon from '@mui/icons-material/Delete';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import { useEffect, useRef, useState } from 'react';
import {
    Paper,
    MenuList,
    MenuItem,
    ListItemIcon,
    ListItemText,
    Divider
} from '@mui/material';
import { useStore } from '@/store';
import { handleOpenFolder, toggleGameClearStatus } from '@/utils';
import { AlertDeleteBox } from '@/components/AlertBox';
import { useTranslation } from 'react-i18next';
import { isTauri } from '@tauri-apps/api/core';
import { useGamePlayStore } from '@/store/gamePlayStore';
import type { GameData } from '@/types';
import { LinkWithScrollSave } from '../LinkWithScrollSave';

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
const RightMenu: React.FC<RightMenuProps> = ({ isopen, anchorPosition, setAnchorEl, id }) => {
    const { getGameById, deleteGame, useIsLocalGame, updateGameClearStatusInStore } = useStore();
    const { launchGame, isGameRunning } = useGamePlayStore();
    const [openAlert, setOpenAlert] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [gameData, setGameData] = useState<GameData | null>(null);
    const { t } = useTranslation();
    const menuRef = useRef<HTMLDivElement | null>(null);


    // 检查该游戏是否正在运行
    const isThisGameRunning = isGameRunning(id === null ? undefined : id);

    // 获取游戏数据以显示通关状态
    useEffect(() => {
        const fetchGameData = async () => {
            if (id !== null && id !== undefined) {
                try {
                    const game = await getGameById(id);
                    setGameData(game);
                } catch (error) {
                    console.error('获取游戏数据失败:', error);
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
            return isTauri() && useIsLocalGame(id) && !isThisGameRunning;
    }

    /**
     * 监听菜单外部点击、滚动、窗口变化，自动关闭菜单
     */
    useEffect(() => {
        const handleInteraction = () => {
            setAnchorEl(null);
        };

        if (isopen) {
            document.addEventListener('click', handleInteraction);
            document.addEventListener('scroll', handleInteraction, true);
            window.addEventListener('resize', handleInteraction);
        }
        // 计算菜单位置
        if (menuRef.current && anchorPosition) {
            const { offsetWidth, offsetHeight } = menuRef.current;
            const newTop = Math.min(anchorPosition.top, window.innerHeight - offsetHeight);
            const newLeft = Math.min(anchorPosition.left, window.innerWidth - offsetWidth);
            menuRef.current.style.top = `${newTop}px`;
            menuRef.current.style.left = `${newLeft}px`;
        }

        return () => {
            document.removeEventListener('click', handleInteraction);
            document.removeEventListener('scroll', handleInteraction, true);
            window.removeEventListener('resize', handleInteraction);
        };
    }, [isopen, setAnchorEl, anchorPosition]);

    if (!isopen) return null;
    if (!anchorPosition) return null;

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
            console.error('删除游戏失败:', error);
        } finally {
            setAnchorEl(null);
            setIsDeleting(false);
            setOpenAlert(false);
        }
    }

    /**
     * 启动游戏操作
     */
    const handleStartGame = async () => {
        if (!id) return;
        try {
            const selectedGame = await getGameById(id);
            if (!selectedGame || !selectedGame.localpath) {
                console.error(t('components.LaunchModal.gamePathNotFound'));
                return;
            }
            await launchGame(selectedGame.localpath, id);
        } catch (error) {
            console.error(t('components.LaunchModal.launchFailed'), error);
        }
    };

    const handleSwitchClearStatus = async () => {
        if (id === null || id === undefined) return;
        try {
            await toggleGameClearStatus(id, (_, updatedGame) => {
                // 更新本地状态
                setGameData(updatedGame);
            }, (gameId, newStatus) => {
                // 在库列表页面，需要保持全局刷新以更新筛选视图
                updateGameClearStatusInStore(gameId, newStatus, false); // skipRefresh = false
            });
            setAnchorEl(null);
        } catch (error) {
            console.error('更新游戏通关状态失败:', error);
        }
    }

    return (
        <div
            className="fixed z-50 animate-fade-in animate-duration-100 select-none"
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
        >
            {/* 删除确认弹窗 */}
            <AlertDeleteBox open={openAlert} setOpen={setOpenAlert} onConfirm={handleDeleteGame} isLoading={isDeleting} />

            <Paper
                elevation={8}
                sx={{
                    minWidth: '200px',
                    borderRadius: 2,
                    textAlign: 'left'
                }}
            >
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
                        <ListItemText primary={t('components.RightMenu.startGame')} />
                    </MenuItem>

                    {/* 进入详情 */}
                    <LinkWithScrollSave
                        to={`/libraries/${id}`}
                        style={{ textDecoration: 'none', color: 'inherit' }}
                    >
                        <MenuItem>
                            <ListItemIcon>
                                <ArticleIcon />
                            </ListItemIcon>
                            <ListItemText primary={t('components.RightMenu.enterDetails')} />
                        </MenuItem>
                    </LinkWithScrollSave>

                    {/* 删除游戏 */}
                    <MenuItem onClick={() => setOpenAlert(true)}>
                        <ListItemIcon>
                            <DeleteIcon />
                        </ListItemIcon>
                        <ListItemText primary={t('components.RightMenu.deleteGame')} />
                    </MenuItem>

                    <Divider />

                    {/* 打开游戏文件夹 */}
                    <MenuItem
                        disabled={!(isTauri() && id !== undefined && id !== null && useIsLocalGame(id))}
                        onClick={() => {
                            handleOpenFolder({ id, getGameById });
                            setAnchorEl(null);
                        }}
                    >
                        <ListItemIcon>
                            <FolderOpenIcon />
                        </ListItemIcon>
                        <ListItemText primary={t('components.RightMenu.openGameFolder')} />
                    </MenuItem>

                    {/* 通关状态切换 */}
                    <MenuItem onClick={handleSwitchClearStatus}>
                        <ListItemIcon>
                            {gameData?.clear === 1 ? (
                                <EmojiEventsIcon className="text-yellow-500" />
                            ) : (
                                <EmojiEventsOutlinedIcon />
                            )}
                        </ListItemIcon>
                        <ListItemText
                            primary={
                                gameData?.clear === 1 ?
                                    t('components.RightMenu.markAsNotCompleted') :
                                    t('components.RightMenu.markAsCompleted')
                            }
                        />
                    </MenuItem>
                </MenuList>
            </Paper>
        </div>
    );
};

export default RightMenu;
