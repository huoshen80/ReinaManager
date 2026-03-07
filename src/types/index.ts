/**
 * @file 类型定义
 * @description 定义全局使用的核心数据类型，包括游戏数据、会话、统计等。
 * @module src/types/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

// ==================== 工具类型 ====================

/**
 * 可空类型 - 用于更新操作的三态逻辑
 *
 * 在更新操作中，需要区分三种状态：
 * - undefined: 不修改该字段
 * - null: 显式清空该字段
 * - T: 设置新值
 *
 * 对应 Rust 后端的 Option<Option<T>>
 */
export type Nullable<T> = T | null;

/**
 * 深度可空类型 - 将对象的所有属性转换为可空
 */
export type DeepNullable<T> = {
	[K in keyof T]?: Nullable<T[K]>;
};

export interface BatchOperationError {
	index: number;
	message: string;
}

export interface BatchOperationResult {
	total: number;
	success: number;
	failed: number;
	ids?: number[];
	errors: BatchOperationError[];
}

export interface ScanResult {
	name: string;
	path: string;
	executables: string[];
}

// ==================== 元数据结构 ====================

/**
 * BGM 数据结构（JSON 列嵌入 games 表）
 *
 * 重构后移除 game_id，新增 date 字段
 * 注意：所有可选字段使用 undefined（与 Rust Option::None 对应）
 */
export interface BgmData {
	image?: string;
	name?: string;
	name_cn?: string;
	aliases?: string[];
	summary?: string;
	tags?: string[];
	rank?: number;
	score?: number;
	developer?: string;
	nsfw?: boolean;
	date?: string;
}

/**
 * VNDB 数据结构（JSON 列嵌入 games 表）
 *
 * 重构后移除 game_id，新增 date 字段
 * 注意：所有可选字段使用 undefined（与 Rust Option::None 对应）
 */
export interface VndbData {
	image?: string;
	name?: string;
	name_cn?: string;
	all_titles?: string[];
	aliases?: string[];
	summary?: string;
	tags?: string[];
	average_hours?: number;
	developer?: string;
	score?: number;
	nsfw?: boolean;
	date?: string;
}

/**
 * YMGal 数据结构（JSON 列嵌入 games 表）
 *
 * 预留用于 YMGal 数据源
 * 注意：YMGal API 不提供 tags 字段，所有可选字段使用 undefined
 */
export interface YmgalData {
	image?: string;
	name?: string;
	name_cn?: string;
	aliases?: string[];
	summary?: string;
	tags?: never; // YMGal 不支持标签
	developer?: string;
	nsfw?: boolean;
	date?: string;
}

/**
 * 自定义数据结构（JSON 列嵌入 games 表）
 *
 * 用于用户手动添加的游戏或自定义元数据
 * 替代原有的 other_data 表和 custom_name/custom_cover 字段
 *
 * 注意：CustomData 是用户可编辑的，支持 null 用于清空字段
 */
export interface CustomData {
	image?: Nullable<string>;
	name?: Nullable<string>;
	aliases?: Nullable<string[]>;
	summary?: Nullable<string>;
	tags?: Nullable<string[]>;
	developer?: Nullable<string>;
	nsfw?: Nullable<boolean>;
	date?: Nullable<string>;
}

// ==================== 游戏数据类型（DTO 三位一体） ====================

/**
 * 数据源 ID 类型
 */
export type IdType =
	| "bgm"
	| "vndb"
	| "ymgal"
	| "mixed"
	| "custom"
	| "Whitecloud";

/**
 * 完整游戏数据 - 对应数据库 games 表结构（读取用）
 *
 * 这是后端返回的原始数据格式，用于 UI 渲染和数据展示。
 * 所有元数据以 JSON 列形式嵌入。
 */
export interface FullGameData {
	// --- 主键 ---
	id?: number;

	// --- 外部 ID ---
	bgm_id?: string;
	vndb_id?: string;
	ymgal_id?: string;
	id_type?: IdType | string;

	// --- 核心状态 ---
	localpath?: Nullable<string>;
	savepath?: Nullable<string>;
	autosave?: number;
	maxbackups?: number;
	clear?: number;
	le_launch?: number;
	magpie?: number;

	// --- JSON Payload (嵌入式元数据) ---
	bgm_data?: Nullable<BgmData>;
	vndb_data?: Nullable<VndbData>;
	ymgal_data?: Nullable<YmgalData>;
	custom_data?: Nullable<CustomData>;

	// --- 时间类（只读） ---
	date?: string;
	created_at?: number;
	updated_at?: number;
}

/**
 * 插入游戏参数 - 用于新增游戏（写入用）
 *
 * 特点：
 * - 不包含 id（由数据库自动生成）
 * - 不包含 created_at/updated_at（由数据库自动设置）
 * - id_type 是必需的
 */
