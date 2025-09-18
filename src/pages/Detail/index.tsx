/**
 * @file 游戏详情页
 * @description 展示单个游戏的详细信息、统计数据、标签、简介等，包含统计信息卡片和近7天游玩时长折线图，支持国际化。
 * @module src/pages/Detail/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - Detail：游戏详情页面主组件
 *
 * 依赖：
 * - @mui/material
 * - @mui/x-charts/LineChart
 * - @/store
 * - @/store/gamePlayStore
 * - @/types
 * - react-i18next
 * - react-router
 */

import { useStore } from '@/store';
import { PageContainer } from '@toolpad/core/PageContainer';
import { useActivePage } from '@toolpad/core/useActivePage';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Typography, Box, Stack, Chip, Tabs, Tab, CircularProgress } from '@mui/material';
import { useLocation } from 'react-router-dom';
import { InfoBox } from './InfoBox';
import { Edit } from './Edit';
import { Backup } from './Backup';
import i18n from '@/utils/i18n';
import { getGameDisplayName, getGameCover } from '@/utils';
import { translateTags } from '@/utils/tagTranslation';


// Tab面板组件
interface TabPanelProps {
    children?: React.ReactNode;
    index: number;
    value: number;
}

const TabPanel = (props: TabPanelProps) => {
    const { children, value, index, ...other } = props;

    return (
        <div
            role="tabpanel"
            hidden={value !== index}
            id={`game-tab-${index}`}
            aria-labelledby={`game-tab-${index}`}
            {...other}
        >
            {value === index && (
                <Box sx={{ pt: 3 }}>
                    {children}
                </Box>
            )}
        </div>
    );
}

/**
 * Detail 组件
 * 游戏详情页面主组件，展示游戏图片、基本信息、标签、统计、简介等。
 *
 * @component
 * @returns {JSX.Element} 游戏详情页面
 */
