/**
 * @file Settings 页面
 * @description 应用设置页，支持 Bangumi Token 设置、语言切换等功能。
 * @module src/pages/Settings/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - Settings：设置页面主组件
 * - LanguageSelect：语言选择组件
 *
 * 依赖：
 * - @mui/material
 * - @toolpad/core
 * - @/store
 * - @/utils
 * - react-i18next
 */

import { useEffect, useState } from 'react';
import { useStore } from '@/store';
import { openurl, openDatabaseBackupFolder, handleGetFolder, moveBackupFolder } from '@/utils';
import Box from '@mui/material/Box';
import InputLabel from '@mui/material/InputLabel';
import MenuItem from '@mui/material/MenuItem';
import Select, { type SelectChangeEvent } from '@mui/material/Select';
import { useTranslation } from 'react-i18next';
import { PageContainer } from '@toolpad/core';
import TextField from '@mui/material/TextField';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import { isEnabled } from '@tauri-apps/plugin-autostart';
import { toggleAutostart } from '@/components/AutoStart';
import { Switch, FormControlLabel, RadioGroup, Radio, Checkbox, CircularProgress, IconButton, InputAdornment, Typography, Link, Divider } from '@mui/material';
import { backupDatabase } from '@/utils/database';
import { getSavePathRepository, setSavePathRepository } from '@/utils/settingsConfig';
import { StatusAlert } from '@/components/AlertBox';
import BackupIcon from '@mui/icons-material/Backup';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import ClearIcon from '@mui/icons-material/Clear';
import SaveIcon from '@mui/icons-material/Save';
import UpdateIcon from '@mui/icons-material/Update';
import { isTauri } from '@tauri-apps/api/core';
import { checkForUpdates } from '@/components/Update';
import pkg from '../../../package.json';


/**
 * LanguageSelect 组件
 * 语言选择下拉框，支持中、英、日多语言切换。
 *
 * @component
 * @returns {JSX.Element} 语言选择器
 */
const LanguageSelect = () => {
    const { t, i18n } = useTranslation(); // 使用i18n实例和翻译函数
    const [language, setLanguage] = useState(i18n.language); // 使用当前语言初始化状态

    // 语言名称映射
    const languageNames = {
        "zh-CN": "简体中文(zh-CN)",
        "zh-TW": "繁体中文(zh-TW)",
        "en-US": "English(en-US)",
        "ja-JP": "日本語(ja-JP)",
    };

    // 当i18n.language变化时更新state
    useEffect(() => {
        setLanguage(i18n.language);
    }, [i18n.language]);

    /**
     * 处理语言切换
     * @param {SelectChangeEvent} event
     */
    const handleChange = (event: SelectChangeEvent) => {
        const newLang = event.target.value;
        setLanguage(newLang);
        i18n.changeLanguage(newLang); // 切换语言
    };

    return (
        <Box className="min-w-30 mb-6">
            <InputLabel
                id="language-select-label"
                className="mb-2 font-semibold"
            >
                {t('pages.Settings.language')}
            </InputLabel>
            <Select
                labelId="language-select-label"
                id="language-select"
                value={language}
                onChange={handleChange}
                className="w-60"
                renderValue={(value) => languageNames[value as keyof typeof languageNames]}
            >
                <MenuItem value="zh-CN">简体中文(zh-CN)</MenuItem>
                <MenuItem value="zh-TW">繁体中文(zh-TW)</MenuItem>
                <MenuItem value="en-US">English(en-US)</MenuItem>
                <MenuItem value="ja-JP">日本語(ja-JP)</MenuItem>
            </Select>
        </Box>
    );
}