export interface InsertGameParams {
	// --- 外部 ID ---
	bgm_id?: string;
	vndb_id?: string;
	ymgal_id?: string;
	id_type: IdType | string; // 必需字段

	// --- 核心状态 ---
	date?: string;
	localpath?: string;
	savepath?: string;
	autosave?: number;
	maxbackups?: number;
	clear?: number;
	le_launch?: number;
	magpie?: number;

	// --- JSON Payload ---
	bgm_data?: BgmData;
	vndb_data?: VndbData;
	ymgal_data?: YmgalData;
	custom_data?: CustomData;
}

/**
 * 更新游戏参数 - 用于更新游戏（部分更新用）
 *
 * 三态逻辑说明：
 * - undefined（字段不存在）: 不修改该字段
 * - null: 显式将该字段设为 NULL
 * - 具体值: 更新为新值
 *
 * 对应 Rust 后端的 Option<Option<T>> 反序列化
 */
export interface UpdateGameParams {
	// --- 外部 ID（支持三态） ---
	bgm_id?: Nullable<string>;
	vndb_id?: Nullable<string>;
	ymgal_id?: Nullable<string>;
	id_type?: IdType | string;

	// --- 核心状态（支持三态） ---
	date?: Nullable<string>;
	localpath?: Nullable<string>;
	savepath?: Nullable<string>;
	autosave?: Nullable<number>;
	maxbackups?: Nullable<number>;
	clear?: Nullable<number>;
	le_launch?: Nullable<number>;
	magpie?: Nullable<number>;

	// --- JSON Payload（支持三态） ---
	bgm_data?: Nullable<BgmData>;
	vndb_data?: Nullable<VndbData>;
	ymgal_data?: Nullable<YmgalData>;
	custom_data?: Nullable<CustomData>;
}

/**
 * 游戏数据结构 - 展示层
 *
 * 所有字段已展平，用于组件直接消费
 * 注意：所有可选字段使用 undefined（与 Rust 后端保持一致）
 */
export interface GameData {
	// 基础字段
	id?: number;
	bgm_id?: string;
	vndb_id?: string;
	ymgal_id?: string;
	id_type?: string;
	date?: string;
	localpath?: string;
	savepath?: string;
	autosave?: number;
	maxbackups?: number;
	clear?: number;
	le_launch?: number;
	magpie?: number;
	custom_data?: CustomData;
	created_at?: number;
	updated_at?: number;

	// 展平的元数据字段
	image?: string;
	name?: string;
	name_cn?: string;
	summary?: string;
	tags?: string[];
	rank?: number;
	score?: number;
	developer?: string;
	all_titles?: string[];
	aliases?: string[];
	average_hours?: number;
	nsfw?: boolean;
}

/**
 * 操作游戏相关属性类型
 */
export interface HanleGamesProps {
	id?: number;
	getGameById: (id: number) => Promise<GameData>;
	canUse?: () => boolean;
}

/**
 * 游戏会话记录
 */
export interface GameSession {
	session_id: number; // 会话的唯一标识符
	game_id: number; // 游戏的唯一标识符
	start_time: number;
	end_time?: number;
	duration?: number; // 分钟
	date: string;
}

/**
 * 游戏统计数据（原始）
 */
export interface GameStatistics {
	game_id: number; // 游戏的唯一标识符
	total_time: number; // 分钟
	session_count: number;
	last_played?: number;
	daily_stats?: Array<{ date: string; playtime: number }>; // 新格式: [{date: "YYYY-MM-DD", playtime: minutes}, ...]
}

/**
 * 格式化后的游戏时间统计
 */
export interface GameTimeStats {
	totalPlayTime: string; // 格式化的总时间，如"10小时20分钟"
	totalMinutes: number; // 总分钟数
	todayPlayTime: string; // 今天的游戏时间
	todayMinutes: number; // 今天的分钟数
	sessionCount: number; // 启动次数
	lastPlayed: Date | null; // 最后一次游玩时间
	daily_stats?: Array<{ date: string; playtime: number }>; // 新格式: [{date: "YYYY-MM-DD", playtime: minutes}, ...]
}

/**
 * 游戏时间更新回调类型
 * @param gameId 游戏ID
 * @param minutes 已游玩分钟数
 */
export type TimeUpdateCallback = (gameId: number, minutes: number) => void;

/**
 * 游戏会话结束回调类型
 * @param gameId 游戏ID
 * @param minutes 本次会话时长（分钟）
 */
export type SessionEndCallback = (gameId: number, minutes: number) => void;

/**
 * 存档备份记录
 */
export interface SavedataRecord {
	id: number;
	game_id: number;
	file: string; // 对应数据库中的 file 列（备份文件名）
	backup_time: number;
	file_size: number;
}

/**
 * 日志级别类型
 */
export type LogLevel = "error" | "warn" | "info" | "debug";

export * from "./collection";
