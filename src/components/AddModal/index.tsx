/**
 * @file AddModal 组件
 * @description 用于添加新游戏条目的弹窗组件，支持通过 Bangumi/VNDB API 自动获取信息或自定义添加本地游戏，包含错误提示、加载状态、国际化等功能。
 * @module src/components/AddModal/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - AddModal：添加游戏的弹窗组件
 *
 * 依赖：
 * - @mui/material
 * - @tauri-apps/plugin-dialog
 * - @tauri-apps/api/core
 * - @/api/bgm
 * - @/api/vndb
 * - @/store
 * - @/utils
 * - react-i18next
 */

import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import AddIcon from '@mui/icons-material/Add';
import FileOpenIcon from '@mui/icons-material/FileOpen';
import { useModal } from '@/components/Toolbar';
import { useEffect, useState } from 'react';
import { fetchBgmById, fetchBgmByName } from '@/api/bgm';
import { fetchVndbById, fetchVndbByName } from '@/api/vndb';
import { fetchMixedData } from '@/api/mixed';
import Alert from '@mui/material/Alert';
import { useStore } from '@/store/';
import CircularProgress from '@mui/material/CircularProgress';
import { isTauri } from '@tauri-apps/api/core';
import Switch from '@mui/material/Switch';
import { RadioGroup, FormControlLabel, Radio } from '@mui/material';
import { transformApiGameData } from '@/utils/apiDataTransform';
import { getSetting, setSetting } from '@/utils/localStorage';
import { useTranslation } from 'react-i18next';
import { handleDirectory } from '@/utils';

/**
 * AddModal 组件用于添加新游戏条目。
 *
 * 主要功能：
 * - 支持通过 Bangumi 或 VNDB API 自动获取游戏信息。
 * - 支持自定义模式，允许用户手动选择本地可执行文件并填写名称。
 * - 支持错误提示、加载状态、国际化等功能。
 *
 * @component
 * @returns {JSX.Element} 添加游戏的弹窗组件
 */