const BgmTokenSettings = () => {
    const { t } = useTranslation();
    const { bgmToken, setBgmToken } = useStore();
    const [inputToken, setInputToken] = useState('');
    const [tokenStatus, setTokenStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    useEffect(() => {
        setInputToken(bgmToken);
    }, [bgmToken]);

    /**
     * 打开 Bangumi Token 获取页面
     */
    const handleOpen = () => {
        openurl("https://next.bgm.tv/demo/access-token/create");
    }

    /**
     * 保存BGM Token
     */
    const handleSaveToken = () => {
        try {
            setBgmToken(inputToken);
            setTokenStatus({
                type: 'success',
                message: t('pages.Settings.bgmTokenSettings.saveSuccess', 'BGM Token 保存成功')
            });

            // 3秒后清除状态消息
            setTimeout(() => setTokenStatus(null), 3000);
        } catch (error) {
            setTokenStatus({
                type: 'error',
                message: t('pages.Settings.bgmTokenSettings.saveError', 'BGM Token 保存失败')
            });
        }
    };

    /**
     * 清除BGM Token输入框
     */
    const handleClearToken = () => {
        setInputToken('');
        setTokenStatus(null);
    };

    return (
        <Box className="mb-8">
            <InputLabel className="font-semibold mb-4">
                {t('pages.Settings.bgmToken')}
            </InputLabel>

            {/* BGM Token 状态提示 */}
            <StatusAlert
                success={tokenStatus?.type === 'success' ? tokenStatus.message : null}
                error={tokenStatus?.type === 'error' ? tokenStatus.message : null}
                sx={{ mb: 2 }}
            />

            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                <TextField
                    type="password"
                    placeholder={t('pages.Settings.tokenPlaceholder')}
                    value={inputToken}
                    onChange={(e) => setInputToken(e.target.value)}
                    variant="outlined"
                    size="medium"
                    className="min-w-60"
                    InputProps={{
                        endAdornment: inputToken && (
                            <InputAdornment position="end">
                                <IconButton
                                    onClick={handleClearToken}
                                    edge="end"
                                    size="small"
                                    aria-label={t('pages.Settings.bgmTokenSettings.clearToken', '清除令牌')}
                                >
                                    <ClearIcon />
                                </IconButton>
                            </InputAdornment>
                        ),
                    }}
                />
                <Button
                    variant="contained"
                    color="primary"
                    onClick={handleSaveToken}
                    className="px-6 py-2"
                >
                    {t('pages.Settings.saveBtn')}
                </Button>
                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleOpen}
                    className="px-6 py-2"
                >
                    {t('pages.Settings.getToken')}
                </Button>
            </Stack>
        </Box>
    );
}

const AutoStartSettings = () => {
    const { t } = useTranslation();
    const [autoStart, setAutoStart] = useState(false);

    useEffect(() => {
        const checkAutoStart = async () => {
            setAutoStart(await isEnabled());
        };
        checkAutoStart();
    }, []);

    return (
        <Box className="mb-6">
            <Stack direction="row" alignItems="center" className="min-w-60">
                <Box>
                    <InputLabel className="font-semibold mb-1">
                        {t('pages.Settings.autoStart')}
                    </InputLabel>
                </Box>
                <Switch
                    checked={autoStart}
                    onChange={() => {
                        setAutoStart(!autoStart);
                        toggleAutostart();
                    }}
                    color="primary"
                />
            </Stack>
        </Box>
    );
}

const NsfwSettings = () => {
    const { t } = useTranslation();
    const { nsfwFilter, setNsfwFilter, nsfwCoverReplace, setNsfwCoverReplace } = useStore();

    return (
        <Box className="mb-6">
            <InputLabel className="font-semibold mb-4">
                {t('pages.Settings.nsfw.title')}
            </InputLabel>

            <Box className="pl-2">
                <FormControlLabel
                    control={
                        <Switch
                            checked={nsfwFilter}
                            onChange={e => setNsfwFilter(e.target.checked)}
                            color="primary"
                        />
                    }
                    label={t('pages.Settings.nsfw.filter')}
                />

                <FormControlLabel
                    control={
                        <Switch
                            checked={nsfwCoverReplace}
                            onChange={e => setNsfwCoverReplace(e.target.checked)}
                            color="primary"
                        />
                    }
                    label={t('pages.Settings.nsfw.coverReplace')}
                />
            </Box>
        </Box>
    );
};

