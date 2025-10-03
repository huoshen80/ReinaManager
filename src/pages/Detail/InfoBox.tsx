import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import SportsEsportsIcon from '@mui/icons-material/SportsEsports';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import TodayIcon from '@mui/icons-material/Today';
import BackupIcon from '@mui/icons-material/Backup';
import { Typography, Box, Paper } from '@mui/material';
import type { GameTimeStats } from '@/types';
import { LineChart } from '@mui/x-charts/LineChart';
import { useGamePlayStore } from '@/store/gamePlayStore';
import { useTranslation } from 'react-i18next';
import { savedataService } from '@/services';


/**
 * 图表数据类型定义
 */
interface GameTimeChartData {
    date: string;
    playtime: number;
    [key: string]: string | number;
}

/**
 * InfoBox 组件属性类型
 */
interface InfoBoxProps {
    gameID: number;
}

/**
 * InfoBox 组件
 * 展示游戏统计信息（游玩次数、今日时长、总时长、备份次数）及近7天游玩时长折线图。
 *
 * @param {InfoBoxProps} props 组件属性
 * @returns {JSX.Element} 统计信息卡片与折线图
 */
export const InfoBox: React.FC<InfoBoxProps> = ({ gameID }: InfoBoxProps): JSX.Element => {
    const { t } = useTranslation();
    const { loadGameStats, runningGameIds } = useGamePlayStore();
    const [stats, setStats] = useState<GameTimeStats | null>(null);
    const [backupCount, setBackupCount] = useState<number>(0);

    // 存储上一次游戏运行状态，用于检测变化
    const prevRunningRef = useRef(false);

    /**
     * 异步加载游戏统计数据
     */
    const fetchStats = useCallback(async () => {
        try {
            const gameStats = await loadGameStats(gameID, true); // 强制刷新
            setBackupCount(await savedataService.getSavedataCount(gameID));
            setStats(gameStats);
        } catch (error) {
            console.error('加载游戏统计失败:', error);
        }
    }, [gameID, loadGameStats]);

    // 初始加载数据
    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    // 监听当前游戏的运行状态变化，关闭后自动刷新统计
    useEffect(() => {
        let unmounted = false;
        const isCurrentGameRunning = runningGameIds.has(gameID);
        if (prevRunningRef.current && !isCurrentGameRunning) {
            const timer = setTimeout(() => {
                if (!unmounted) fetchStats();
            }, 500);
            return () => {
                unmounted = true;
                clearTimeout(timer);
            };
        }
        prevRunningRef.current = isCurrentGameRunning;
        return () => {
            unmounted = true;
        };
    }, [runningGameIds, gameID, fetchStats]);

    /**
     * 统计项数据
     */
    const statItems = useMemo(() =>
        [
            {
                color: 'primary',
                icon: <SportsEsportsIcon fontSize="small" />,
                title: t('pages.Detail.playCount'),
                value: stats ? `${stats.sessionCount}` : '0'
            },
            {
                color: 'primary',
                icon: <TodayIcon fontSize="small" />,
                title: t('pages.Detail.todayPlayTime'),
                value: stats ? `${stats.todayPlayTime}` : '0分钟'
            },
            {
                color: 'primary',
                icon: <AccessTimeIcon fontSize="small" />,
                title: t('pages.Detail.totalPlayTime'),
                value: stats ? `${stats.totalPlayTime}` : '0分钟'
            },
            {
                color: 'primary',
                icon: <BackupIcon fontSize="small" />,
                title: t('pages.Detail.backupCount'),
                value: backupCount
            }
        ],
        [stats, t, backupCount]
    )

    /**
     * 生成近7天的游玩时长数据，补全无数据的日期
     */
    const chartData = useMemo(() => {
        const datePlaytimeMap = new Map<string, number>();
        if (stats?.daily_stats) {
            for (const item of stats.daily_stats) {
                datePlaytimeMap.set(item.date, item.playtime);
            }
        }
        const result: GameTimeChartData[] = [];
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        for (let i = 6; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(today.getDate() - i);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const dateStr = `${year}-${month}-${day}`;
            result.push({
                date: dateStr,
                playtime: datePlaytimeMap.get(dateStr) || 0
            });
        }
        return result;
    }, [stats?.daily_stats]);

    return (
        <>
            {/* 统计信息卡片 */}
            <Box className="mb-4">
                <Typography variant="h6" fontWeight="bold" gutterBottom component="div">
                    {t('pages.Detail.gameStats')}
                </Typography>
                <div className="grid grid-cols-4 gap-4">
                    {statItems.map((item) => (
                        <Paper
                            key={item.title}
                            elevation={0}
                            className={`
                                p-4 rounded-lg overflow-hidden
                                transition-all duration-200
                                hover:shadow-md hover:scale-[1.02]
                                ${item.color === 'primary' ? 'bg-blue-50/40 border border-blue-100/40' : 'bg-green-50/40 border border-green-100/40'}
                            `}
                        >
                            <div className="flex items-center space-x-2 mb-2">
                                <span className="text-[#1976d2] flex-shrink-0 flex items-center">
                                    {item.icon}
                                </span>
                                <Typography
                                    variant="body2"
                                    className="font-medium text-gray-600 truncate"
                                    title={item.title}
                                    component="span"
                                >
                                    {item.title}
                                </Typography>
                            </div>
                            <Typography variant="h6" className="font-bold" component="div">
                                {item.value}
                            </Typography>
                        </Paper>
                    ))}
                </div>
            </Box>
            {/* 近7天游玩时长折线图 */}
            {
                chartData.length > 0 &&
                <LineChart
                    dataset={chartData}
                    xAxis={[{
                        dataKey: 'date',
                        scaleType: 'point'
                    }]}
                    yAxis={[{
                        min: 0,
                        max: chartData.every(item => item.playtime === 0) ? 10 : undefined,
                        // label: t('pages.Detail.playTimeMinutes'),
                        scaleType: 'linear',
                        tickMinStep: 1
                    }]}
                    series={[{ dataKey: 'playtime', color: '#1976d2' }]}
                    height={300}
                    margin={{ right: 40 }}
                    grid={{ vertical: true, horizontal: true }}
                />
            }
        </>
    );
};