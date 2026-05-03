import type React from "react";
import type { GameData } from "@/types";

/** CardItem 组件的 Props */
export interface CardItemProps extends React.HTMLAttributes<HTMLDivElement> {
	/** 游戏数据 */
	card: GameData;
	/** 是否被批量选择 */
	isBatchSelected?: boolean;
	/** 是否显示批量选择标志 */
	showBatchMarker?: boolean;
	/** 是否显示移出分类按钮 */
	showRemoveFromCategory?: boolean;
	/** 移出分类事件 */
	onRemoveFromCategory?: () => void;
	/** 移出分类提示 */
	removeFromCategoryTitle?: string;
	/** 是否为拖拽时的浮层预览 */
	isOverlay?: boolean;
	/** 右键菜单事件 */
	onContextMenu: (e: React.MouseEvent) => void;
	/** 点击事件 */
	onClick: () => void;
	/** 双击事件 */
	onDoubleClick: () => void;
	/** 长按事件 */
	onLongPress: () => void;
	/** 显示名称 */
	displayName: string;
	/** 是否启用延迟点击（用于区分单击和双击） */
	useDelayedClick: boolean;
}

/** SortableCardItem 组件的 Props（不包含 style 和 ref） */
export type SortableCardItemProps = Omit<CardItemProps, "style" | "ref"> & {
	/** 是否禁用拖拽排序 */
	disabledSortable?: boolean;
};

/** 右键菜单位置状态 */
export interface MenuPosition {
	mouseX: number;
	mouseY: number;
	cardId: number | null;
}

/** 右键菜单控制器 */
export interface RightMenuHostHandle {
	open: (cardId: number, mouseX: number, mouseY: number) => void;
}
