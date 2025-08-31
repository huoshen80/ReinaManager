/**
 * @file Cards 组件
 * @description 游戏卡片列表组件，负责展示所有游戏的封面、名称，并支持右键菜单操作与选中高亮，适配响应式布局。
 * @module src/components/Cards/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - Cards：游戏卡片列表主组件
 *
 * 依赖：
 * - @mui/material
 * - @/components/RightMenu
 * - @/store
 **/

import { memo, useState } from 'react';
import Card from '@mui/material/Card';
import CardMedia from '@mui/material/CardMedia';
import CardActionArea from '@mui/material/CardActionArea';
import RightMenu from '@/components/RightMenu';
import { useStore } from '@/store';
import { useGamePlayStore } from '@/store/gamePlayStore';
import type { GameData } from '@/types';
import KeepAlive from 'react-activation';
import { useTranslation } from 'react-i18next';
import { getGameDisplayName, getGameDisplayImage, isNsfwGame } from '@/utils';
import { useNavigate } from 'react-router';

/**
 * Cards 组件用于展示游戏卡片列表。
 * 支持右键弹出菜单、点击选中高亮、响应式布局等功能。
 *
 * @component
 * @returns {JSX.Element} 游戏卡片列表
 */
// 单个卡片项，使用memo避免无关渲染
const CardItem = memo(({ card, isActive, onContextMenu, onClick, onDoubleClick, onLongPress, displayName, useDelayedClick }: {
    card: GameData;
    isActive: boolean;
    onContextMenu: (e: React.MouseEvent) => void;
    onClick: () => void;
    onDoubleClick: () => void;
    onLongPress: () => void;
    displayName: string;
    useDelayedClick: boolean;
}) => {
    const { nsfwCoverReplace } = useStore();
    const [clickTimeout, setClickTimeout] = useState<NodeJS.Timeout | null>(null);
    const [longPressTimeout, setLongPressTimeout] = useState<NodeJS.Timeout | null>(null);
    const [isLongPressing, setIsLongPressing] = useState(false);
    const [hasLongPressed, setHasLongPressed] = useState(false);

    // 确保 tags 统一为数组
    const tags = typeof card.tags === "string" ? JSON.parse(card.tags) : card.tags;
    const isNsfw = isNsfwGame(tags);

    const handleClick = () => {
        // 如果刚刚完成了长按，则忽略此次点击
        if (hasLongPressed) {
            setHasLongPressed(false);
            return;
        }

        if (useDelayedClick) {
            // 启用双击启动时使用延迟点击
            if (clickTimeout) {
                clearTimeout(clickTimeout);
                setClickTimeout(null);
            }

            const timeout = setTimeout(() => {
                onClick();
                setClickTimeout(null);
            }, 200); // 200ms 延迟

            setClickTimeout(timeout);
        } else {
            // 不启用双击启动时直接执行点击（选择模式下即时响应）
            onClick();
        }
    };

    const handleDoubleClick = () => {
        if (useDelayedClick) {
            // 双击时清除单击定时器，防止单击事件执行
            if (clickTimeout) {
                clearTimeout(clickTimeout);
                setClickTimeout(null);
            }
        }
        onDoubleClick();
    };

    // 长按事件处理
    const handleMouseDown = () => {
        // 重置长按标志
        setHasLongPressed(false);

        if (longPressTimeout) {
            clearTimeout(longPressTimeout);
        }

        const timeout = setTimeout(() => {
            setIsLongPressing(true);
            setHasLongPressed(true); // 标记已完成长按
            onLongPress();
        }, 800); // 800ms 长按时间

        setLongPressTimeout(timeout);
    };

    const handleMouseUp = () => {
        if (longPressTimeout) {
            clearTimeout(longPressTimeout);
            setLongPressTimeout(null);
        }
        setIsLongPressing(false);

        // 延迟重置长按标志，确保 click 事件能够检查到
        setTimeout(() => {
            if (hasLongPressed) {
                setHasLongPressed(false);
            }
        }, 50);
    };

    const handleMouseLeave = () => {
        if (longPressTimeout) {
            clearTimeout(longPressTimeout);
            setLongPressTimeout(null);
        }
        setIsLongPressing(false);
    };

    return (
        <Card
            key={card.id}
            className={`min-w-24 max-w-full !transition-all ${isActive ? 'scale-y-105' : 'scale-y-100'}`}
            onContextMenu={onContextMenu}
        >
            <CardActionArea
                onClick={handleClick}
                onDoubleClick={handleDoubleClick}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseLeave}
                className={`
                    duration-100 
                    hover:shadow-lg hover:scale-105 
                    active:shadow-sm active:scale-95 
                    ${isLongPressing ? 'ring-2 ring-blue-500 shadow-lg' : ''}
                `}
            >
                <CardMedia
                    component="img"
                    className="h-auto aspect-[3/4]"
                    image={nsfwCoverReplace && isNsfw ? "/images/NR18.png" : getGameDisplayImage(card)}
                    alt="Card Image"
                    draggable="false"
                    loading="lazy"
                />
                <div className={`p-1 h-8 text-base truncate ${isActive ? '!font-bold text-blue-500' : ''}`}>
                    {displayName}
                </div>
            </CardActionArea>
        </Card>
    );
});

