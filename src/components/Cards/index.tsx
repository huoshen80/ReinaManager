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
 */

import { useState, memo } from 'react';
import Card from '@mui/material/Card';
import CardMedia from '@mui/material/CardMedia';
import CardActionArea from '@mui/material/CardActionArea';
import RightMenu from '@/components/RightMenu';
import { useStore } from '@/store';
import type { GameData } from '@/types';
import KeepAlive from 'react-activation';
import { useTranslation } from 'react-i18next';
import {getGameDisplayName, isNsfwGame} from '@/utils';

/**
 * Cards 组件用于展示游戏卡片列表。
 * 支持右键弹出菜单、点击选中高亮、响应式布局等功能。
 *
 * @component
 * @returns {JSX.Element} 游戏卡片列表
 */
// 单个卡片项，使用memo避免无关渲染
const CardItem = memo(({ card, isActive, onContextMenu, onClick, displayName }: {
    card: GameData;
    isActive: boolean;
    onContextMenu: (e: React.MouseEvent) => void;
    onClick: () => void;
    displayName: string;
}) => {
    const { nsfwCoverBlur } = useStore();

    // 确保 tags 统一为数组
    const tags = typeof card.tags === "string" ? JSON.parse(card.tags) : card.tags;
    const isNsfw = isNsfwGame(tags);

    return (
        <Card
            key={card.id}
            className={`min-w-24 max-w-full !transition-all ${isActive ? 'scale-y-105' : 'scale-y-100'}`}
            onContextMenu={onContextMenu}
        >
            <CardActionArea
                onClick={onClick}
                className={`
                    duration-100 
                    hover:shadow-lg hover:scale-105 
                    active:shadow-sm active:scale-95 
                `}
            >
                <CardMedia
                    component="img"
                    className={`h-auto aspect-[3/4] ${nsfwCoverBlur && isNsfw ? 'blur-md' : ''}`}
                    image={card.image}
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
    const games = useStore(s => s.games);
    const { i18n } = useTranslation();
    const [menuPosition, setMenuPosition] = useState<{
        mouseX: number;
        mouseY: number;
        cardId: number | null;
    } | null>(null);

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
        <KeepAlive>
            <div className="flex-1 text-center grid grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 gap-4 p-4">
                {/* 右键菜单组件 */}
                <RightMenu id={menuPosition?.cardId} isopen={Boolean(menuPosition)}
                    anchorPosition={
                        menuPosition
                            ? { top: menuPosition.mouseY, left: menuPosition.mouseX }
                            : undefined
                    }
                    setAnchorEl={(value) => {
                        if (!value) setMenuPosition(null);
                    }} />                {/* 游戏卡片渲染 */}
                {games.map((card) => {
                    const displayName = getGameDisplayName(card, i18n.language);

                    return (
                        <CardItem
                            key={card.id}
                            card={card}
                            isActive={selectedGameId === card.id}
                            onContextMenu={(e) => handleContextMenu(e, card.id)}
                            onClick={() => setSelectedGameId(card.id)}
                            displayName={displayName}
                        />
                    );
                })}
            </div>
        </KeepAlive>
    );
};

export default Cards;
