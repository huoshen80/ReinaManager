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
import { fetchMixedData } from "@/api/mixed";
import { fetchBgmById } from "@/api/bgm";
import { fetchVndbById } from "@/api/vndb";
import type { FullGameData, GameData } from "@/types";
import { useTranslation } from 'react-i18next';
import { snackbar } from "@/components/Snackbar";
import { transformApiGameData } from "@/utils";

interface DataSourceUpdateProps {
    bgmToken: string;
    selectedGame: GameData | null;
    onDataFetched: (data: FullGameData) => void;
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
    const fetchGameData = useCallback(async () => {
        if (!selectedGame) {
            throw new Error(t('pages.Detail.DataSourceUpdate.noGameSelected', '未选择游戏'));
        }

        if (idType === "custom") {
            throw new Error(t('pages.Detail.DataSourceUpdate.customModeWarning', '自定义模式无法从数据源更新。'));
        }

        let apiData;

        if (idType === 'bgm') {
            // BGM 单一数据源
            if (!bgmId) throw new Error(t('pages.Detail.DataSourceUpdate.bgmIdRequired', 'Bangumi ID 不能为空'));
            const result = await fetchBgmById(bgmId, bgmToken);
            if (typeof result === 'string') throw new Error(result);
            apiData = result;

        } else if (idType === 'vndb') {
            // VNDB 单一数据源
            if (!vndbId) throw new Error(t('pages.Detail.DataSourceUpdate.vndbIdRequired', 'VNDB ID 不能为空'));
            const result = await fetchVndbById(vndbId);
            if (typeof result === 'string') throw new Error(result);
            apiData = result;

        } else {
            // Mixed 混合数据源
            if (!bgmId && !vndbId) throw new Error(t('pages.Detail.DataSourceUpdate.bgmOrVndbIdRequired', 'Bangumi ID 或 VNDB ID 不能为空'));

            const { bgm_data, vndb_data } = await fetchMixedData({
                bgm_id: bgmId || undefined,
                vndb_id: vndbId || undefined,
                BGM_TOKEN: bgmToken,
            });
            let id_type;
            if (!bgm_data && !vndb_data) {
                throw new Error(t('pages.Detail.DataSourceUpdate.noDataFetched', '未获取到数据或数据源无效。'));
            }
            if (bgm_data && !vndb_data) {
                id_type = 'bgm';
            } else if (!bgm_data && vndb_data) {
                id_type = 'vndb';
            } else {
                id_type = 'mixed';
            }
            // 合并两个数据源
            apiData = {
                game: { ...bgm_data?.game, ...vndb_data?.game, id_type },
                bgm_data: bgm_data?.bgm_data || null,
                vndb_data: vndb_data?.vndb_data || null,
                other_data: null
            };
        }
        const transformedData = transformApiGameData(apiData);
        console.log(transformedData);
        return transformedData;
    }, [idType, bgmId, vndbId, bgmToken, selectedGame, t]);

    // 获取并预览游戏数据
    const handleFetchAndPreview = async () => {
        setIsLoading(true);
        try {
            const result = await fetchGameData();
            onDataFetched(result);
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
