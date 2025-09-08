import { useStore } from "@/store";
import { useEffect, useState } from "react";
import {
    Box,
    TextField,
    Button,
    Stack,
    CircularProgress,
    List,
    ListItem,
    ListItemText,
    ListItemSecondaryAction,
    IconButton,
    Typography,
    Card,
    CardContent,
    Switch,
    FormControlLabel,
    Divider
} from "@mui/material";
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import BackupIcon from '@mui/icons-material/Backup';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import { handleGetFolder, deleteSavedataBackup, getAppDataDir, createGameSavedataBackup, openGameBackupFolder, openGameSaveDataFolder } from '@/utils';
import {
    getSavedataRecords,
    deleteSavedataRecord,
    getGameById
} from '@/utils/repository';
import type { SavedataRecord } from '@/types';
import { useTranslation } from 'react-i18next';
import { AlertDeleteBox } from '@/components/AlertBox';
import { snackbar } from '@/components/Snackbar';
import { getSavePathRepository } from "@/utils/settingsConfig";

/**
 * Backup 组件
 * 游戏存档备份页面
 * 
 * @component
 * @returns {JSX.Element} 备份页面
 */
export const Backup = (): JSX.Element => {
    const { selectedGame, updateGame } = useStore();
    const { t } = useTranslation();

    // 状态管理
    const [saveDataPath, setSaveDataPath] = useState<string>("");
    const [backupList, setBackupList] = useState<SavedataRecord[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [backupToDelete, setBackupToDelete] = useState<SavedataRecord | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(false);
    const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

    // 初始化组件，加载备份列表和游戏设置
    useEffect(() => {
        if (selectedGame) {
            loadBackupList();
            loadGameSettings();
        }
    }, [selectedGame]);

    // 从数据库加载游戏的最新设置
    const loadGameSettings = async () => {
        if (!selectedGame?.id) return;

        try {
            // 从数据库获取最新的游戏信息
            const latestGame = await getGameById(selectedGame.id);
            if (latestGame) {
                setSaveDataPath(latestGame.savepath || "");
                setAutoSaveEnabled(latestGame.autosave === 1);
            }
        } catch (error) {
            console.error('加载游戏设置失败:', error);
        }
    };

    // 加载备份列表
    const loadBackupList = async () => {
        if (!selectedGame?.id) return;

        try {
            const records = await getSavedataRecords(selectedGame.id);
            setBackupList(records);
        } catch (error) {
            console.error('加载备份列表失败:', error);
            snackbar.error(t('pages.Detail.Backup.loadBackupsFailed', '加载备份列表失败'));
        }
    };

    // 选择存档文件夹
    const handleSelectSaveDataPath = async () => {
        const selectedPath = await handleGetFolder();
        if (selectedPath) {
            setSaveDataPath(selectedPath);
        }
    };

    // 更新存档路径
    const handleUpdateSaveDataPath = async () => {
        if (!selectedGame?.id) return;

        setIsUpdatingSettings(true);

        try {
            // 使用统一的updateGame函数更新存档路径
            await updateGame(selectedGame.id, { savepath: saveDataPath });

            snackbar.success(t('pages.Detail.Backup.pathUpdateSuccess', '存档路径更新成功'));
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t('pages.Detail.Backup.unknownError', '未知错误');
            snackbar.error(`${t('pages.Detail.Backup.pathUpdateFailed', '路径更新失败')}: ${errorMessage}`);
        } finally {
            setIsUpdatingSettings(false);
        }
    };

    // 处理自动备份开关
    const handleAutoSaveToggle = async (enabled: boolean) => {
        if (!selectedGame?.id) return;

        setIsUpdatingSettings(true);

        try {
            // 使用统一的updateGame函数更新自动保存状态
            await updateGame(selectedGame.id, { autosave: enabled ? 1 as const : 0 as const });
            setAutoSaveEnabled(enabled);

            const message = enabled
                ? t('pages.Detail.Backup.autoSaveEnabled', '自动备份已启用')
                : t('pages.Detail.Backup.autoSaveDisabled', '自动备份已禁用');
            snackbar.success(message);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t('pages.Detail.Backup.unknownError', '未知错误');
            snackbar.error(`${t('pages.Detail.Backup.autoSaveUpdateFailed', '自动备份设置失败')}: ${errorMessage}`);
            // 恢复原状态
            setAutoSaveEnabled(!enabled);
        } finally {
            setIsUpdatingSettings(false);
        }
    };

    // 创建备份
    const handleCreateBackup = async () => {
        if (!saveDataPath || !selectedGame?.id) {
            snackbar.error(t('pages.Detail.Backup.pathRequired', '请先选择存档文件夹'));
            return;
        }

        setIsLoading(true);

        try {
            await createGameSavedataBackup(selectedGame.id, saveDataPath);
            snackbar.success(t('pages.Detail.Backup.backupSuccess', '备份创建成功'));
            loadBackupList();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t('pages.Detail.Backup.unknownError', '未知错误');
            snackbar.error(`${t('pages.Detail.Backup.backupFailed', '备份失败')}: ${errorMessage}`);
        } finally {
            setIsLoading(false);
        }
    };

    // 打开备份文件夹
    const handleOpenBackupFolder = async () => {
        if (!selectedGame?.id) return;

        try {
            await openGameBackupFolder(selectedGame.id);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t('pages.Detail.Backup.unknownError', '未知错误');
            snackbar.error(`${t('pages.Detail.Backup.openFolderFailed', '打开文件夹失败')}: ${errorMessage}`);
        }
    };

    // 打开存档文件夹
    const handleOpenSaveDataFolder = async () => {
        if (!saveDataPath) {
            snackbar.error(t('pages.Detail.Backup.pathRequired', '请先选择存档文件夹'));
            return;
        }

        try {
            await openGameSaveDataFolder(saveDataPath);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t('pages.Detail.Backup.unknownError', '未知错误');
            snackbar.error(`${t('pages.Detail.Backup.openFolderFailed', '打开文件夹失败')}: ${errorMessage}`);
        }
    };

    // 打开删除确认对话框
    const handleDeleteClick = (backup: SavedataRecord) => {
        setBackupToDelete(backup);
        setDeleteDialogOpen(true);
    };

    // 删除备份
    const handleDeleteBackup = async () => {
        if (!backupToDelete) return;

        setIsDeleting(true);

        try {
            // 获取备份文件完整路径
            const appDataDir = await getAppDataDir();
            const saveRootPath = await getSavePathRepository();
            const backupGameDir = (saveRootPath === '') ? `${appDataDir}` : `${saveRootPath}`;
            const backupFilePath = `${backupGameDir}/backups/game_${backupToDelete.game_id}/${backupToDelete.file}`;

            // 删除备份文件
            await deleteSavedataBackup(backupFilePath);

            // 从数据库删除记录
            await deleteSavedataRecord(backupToDelete.id);

            snackbar.success(t('pages.Detail.Backup.deleteSuccess', '备份删除成功'));
            loadBackupList();

            // 关闭对话框并清空选中的备份
            setDeleteDialogOpen(false);
            setBackupToDelete(null);
        } catch (error) {
            await deleteSavedataRecord(backupToDelete.id);
            const errorMessage = error instanceof Error ? error.message : t('pages.Detail.Backup.unknownError', '未知错误');
            snackbar.error(`${t('pages.Detail.Backup.deleteFailed', '删除失败')}: ${errorMessage}`);
        } finally {
            setIsDeleting(false);
        }
    };

    // 格式化文件大小
    const formatFileSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${Number.parseFloat((bytes / (k ** i)).toFixed(2))} ${sizes[i]}`;
    };

    // 格式化时间
    const formatDate = (timestamp: number): string => {
        return new Date(timestamp * 1000).toLocaleString();
    };

    return (
        <Box sx={{ p: 3 }}>

            <Stack spacing={3}>
                {/* 自动备份设置 */}
                <Card>
                    <CardContent>
                        <Typography variant="h6" gutterBottom>
                            {t('pages.Detail.Backup.settings', '备份设置')}
                        </Typography>

                        <Stack spacing={2}>
                            {/* 自动备份开关 */}
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={autoSaveEnabled}
                                        onChange={(e) => handleAutoSaveToggle(e.target.checked)}
                                        disabled={isUpdatingSettings || !selectedGame?.savepath}
                                    />
                                }
                                label={t('pages.Detail.Backup.autoSave', '自动备份')}
                            />

                            <Divider />

                            {/* 存档路径设置 */}
                            <Typography variant="subtitle2" color="textSecondary">
                                {t('pages.Detail.Backup.savePathSettings', '存档路径设置')}
                            </Typography>

                            <Box sx={{ display: 'flex', gap: 1 }}>
                                <TextField
                                    label={t('pages.Detail.Backup.saveDataPath', '存档文件夹路径')}
                                    variant="outlined"
                                    fullWidth
                                    value={saveDataPath}
                                    onChange={(e) => setSaveDataPath(e.target.value)}
                                    disabled={isLoading || isUpdatingSettings || !selectedGame}
                                    placeholder={t('pages.Detail.Backup.selectSaveDataFolder', '选择存档文件夹')}
                                />
                                <Button
                                    variant="outlined"
                                    onClick={handleSelectSaveDataPath}
                                    disabled={isLoading || isUpdatingSettings || !selectedGame}
                                    sx={{ minWidth: '40px', px: 1 }}
                                >
                                    <FolderOpenIcon />
                                </Button>
                                <Button
                                    variant="outlined"
                                    onClick={handleUpdateSaveDataPath}
                                    disabled={isLoading || isUpdatingSettings || !selectedGame || !saveDataPath}
                                    startIcon={isUpdatingSettings ? <CircularProgress size={16} /> : <SaveIcon />}
                                    sx={{ minWidth: '100px' }}
                                >
                                    {isUpdatingSettings ? t('pages.Detail.Backup.updating', '更新中...') : t('pages.Detail.Backup.updatePath', '更新路径')}
                                </Button>
                            </Box>
                        </Stack>
                    </CardContent>
                </Card>

                {/* 手动备份操作 */}
                <Card>
                    <CardContent>
                        <Typography variant="h6" gutterBottom>
                            {t('pages.Detail.Backup.manualBackup', '手动备份')}
                        </Typography>

                        {/* 创建备份按钮 */}
                        <Stack spacing={2}>
                            <Button
                                variant="contained"
                                color="primary"
                                size="large"
                                fullWidth
                                onClick={handleCreateBackup}
                                disabled={isLoading || !saveDataPath || !selectedGame?.savepath}
                                startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <BackupIcon />}
                            >
                                {isLoading ? t('pages.Detail.Backup.creating', '正在创建备份...') : t('pages.Detail.Backup.createBackup', '创建备份')}
                            </Button>

                            {/* 打开文件夹按钮 */}
                            <Stack direction="row" spacing={1}>
                                <Button
                                    variant="outlined"
                                    size="medium"
                                    onClick={() => handleOpenBackupFolder()}
                                    disabled={!selectedGame}
                                    startIcon={<FolderOpenIcon />}
                                    sx={{ flex: 1 }}
                                >
                                    {t('pages.Detail.Backup.openBackupFolder', '打开备份文件夹')}
                                </Button>

                                <Button
                                    variant="outlined"
                                    size="medium"
                                    onClick={() => handleOpenSaveDataFolder()}
                                    disabled={!saveDataPath || !selectedGame?.savepath}
                                    startIcon={<FolderOpenIcon />}
                                    sx={{ flex: 1 }}
                                >
                                    {t('pages.Detail.Backup.openSaveDataFolder', '打开存档文件夹')}
                                </Button>
                            </Stack>
                        </Stack>
                    </CardContent>
                </Card>

                {/* 备份列表 */}
                <Card>
                    <CardContent>
                        <Typography variant="h6" gutterBottom>
                            {t('pages.Detail.Backup.backupHistory', '备份历史')}
                        </Typography>

                        {backupList.length === 0 ? (
                            <Typography color="textSecondary">
                                {t('pages.Detail.Backup.noBackups', '暂无备份记录')}
                            </Typography>
                        ) : (
                            <List>
                                {backupList.map((backup) => (
                                    <ListItem key={backup.id} divider>
                                        <ListItemText
                                            primary={backup.file}
                                            secondary={
                                                <Box>
                                                    <Typography variant="body2" color="textSecondary">
                                                        {t('pages.Detail.Backup.backupTime', '备份时间')}: {formatDate(backup.backup_time)}
                                                    </Typography>
                                                    <Typography variant="body2" color="textSecondary">
                                                        {t('pages.Detail.Backup.fileSize', '文件大小')}: {formatFileSize(backup.file_size)}
                                                    </Typography>
                                                </Box>
                                            }
                                        />
                                        <ListItemSecondaryAction>
                                            <IconButton
                                                edge="end"
                                                onClick={() => handleDeleteClick(backup)}
                                                disabled={isLoading}
                                                color="error"
                                            >
                                                <DeleteIcon />
                                            </IconButton>
                                        </ListItemSecondaryAction>
                                    </ListItem>
                                ))}
                            </List>
                        )}
                    </CardContent>
                </Card>
            </Stack>

            {/* 删除确认对话框 */}
            <AlertDeleteBox
                open={deleteDialogOpen}
                setOpen={setDeleteDialogOpen}
                onConfirm={handleDeleteBackup}
                isLoading={isDeleting}
                title={t('components.AlertBox.deleteBackupTitle', '删除备份')}
                message={backupToDelete ?
                    `${t('pages.Detail.Backup.confirmDelete', '确定要删除备份')} "${backupToDelete.file}" ${t('pages.Detail.Backup.confirmDeleteSuffix', '吗？此操作不可撤销。')}`
                    : undefined
                }
            />
        </Box>
    );
};

