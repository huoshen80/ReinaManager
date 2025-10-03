/**
 * @file AlertBox 组件
 * @description 通用弹窗提示组件，支持普通确认/取消弹窗和带加载状态的删除确认弹窗，适用于全局提示、删除确认等场景，支持国际化。
 * @module src/components/AlertBox/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - AlertBox：通用提示框组件
 * - AlertDeleteBox：带加载状态的删除确认弹窗
 *
 * 依赖：
 * - @mui/material
 * - react-i18next
 */

import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import CircularProgress from '@mui/material/CircularProgress';
import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import type { FullGameData } from '@/types';

/**
 * 通用提示框属性类型
 */
interface AlertBoxProps {
    open: boolean;
    setOpen: (value: boolean) => void;
    title?: string;
    message?: ReactNode; // 修改类型以支持 JSX 元素
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    confirmColor?: 'primary' | 'error' | 'success' | 'info' | 'warning';
    confirmVariant?: 'text' | 'outlined' | 'contained';
    autoCloseOnConfirm?: boolean;  // 确认后是否自动关闭
    isLoading?: boolean; // 新增属性：加载状态
    customMessage?: string; // 新增属性：自定义消息
}

/**
 * 删除提示框专用属性类型
 */
interface AlertDeleteBoxProps {
    open: boolean;
    setOpen: (value: boolean) => void;
    onConfirm: () => void;
    isLoading?: boolean;  // 添加加载状态
    message?: string; // 自定义删除消息
    title?: string; // 自定义删除标题
}


// 定义 ViewUpdateGameBoxProps 接口
interface ViewUpdateGameBoxProps {
    fullgame: FullGameData | string | null;
    open: boolean;
    setOpen: (value: boolean) => void;
    onConfirm: () => void;
}

/**
 * 通用提示框组件
 *
 * @param {AlertBoxProps} props 组件属性
 * @returns {JSX.Element} 通用弹窗
 */
export function AlertBox({
    open,
    setOpen,
    title,
    message,
    onConfirm,
    confirmText,
    cancelText,
    confirmColor = 'primary',
    confirmVariant = 'text',
    autoCloseOnConfirm = true,
    isLoading = false
}: AlertBoxProps) {
    const { t } = useTranslation();

    /**
     * 关闭弹窗
     */
    const handleClose = () => {
        if (!isLoading) {
            setOpen(false);
        }
    };

    /**
     * 确认操作
     */
    const handleConfirm = () => {
        onConfirm();
        if (autoCloseOnConfirm && !isLoading) {
            setOpen(false);
        }
    };

    return (
        <Dialog
            open={open}
            onClose={handleClose}
            aria-labelledby="alert-dialog-title"
            aria-describedby="alert-dialog-description"
        >
            {title && (
                <DialogTitle id="alert-dialog-title">
                    {title}
                </DialogTitle>
            )}
            {message && (
                <DialogContent>
                    <DialogContentText component="div" id="alert-dialog-description">
                        {message}
                    </DialogContentText>
                </DialogContent>
            )}
            <DialogActions>
                <Button onClick={handleClose} disabled={isLoading}>
                    {cancelText || t('components.AlertBox.cancel')}
                </Button>
                <Button
                    onClick={handleConfirm}
                    color={confirmColor}
                    variant={confirmVariant}
                    autoFocus
                    disabled={isLoading}
                    startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : undefined}
                >
                    {isLoading
                        ? t('components.AlertBox.processing')
                        : (confirmText || t('components.AlertBox.confirm'))}
                </Button>
            </DialogActions>
        </Dialog>
    );
}


/**
 * 删除提示框组件，带加载状态
 *
 * @param {AlertDeleteBoxProps} props 组件属性
 * @returns {JSX.Element} 删除确认弹窗
 */
export const AlertDeleteBox: React.FC<AlertDeleteBoxProps> = ({
    open,
    setOpen,
    onConfirm,
    isLoading = false,
    message,
    title
}) => {
    const { t } = useTranslation();

    return (
        <AlertBox
            open={open}
            setOpen={setOpen}
            title={title || t('components.AlertBox.deleteGameTitle')}
            message={message || t('components.AlertBox.deleteGameMessage')}
            onConfirm={onConfirm}
            confirmText={t('components.AlertBox.confirmDelete')}
            cancelText={t('components.AlertBox.cancel')}
            confirmColor="error"
            confirmVariant="contained"
            autoCloseOnConfirm={false} // 不自动关闭，由父组件控制
            isLoading={isLoading} // 传递加载状态
        />
    );
}

/**
 * 更新游戏信息提示框组件
 *
 * @param {Object} props 组件属性
 * @param {{ name: string; image: string }} props.game 游戏信息
 * @param {boolean} props.open 控制弹窗打开状态
 * @param {(value: boolean) => void} props.setOpen 设置弹窗打开状态的函数
 * @param {() => void} props.onConfirm 确认操作函数
 * @returns {JSX.Element} 更新游戏信息弹窗
 */
export const ViewUpdateGameBox: React.FC<ViewUpdateGameBoxProps> = ({
    fullgame,
    open,
    setOpen,
    onConfirm
}) => {
    const { t } = useTranslation();
    return (
        <AlertBox
            open={open}
            setOpen={setOpen}
            title={t('components.AlertBox.confirmUpdateTitle')}
            message={
                (fullgame && typeof fullgame !== 'string') ? (
                    <Box className="flex gap-2 items-start w-full">
                        {fullgame.bgm_data && (
                            <Box className="text-left">
                                <Typography variant="subtitle1" gutterBottom>
                                    {t('components.AlertBox.bgmData', "BGM 数据")}
                                </Typography>
                                <Typography variant="body2" className="mb-1">
                                    {t('components.AlertBox.gameName')}: {fullgame.bgm_data.name}
                                </Typography>
                                {fullgame.bgm_data.image && (
                                    <img src={fullgame.bgm_data.image} alt={`BGM ${fullgame.bgm_data.name}`} className="w-full h-auto max-h-64 object-contain rounded" />
                                )}
                            </Box>
                        )}
                        {fullgame.vndb_data && (
                            <Box className="text-left">
                                <Typography variant="subtitle1" gutterBottom>
                                    {t('components.AlertBox.vndbData', "VNDB 数据")}
                                </Typography>
                                <Typography variant="body2" className="mb-1">
                                    {t('components.AlertBox.gameName')}: {fullgame.vndb_data.name}
                                </Typography>
                                {fullgame.vndb_data.image && (
                                    <img src={fullgame.vndb_data.image} alt={`VNDB ${fullgame.vndb_data.name}`} className="w-full h-auto max-h-64 object-contain rounded" />
                                )}
                            </Box>
                        )}
                    </Box>
                ) : (
                    <Typography>{t('components.AlertBox.noData', "没有数据")}</Typography>
                )
            }
            onConfirm={onConfirm}
            confirmText={t('components.AlertBox.confirm')}
            cancelText={t('components.AlertBox.cancel')}
            confirmColor="primary"
            confirmVariant="contained"
        />
    );
};