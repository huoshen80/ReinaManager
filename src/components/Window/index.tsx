import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    Button,
    Checkbox,
    FormControlLabel,
    Typography,
    Box,
    LinearProgress,
    Chip,
    Stack
} from '@mui/material';
import { useStore } from '@/store';
import { Update } from '@tauri-apps/plugin-updater';
import {
    downloadAndInstallUpdate,
    UpdateProgress,
    silentCheckForUpdates,
    checkForUpdates
} from '@/components/Update';
import UpdateIcon from '@mui/icons-material/Update';
import DownloadIcon from '@mui/icons-material/Download';

/**
 * UpdateModal 更新确认弹窗组件
 */
interface UpdateModalProps {
    open: boolean;
    onClose: () => void;
    update: Update | null;
}

const UpdateModal: React.FC<UpdateModalProps> = ({ open, onClose, update }) => {
    const { t } = useTranslation();
    const [isDownloading, setIsDownloading] = useState(false);
    const [progress, setProgress] = useState<UpdateProgress | null>(null);
    const [downloadError, setDownloadError] = useState<string>('');

    const handleUpdate = async () => {
        if (!update) return;

        setIsDownloading(true);
        setDownloadError('');
        setProgress(null);

        try {
            await downloadAndInstallUpdate(update, {
                onProgress: (progress) => {
                    setProgress(progress);
                },
                onDownloadComplete: () => {
                    // 下载完成，应用即将重启
                },
                onError: (error) => {
                    setDownloadError(error);
                    setIsDownloading(false);
                }
            });
        } catch (error) {
            setDownloadError(error instanceof Error ? error.message : '更新失败');
            setIsDownloading(false);
        }
    };

    const handleCancel = () => {
        if (!isDownloading) {
            onClose();
        }
    };

    if (!update) return null;

    return (
        <Dialog
            open={open}
            onClose={handleCancel}
            maxWidth="sm"
            fullWidth
            disableEscapeKeyDown={isDownloading}
        >
            <DialogTitle>
                <Stack direction="row" alignItems="center" spacing={1}>
                    <UpdateIcon color="primary" />
                    <Typography variant="h6">
                        {t('components.Window.UpdateModal.title', '发现新版本')}
                    </Typography>
                </Stack>
            </DialogTitle>

            <DialogContent>
                <Box className="space-y-4">
                    {/* 版本信息 */}
                    <Box>
                        <Typography variant="body2" color="text.secondary" gutterBottom>
                            {t('components.Window.UpdateModal.newVersion', '新版本')}
                        </Typography>
                        <Chip
                            label={`v${update.version}`}
                            color="primary"
                            variant="outlined"
                            size="small"
                        />
                    </Box>

                    {/* 更新日期 */}
                    {update.date && (
                        <Box>
                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                {t('components.Window.UpdateModal.releaseDate', '发布日期')}
                            </Typography>
                            <Typography variant="body2">
                                {new Date(update.date as string).toLocaleDateString()}
                            </Typography>
                        </Box>
                    )}

                    {/* 更新说明 */}
                    {update.body && (
                        <Box>
                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                {t('components.Window.UpdateModal.changelog', '更新说明')}
                            </Typography>
                            <Box
                                sx={{
                                    p: 2,
                                    borderRadius: 1,
                                    maxHeight: 250,
                                    overflow: 'auto',
                                    border: '1px solid',
                                    borderColor: 'divider',
                                    '& details': {
                                        mb: 1,
                                        border: '1px solid',
                                        borderColor: 'divider',
                                        borderRadius: 1,
                                        overflow: 'hidden',
                                    },
                                    '& summary': {
                                        cursor: 'pointer',
                                        fontWeight: 'bold',
                                        userSelect: 'none',
                                        p: 1,
                                        backgroundColor: 'action.hover',
                                        '&:hover': {
                                            backgroundColor: 'action.selected',
                                        }
                                    },
                                    '& details[open] > summary': {
                                        borderBottom: '1px solid',
                                        borderBottomColor: 'divider',
                                    },
                                    '& details > :not(summary)': {
                                        p: 1,
                                    }
                                }}
                            >
                                <ReactMarkdown
                                    rehypePlugins={[rehypeRaw]}
                                    components={{
                                        // 自定义渲染组件以确保样式兼容
                                        p: (props) => (
                                            <Typography variant="body2" component="p" sx={{ mb: 1 }}>
                                                {props.children}
                                            </Typography>
                                        ),
                                        h1: (props) => (
                                            <Typography variant="h6" component="h1" sx={{ mb: 1, mt: 2, fontWeight: 'bold' }}>
                                                {props.children}
                                            </Typography>
                                        ),
                                        h2: (props) => (
                                            <Typography variant="subtitle1" component="h2" sx={{ mb: 1, mt: 2, fontWeight: 'bold' }}>
                                                {props.children}
                                            </Typography>
                                        ),
                                        h3: (props) => (
                                            <Typography variant="subtitle2" component="h3" sx={{ mb: 1, mt: 1, fontWeight: 'bold' }}>
                                                {props.children}
                                            </Typography>
                                        ),
                                        ul: (props) => (
                                            <Box component="ul" sx={{ pl: 2, mb: 1, mt: 0.5 }}>
                                                {props.children}
                                            </Box>
                                        ),
                                        li: (props) => (
                                            <Typography variant="body2" component="li" sx={{ mb: 0.5 }}>
                                                {props.children}
                                            </Typography>
                                        ),
                                        // 自定义链接组件，点击时用默认浏览器打开
                                        a: (props) => (
                                            <Typography
                                                component="span"
                                                variant="body2"
                                                sx={{
                                                    color: 'primary.main',
                                                    textDecoration: 'underline',
                                                    cursor: 'pointer',
                                                    '&:hover': {
                                                        color: 'primary.dark',
                                                    }
                                                }}
                                                onClick={async (e) => {
                                                    e.preventDefault();
                                                    if (props.href) {
                                                        try {
                                                            await openUrl(props.href);
                                                        } catch (error) {
                                                            console.error('Failed to open link:', error);
                                                        }
                                                    }
                                                }}
                                            >
                                                {props.children}
                                            </Typography>
                                        )
                                    }}
                                >
                                    {update.body || ''}
                                </ReactMarkdown>
                            </Box>
                        </Box>
                    )}

                    {/* 下载进度 */}
                    {isDownloading && (
                        <Box>
                            <Typography variant="body2" color="text.secondary" gutterBottom>
                                {t('components.Window.UpdateModal.downloading', '正在下载更新...')}
                            </Typography>
                            {progress && (
                                <Box>
                                    <LinearProgress
                                        variant="determinate"
                                        value={progress.percentage}
                                        sx={{ mb: 1 }}
                                    />
                                    <Typography variant="caption" color="text.secondary">
                                        {progress.percentage}% ({Math.round(progress.downloaded / 1024 / 1024)}MB / {Math.round(progress.contentLength / 1024 / 1024)}MB)
                                    </Typography>
                                </Box>
                            )}
                            {!progress && (
                                <LinearProgress sx={{ mb: 1 }} />
                            )}
                        </Box>
                    )}

                    {/* 错误信息 */}
                    {downloadError && (
                        <Box>
                            <Typography variant="body2" color="error">
                                {downloadError}
                            </Typography>
                        </Box>
                    )}
                </Box>
            </DialogContent>

            <DialogActions>
                <Button
                    onClick={handleCancel}
                    disabled={isDownloading}
                    color="inherit"
                >
                    {t('components.Window.UpdateModal.cancel', '取消')}
                </Button>
                <Button
                    onClick={handleUpdate}
                    disabled={isDownloading}
                    variant="contained"
                    startIcon={isDownloading ? <DownloadIcon /> : <UpdateIcon />}
                >
                    {isDownloading
                        ? t('components.Window.UpdateModal.downloading', '下载中...')
                        : t('components.Window.UpdateModal.update', '立即更新')
                    }
                </Button>
            </DialogActions>
        </Dialog>
    );
};