export const Detail: React.FC = () => {
    const id = Number(useLocation().pathname.split('/').pop());
    const { t } = useTranslation();
    const { setSelectedGameId, selectedGame, fetchGame, tagTranslation } = useStore();
    const [tabIndex, setTabIndex] = useState(0);
    const [showAllTags, setShowAllTags] = useState(false); // 控制标签折叠状态
    const [isDetailLoading, setIsDetailLoading] = useState(false); // 详情页面专用的加载状态

    const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
        setTabIndex(newValue);
    };

    const handleToggleTags = () => {
        setShowAllTags((prev) => !prev);
    };

    const activePage = useActivePage();
    const location = useLocation();
    const title = selectedGame ? getGameDisplayName(selectedGame, i18n.language) : t('pages.Detail.loading');
    const breadcrumbs = useMemo(() => {
        const base = activePage?.breadcrumbs ?? [];
        // 使用当前路径，避免手动拼接出重复斜杠或错误段
        const path = location.pathname;
        // 仅在标题存在时追加末级面包屑
        return title
            ? [...base, { title, path }]
            : base;
    }, [activePage?.breadcrumbs, location.pathname, title]);

    // 优化后的 useEffect - 统一数据获取逻辑
    useEffect(() => {
        if (id) {
            setIsDetailLoading(true); // 开始加载
            setSelectedGameId(id); // 立即设置ID，以便其他组件（如LaunchModal）能响应
            fetchGame(id).finally(() => {
                setIsDetailLoading(false); // 加载完成
            });
        }

        // 返回清理函数，防止快速切换时显示上一个游戏的数据
        return () => {
            useStore.setState({ selectedGame: null });
        };
    }, [id, fetchGame, setSelectedGameId]);

    // 派生状态：基于selectedGame和isDetailLoading计算当前状态
    const isLoading = isDetailLoading || !selectedGame || selectedGame.id !== id;
    const isNotFound = !isDetailLoading && !selectedGame && id; // 加载完成但仍然没有数据

    // 加载状态UI - 使用骨架屏
    if (isLoading) {
        return (
            <PageContainer key={id} sx={{ maxWidth: '100% !important' }}>
                <Box className="p-2" display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
                    <CircularProgress />
                    <Typography sx={{ ml: 2 }}>{t('pages.Detail.loading')}</Typography>
                </Box>
            </PageContainer>
        );
    }

    // 未找到游戏UI
    if (isNotFound) {
        return (
            <PageContainer key={id} sx={{ maxWidth: '100% !important' }}>
                <Box className="p-2" display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
                    <Typography>{t('pages.Detail.notFound')}</Typography>
                </Box>
            </PageContainer>
        );
    }

    return (
        <PageContainer key={id} title={title} breadcrumbs={breadcrumbs} sx={{ maxWidth: '100% !important' }}>
            <Box className="p-2">
                {/* 顶部区域：图片和基本信息 */}
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                    {/* 左侧：游戏图片 */}
                    <Box>
                        <img
                            src={getGameCover(selectedGame)}
                            loading='lazy'
                            alt={selectedGame.name}
                            className="max-h-65 max-w-40 lg:max-w-80 rounded-lg shadow-lg select-none"
                            onDragStart={(event) => event.preventDefault()}
                        />
                    </Box>
                    {/* 右侧：游戏信息 */}
                    <Box className="flex-1">
                        <Stack
                            direction={{ xs: 'column', sm: 'row' }}
                            className="flex flex-wrap [&>div]:mr-6 [&>div]:mb-2"
                        >
                            {selectedGame.id_type === 'custom' ?
                                <Box>
                                    <Typography variant="subtitle2" fontWeight="bold" component="div">{t('pages.Detail.gameDatafrom')}</Typography>
                                    <Typography component="div">Custom</Typography>
                                </Box> :
                                <Box>
                                    <Typography variant="subtitle2" fontWeight="bold" component="div">{t('pages.Detail.gameDatafrom')}</Typography>
                                    <Typography component="div">{selectedGame.id_type}</Typography>
                                </Box>}
                            <Box>
                                <Typography variant="subtitle2" fontWeight="bold" component="div">{t('pages.Detail.gameDeveloper')}</Typography>
                                <Typography component="div">{selectedGame.developer || '-'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" fontWeight="bold" component="div">{t('pages.Detail.releaseDate')}</Typography>
                                <Typography component="div">{selectedGame.date || '-'}</Typography>
                            </Box>
                            <Box>
                                <Typography variant="subtitle2" fontWeight="bold" component="div">{t('pages.Detail.addTime')}</Typography>
                                <Typography component="div">
                                    {selectedGame.time ? new Date(selectedGame.time).toLocaleDateString() : '-'}
                                </Typography>
                            </Box>
                            {selectedGame.rank !== 0 && selectedGame.rank !== null &&
                                <Box>
                                    <Typography variant="subtitle2" fontWeight="bold" component="div">{t('pages.Detail.gameRanking')}</Typography>
                                    <Typography component="div">{selectedGame.rank || '-'}</Typography>
                                </Box>}
                            {selectedGame.aveage_hours !== 0 && selectedGame.aveage_hours &&
                                <Box>
                                    <Typography variant="subtitle2" fontWeight="bold" component="div">{t('pages.Detail.expected_hours')}</Typography>
                                    <Typography component="div">{selectedGame.aveage_hours || '-'}h</Typography>
                                </Box>}
                            <Box>
                                <Typography variant="subtitle2" fontWeight="bold" component="div">{t('pages.Detail.gameScore')}</Typography>
                                <Typography component="div">{selectedGame.score || '-'}</Typography>
                            </Box>
                        </Stack>
                        {/* 标签 */}
                        <Box className="mt-2">
                            <Typography variant="subtitle2" fontWeight="bold" gutterBottom component="div">{t('pages.Detail.gameTags')}</Typography>
                            <Stack direction="row" className="flex-wrap gap-1">
                                {translateTags(selectedGame.tags || [], tagTranslation)
                                    .slice(0, showAllTags ? undefined : 40) // 根据折叠状态显示标签数量
                                    .map((tag, index) => (
                                        <Chip key={`${selectedGame.tags?.[index] || tag}-${index}`} label={tag} size="small" variant="outlined" />
                                    ))}
                            </Stack>
                            {selectedGame.tags && selectedGame.tags.length > 40 && (
                                <Typography
                                    variant="body2"
                                    color="primary"
                                    sx={{ cursor: 'pointer', mt: 1 }}
                                    component={'span'}
                                    onClick={handleToggleTags}
                                >
                                    {showAllTags ? t('pages.Detail.collapseTags', '折叠标签') : t('pages.Detail.expandTags', '展开标签')}
                                </Typography>
                            )}
                        </Box>
                    </Box>
                </Stack>


                {/* 添加Tabs组件 */}
                <Box sx={{ width: '100%' }}>
                    <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
                        <Tabs
                            value={tabIndex}
                            onChange={handleTabChange}
                            aria-label="game detail tabs"
                        >
                            <Tab label={t('pages.Detail.gameStats')} id="game-tab-0" aria-controls="game-tabpanel-0" />
                            <Tab label={t('pages.Detail.introduction')} id="game-tab-1" aria-controls="game-tabpanel-1" />
                            <Tab label={t('pages.Detail.editPart')} id="game-tab-2" aria-controls="game-tabpanel-2" />
                            <Tab label={t('pages.Detail.backup')} id="game-tab-3" aria-controls="game-tabpanel-3" />
                        </Tabs>
                    </Box>

                    {/* 统计信息Tab */}
                    <TabPanel value={tabIndex} index={0}>
                        {tabIndex === 0 && <InfoBox gameID={id} />}
                    </TabPanel>
                    <TabPanel value={tabIndex} index={1}>
                        {tabIndex === 1 && (
                            /* 游戏简介 */
                            <Box>
                                <Typography variant="h6" fontWeight="bold" component="div">{t('pages.Detail.introduction')}</Typography>
                                <Typography className="mt-1" component="div">{selectedGame.summary}</Typography>
                            </Box>
                        )}
                    </TabPanel>
                    <TabPanel value={tabIndex} index={2}>
                        {tabIndex === 2 && <Edit />}
                    </TabPanel>
                    <TabPanel value={tabIndex} index={3}>
                        {tabIndex === 3 && <Backup />}
                    </TabPanel>

                </Box>

            </Box>
        </PageContainer>
    )
}