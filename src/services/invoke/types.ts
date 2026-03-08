/**
 * @file Service 层类型定义
 * @description 定义与后端 Tauri commands 交互的类型
 */

/**
 * 游戏类型筛选（小写，匹配后端 Rust 枚举）
 */
export type GameType = "all" | "local" | "online" | "noclear" | "clear";

/**
 * 排序选项（小写，匹配后端 Rust 枚举）
 */
export type SortOption =
	| "addtime"
	| "datetime"
	| "lastplayed"
	| "bgmrank"
	| "vndbrank"
	| "namesort";

/**
 * 排序方向（小写，匹配后端 Rust 枚举）
 */
export type SortOrder = "asc" | "desc";

/**
 * 统一的服务响应类型
 */
export interface ServiceResponse<T> {
	success: boolean;
	data?: T;
	error?: string;
}

/**
 * 每日统计数据
 */
export interface DailyStats {
	date: string;
	playtime: number;
}
