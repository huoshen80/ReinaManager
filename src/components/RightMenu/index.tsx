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
import {useEffect, useRef, useState} from 'react';
import { Link } from 'react-router';
import { useStore } from '@/store';
import { handleOpenFolder, toggleGameClearStatus } from '@/utils';
import { AlertDeleteBox } from '@/components/AlertBox';
import { useTranslation } from 'react-i18next';
import { isTauri } from '@tauri-apps/api/core';
import { useGamePlayStore } from '@/store/gamePlayStore';
import type { GameData } from '@/types';

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
    }, [isopen, setAnchorEl,anchorPosition]);

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
            await toggleGameClearStatus(id, getGameById, (_, updatedGame) => {
                // 更新本地状态
                setGameData(updatedGame);
            }, updateGameClearStatusInStore);
            setAnchorEl(null);
        } catch (error) {
            console.error('更新游戏通关状态失败:', error);
        }
    }

    return (
        <div
            className="fixed z-50 animate-fade-in animate-duration-200 select-none"
            ref={menuRef}
            onClick={(e) => e.stopPropagation()}
        >
            {/* 删除确认弹窗 */}
            <AlertDeleteBox open={openAlert} setOpen={setOpenAlert} onConfirm={handleDeleteGame} isLoading={isDeleting} />
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg min-w-[200px] py-1 border border-gray-200 dark:border-gray-700">
                {/* 启动游戏 */}
                <div
                    className={`flex items-center px-4 py-2 text-black dark:text-white ${canUse()
                        ? 'hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
                        : 'opacity-50 cursor-not-allowed'
                        }`}
                    onClick={() => {
                        handleStartGame();
                        setAnchorEl(null);
                    }}
                >
                    <PlayCircleOutlineIcon className="mr-2" />
                    <span>{t('components.RightMenu.startGame')}</span>
                </div>
                {/* 进入详情 */}
                <Link
                    className="flex items-center px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer no-underline text-black dark:text-white visited:text-black dark:visited:text-white"
                    to={`/libraries/${id}`}>
                    <ArticleIcon className="mr-2" />
                    <span>{t('components.RightMenu.enterDetails')}</span>
                </Link>
                {/* 删除游戏 */}
                <div
                    className="flex items-center px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-black dark:text-white"
                    onClick={() => {
                        setOpenAlert(true);
                    }}
                >
                    <DeleteIcon className="mr-2" />
                    <span>{t('components.RightMenu.deleteGame')}</span>
                </div>
                <div className="h-[1px] bg-gray-200 dark:bg-gray-700 my-1" />
                {/* 打开游戏文件夹 */}
                <div
                    className={`flex items-center px-4 py-2 text-black dark:text-white ${isTauri() && id !== undefined && id !== null && useIsLocalGame(id)
                        ? 'hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer'
                        : 'opacity-50 cursor-not-allowed'
                        }`}
                    onClick={() => {
                        handleOpenFolder({ id, getGameById });
                        setAnchorEl(null);
                    }}
                >
                    <FolderOpenIcon className="mr-2" />
                    <span>{t('components.RightMenu.openGameFolder')}</span>
                </div>
                {/* 通关状态切换 */}
                <div
                    className="flex items-center px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer text-black dark:text-white"
                    onClick={handleSwitchClearStatus}
                >
                    {gameData?.clear === 1 ? (
                        <EmojiEventsIcon className="mr-2 text-yellow-500" />
                    ) : (
                        <EmojiEventsOutlinedIcon className="mr-2" />
                    )}
                    <span>
                        {gameData?.clear === 1 ?
                            t('components.RightMenu.markAsNotCompleted') :
                            t('components.RightMenu.markAsCompleted')
                        }
                    </span>
                </div>
            </div>
        </div>
    );
};

export default RightMenu;
