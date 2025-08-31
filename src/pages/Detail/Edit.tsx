import { useStore } from "@/store";
import { useEffect, useState, useCallback } from "react";
import { useLocation } from "react-router";
import {
    Box,
    TextField,
    Button,
    Stack,
    FormControl,
    InputLabel,
    Select as MuiSelect,
    MenuItem,
    CircularProgress,
    type SelectChangeEvent
} from "@mui/material";
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import UpdateIcon from '@mui/icons-material/Update';
import { fetchFromBgm } from "@/api/bgm";
import { fetchFromVNDB } from "@/api/vndb";
import fetchMixedData from "@/api/mixed";
import type { GameData } from "@/types";
import { ViewUpdateGameBox, StatusAlert } from "@/components/AlertBox";
import { handleDirectory } from "@/utils";
import { updateGameLocalPath } from "@/utils/repository";
import { useTranslation } from 'react-i18next';
import CustomContentEditor from "@/components/CustomContentEditor";
/**
 * Edit 组件
 * 游戏信息编辑页面，利用全局状态管理优化，减少冗余代码。
 *
 * @component
 * @returns {JSX.Element} 编辑页面
 */
export const Edit = (): JSX.Element => {
    const { bgmToken, updateGame, selectedGame } = useStore();
    const id = Number(useLocation().pathname.split('/').pop());
    const { t } = useTranslation();

    // 可编辑状态
    const [bgmId, setBgmId] = useState<string>("");
    const [vndbId, setVndbId] = useState<string>("");
    const [idType, setIdType] = useState<string>("");
    const [localPath, setLocalPath] = useState<string>("");

    // UI 状态
    const [gameData, setGameData] = useState<GameData | string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [updateSuccess, setUpdateSuccess] = useState(false);
    const [pathUpdateSuccess, setPathUpdateSuccess] = useState(false);
    const [openViewBox, setOpenViewBox] = useState(false);

    // 重构的数据获取逻辑
    const fetchGameData = useCallback(async (): Promise<GameData | string> => {
        let fetchedData: GameData | string | null = null;

        switch (idType) {
            case "bgm": {
                if (!bgmId) return t('pages.Detail.Edit.bgmIdRequired', 'Bangumi ID 不能为空');
                try {
                    fetchedData = await fetchFromBgm(bgmId, bgmToken, bgmId);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : t('pages.Detail.Edit.unknownError', '未知错误');
                    console.error("Bangumi 数据获取失败:", errorMessage);
                    return `${t('pages.Detail.Edit.bangumiFetchError', 'Bangumi 获取错误')}: ${errorMessage}`;
                }
                break;
            }
            case "vndb": {
                if (!vndbId) return t('pages.Detail.Edit.vndbIdRequired', 'VNDB ID 不能为空');
                try {
                    fetchedData = await fetchFromVNDB(vndbId, vndbId);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : t('pages.Detail.Edit.unknownError', '未知错误');
                    console.error("VNDB 数据获取失败:", errorMessage);
                    return `${t('pages.Detail.Edit.vndbFetchError', 'VNDB 获取错误')}: ${errorMessage}`;
                }
                break;
            }
            case "mixed": {
                if (!bgmId && !vndbId) return t('pages.Detail.Edit.bgmOrVndbIdRequired', 'Bangumi ID 或 VNDB ID 不能为空');
                try {
                    fetchedData = await fetchMixedData(
                        bgmId || vndbId,
                        bgmToken,
                        bgmId,
                        vndbId
                    );
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : t('pages.Detail.Edit.unknownError', '未知错误');
                    console.error("Mixed 数据获取失败:", errorMessage);
                    return `${t('pages.Detail.Edit.mixedFetchError', 'Mixed 获取错误')}: ${errorMessage}`;
                }
                break;
            }
            case "custom": {
                return t('pages.Detail.Edit.customModeWarning', '自定义模式无法从数据源更新。');
            }
            default:
                return t('pages.Detail.Edit.invalidDataSource', '选择了无效的数据源。');
        }

        return fetchedData ?? t('pages.Detail.Edit.noDataFetched', '未获取到数据或数据源无效。');
    }, [idType, bgmId, vndbId, bgmToken, t]);

    // Effect：从 selectedGame 初始化本地状态
    useEffect(() => {
        if (selectedGame) {
            setBgmId(selectedGame.bgm_id || "");
            setVndbId(selectedGame.vndb_id || "");
            setIdType(selectedGame.id_type || "");
            setLocalPath(selectedGame.localpath || "");
        }
    }, [selectedGame]);

    // 获取并预览游戏数据
    const handleFetchAndPreview = async () => {
        setIsLoading(true);
        setFetchError(null);
        setUpdateSuccess(false);

        const result = await fetchGameData()


        if (result && typeof result !== 'string') {
            const updatedResult = {
                ...result,
                id: id,
                localpath: localPath,
                clear: selectedGame?.clear
            };
            setGameData(updatedResult);
            setOpenViewBox(true);
        } else {
            setFetchError(result);
        }

        setIsLoading(false);
    };

    // 确认更新游戏数据
    const handleConfirmGameUpdate = () => {
        if (gameData && typeof gameData !== 'string') {
            updateGame(id, gameData);
            setOpenViewBox(false);
            setUpdateSuccess(true);
            setTimeout(() => setUpdateSuccess(false), 3000);
        }
    };

    // 处理修改可执行文件路径
    const handleUpdateLocalPath = async () => {
        if (!localPath || !selectedGame) return;

        setIsLoading(true);
        try {
            await updateGameLocalPath(id, localPath);

            // 更新全局状态
            const updatedGame = { ...selectedGame, localpath: localPath };
            updateGame(id, updatedGame);

            setPathUpdateSuccess(true);
            setTimeout(() => setPathUpdateSuccess(false), 3000);
        } catch (error) {
            setFetchError(`${t('pages.Detail.Edit.updatePathFailed', '更新路径失败')}: ${error instanceof Error ? error.message : t('pages.Detail.Edit.unknownError', '未知错误')}`);
        } finally {
            setIsLoading(false);
        }
    };

    // 处理选择可执行文件路径
    const handleSelectLocalPath = async () => {
        const selectedPath = await handleDirectory();
        if (selectedPath) {
            setLocalPath(selectedPath);
        }
    };

    // 处理数据源选择变更
    const handleIdTypeChange = (event: SelectChangeEvent) => {
        setIdType(event.target.value);
    };

    // 构建成功消息数组
    const successMessages = [];
    if (updateSuccess) {
        successMessages.push(t('pages.Detail.Edit.updateSuccess', '游戏信息已成功更新'));
    }
    if (pathUpdateSuccess) {
        successMessages.push(t('pages.Detail.Edit.pathUpdateSuccess', '游戏路径已成功更新'));
    }

    return (
        <Box sx={{ p: 3 }}>
            {/* 状态提示区域 */}
            <StatusAlert
                error={fetchError}
                success={successMessages.length > 0 ? successMessages : null}
                gameNotFound={!selectedGame}
            />

            {/* 游戏更新确认弹窗 */}
            <ViewUpdateGameBox
                open={openViewBox}
                setOpen={setOpenViewBox}
                onConfirm={handleConfirmGameUpdate}
                game={gameData}
            />

            <Stack spacing={3}>
                {/* ID 类型选择框 */}
                <FormControl fullWidth disabled={isLoading || !selectedGame}>
                    <InputLabel id="id-type-label">{t('pages.Detail.Edit.dataSource', '数据源')}</InputLabel>
                    <MuiSelect
                        labelId="id-type-label"
                        value={idType}
                        onChange={handleIdTypeChange}
                        label={t('pages.Detail.Edit.dataSource', '数据源')}
                    >
                        <MenuItem value="bgm">Bangumi</MenuItem>
                        <MenuItem value="vndb">VNDB</MenuItem>
                        <MenuItem value="mixed">Mixed</MenuItem>
                        <MenuItem value="custom">Custom</MenuItem>
                        <MenuItem value="Whitecloud" disabled>Whitecloud</MenuItem>
                    </MuiSelect>
                </FormControl>

                {/* Bangumi ID 编辑框 */}
                {idType !== "vndb" && idType !== "custom" && (
                    <TextField
                        label={t('pages.Detail.Edit.bgmId', 'Bangumi ID')}
                        variant="outlined"
                        fullWidth
                        value={bgmId}
                        onChange={(e) => setBgmId(e.target.value)}
                        disabled={isLoading}
                    />
                )}

                {/* VNDB ID 编辑框 */}
                {idType !== "bgm" && idType !== "custom" && (
                    <TextField
                        label={t('pages.Detail.Edit.vndbId', 'VNDB ID')}
                        variant="outlined"
                        fullWidth
                        value={vndbId}
                        onChange={(e) => setVndbId(e.target.value)}
                        disabled={isLoading}
                    />
                )}

                {/* 更新按钮 */}
                <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    fullWidth
                    disabled={
                        idType === "custom" ||
                        isLoading ||
                        !selectedGame ||
                        (idType === "bgm" && !bgmId) ||
                        (idType === "vndb" && !vndbId) ||
                        (idType === "mixed" && !bgmId && !vndbId)
                    }
                    onClick={handleFetchAndPreview}
                    startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <UpdateIcon />}
                >
                    {isLoading ? t('pages.Detail.Edit.loading', '正在获取...') : t('pages.Detail.Edit.updateFromSource', '从数据源更新数据')}
                </Button>

                {/* 可执行文件路径区域 */}
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <TextField
                        label={t('pages.Detail.Edit.localPath', '可执行文件路径')}
                        variant="outlined"
                        fullWidth
                        value={localPath}
                        onChange={(e) => setLocalPath(e.target.value)}
                        disabled={isLoading || !selectedGame}
                    />
                    <Button
                        variant="outlined"
                        onClick={handleSelectLocalPath}
                        disabled={isLoading || !selectedGame}
                        sx={{ minWidth: '40px', px: 1 }}
                    >
                        <FolderOpenIcon />
                    </Button>
                </Box>

                {/* 更新路径按钮 */}
                <Button
                    variant="contained"
                    color="primary"
                    size="large"
                    fullWidth
                    onClick={handleUpdateLocalPath}
                    disabled={isLoading || !localPath || !selectedGame}
                >
                    {t('pages.Detail.Edit.updateLocalPath', '更新可执行文件路径')}
                </Button>

                {/* 自定义内容编辑器 */}
                {selectedGame && (
                    <CustomContentEditor
                        game={selectedGame}
                        onUpdate={(updatedGame) => {
                            // 更新全局状态中的selectedGame
                            useStore.getState().setSelectedGame(updatedGame);
                        }}
                        onError={(error) => {
                            setFetchError(error);
                        }}
                        disabled={isLoading}
                    />
                )}
            </Stack>
        </Box>
    );
};