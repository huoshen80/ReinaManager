/**
 * @file 分组分类相关类型定义
 */

/**
 * 分组（Group）- 一级容器
 */
export interface Group {
	id: number;
	name: string;
	icon?: string;
	sort_order: number;
	created_at?: number;
	updated_at?: number;
}

/**
 * 分类（Category）- 二级容器
 */
export interface Category {
	id: number;
	name: string;
	icon?: string;
	sort_order: number;
	game_count: number;
}

/**
 * 分组与分类的树形结构
 */
export interface GroupWithCategories {
	id: number;
	name: string;
	icon?: string;
	sort_order: number;
	categories: Category[];
}

/**
 * 默认分组类型枚举
 */
export enum DefaultGroup {
	DEVELOPER = "default_developer",
	PLAY_STATUS = "default_play_status",
}

/**
 * 游戏状态枚举（基于 games.clear 字段）
 * games.clear 已从 0/1 改为 1-5 的枚举值
 */
export enum PlayStatus {
	WISH = 1, // 想玩
	PLAYING = 2, // 在玩
	PLAYED = 3, // 玩过
	ON_HOLD = 4, // 搁置
	DROPPED = 5, // 弃坑
}

/**
 * 所有游戏状态列表（用于菜单渲染）
 */
export const ALL_PLAY_STATUSES: PlayStatus[] = [
	PlayStatus.WISH,
	PlayStatus.PLAYING,
	PlayStatus.PLAYED,
	PlayStatus.ON_HOLD,
	PlayStatus.DROPPED,
];

/**
 * 游戏状态 i18n key 映射
 */
export const PLAY_STATUS_I18N_KEYS: Record<PlayStatus, string> = {
	[PlayStatus.WISH]: "category.playStatus.wish",
	[PlayStatus.PLAYING]: "category.playStatus.playing",
	[PlayStatus.PLAYED]: "category.playStatus.played",
	[PlayStatus.ON_HOLD]: "category.playStatus.onHold",
	[PlayStatus.DROPPED]: "category.playStatus.dropped",
};

/**
 * 游戏状态图标名称映射
 * - 想玩: 星星 (StarBorder)
 * - 在玩: 播放 (PlayCircle)
 * - 玩过: 打勾 (CheckCircle)
 * - 搁置: 暂停 (PauseCircle)
 * - 弃坑: 打叉 (Cancel)
 */
export type PlayStatusIconType =
	| "StarBorder"
	| "PlayCircle"
	| "CheckCircle"
	| "PauseCircle"
	| "Cancel";

export const PLAY_STATUS_ICONS: Record<PlayStatus, PlayStatusIconType> = {
	[PlayStatus.WISH]: "StarBorder",
	[PlayStatus.PLAYING]: "PlayCircle",
	[PlayStatus.PLAYED]: "CheckCircle",
	[PlayStatus.ON_HOLD]: "PauseCircle",
	[PlayStatus.DROPPED]: "Cancel",
};

/**
 * 获取游戏状态多语言文案
 */
export function getPlayStatusLabel(
	t: (key: string) => string,
	status: PlayStatus,
): string {
	return t(PLAY_STATUS_I18N_KEYS[status]);
}

/**
 * 判断是否为"玩过"状态（显示金奖杯）
 */
export function isPlayedStatus(status: number | undefined | null): boolean {
	return status === PlayStatus.PLAYED;
}
