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

import { useState, useRef } from 'react';
import Stack from '@mui/material/Stack';
import { ThemeSwitcher } from '@toolpad/core/DashboardLayout';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import DeleteIcon from '@mui/icons-material/Delete';
import AddModal from '@/components/AddModal';
import SortModal from '@/components/SortModal';
import { FilterModal } from '@/components/FilterModal';
import { useLocation, useNavigate } from 'react-router-dom';
import { LaunchModal } from '@/components/LaunchModal';
import Button from '@mui/material/Button';
import { handleOpenFolder, openurl, toggleGameClearStatus } from '@/utils';
import { useStore } from '@/store';
import type { HanleGamesProps } from '@/types';
import { AlertDeleteBox } from '@/components/AlertBox';
import { useTranslation } from 'react-i18next';
import { isTauri } from '@tauri-apps/api/core';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import CallMadeIcon from '@mui/icons-material/CallMade';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';

/**
 * 按钮组属性类型
 */
interface ButtonGroupProps {
    isLibraries: boolean;
    isDetail: boolean;
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
}

/**
 * 打开游戏文件夹按钮
 * @param {HanleGamesProps} props
 * @returns {JSX.Element}
 */
const OpenFolder = ({ id, getGameById, canUse }: HanleGamesProps) => {
    const { t } = useTranslation();

    return (
        <Button
            startIcon={<FolderOpenIcon />}
            color="primary"
            variant="text"
            disabled={typeof canUse === 'function' ? !canUse() : true}
            onClick={() =>
                handleOpenFolder({ id, getGameById })
            }
        >
            {t('components.Toolbar.openGameFolder')}
        </Button>
    )
}

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
            navigate('/libraries');
        } catch (error) {
            console.error('删除游戏失败:', error);
        } finally {
            setIsDeleting(false);
            setOpenAlert(false);
        }
    }

    return (
        <>
            <Button
                startIcon={<DeleteIcon />}
                color="error"
                variant="text"
                disabled={isDeleting}
                onClick={() => setOpenAlert(true)}
            >
                {isDeleting ? t('components.Toolbar.deleting') : t('components.Toolbar.deleteGame')}
            </Button>
            <AlertDeleteBox
                open={openAlert}
                setOpen={setOpenAlert}
                onConfirm={handleDeleteGame}
                isLoading={isDeleting}
            />
        </>
    )
}

/**
 * 详情页更多操作按钮（外链等）
 * @returns {JSX.Element}
 */
const MoreButton = () => {
    const { selectedGame, setSelectedGame, updateGameClearStatusInStore } = useStore();
    const { t } = useTranslation();
    const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
    const open = Boolean(anchorEl);

    const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    /**
     * 跳转到外部链接
     * @param {string} type 链接类型（bgm/vndb）
     */
    const handleView = (type: string) => {
        if (type === "bgm") {
            openurl(`https://bgm.tv/subject/${selectedGame?.bgm_id}`);
        } else if (type === "vndb") {
            openurl(`https://vndb.org/${selectedGame?.vndb_id}`);
        }
    };

    /**
     * 切换通关状态
     */
    const handleToggleClearStatus = async () => {
        if (selectedGame?.id === undefined) return;
        try {
            await toggleGameClearStatus(selectedGame.id, (_, updatedGame) => {
                // 更新store中的游戏数据
                setSelectedGame(updatedGame);
            }, (gameId, newStatus) => {
                // 在详情页时跳过全局刷新，避免影响编辑页面状态
                updateGameClearStatusInStore(gameId, newStatus, true); // skipRefresh = true
            });
        } catch (error) {
            console.error('更新游戏通关状态失败:', error);
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
                {t('components.Toolbar.more')}
            </Button>
            <Menu
                id="more-menu"
                anchorEl={anchorEl}
                open={open}
                onClose={handleClose}
            >
                <MenuItem disabled={!selectedGame || !selectedGame.bgm_id} onClick={() => {
                    handleView("bgm");
                    handleClose();
                }}>
                    <ListItemIcon>
                        <CallMadeIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>{t('components.Toolbar.bgmlink')}</ListItemText>
                </MenuItem>
                <MenuItem disabled={!selectedGame || !selectedGame.vndb_id} onClick={() => {
                    handleView("vndb");
                    handleClose();
                }}>
                    <ListItemIcon>
                        <CallMadeIcon fontSize="small" />
                    </ListItemIcon>
                    <ListItemText>{t('components.Toolbar.vndblink')}</ListItemText>
                </MenuItem>
                <MenuItem onClick={handleToggleClearStatus}>
                    <ListItemIcon>
                        {selectedGame?.clear === 1 ? (
                            <EmojiEventsIcon fontSize="small" className="text-yellow-500" />
                        ) : (
                            <EmojiEventsOutlinedIcon fontSize="small" />
                        )}
                    </ListItemIcon>
                    <ListItemText>
                        {selectedGame?.clear === 1 ?
                            t('components.Toolbar.markAsNotCompleted') :
                            t('components.Toolbar.markAsCompleted')
                        }
                    </ListItemText>
                </MenuItem>
            </Menu>
        </>
    );
}

/**
 * 顶部按钮组组件，根据页面类型切换显示内容
 * @param {ButtonGroupProps} props
 * @returns {JSX.Element}
 */
export const Buttongroup = ({ isLibraries, isDetail }: ButtonGroupProps) => {
    const id = Number(useLocation().pathname.split('/').pop());
    const { getGameById, useIsLocalGame } = useStore();

    /**
     * 判断当前游戏是否可用（本地且 Tauri 环境）
     * @returns {boolean}
     */
    const canUse = () => {
        if (id !== undefined && id !== null)
            return isTauri() && useIsLocalGame(id);
        return false;
    }

    return (
        <>
            {(isDetail &&
                id) &&
                <>
                    <LaunchModal />
                    <OpenFolder id={id} getGameById={getGameById} canUse={canUse} />
                    <DeleteModal id={id} />
                    <MoreButton />
                    <ThemeSwitcher />
                </>
            }
            {isLibraries &&
                <>
                    <LaunchModal />
                    <AddModal />
                    <SortModal />
                    <FilterModal />
                    <ThemeSwitcher />
                </>
            }
        </>
    );
}

/**
 * 主工具栏组件，根据路由自动切换按钮组
 * @returns {JSX.Element}
 */
export const Toolbars = () => {
    const path = useLocation().pathname;
    const isLibraries = path === "/libraries";
    const isDetail = path.startsWith("/libraries/") && path !== "/libraries/";
    return (
        <Stack direction="row">
            <Buttongroup isLibraries={isLibraries} isDetail={isDetail} />
            {!isLibraries && !isDetail && <ThemeSwitcher />}
        </Stack>
    );
}