const TagTranslationSettings = () => {
    const { t } = useTranslation();
    const { tagTranslation, setTagTranslation } = useStore();

    return (
        <Box className="mb-6">
            <Stack direction="row" alignItems="center" className="min-w-60">
                <Box>
                    <InputLabel className="font-semibold mb-1">
                        {t('pages.Settings.tagTranslation.title')}
                    </InputLabel>
                    <Typography variant="caption" color="text.secondary">
                        {t('pages.Settings.tagTranslation.description')}
                    </Typography>
                </Box>
                <Switch
                    checked={tagTranslation}
                    onChange={(e) => setTagTranslation(e.target.checked)}
                    color="primary"
                />
            </Stack>
        </Box>
    );
};

const CardClickModeSettings = () => {
    const { t } = useTranslation();
    const { cardClickMode, setCardClickMode, doubleClickLaunch, setDoubleClickLaunch, longPressLaunch, setLongPressLaunch } = useStore();

    return (
        <Box className="mb-6">
            <InputLabel className="font-semibold mb-4">
                {t('pages.Settings.cardClickMode.title')}
            </InputLabel>
            <Box className="pl-2">
                <RadioGroup
                    value={cardClickMode}
                    onChange={e => setCardClickMode(e.target.value as 'navigate' | 'select')}
                    className="pl-2"
                >
                    <FormControlLabel
                        value="navigate"
                        control={<Radio color="primary" />}
                        label={t('pages.Settings.cardClickMode.navigate')}
                        className="mb-1"
                    />
                    <FormControlLabel
                        value="select"
                        control={<Radio color="primary" />}
                        label={t('pages.Settings.cardClickMode.select')}
                        className="mb-1"
                    />
                </RadioGroup>

                {/* 双击启动游戏设置 */}
                <Box className="mt-4 pl-2">
                    <FormControlLabel
                        control={
                            <Switch
                                checked={doubleClickLaunch}
                                onChange={e => setDoubleClickLaunch(e.target.checked)}
                                color="primary"
                            />
                        }
                        label={t('pages.Settings.cardClickMode.doubleClickLaunch')}
                        className="mb-1"
                    />
                    {doubleClickLaunch && cardClickMode === 'navigate' && (
                        <Typography variant="caption" color="text.secondary" className="block ml-8">
                            {t('pages.Settings.cardClickMode.doubleClickLaunchNote')}
                        </Typography>
                    )}
                </Box>

                {/* 长按启动游戏设置 */}
                <Box className="mt-4 pl-2">
                    <FormControlLabel
                        control={
                            <Switch
                                checked={longPressLaunch}
                                onChange={e => setLongPressLaunch(e.target.checked)}
                                color="primary"
                            />
                        }
                        label={t('pages.Settings.cardClickMode.longPressLaunch')}
                        className="mb-1"
                    />
                    {longPressLaunch && (
                        <Typography variant="caption" color="text.secondary" className="block ml-8">
                            {t('pages.Settings.cardClickMode.longPressLaunchNote')}
                        </Typography>
                    )}
                </Box>
            </Box>
        </Box>
    );
};

const CloseBtnSettings = () => {
    const { t } = useTranslation();
    const { skipCloseRemind, defaultCloseAction, setSkipCloseRemind, setDefaultCloseAction } = useStore();
    return (
        <Box className="mb-6">
            <InputLabel className="font-semibold mb-4">
                {t('pages.Settings.closeSettings')}
            </InputLabel>
            <Box className="pl-2">
                <FormControlLabel
                    control={
                        <Checkbox
                            checked={skipCloseRemind}
                            onChange={e => setSkipCloseRemind(e.target.checked)}
                            color="primary"
                        />
                    }
                    label={t('pages.Settings.skipCloseRemind')}
                    className="mb-2"
                />
                <RadioGroup
                    value={defaultCloseAction}
                    onChange={e => setDefaultCloseAction(e.target.value as 'hide' | 'close')}
                    className="pl-4"
                >
                    <FormControlLabel
                        value="hide"
                        control={<Radio color="primary" />}
                        label={t('pages.Settings.closeToTray')}
                        disabled={!skipCloseRemind}
                        className={!skipCloseRemind ? "opacity-50 transition-opacity duration-200" : ""}
                    />
                    <FormControlLabel
                        value="close"
                        control={<Radio color="primary" />}
                        label={t('pages.Settings.closeApp')}
                        disabled={!skipCloseRemind}
                        className={!skipCloseRemind ? "opacity-50 transition-opacity duration-200" : ""}
                    />
                </RadioGroup>
            </Box>
        </Box>
    );
}

