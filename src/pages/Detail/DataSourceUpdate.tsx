import { useState, useCallback, useEffect } from "react";
import {
    Box,
    TextField,
    Button,
    FormControl,
    InputLabel,
    Select as MuiSelect,
    MenuItem,
    CircularProgress,
    type SelectChangeEvent
} from "@mui/material";
import UpdateIcon from '@mui/icons-material/Update';
import { fetchBgmById } from "@/api/bgm";
import { fetchVndbById } from "@/api/vndb";
import { fetchMixedById } from "@/api/mixed";
import type { GameData } from "@/types";
import { useTranslation } from 'react-i18next';
import { snackbar } from "@/components/Snackbar";

interface DataSourceUpdateProps {
    bgmToken: string;
    selectedGame: GameData | null;
    onDataFetched: (data: GameData) => void;
    disabled?: boolean;
}

/**
 * DataSourceUpdate 组件
 * 负责从外部数据源(BGM, VNDB, Mixed)更新游戏信息
 */
export const DataSourceUpdate: React.FC<DataSourceUpdateProps> = ({
    bgmToken,
    selectedGame,
    onDataFetched,
    disabled = false
}) => {
    const { t } = useTranslation();

    // 数据源更新相关状态
    const [bgmId, setBgmId] = useState<string>(selectedGame?.bgm_id || "");
    const [vndbId, setVndbId] = useState<string>(selectedGame?.vndb_id || "");
    const [idType, setIdType] = useState<string>(selectedGame?.id_type || "");
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        setBgmId(selectedGame?.bgm_id || "");
        setVndbId(selectedGame?.vndb_id || "");
        setIdType(selectedGame?.id_type || "");
    }, [selectedGame]);

    // 重构的数据获取逻辑
    const fetchGameData = useCallback(async (): Promise<GameData> => {
        let fetchedData: GameData | string | null = null;

        switch (idType) {
            case "bgm": {
                if (!bgmId) throw new Error(t('pages.Detail.DataSourceUpdate.bgmIdRequired', 'Bangumi ID 不能为空'));
                try {
                    fetchedData = await fetchBgmById(bgmId, bgmToken);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : t('pages.Detail.DataSourceUpdate.unknownError', '未知错误');
                    console.error("Bangumi 数据获取失败:", errorMessage);
                    throw new Error(`${t('pages.Detail.DataSourceUpdate.bangumiFetchError', 'Bangumi 获取错误')}: ${errorMessage}`);
                }
                break;
            }
            case "vndb": {
                if (!vndbId) throw new Error(t('pages.Detail.DataSourceUpdate.vndbIdRequired', 'VNDB ID 不能为空'));
                try {
                    fetchedData = await fetchVndbById(vndbId);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : t('pages.Detail.DataSourceUpdate.unknownError', '未知错误');
                    console.error("VNDB 数据获取失败:", errorMessage);
                    throw new Error(`${t('pages.Detail.DataSourceUpdate.vndbFetchError', 'VNDB 获取错误')}: ${errorMessage}`);
                }
                break;
            }
            case "mixed": {
                if (!bgmId && !vndbId) throw new Error(t('pages.Detail.DataSourceUpdate.bgmOrVndbIdRequired', 'Bangumi ID 或 VNDB ID 不能为空'));
                try {
                    fetchedData = await fetchMixedById(bgmId, vndbId, bgmToken);
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : t('pages.Detail.DataSourceUpdate.unknownError', '未知错误');
                    console.error("Mixed 数据获取失败:", errorMessage);
                    throw new Error(`${t('pages.Detail.DataSourceUpdate.mixedFetchError', 'Mixed 获取错误')}: ${errorMessage}`);
                }
                break;
            }
            case "custom": {
                throw new Error(t('pages.Detail.DataSourceUpdate.customModeWarning', '自定义模式无法从数据源更新。'));
            }
            default:
                throw new Error(t('pages.Detail.DataSourceUpdate.invalidDataSource', '选择了无效的数据源。'));
        }

        if (!fetchedData || typeof fetchedData === 'string') {
            throw new Error(t('pages.Detail.DataSourceUpdate.noDataFetched', '未获取到数据或数据源无效。'));
        }

        return fetchedData;
    }, [idType, bgmId, vndbId, bgmToken, t]);

    // 获取并预览游戏数据
    const handleFetchAndPreview = async () => {
        setIsLoading(true);
        try {
            const result = await fetchGameData();
            onDataFetched(result); // 现在 result 一定是 GameData 类型
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t('pages.Detail.DataSourceUpdate.unknownError', '未知错误');
            snackbar.error(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    // 处理数据源选择变更
    const handleIdTypeChange = (event: SelectChangeEvent) => {
        setIdType(event.target.value);
    };

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* ID 类型选择框 */}
            <FormControl fullWidth disabled={isLoading || disabled || !selectedGame}>
                <InputLabel id="id-type-label">{t('pages.Detail.DataSourceUpdate.dataSource', '数据源')}</InputLabel>
                <MuiSelect
                    labelId="id-type-label"
                    value={idType}
                    onChange={handleIdTypeChange}
                    label={t('pages.Detail.DataSourceUpdate.dataSource', '数据源')}
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
                    label={t('pages.Detail.DataSourceUpdate.bgmId', 'Bangumi ID')}
                    variant="outlined"
                    fullWidth
                    value={bgmId}
                    onChange={(e) => setBgmId(e.target.value)}
                    disabled={isLoading || disabled}
                />
            )}

            {/* VNDB ID 编辑框 */}
            {idType !== "bgm" && idType !== "custom" && (
                <TextField
                    label={t('pages.Detail.DataSourceUpdate.vndbId', 'VNDB ID')}
                    variant="outlined"
                    fullWidth
                    value={vndbId}
                    onChange={(e) => setVndbId(e.target.value)}
                    disabled={isLoading || disabled}
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
                    disabled ||
                    !selectedGame ||
                    (idType === "bgm" && !bgmId) ||
                    (idType === "vndb" && !vndbId) ||
                    (idType === "mixed" && !bgmId && !vndbId)
                }
                onClick={handleFetchAndPreview}
                startIcon={isLoading ? <CircularProgress size={20} color="inherit" /> : <UpdateIcon />}
            >
                {isLoading ? t('pages.Detail.DataSourceUpdate.loading', '正在获取...') : t('pages.Detail.DataSourceUpdate.updateFromSource', '从数据源更新数据')}
            </Button>
        </Box>
    );
};