const AddModal: React.FC = () => {
    const { t } = useTranslation();
    const { bgmToken, games, addGame } = useStore();
    const { isopen, handleOpen, handleClose } = useModal();
    const [formText, setFormText] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [path, setPath] = useState('');
    const [customMode, setCustomMode] = useState(false);
    // 将 boolean 切换改为多种模式选择
    const [apiSource, setApiSource] = useState<'bgm' | 'vndb' | 'mixed'>(getSetting('apiSource') || 'vndb');
    // 保留 ID 搜索状态
    const [isID, setisID] = useState(false);
    /**
     * 当路径变化时，自动提取文件夹名作为游戏名。
     */
    useEffect(() => {
        if (path) {
            const folderName = extractFolderName(path);
            setFormText(folderName);
        }
    }, [path]);

    // 持久化：apiSource 变化时写入设置
    useEffect(() => {
        // 仅在值有效时保存
        if (apiSource) {
            setSetting('apiSource', apiSource);
        }
    }, [apiSource]);

    /**
     * 提交表单，处理添加游戏的逻辑。
     * - 自定义模式下直接添加本地游戏。
     * - 其他模式下通过 API 获取游戏信息并添加。
     */
    const handleSubmit = async () => {
        try {
            setLoading(true);

            const defaultdata = {
                game: { localpath: path, autosave: 0, clear: 0 },
            }
            // 场景1: 自定义模式
            if (customMode) {
                if (!path) {
                    setError(t('components.AddModal.noExecutableSelected'));
                    setTimeout(() => setError(''), 5000);
                    return;
                }

                const customGameData = transformApiGameData(
                    { game: { id_type: 'custom' } },
                    { ...defaultdata, other: { name: formText, image: "/images/default.png" } }
                );

                addGame(customGameData);
                setFormText('');
                setPath('');
                handleClose();
                return;
            }

            // 场景2-4: 通过 API 获取数据
            let apiData;

            if (apiSource === 'bgm') {
                // BGM 单一数据源
                const result = isID
                    ? await fetchBgmById(formText, bgmToken)
                    : await fetchBgmByName(formText, bgmToken);

                if (typeof result === 'string') {
                    setError(result);
                    setTimeout(() => setError(''), 5000);
                    return;
                }
                apiData = result;

            } else if (apiSource === 'vndb') {
                // VNDB 单一数据源
                const result = isID
                    ? await fetchVndbById(formText)
                    : await fetchVndbByName(formText);

                if (typeof result === 'string') {
                    setError(result);
                    setTimeout(() => setError(''), 5000);
                    return;
                }
                apiData = result;

            } else {
                // Mixed 混合数据源
                const { bgmId, vndbId } = isID ? parseGameId(formText, true) : {};

                if (isID && !bgmId && !vndbId) {
                    setError(t('components.AddModal.invalidIDFormat'));
                    setTimeout(() => setError(''), 5000);
                    return;
                }

                const { bgm_data, vndb_data } = await fetchMixedData({
                    bgm_id: bgmId,
                    vndb_id: vndbId,
                    name: !isID ? formText : undefined,
                    BGM_TOKEN: bgmToken,
                });

                if (!bgm_data && !vndb_data) {
                    setError(t('components.AddModal.noDataSource'));
                    setTimeout(() => setError(''), 5000);
                    return;
                }

                // 合并两个数据源
                apiData = {
                    game: { ...bgm_data?.game, ...vndb_data?.game, id_type: 'mixed' },//date不一致时，可能会出现搜索结果不同的问题
                    bgm_data: bgm_data?.bgm_data || null,
                    vndb_data: vndb_data?.vndb_data || null,
                    other_data: null
                };
            }

            // 统一使用 transformApiGameData 处理所有数据
            const fullGameData = transformApiGameData(apiData, { ...defaultdata });

            // 检查是否已存在相同游戏
            const existingGame = games.find((game) => {
                if (fullGameData.game.bgm_id && game.bgm_id === fullGameData.game.bgm_id) return true;
                if (fullGameData.game.vndb_id && game.vndb_id === fullGameData.game.vndb_id) return true;
                return false;
            });

            if (existingGame) {
                setError(t('components.AddModal.gameExists'));
                setTimeout(() => setError(''), 5000);
                return;
            }

            addGame(fullGameData);
            setFormText('');
            setPath('');
            handleClose();

        } catch (error) {
            const errorMessage = error instanceof Error
                ? error.message
                : t('components.AddModal.unknownError');
            setError(errorMessage);
            setTimeout(() => setError(''), 5000);
        } finally {
            setLoading(false);
        }
    }

    /**
     * 从文件路径中提取文件夹名称。
     * @param path 文件路径
     * @returns 文件夹名称
     */
    const extractFolderName = (path: string): string => {
        const parts = path.split('\\');
        return parts.length > 1 ? parts[parts.length - 2] : '';
    };

    /**
     * 解析游戏 ID，判断是 Bangumi ID 还是 VNDB ID
     * @param input 用户输入的文本
     * @param isID 是否为 ID 搜索模式
     * @returns 包含 bgmId 和 vndbId 的对象
     */
    const parseGameId = (input: string, isID: boolean): { bgmId?: string; vndbId?: string } => {
        if (!isID) {
            return {}; // 如果不是 ID 搜索模式，返回空对象
        }

        // VNDB ID 格式：v + 数字（如 v17, v1234）
        if (/^v\d+$/i.test(input)) {
            return { vndbId: input };
        }

        // Bangumi ID 格式：纯数字字符串（如 123, 456789）
        if (/^\d+$/.test(input)) {
            return { bgmId: input };
        }

        // 如果格式不匹配，返回空对象
        return {};
    };

    return (
        <>
            {/* 添加游戏按钮，点击后弹窗打开 */}
            <Button onClick={handleOpen} startIcon={<AddIcon />}>{t('components.AddModal.addGame')}</Button>
            <Dialog
                open={isopen}
                onClose={(_, reason) => {
                    // 加载时防止关闭弹窗
                    if (reason !== 'backdropClick' && !loading) {
                        handleClose();
                    }
                }}
                closeAfterTransition={false}
                aria-labelledby="addgame-dialog-title"
            >
                {/* 错误提示 */}
                {error && <Alert severity="error">{error}</Alert>}
                <DialogTitle>{t('components.AddModal.addGame')}</DialogTitle>
                <DialogContent>
                    {/* 选择本地可执行文件 */}
                    <Button className='w-md' variant='contained' onClick={async () => {
                        const result = await handleDirectory();
                        if (result)
                            setPath(result);
                    }} startIcon={<FileOpenIcon />} disabled={!isTauri()} >{t('components.AddModal.selectLauncher')}</Button>
                    <p>
                        <input className='w-md' type="text" value={path}
                            placeholder={t('components.AddModal.selectExecutable')} readOnly />
                    </p>
                    {/* 自定义模式和 API 来源切换 */}
                    <div>
                        <Switch checked={customMode} onChange={() => {
                            setCustomMode(!customMode)
                        }} />
                        <span>{t('components.AddModal.enableCustomMode')}</span>
                        <RadioGroup className='ml-2' row value={apiSource} onChange={(e) => setApiSource(e.target.value as 'bgm' | 'vndb' | 'mixed')}>
                            <FormControlLabel value="bgm" control={<Radio />} label="Bangumi" />
                            <FormControlLabel value="vndb" control={<Radio />} label="VNDB" />
                            <FormControlLabel value="mixed" control={<Radio />} label="Mixed" />
                        </RadioGroup>
                        <Switch checked={isID} onChange={() => {
                            setisID(!isID)
                        }} />
                        <span>{t('components.AddModal.idSearch')}</span>
                    </div>
                    {/* 游戏名称输入框 */}
                    <TextField
                        required
                        margin="dense"
                        id="name"
                        name="game-name"
                        label={!isID ? t('components.AddModal.gameName') : t('components.AddModal.gameIDTips')}
                        type="text"
                        fullWidth
                        variant="standard"
                        autoComplete="off"
                        value={formText}
                        onChange={(event) => setFormText(event.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    {/* 取消按钮 */}
                    <Button variant="outlined" onClick={() => {
                        setFormText('');
                        setPath('');
                        handleClose();
                    }} disabled={loading} >{t('components.AddModal.cancel')}</Button>
                    {/* 确认按钮 */}
                    <Button
                        variant="contained"
                        onClick={handleSubmit}
                        disabled={formText === '' || loading}
                        startIcon={loading ? <CircularProgress size={20} /> : null}
                    >
                        {loading ? t('components.AddModal.processing') : t('components.AddModal.confirm')}
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}

export default AddModal;