const DatabaseBackupSettings = () => {
    const { t } = useTranslation();
    const [isBackingUp, setIsBackingUp] = useState(false);
    const [backupStatus, setBackupStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    const handleBackupDatabase = async () => {
        setIsBackingUp(true);
        setBackupStatus(null);

        try {
            const backupPath = await backupDatabase();
            setBackupStatus({
                type: 'success',
                message: t('pages.Settings.databaseBackup.backupSuccess', `数据库备份成功: ${backupPath}`)
            });

            // 3秒后清除状态消息
            setTimeout(() => setBackupStatus(null), 3000);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t('pages.Settings.databaseBackup.backupFailed', '备份失败');
            setBackupStatus({
                type: 'error',
                message: t('pages.Settings.databaseBackup.backupError', `数据库备份失败: ${errorMessage}`)
            });
        } finally {
            setIsBackingUp(false);
        }
    };

    const handleOpenBackupFolder = async () => {
        try {
            await openDatabaseBackupFolder();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t('pages.Settings.databaseBackup.openFolderFailed', '打开文件夹失败');
            setBackupStatus({
                type: 'error',
                message: t('pages.Settings.databaseBackup.openFolderError', `打开备份文件夹失败: ${errorMessage}`)
            });
        }
    };

    return (
        <Box className="mb-6">
            <InputLabel className="font-semibold mb-4">
                {t('pages.Settings.databaseBackup.title', '数据库备份')}
            </InputLabel>

            {/* 状态提示 */}
            <StatusAlert
                success={backupStatus?.type === 'success' ? backupStatus.message : null}
                error={backupStatus?.type === 'error' ? backupStatus.message : null}
                sx={{ mb: 2 }}
            />

            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                <Button
                    variant="contained"
                    color="primary"
                    onClick={handleBackupDatabase}
                    disabled={isBackingUp || !isTauri()}
                    startIcon={isBackingUp ? <CircularProgress size={16} color="inherit" /> : <BackupIcon />}
                    className="px-6 py-2"
                >
                    {isBackingUp ? t('pages.Settings.databaseBackup.backing', '备份中...') : t('pages.Settings.databaseBackup.backup', '备份数据库')}
                </Button>

                <Button
                    variant="outlined"
                    color="primary"
                    onClick={handleOpenBackupFolder}
                    startIcon={<FolderOpenIcon />}
                    className="px-6 py-2"
                    disabled={!isTauri()}
                >
                    {t('pages.Settings.databaseBackup.openFolder', '打开备份文件夹')}
                </Button>
            </Stack>
        </Box>
    );
}

const SavePathSettings = () => {
    const { t } = useTranslation();
    const [savePath, setSavePath] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error' | 'warning', message: string } | null>(null);
    const [originalPath, setOriginalPath] = useState(''); // 存储原始路径

    // 加载当前设置的备份路径
    useEffect(() => {
        const loadSavePath = async () => {
            try {
                const currentPath = await getSavePathRepository();
                setSavePath(currentPath);
                setOriginalPath(currentPath); // 保存原始路径
            } catch (error) {
                console.error('加载备份路径失败:', error);
            }
        };
        loadSavePath();
    }, []);

    const handleSelectFolder = async () => {
        try {
            const selectedPath = await handleGetFolder();
            if (selectedPath) {
                setSavePath(selectedPath);
            }
        } catch (error) {
            setSaveStatus({
                type: 'error',
                message: t('pages.Settings.savePath.selectFolderError', '选择文件夹失败')
            });
        }
    };

    const handleSavePath = async () => {
        setIsLoading(true);
        setSaveStatus(null);

        try {
            // 首先保存新路径到数据库
            await setSavePathRepository(savePath);

            // 如果路径发生了变化，需要移动备份文件夹
            if (originalPath !== savePath || originalPath !== '') {
                setSaveStatus({
                    type: 'warning',
                    message: t('pages.Settings.savePath.movingBackups', '正在移动备份文件夹到新位置...')
                });

                const moveResult = await moveBackupFolder(originalPath, savePath);

                if (moveResult.moved) {
                    setSaveStatus({
                        type: 'success',
                        message: t('pages.Settings.savePath.moveSuccess', '备份路径保存成功，备份文件夹已移动到新位置')
                    });
                    setOriginalPath(savePath); // 更新原始路径
                } else {
                    setSaveStatus({
                        type: 'warning',
                        message: t('pages.Settings.savePath.moveWarning', `备份路径已保存，但移动备份文件夹时出现问题: ${moveResult.message}`)
                    });
                }
            } else {
                setSaveStatus({
                    type: 'success',
                    message: t('pages.Settings.savePath.saveSuccess', '备份路径保存成功')
                });
            }

            // 5秒后清除状态消息
            setTimeout(() => setSaveStatus(null), 5000);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : t('pages.Settings.savePath.saveFailed', '保存失败');
            setSaveStatus({
                type: 'error',
                message: t('pages.Settings.savePath.saveError', `保存备份路径失败: ${errorMessage}`)
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Box className="mb-6">
            <InputLabel className="font-semibold mb-4">
                {t('pages.Settings.savePath.title', '游戏存档备份路径')}
            </InputLabel>

            {/* 状态提示 */}
            <StatusAlert
                success={saveStatus?.type === 'success' ? saveStatus.message : null}
                error={saveStatus?.type === 'error' ? saveStatus.message : null}
                warning={saveStatus?.type === 'warning' ? saveStatus.message : null}
                sx={{ mb: 2 }}
            />

            <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
                <TextField
                    label={t('pages.Settings.savePath.pathLabel', '备份根目录路径')}
                    variant="outlined"
                    value={savePath}
                    onChange={(e) => setSavePath(e.target.value)}
                    className="min-w-60 flex-grow"
                    placeholder={t('pages.Settings.savePath.pathPlaceholder', '选择游戏存档备份的根目录')}
                    disabled={isLoading}
                />

                <Button
                    variant="outlined"
                    onClick={handleSelectFolder}
                    disabled={isLoading || !isTauri()}
                    startIcon={<FolderOpenIcon />}
                    className="px-4 py-2"
                >
                    {t('pages.Settings.savePath.selectFolder', '选择目录')}
                </Button>

                <Button
                    variant="contained"
                    color="primary"
                    onClick={handleSavePath}
                    disabled={isLoading || !savePath.trim()}
                    startIcon={isLoading ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
                    className="px-6 py-2"
                >
                    {isLoading ? t('pages.Settings.savePath.saving', '保存中...') : t('pages.Settings.saveBtn')}
                </Button>
            </Stack>
        </Box>
    );
}

/**
 * AboutSection 组件
 * 关于模块，显示应用信息、版本、更新检查等功能
 */
const AboutSection: React.FC = () => {
    const { t } = useTranslation();
    const { triggerUpdateModal } = useStore();
    const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
    const [updateStatus, setUpdateStatus] = useState<string>('');

    const handleCheckUpdate = async () => {
        setIsCheckingUpdate(true);
        setUpdateStatus('');

        try {
            await checkForUpdates({
                onUpdateFound: (update) => {
                    setUpdateStatus(`发现新版本: ${update.version}`);
                    // 触发全局更新窗口显示
                    triggerUpdateModal(update);
                },
                onNoUpdate: () => {
                    setUpdateStatus('当前已是最新版本');
                },
                onError: (error) => {
                    setUpdateStatus(`检查更新失败: ${error}`);
                }
            });
        } catch (error) {
            setUpdateStatus(`检查更新出错: ${error}`);
        } finally {
            setIsCheckingUpdate(false);
        }
    };

    const openGitHub = () => {
        openurl('https://github.com/huoshen80/ReinaManager');
    };

    const openBlog = () => {
        openurl('https://huoshen80.xin');
    };

    return (
        <Box className="mb-6">
            <InputLabel className="font-semibold mb-4">
                {t('pages.Settings.about.title', '关于')}
            </InputLabel>

            <Box className="pl-2 space-y-3">
                {/* 版本信息和更新按钮 */}
                <Stack direction="row" alignItems="center" spacing={2}>
                    <Typography variant="body2">
                        <strong>{t('pages.Settings.about.version', '版本')}: </strong>
                        v{pkg.version}
                    </Typography>
                    <Button
                        variant="outlined"
                        startIcon={isCheckingUpdate ? <CircularProgress size={16} color="inherit" /> : <UpdateIcon />}
                        onClick={handleCheckUpdate}
                        disabled={isCheckingUpdate}
                        size="small"
                    >
                        {isCheckingUpdate
                            ? t('pages.Settings.about.checking', '检查中...')
                            : t('pages.Settings.about.checkUpdate', '检查更新')
                        }
                    </Button>
                </Stack>

                {/* 更新状态显示 */}
                {updateStatus && (
                    <Typography
                        variant="body2"
                        color={updateStatus.includes('失败') || updateStatus.includes('出错') ? 'error' : 'primary'}
                    >
                        {updateStatus}
                    </Typography>
                )}

                {/* 作者信息 */}
                <Typography variant="body2">
                    <strong>{t('pages.Settings.about.author', '作者')}: </strong>
                    huoshen80
                </Typography>

                {/* 项目链接 */}
                <Typography variant="body2">
                    <strong>{t('pages.Settings.about.github', '项目地址')}: </strong>
                    <Link
                        component="button"
                        variant="body2"
                        onClick={openGitHub}
                        sx={{ textDecoration: 'none' }}
                    >
                        https://github.com/huoshen80/ReinaManager
                    </Link>
                </Typography>

                {/* 作者博客链接 */}
                <Typography variant="body2">
                    <strong>{t('pages.Settings.about.blog', '作者博客')}: </strong>
                    <Link
                        component="button"
                        variant="body2"
                        onClick={openBlog}
                        sx={{ textDecoration: 'none' }}
                    >
                        https://huoshen80.xin
                    </Link>
                </Typography>
            </Box>
        </Box>
    );
}

/**
 * Settings 组件
 * 应用设置页面，支持 Bangumi Token 设置与保存、获取 Token 链接、语言切换等功能。
 *
 * @component
 * @returns {JSX.Element} 设置页面
 */
export const Settings: React.FC = () => {
    return (
        <PageContainer className="max-w-full">
            <Box className="py-4">
                {/* BGM Token 设置 */}
                <BgmTokenSettings />
                <Divider sx={{ my: 3 }} />

                {/* 语言设置 */}
                <LanguageSelect />
                <Divider sx={{ my: 3 }} />

                {/* TAG翻译设置 */}
                <TagTranslationSettings />
                <Divider sx={{ my: 3 }} />

                {/* NSFW设置 */}
                <NsfwSettings />
                <Divider sx={{ my: 3 }} />

                {/* 卡片点击模式设置 */}
                <CardClickModeSettings />
                <Divider sx={{ my: 3 }} />

                {/* 自启动设置 */}
                <AutoStartSettings />
                <Divider sx={{ my: 3 }} />

                {/* 关闭按钮设置 */}
                <CloseBtnSettings />
                <Divider sx={{ my: 3 }} />

                {/* 备份路径设置 */}
                <SavePathSettings />
                <Divider sx={{ my: 3 }} />

                {/* 数据库备份设置 */}
                <DatabaseBackupSettings />
                <Divider sx={{ my: 3 }} />

                {/* 关于 */}
                <AboutSection />
            </Box>
        </PageContainer>
    );
};