const Cards = () => {
    // 只订阅需要的状态，减少重渲染
    const selectedGameId = useStore(s => s.selectedGameId);
    const setSelectedGameId = useStore(s => s.setSelectedGameId);
    const cardClickMode = useStore(s => s.cardClickMode);
    const doubleClickLaunch = useStore(s => s.doubleClickLaunch);
    const longPressLaunch = useStore(s => s.longPressLaunch);
    const games = useStore(s => s.games);
    const { launchGame } = useGamePlayStore();
    const navigate = useNavigate();
    const { i18n } = useTranslation();
    const [menuPosition, setMenuPosition] = useState<{
        mouseX: number;
        mouseY: number;
        cardId: number | null;
    } | null>(null);

    /**
     * 处理卡片单击事件
     */
    const handleCardClick = (cardId: number, _card: GameData) => {
        if (cardClickMode === 'navigate') {
            // 单击导航到详情页面
            setSelectedGameId(cardId);
            navigate(`/libraries/${cardId}`);
        } else {
            // 单击选择游戏
            setSelectedGameId(cardId);
        }
    };

    /**
     * 处理卡片双击事件
     */
    const handleCardDoubleClick = async (cardId: number, card: GameData) => {
        if (doubleClickLaunch && card.localpath) {
            // 只有启用双击启动功能时才启动游戏
            setSelectedGameId(cardId);
            try {
                await launchGame(card.localpath, cardId);
            } catch (error) {
                console.error('启动游戏失败:', error);
            }
        }
    };

    /**
     * 处理卡片长按事件
     */
    const handleCardLongPress = async (cardId: number, card: GameData) => {
        if (longPressLaunch && card.localpath) {
            // 只有启用长按启动功能时才启动游戏
            setSelectedGameId(cardId);
            try {
                await launchGame(card.localpath, cardId);
            } catch (error) {
                console.error('长按启动游戏失败:', error);
            }
        }
    };

    /**
     * 右键菜单事件处理，弹出菜单并设置选中卡片
     */
    const handleContextMenu = (event: React.MouseEvent, cardId: number | undefined) => {
        if (!cardId) return;
        setMenuPosition({
            mouseX: event.clientX,
            mouseY: event.clientY,
            cardId
        });
        setSelectedGameId(cardId);
    };
    return (
        <KeepAlive cacheKey='cards'>
            <div
                className="flex-1 text-center grid grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-4 p-4">
                {/* 右键菜单组件 */}
                <RightMenu id={menuPosition?.cardId} isopen={Boolean(menuPosition)}
                    anchorPosition={
                        menuPosition
                            ? { top: menuPosition.mouseY, left: menuPosition.mouseX }
                            : undefined
                    }
                    setAnchorEl={(value) => {
                        if (!value) setMenuPosition(null);
                    }} /> {/* 游戏卡片渲染 */}
                {games.map((card) => {
                    const displayName = getGameDisplayName(card, i18n.language);

                    return (
                        <CardItem
                            key={card.id}
                            card={card}
                            isActive={selectedGameId === card.id}
                            onContextMenu={(e) => handleContextMenu(e, card.id)}
                            onClick={() => handleCardClick(card.id!, card)}
                            onDoubleClick={() => handleCardDoubleClick(card.id!, card)}
                            onLongPress={() => handleCardLongPress(card.id!, card)}
                            displayName={displayName}
                            useDelayedClick={cardClickMode === 'navigate' && doubleClickLaunch}
                        />
                    );
                })}
            </div>
        </KeepAlive>
    );
};

export default Cards;
