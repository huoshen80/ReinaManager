import { useState, useEffect } from "react";
import {
    Box,
    TextField,
    Button,
    Stack,
    Card,
    CardContent,
    Typography,
    IconButton,
    CircularProgress
} from "@mui/material";
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import PhotoCameraIcon from '@mui/icons-material/PhotoCamera';
import DeleteIcon from '@mui/icons-material/Delete';
import SaveIcon from '@mui/icons-material/Save';
import type { FullGameData, GameData } from "@/types";
import { handleDirectory, getGameCover } from "@/utils";
import { getGameDisplayName } from "@/utils";
import { useTranslation } from 'react-i18next';
import i18n from '@/utils/i18n';
import { snackbar } from "@/components/Snackbar";
import { selectImageFile, uploadSelectedImage, deleteCustomCoverFile, getPreviewUrlFromPath } from "@/utils/customCover";

interface GameInfoEditProps {
    selectedGame: GameData | null;
    onSave: (data: Partial<FullGameData>) => Promise<void>;
    disabled?: boolean;
}

/**
 * GameInfoEdit 组件
 * 负责编辑游戏资料：自定义封面、游戏备注、可执行文件路径
 */
export const GameInfoEdit: React.FC<GameInfoEditProps> = ({
    selectedGame,
    onSave,
    disabled = false
}) => {
    const { t } = useTranslation();

    // 游戏信息编辑相关状态
    const [localPath, setLocalPath] = useState<string>("");
    const [gameNote, setGameNote] = useState<string>("");
    const [isLoading, setIsLoading] = useState(false);

    // 图片预览相关状态
    const [selectedImagePath, setSelectedImagePath] = useState<string | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    // 添加临时封面状态，用于平滑过渡
    const [tempCoverUrl, setTempCoverUrl] = useState<string | null>(null);

    // 同步 selectedGame prop 到内部状态
    useEffect(() => {
        if (selectedGame) {
            setLocalPath(selectedGame.localpath || "");
            const displayName = getGameDisplayName(selectedGame, i18n.language);
            setGameNote(selectedGame.custom_name || displayName);
        } else {
            // 处理 selectedGame 为 null 的情况
            setLocalPath("");
            setGameNote("");
        }
    }, [selectedGame]);

    // 清理预览URL避免内存泄漏
    useEffect(() => {
        return () => {
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    // 检查是否有任何更改
    const hasChanges = () => {
        if (!selectedGame) return false;
        const currentDisplayName = getGameDisplayName(selectedGame, i18n.language);
        const currentCustomName = selectedGame.custom_name || currentDisplayName;

        return (
            localPath !== (selectedGame.localpath || "") ||
            gameNote !== currentCustomName ||
            selectedImagePath !== null // 有选择的图片但未保存
        );
    };

    // 处理选择可执行文件路径
    const handleSelectLocalPath = async () => {
        try {
            const selectedPath = await handleDirectory();
            if (selectedPath) {
                setLocalPath(selectedPath);
            }
        } catch (error) {
            snackbar.error(`${t('pages.Detail.GameInfoEdit.selectPathFailed', '选择路径失败')}: ${error instanceof Error ? error.message : t('pages.Detail.GameInfoEdit.unknownError', '未知错误')}`);
        }
    };

    // 处理自定义封面文件选择 - 只选择，不立即上传
    const handleCustomCoverSelect = async () => {
        if (!selectedGame || typeof selectedGame.id !== 'number') {
            snackbar.error(t('pages.Detail.GameInfoEdit.invalidGameId', '无效的游戏ID'));
            return;
        }

        try {
            // 只选择图片文件，不立即上传
            const imagePath = await selectImageFile();
            if (imagePath) {
                // 清理之前的预览 URL（如果是 object URL）
                if (previewUrl) {
                    try { URL.revokeObjectURL(previewUrl); } catch { }
                }

                setSelectedImagePath(imagePath);

                // 通过后端读取文件并转换为 blob URL 用于预览
                const blobUrl = await getPreviewUrlFromPath(imagePath);
                setPreviewUrl(blobUrl);
            }
        } catch (error) {
            snackbar.error(`${t('pages.Detail.GameInfoEdit.selectImageFailed', '选择图片失败')}: ${error instanceof Error ? error.message : error}`);
        }
    };

    // 获取当前要显示的封面URL
    const getCurrentCoverUrl = () => {
        // 如果有临时封面，优先使用（用于平滑过渡）
        if (tempCoverUrl) {
            return tempCoverUrl;
        }

        // 优先级：预览URL > 正在保存时保持预览 > 实际封面
        if (previewUrl) return previewUrl; // 优先显示预览
        if (isLoading && previewUrl) return previewUrl; // 保存中也显示预览
        if (!selectedGame) return '';
        return getGameCover(selectedGame);
    };

    // 处理删除自定义封面
    const handleRemoveCustomCover = async () => {
        if (!selectedGame || typeof selectedGame.id !== 'number' || !selectedGame.custom_cover) {
            snackbar.error(t('pages.Detail.GameInfoEdit.invalidGameId', '无效的游戏ID或无自定义封面'));
            return;
        }

        setIsLoading(true);
        try {
            // 删除文件和数据库记录
            await deleteCustomCoverFile(selectedGame.id, selectedGame.custom_cover);

            // 触发父组件刷新数据
            const updateData: Partial<FullGameData> = {
                game: {
                    custom_cover: null
                }
            };
            await onSave(updateData);

        } catch (error) {
            snackbar.error(`${t('pages.Detail.GameInfoEdit.removeCustomCoverFailed', '移除自定义封面失败')}: ${error instanceof Error ? error.message : error}`);
        } finally {
            setIsLoading(false);
        }
    };

    // 统一保存所有更改
    const handleSaveAll = async () => {
        if (!selectedGame || !hasChanges()) return;

        setIsLoading(true);

        try {
            const gameUpdates: any = {};

            // 处理自定义封面上传
            if (selectedImagePath && selectedGame.id) {
                // 将选择的文件保存到最终位置
                const extension = await uploadSelectedImage(selectedGame.id, selectedImagePath);
                gameUpdates.custom_cover = extension;
            }

            // 准备其他更新数据
            if (localPath !== (selectedGame.localpath || "")) {
                gameUpdates.localpath = localPath;
            }

            // 检查自定义名称是否有变化
            const currentDisplayName = getGameDisplayName(selectedGame, i18n.language);
            const currentCustomName = selectedGame.custom_name || currentDisplayName;
            if (gameNote !== currentCustomName) {
                gameUpdates.custom_name = gameNote;
            }

            const updateData: Partial<FullGameData> = {
                game: gameUpdates
            };

            // 先保存到数据库
            await onSave(updateData);

            // 保存成功后设置临时封面URL（如果有新封面）
            if (selectedImagePath && gameUpdates.custom_cover) {
                // 生成新的封面URL作为临时封面，确保立即显示新图片
                const newCoverUrl = getGameCover({
                    ...selectedGame,
                    custom_cover: gameUpdates.custom_cover
                });
                setTempCoverUrl(newCoverUrl);
            }

            // 延迟清理预览状态，给新封面时间加载
            setTimeout(() => {
                if (selectedImagePath) {
                    setSelectedImagePath(null);
                    if (previewUrl) {
                        try { URL.revokeObjectURL(previewUrl); } catch { }
                        setPreviewUrl(null);
                    }
                }
                // 清理临时封面
                setTempCoverUrl(null);
            }, 100); // 100ms延迟，足够新图片开始加载

        } catch (error) {
            snackbar.error(`${t('pages.Detail.GameInfoEdit.saveGameInfoFailed', '保存游戏信息失败')}: ${error instanceof Error ? error.message : t('pages.Detail.GameInfoEdit.unknownError', '未知错误')}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* 自定义封面和游戏备注编辑区域 */}
            <Card>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        {t('pages.Detail.GameInfoEdit.customizeGame', '自定义游戏信息')}
                    </Typography>

                    <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                        {/* 左侧：自定义封面 */}
                        <Box sx={{ flex: '0 0 300px' }}>
                            <Typography variant="subtitle1" gutterBottom>
                                {t('pages.Detail.GameInfoEdit.customCover', '自定义封面')}
                            </Typography>

                            <Stack spacing={2}>
                                {/* 当前封面预览 */}
                                <Box>
                                    <img
                                        src={getCurrentCoverUrl()}
                                        alt="Game Cover"
                                        style={{
                                            maxWidth: '200px',
                                            maxHeight: '300px',
                                            objectFit: 'contain',
                                            borderRadius: '8px'
                                        }}
                                    />
                                </Box>

                                {/* 文件选择和操作按钮 */}
                                <Stack direction="row" spacing={1} flexWrap="wrap">
                                    <Button
                                        variant="outlined"
                                        onClick={handleCustomCoverSelect}
                                        startIcon={<PhotoCameraIcon />}
                                        disabled={isLoading || disabled || !selectedGame}
                                        size="small"
                                    >
                                        {t('pages.Detail.GameInfoEdit.selectImage', '选择图片')}
                                    </Button>

                                    {selectedGame?.custom_cover && (
                                        <IconButton
                                            onClick={handleRemoveCustomCover}
                                            disabled={isLoading || disabled}
                                            color="error"
                                            size="small"
                                            title={t('pages.Detail.GameInfoEdit.removeCustomCover', '移除自定义封面')}
                                        >
                                            <DeleteIcon />
                                        </IconButton>
                                    )}
                                </Stack>

                                {selectedGame?.custom_cover && (
                                    <Typography variant="caption" color="textSecondary">
                                        {t('pages.Detail.GameInfoEdit.hasCustomCover', '已设置自定义封面')}: {selectedGame.custom_cover}
                                    </Typography>
                                )}

                                {selectedImagePath && (
                                    <Typography variant="caption" color="primary">
                                        {t('pages.Detail.GameInfoEdit.previewSelected', '已选择新图片，保存后生效')}: {selectedImagePath.split(/[/\\]/).pop()}
                                    </Typography>
                                )}
                            </Stack>
                        </Box>

                        {/* 右侧：游戏备注 */}
                        <Box sx={{ flex: 1 }}>
                            <Typography variant="subtitle1" gutterBottom>
                                {t('pages.Detail.GameInfoEdit.gameNote', '游戏备注')}
                            </Typography>

                            <Stack spacing={2}>
                                <TextField
                                    label={t('pages.Detail.GameInfoEdit.customGameName', '自定义游戏名称')}
                                    variant="outlined"
                                    fullWidth
                                    value={gameNote}
                                    onChange={(e) => setGameNote(e.target.value)}
                                    disabled={isLoading || disabled || !selectedGame}
                                    placeholder={selectedGame ? getGameDisplayName(selectedGame, i18n.language) : t('pages.Detail.GameInfoEdit.enterGameNote', '请输入游戏备注')}
                                    helperText={t('pages.Detail.GameInfoEdit.noteHelperText', '您可以为游戏设置一个自定义的显示名称，留空则使用默认名称')}
                                />
                            </Stack>
                        </Box>
                    </Stack>
                </CardContent>
            </Card>

            {/* 可执行文件路径区域 */}
            <Box sx={{ display: 'flex', gap: 1 }}>
                <TextField
                    label={t('pages.Detail.GameInfoEdit.localPath', '可执行文件路径')}
                    variant="outlined"
                    fullWidth
                    value={localPath}
                    onChange={(e) => setLocalPath(e.target.value)}
                    disabled={isLoading || disabled || !selectedGame}
                />
                <Button
                    variant="outlined"
                    onClick={handleSelectLocalPath}
                    disabled={isLoading || disabled || !selectedGame}
                    sx={{ minWidth: '40px', px: 1 }}
                >
                    <FolderOpenIcon />
                </Button>
            </Box>


            {/* 统一保存按钮 */}
            <Button
                variant="contained"
                color="primary"
                size="large"
                fullWidth
                onClick={handleSaveAll}
                disabled={isLoading || disabled || !selectedGame || !hasChanges()}
                startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <SaveIcon />}
                sx={{ mt: 2 }}
            >
                {isLoading ? t('pages.Detail.GameInfoEdit.saving', '保存中...') : t('pages.Detail.GameInfoEdit.saveAllChanges', '保存所有更改')}
            </Button>
        </Box>
    );
};