const WindowsHandler: React.FC = () => {
    const { setSkipCloseRemind, showUpdateModal, pendingUpdate, setShowUpdateModal, setPendingUpdate } = useStore();
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const w = getCurrentWindow();
        let unlisten = () => { };
        // 拦截关闭
        // @ts-ignore: onCloseRequested API provides preventDefault
        w.onCloseRequested(async (event) => {
            // @ts-ignore
            event.preventDefault();
            // 获取最新的状态值，避免闭包陷阱
            const currentSkipRemind = useStore.getState().skipCloseRemind;
            const currentDefaultAction = useStore.getState().defaultCloseAction;

            if (currentSkipRemind) {
                if (currentDefaultAction === 'hide') {
                    w.hide();
                } else {
                    w.destroy();
                }
            } else {
                setOpen(true);
            }
        }).then(fn => { unlisten = fn });
        return () => { unlisten(); };
    }, []); // 移除依赖项，避免重复注册监听器

    // 应用启动时静默检查更新
    useEffect(() => {
        const performSilentUpdateCheck = async () => {
            try {
                const result = await silentCheckForUpdates();
                if (result.hasUpdate) {
                    // 静默检查到更新，但不立即显示，等用户空闲时提醒
                    setTimeout(() => {
                        // 再次检查更新以获取增强的Update对象
                        checkForUpdates({
                            onUpdateFound: (update) => {
                                setPendingUpdate(update);
                                setShowUpdateModal(true);
                            },
                            onNoUpdate: () => {
                                // 静默忽略
                            },
                            onError: () => {
                                // 静默忽略错误
                            }
                        });
                    }, 5000); // 5秒后显示更新提醒
                }
            } catch (error) {
                // 静默忽略错误
            }
        };

        performSilentUpdateCheck();
    }, []);

    const handleCancel = () => {
        setSkipCloseRemind(false);
        setOpen(false);
    };
    const handleHide = () => {
        setOpen(false);
        getCurrentWindow().hide();
    };
    const handleExit = () => {
        setOpen(false);
        getCurrentWindow().destroy();
    };

    return (
        <>
            <Dialog open={open} onClose={handleCancel}>
                <DialogTitle>{t('components.Window.closeDialog.title')}</DialogTitle>
                <DialogContent>
                    <Typography variant="body1" sx={{ mb: 2 }}>
                        {t('components.Window.closeDialog.message')}
                    </Typography>
                    <FormControlLabel
                        control={
                            <Checkbox
                                checked={useStore.getState().skipCloseRemind}
                                onChange={e => {
                                    setSkipCloseRemind(e.target.checked);
                                }}
                                color="primary"
                            />
                        }
                        label={t('components.Window.closeDialog.dontRemind')}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleHide}>{t('components.Window.closeDialog.minimizeToTray')}</Button>
                    <Button onClick={handleExit} color="primary">{t('components.Window.closeDialog.exitApp')}</Button>
                </DialogActions>
            </Dialog>

            {/* 更新确认弹窗 */}
            <UpdateModal
                open={showUpdateModal}
                onClose={() => {
                    setShowUpdateModal(false);
                    setPendingUpdate(null);
                }}
                update={pendingUpdate}
            />
        </>
    );
};

export default WindowsHandler;
