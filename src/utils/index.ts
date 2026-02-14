import { path } from "@tauri-apps/api";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { resourceDir } from "@tauri-apps/api/path";
import { open as openDirectory } from "@tauri-apps/plugin-dialog";
import { readDir, stat } from "@tauri-apps/plugin-fs";
import { open } from "@tauri-apps/plugin-shell";
import i18next, { t } from "i18next";
import { extname, join } from "pathe";
import { fetchBgmByIds } from "@/api/bgm";
import { fetchVNDBByIds } from "@/api/vndb";
import { snackbar } from "@/components/Snackbar";
import { gameService, savedataService, settingsService } from "@/services";
import { useScrollStore } from "@/store/scrollStore";
import type { BgmData, GameData, HanleGamesProps, VndbData } from "@/types";
import { getDisplayGameData } from "./dataTransform";

/**
 * 停止游戏结果类型
 */
export interface StopGameResult {
	success: boolean;
	message: string;
	terminated_count: number;
}

// ==================== 路径管理缓存 ====================

// 缓存资源目录路径
let cachedResourceDirPath: string | null = null;

// 缓存应用基础路径
let cachedAppDataDir: string | null = null;
let cachedIsPortableMode: boolean | null = null;

// 缓存常用路径
let cachedDbPath: string | null = null;

/**
 * 路径初始化结果类型
 */
export interface PathInitResult {
	resourceDir: string; // 资源目录路径
	appDataDir: string; // 应用数据目录（便携或标准）
	isPortableMode: boolean; // 是否便携模式
	dbPath: string; // 数据库文件路径
}

/**
 * 初始化所有路径缓存
 * 应该在应用启动时调用，结合后端判断便携模式和数据库配置
 * @returns 所有路径信息
 */
export const initPathCache = async (): Promise<PathInitResult> => {
	// 使用 Promise.all 并行处理所有异步操作以提升初始化速度
	const [resourceDirResult, isPortableResult, systemAppDataDirResult] =
		await Promise.all([
			// 1. 获取资源目录
			cachedResourceDirPath
				? Promise.resolve(cachedResourceDirPath)
				: resourceDir(),
			// 2. 判断便携模式
			cachedIsPortableMode !== null
				? Promise.resolve(cachedIsPortableMode)
				: settingsService.getPortableMode(),
			// 3. 获取系统 AppData 目录
			cachedAppDataDir ? Promise.resolve(null) : path.appDataDir(),
		]);

	// 更新缓存
	if (!cachedResourceDirPath) {
		cachedResourceDirPath = resourceDirResult;
	}
	if (cachedIsPortableMode === null) {
		cachedIsPortableMode = isPortableResult;
	}

	// 3. 确定应用数据目录
	if (!cachedAppDataDir) {
		if (cachedIsPortableMode) {
			// 便携模式：使用资源目录/resources
			cachedAppDataDir = join(cachedResourceDirPath, "resources");
		} else {
			// 标准模式：使用系统 AppData
			cachedAppDataDir = systemAppDataDirResult as string;
		}
	}

	// 4. 获取数据库路径
	if (!cachedDbPath) {
		cachedDbPath = join(cachedAppDataDir, "data", "reina_manager.db");
	}

	return {
		resourceDir: cachedResourceDirPath,
		appDataDir: cachedAppDataDir || "",
		isPortableMode: cachedIsPortableMode,
		dbPath: cachedDbPath || "",
	};
};

/**
 * 获取缓存的资源目录路径（同步）
 * 如果未初始化则返回空字符串
 */
export const getResourceDirPath = (): string => {
	return cachedResourceDirPath || "";
};

/**
 * 获取缓存的应用数据目录（同步）
 * 如果未初始化则返回空字符串
 */
export const getAppDataDirPath = (): string => {
	return cachedAppDataDir || "";
};

/**
 * 获取缓存的数据库路径（同步）
 */
export const getDbPath = (): string => {
	return cachedDbPath || "";
};

/**
 * 获取数据库备份路径（异步）
 */
export const getDbBackupPath = async (): Promise<string> => {
	try {
		const backupDir = await settingsService.getDbBackupPath();
		const backupFinalDir = join(getAppDataDirPath(), "data", "backups");
		return backupDir ? backupDir : backupFinalDir;
	} catch (error) {
		console.error("获取数据库备份路径失败:", error);
		const backupFinalDir = join(getAppDataDirPath(), "data", "backups");
		return backupFinalDir;
	}
};

/**
 * 获取存档备份路径（异步）
 * @param gameId 游戏ID
 */
export const getSavedataBackupPath = async (
	gameId: number,
): Promise<string> => {
	try {
		const savedataBackupPath = await settingsService.getSaveRootPath();
		const backupGameDir = join(savedataBackupPath, "backups", `game_${gameId}`);
		const savedataBackupFinalDir = join(
			getAppDataDirPath(),
			"backups",
			`game_${gameId}`,
		);
		return savedataBackupPath ? backupGameDir : savedataBackupFinalDir;
	} catch (error) {
		console.error("获取存档备份路径失败:", error);
		const savedataBackupFinalDir = join(
			getAppDataDirPath(),
			"backups",
			`game_${gameId}`,
		);
		return savedataBackupFinalDir;
	}
};

/**
 * 是否为便携模式（同步）
 */
export const isPortableMode = (): boolean => {
	return cachedIsPortableMode || false;
};

export const getLocalDateString = (timestamp?: number): string => {
	const date = timestamp ? new Date(timestamp * 1000) : new Date();
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export async function openurl(url: string) {
	if (isTauri()) {
		await open(url);
	} else {
		window.open(url, "_blank");
	}
}

export const handleOpenFolder = async ({
	id,
	getGameById,
}: HanleGamesProps) => {
	if (!id) {
		console.error("未选择游戏");
		return;
	}
	try {
		const selectedGame = await getGameById(id);
		if (!selectedGame || !selectedGame.localpath) {
			console.error("游戏路径未找到");
			return;
		}
		const folder = await path.dirname(selectedGame.localpath);
		if (folder) {
			// 使用我们自己的后端函数打开文件夹
			await invoke("open_directory", { dirPath: folder });
		}
	} catch (error) {
		snackbar.error(i18next.t("components.Snackbar.failedOpenGameFolder"));
		console.error("打开文件夹失败:", error);
	}
};

// 游戏启动选项
export interface GameLaunchOptions {
	le_launch?: boolean;
	magpie?: boolean;
}

// 启动游戏并开始监控
export async function launchGameWithTracking(
	gamePath: string,
	gameId: number,
	args?: string[],
	launchOptions?: GameLaunchOptions,
): Promise<{ success: boolean; message: string; process_id?: number }> {
	try {
		const result = await invoke<{
			success: boolean;
			message: string;
			process_id?: number;
		}>("launch_game", {
			gamePath,
			gameId,
			args: args || [],
			launchOptions,
		});

		return result;
	} catch (error) {
		const errorMessage =
			typeof error === "string" ? error : "Unknown error occurred";
		throw new Error(errorMessage);
	}
}

// 停止游戏
export async function stopGameWithTracking(
	gameId: number,
): Promise<StopGameResult> {
	try {
		const result = await invoke<StopGameResult>("stop_game", {
			gameId,
		});
		return result;
	} catch (error) {
		const errorMessage =
			typeof error === "string" ? error : "Unknown error occurred";
		throw new Error(errorMessage);
	}
}

export function formatRelativeTime(time: string | number | Date): string {
	const now = new Date();
	const target =
		time instanceof Date
			? time
			: typeof time === "number"
				? new Date(time * (time.toString().length === 10 ? 1000 : 1))
				: new Date(time);

	const diff = (now.getTime() - target.getTime()) / 1000; // 秒

	if (diff < 60) return i18next.t("utils.relativetime.justNow"); // 刚刚
	if (diff < 3600) {
		const minutes = Math.floor(diff / 60);
		return i18next.t("utils.relativetime.minutesAgo", { count: minutes });
	}
	if (diff < 86400) {
		const hours = Math.floor(diff / 3600);
		return i18next.t("utils.relativetime.hoursAgo", { count: hours });
	}
	if (diff < 7 * 86400) {
		const days = Math.floor(diff / 86400);
		return i18next.t("utils.relativetime.daysAgo", { count: days });
	}

	// 判断是否为上周
	const nowWeek = getWeekNumber(now);
	const targetWeek = getWeekNumber(target);
	if (
		now.getFullYear() === target.getFullYear() &&
		nowWeek - targetWeek === 1
	) {
		return i18next.t("utils.relativetime.lastWeek");
	}

	// 超过一周，返回日期
	return target.toLocaleDateString();
}

function getWeekNumber(date: Date): number {
	const firstDay = new Date(date.getFullYear(), 0, 1);
	const dayOfYear = (date.getTime() - firstDay.getTime()) / 86400000 + 1;
	return Math.ceil(dayOfYear / 7);
}

// 格式化游戏时间
export function formatPlayTime(minutes: number): string {
	if (!minutes) return i18next.t("utils.formatPlayTime.minutes", { count: 0 });

	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;

	// 如果总小时数大于或等于 100
	if (hours >= 100) {
		// 将总分钟数换算成带一位小数的小时
		const totalHoursAsFloat = Math.floor((minutes / 60) * 10) / 10;
		// 使用一个新的 i18next key 来格式化这个带小数的小时数
		return i18next.t("utils.formatPlayTime.hours", {
			count: totalHoursAsFloat,
		});
	}

	if (hours === 0) {
		return i18next.t("utils.formatPlayTime.minutes", { count: mins });
	}

	if (mins > 0) {
		return i18next.t("utils.formatPlayTime.hoursAndMinutes", {
			hours,
			minutes: mins,
		});
	}
	return i18next.t("utils.formatPlayTime.hours", { count: hours });
}

export const handleDirectory = async (droppedPath?: string) => {
	const path = await openDirectory({
		multiple: false,
		directory: false,
		defaultPath: droppedPath,
		filters: [
			{
				name: t("utils.handleDirectory.executable"),
				extensions: ["exe", "bat", "cmd"],
			},
			{
				name: t("utils.handleDirectory.allFiles"),
				extensions: ["*"],
			},
		],
	});
	if (path === null) return null;
	return path;
};

/**
 * 判断文件是否为可执行文件
 * @param filePath 文件路径
 * @returns 是否为可执行文件
 */
export const isExecutableFile = (filePath: string): boolean => {
	const ext = extname(filePath).toLowerCase();
	return [".exe", ".bat", ".cmd"].includes(ext);
};

/**
 * 获取目录下所有可执行文件（非递归）
 * @param dirPath 目录路径
 * @returns 可执行文件路径数组
 */
export const getExecutablesInDirectory = async (
	dirPath: string,
): Promise<string[]> => {
	try {
		const entries = await readDir(dirPath);
		const executables: string[] = [];

		for (const entry of entries) {
			// 只处理文件，不递归子目录
			if (!entry.isDirectory && entry.name) {
				const fullPath = join(dirPath, entry.name);
				if (isExecutableFile(entry.name)) {
					executables.push(fullPath);
				}
			}
		}

		return executables;
	} catch (error) {
		console.error("读取目录失败:", error);
		return [];
	}
};

/**
 * 处理拖拽的文件或文件夹路径
 * @param droppedPath 拖拽的路径
 * @returns 选中的可执行文件路径，如果失败返回 null
 */
export const handleDroppedPath = async (
	droppedPath: string,
): Promise<string | null> => {
	try {
		// 检查路径类型
		const fileInfo = await stat(droppedPath);

		if (fileInfo.isDirectory) {
			// 拖入的是文件夹，读取其中的可执行文件
			const executables = await getExecutablesInDirectory(droppedPath);

			if (executables.length === 0) {
				// 没有可执行文件
				snackbar.error(t("components.AddModal.emptyFolder"));
				return null;
			}

			if (executables.length === 1) {
				// 只有一个可执行文件，直接使用
				return executables[0];
			}

			// 多个可执行文件，弹出系统对话框让用户选择
			snackbar.info(t("components.AddModal.selectFromFolder"));
			const selected = await handleDirectory(droppedPath);

			return selected;
		}
		// 拖入的是文件
		if (isExecutableFile(droppedPath)) {
			return droppedPath;
		}
		// 不是可执行文件
		snackbar.error(t("components.AddModal.invalidFile"));
		return null;
	} catch (error) {
		console.error("处理拖拽路径失败:", error);
		snackbar.error(t("components.AddModal.invalidFile"));
		return null;
	}
};

export const handleGetFolder = async (defaultPath?: string) => {
	const path = await openDirectory({
		multiple: false,
		directory: true,
		defaultPath: defaultPath,
		filters: [
			{
				name: "存档文件夹",
				extensions: ["*"],
			},
		],
	});
	if (path === null) return null;
	return path;
};

export const getGameDisplayName = (
	game: GameData,
	language?: string,
): string => {
	const currentLanguage = language || i18next.language;
	if (game.custom_data?.name) {
		return game.custom_data.name;
	}
	// 只有当语言为zh-CN时才使用name_cn，其他语言都使用name
	return currentLanguage === "zh-CN" && game.name_cn
		? game.name_cn
		: game.name || "";
};
export const getcustomCoverFolder = (gameID: number): string => {
	const resourceFolder = getResourceDirPath();
	const customCoverFolder = join(
		resourceFolder,
		"resources",
		"covers",
		`game_${gameID}`,
	);
	return customCoverFolder;
};
export const getGameCover = (game: GameData): string => {
	// 如果有自定义封面扩展名，构造自定义封面路径
	if (game.custom_data?.image && game.id) {
		// 获取缓存的资源目录路径
		const customCoverFolder = getcustomCoverFolder(game.id);
		if (customCoverFolder) {
			// 使用数据库的custom_cover字段作为完整文件名（包含版本信息）
			// 例如：custom_cover = "jpg_1703123456789"
			const customCoverPath = join(
				customCoverFolder,
				`cover_${game.id}_${game.custom_data.image}`,
			);

			// 在 Tauri 环境中使用 convertFileSrc 转换路径
			try {
				return convertFileSrc(customCoverPath);
			} catch (error) {
				console.error("转换自定义封面路径失败:", error);
			}
		}
	}

	// 使用默认封面 (来自 bgm/vndb/other 数据的 image 字段)
	return game.image || "/images/default.png";
};

/**
 * 更新游戏状态的通用函数
 * @param gameId 游戏ID
 * @param newStatus 新的游戏状态 (PlayStatus 枚举值 1-5)
 * @param onSuccess 成功回调函数，返回新的游戏状态
 * @param updateGamesInStore 可选：更新store中games数组的函数
 * @returns Promise<void>
 */
export const updateGamePlayStatus = async (
	gameId: number,
	newStatus: number,
	onSuccess?: (newStatus: number, gameData: GameData) => void,
	updateGamesInStore?: (gameId: number, newStatus: number) => void,
): Promise<void> => {
	try {
		const fullgame = await gameService.getGameById(gameId);
		if (!fullgame) {
			console.error("游戏数据未找到");
			return;
		}
		const game = getDisplayGameData(fullgame);

		await gameService.updateGame(gameId, {
			clear: newStatus,
		});

		// 更新store中的games数组
		if (updateGamesInStore) {
			updateGamesInStore(gameId, newStatus);
		}

		// 调用成功回调
		if (onSuccess) {
			onSuccess(newStatus, {
				...game,
				clear: newStatus,
			});
		}
	} catch (error) {
		console.error("更新游戏状态失败:", error);
		throw error;
	}
};

/**
 * 通用的创建游戏存档备份函数
 * @param gameId 游戏ID
 * @param saveDataPath 存档路径
 * @param skipPathCheck 是否跳过路径检查（用于自动备份）
 * @returns 备份信息
 */
export async function createGameSavedataBackup(
	gameId: number,
	saveDataPath: string,
	skipPathCheck = false,
): Promise<{ folder_name: string; backup_time: number; file_size: number }> {
	if (!skipPathCheck && !saveDataPath) {
		throw new Error("存档路径不能为空");
	}

	try {
		// 创建备份（备份路径由后端根据配置自动确定）
		const backupInfo = await savedataService.createBackup(gameId, saveDataPath);

		// 保存备份信息到数据库
		await savedataService.saveSavedataRecord(
			gameId,
			backupInfo.folder_name,
			backupInfo.backup_time,
			backupInfo.file_size,
		);

		return backupInfo;
	} catch (error) {
		console.error("创建游戏存档备份失败:", error);
		throw error;
	}
}

/**
 * 打开游戏备份文件夹
 * @param gameId 游戏ID
 */
export async function openGameBackupFolder(gameId: number): Promise<void> {
	const backupPath = await getSavedataBackupPath(gameId);
	// 使用后端函数打开文件夹
	await invoke("open_directory", {
		dirPath: backupPath,
	});
}

/**
 * 打开游戏存档文件夹
 * @param saveDataPath 存档路径
 */
export async function openGameSaveDataFolder(
	saveDataPath: string,
): Promise<void> {
	if (!saveDataPath) {
		throw new Error("存档路径不能为空");
	}
	// 使用后端函数打开文件夹
	await invoke("open_directory", { dirPath: saveDataPath });
}

/**
 * 打开数据库备份文件夹
 */
export async function openDatabaseBackupFolder(): Promise<void> {
	try {
		const backupPath = await getDbBackupPath();
		// 使用后端函数打开文件夹
		await invoke("open_directory", {
			dirPath: backupPath,
		});
	} catch (error) {
		snackbar.error(
			i18next.t("components.Snackbar.failedOpenDatabaseBackupFolder"),
		);
		console.error("打开数据库备份文件夹失败:", error);
		throw error;
	}
}

/**
 * 移动备份文件夹到新位置
 * @param oldPath 旧的备份根路径
 * @param newPath 新的备份根路径
 * @returns Promise<{ moved: boolean; message: string }>
 */
export async function moveBackupFolder(
	oldPath: string,
	newPath: string,
): Promise<{ moved: boolean; message: string }> {
	try {
		// 获取应用数据目录
		const appDataDir = getAppDataDirPath();

		// 确定旧备份目录和新备份目录路径
		const oldBackupDir = oldPath
			? join(oldPath, "backups")
			: join(appDataDir, "backups");
		const newBackupDir = join(newPath, "backups");

		// 调用 Rust 后端函数移动文件夹
		const result = await invoke<{ success: boolean; message: string }>(
			"move_backup_folder",
			{
				oldPath: oldBackupDir,
				newPath: newBackupDir,
			},
		);

		return {
			moved: result.success,
			message: result.message,
		};
	} catch (error) {
		console.error("移动备份文件夹失败:", error);
		const errorMessage =
			error instanceof Error ? error.message : "移动备份文件夹时发生未知错误";
		return {
			moved: false,
			message: errorMessage,
		};
	}
}

/**
 * 根据tags判断是否为NSFW
 * @param tags
 */
const isNsfwGame = (tags: string[]): boolean => {
	if (tags.length === 0) return false;

	if (tags.some((tag) => tag.includes("R18") || tag === "拔作")) {
		// 1. 显式 R18 或 拔作
		return true;
	}

	// 2. 纯英文标签且无 "No Sexual Content" (沿用你原本的逻辑)
	// biome-ignore lint/suspicious/noControlCharactersInRegex: 允许 ASCII 范围检查
	const isAllEnglish = tags.every((tag) => /^[\x00-\x7F]+$/.test(tag));
	return isAllEnglish && !tags.includes("No Sexual Content");
};

/**
 * 统一判断单个游戏是否为 NSFW
 * 策略：优先读取 game.nsfw 字段，如果为 null/undefined 则回退到标签判断
 */
export const getGameNsfwStatus = (game: GameData): boolean => {
	return game.nsfw ?? isNsfwGame(game.tags || []);
};

/**
 * 应用 NSFW 过滤器
 */
export function applyNsfwFilter(
	data: GameData[],
	enableFilter: boolean,
): GameData[] {
	// 如果没开启过滤，直接返回原数据（这是最快路径）
	if (!enableFilter) return data;

	// 过滤掉判定为 NSFW 的游戏
	return data.filter((game) => !getGameNsfwStatus(game));
}

//主动保存指定路径的滚动条位置
export const saveScrollPosition = (path: string) => {
	const SCROLL_CONTAINER_SELECTOR = "main";
	const container = document.querySelector<HTMLElement>(
		SCROLL_CONTAINER_SELECTOR,
	);

	// 增加一个检查，确保容器是可滚动的，避免无效保存
	if (container && container.scrollHeight > container.clientHeight) {
		const scrollTop = container.scrollTop;
		useScrollStore.setState((state) => ({
			scrollPositions: {
				...state.scrollPositions,
				[path]: scrollTop,
			},
		}));
	}
};

/**
 * 批量更新数据的通用函数
 * @param type 数据类型 ('vndb' | 'bgm')
 * @param fetchFunction 批量获取数据的函数
 * @param getAllIdsFunction 获取所有 ID 的函数
 * @param updateKeyName 更新字段的名称 ('vndb_data' | 'bgm_data')
 * @param token BGM Token (仅当 type 为 'bgm' 时需要)
 * @returns 返回更新结果统计
 */
async function batchUpdateCommon(
	type: "vndb" | "bgm",
	fetchFunction: (
		ids: string[],
		token?: string,
	) => Promise<
		| string
		| Array<{
				bgm_id?: string | null;
				vndb_id?: string | null;
				bgm_data?: BgmData | null;
				vndb_data?: VndbData | null;
		  }>
	>,
	getAllIdsFunction: () => Promise<Array<[number, string]>>,
	updateKeyName: "vndb_data" | "bgm_data",
	token?: string,
): Promise<{
	total: number;
	success: number;
	failed: number;
	errors: string[];
}> {
	try {
		// 1. 获取所有游戏的对应 ID
		const idPairs = await getAllIdsFunction();
		console.log(`Found ${type.toUpperCase()} ID pairs:`, idPairs);

		if (idPairs.length === 0) {
			return {
				total: 0,
				success: 0,
				failed: 0,
				errors: [
					i18next.t(
						`utils.batchUpdate.no${type.charAt(0).toUpperCase() + type.slice(1)}Games`,
						`没有找到包含 ${type.toUpperCase()} ID 的游戏`,
					),
				],
			};
		}

		// 2. 提取 ID 列表
		const ids = idPairs.map(([_, id]) => id);

		// 3. 批量获取数据
		const resultsTemp = token
			? await fetchFunction(ids, token)
			: await fetchFunction(ids);

		// 如果返回的是错误消息字符串
		if (typeof resultsTemp === "string") {
			return {
				total: idPairs.length,
				success: 0,
				failed: idPairs.length,
				errors: [resultsTemp],
			};
		}

		const errors: string[] = [];

		// 4. 构建更新数据
		const updates: Array<
			[number, Partial<{ bgm_data: BgmData; vndb_data: VndbData }>]
		> = [];

		for (const [gameId, apiId] of idPairs) {
			const data = resultsTemp.find((result) => {
				if (type === "bgm") {
					return result.bgm_id === apiId;
				}
				return result.vndb_id === apiId;
			});

			if (data?.[updateKeyName]) {
				updates.push([gameId, { [updateKeyName]: data[updateKeyName] }]);
			} else {
				errors.push(
					i18next.t(
						`utils.batchUpdate.${type}NotFound`,
						`游戏 ID ${gameId} (${type.toUpperCase()}: ${apiId}) 未找到数据`,
					),
				);
			}
		}

		// 5. 批量更新数据库
		if (updates.length > 0) {
			await gameService.updateBatch(updates);
		}

		return {
			total: idPairs.length,
			success: updates.length,
			failed: idPairs.length - updates.length,
			errors,
		};
	} catch (error) {
		const errorMessage =
			error instanceof Error
				? error.message
				: i18next.t("utils.batchUpdate.unknownError", "未知错误");
		console.error(`批量更新 ${type.toUpperCase()} 数据失败:`, error);
		throw new Error(errorMessage);
	}
}

/**
 * 批量更新 VNDB 数据
 * @returns 返回更新结果统计
 */
export async function batchUpdateVndbData(): Promise<{
	total: number;
	success: number;
	failed: number;
	errors: string[];
}> {
	return batchUpdateCommon(
		"vndb",
		fetchVNDBByIds,
		() => gameService.getAllVndbIds(),
		"vndb_data",
	);
}

/**
 * 批量更新 BGM 数据
 * @param bgmToken Bangumi API Token（可选）
 * @returns 返回更新结果统计
 */
export async function batchUpdateBgmData(bgmToken?: string): Promise<{
	total: number;
	success: number;
	failed: number;
	errors: string[];
}> {
	return batchUpdateCommon(
		"bgm",
		(ids: string[]) => fetchBgmByIds(ids, bgmToken),
		() => gameService.getAllBgmIds(),
		"bgm_data",
		bgmToken,
	);
}

// ==================== 脏检查工具函数 ====================

/**
 * 计算 UI 状态与原始数据的差异 (String & Number)
 *
 * 用于 React 受控组件向后端提交更新时的"三态"比对逻辑：
 * - undefined: 没变，不传（后端跳过此字段）
 * - null: 被清空，传 null（后端更新为 NULL）
 * - T: 被修改，传新值（后端更新为新值）
 *
 * @param current 当前 UI 中的状态 (例如 input 的 value)
 * @param original 原始数据 (可能是 null/undefined)
 * @returns undefined | null | T
 *
 * @example
 * // 字符串示例
 * getDiff("", null)        // → undefined (没变，原本就是空)
 * getDiff("ABC", "ABC")    // → undefined (没变)
 * getDiff("", "ABC")       // → null (被清空)
 * getDiff("DEF", "ABC")    // → "DEF" (被修改)
 *
 * @example
 * // 数字示例
 * getDiff(0, undefined)    // → undefined (没变，原本就是 0)
 * getDiff(10, 10)          // → undefined (没变)
 * getDiff(20, 10)          // → 20 (被修改)
 */
export function getDiff<T extends string | number>(
	current: T,
	original: T | null | undefined,
): T | null | undefined {
	// --- 1. 字符串处理 ---
	if (typeof current === "string") {
		// 归一化：将原始数据的 null/undefined 都视为 "" 与当前状态对比
		const normOriginal = (original ?? "") as string;
		const normCurrent = current.trim(); // 去除首尾空格

		// [逻辑1：没变] 归一化后相等 -> 不传 (undefined)
		if (normOriginal === normCurrent) return undefined;

		// [逻辑2：被清空] 当前为空，说明用户删光了 -> 传 null
		if (normCurrent === "") return null;

		// [逻辑3：被修改] 有值且不等 -> 传新值
		return normCurrent as T;
	}

	// --- 2. 数字处理 ---
	if (typeof current === "number") {
		// 归一化：undefined/null 视为 0
		const normOriginal = original ?? 0;

		// [逻辑1：没变]
		if (normOriginal === current) return undefined;

		// [逻辑2：数字变了] 数字通常直接覆盖
		return current;
	}

	return undefined;
}

/**
 * 计算数组差异（用于 aliases, tags 等字符串数组）
 *
 * @param current 当前 UI 状态
 * @param original 原始数据
 * @returns undefined | null | T[]
 *
 * @example
 * getArrayDiff([], [])           // → undefined (没变)
 * getArrayDiff(["a"], ["a"])     // → undefined (没变)
 * getArrayDiff([], ["a", "b"])   // → null (被清空)
 * getArrayDiff(["c"], ["a"])     // → ["c"] (被修改)
 */
export function getArrayDiff<T>(
	current: T[],
	original: T[] | null | undefined,
): T[] | null | undefined {
	const normOriginal = original ?? [];

	// 使用 JSON 比较（适用于简单类型数组）
	if (JSON.stringify(current) === JSON.stringify(normOriginal)) {
		return undefined; // 没变
	}

	// 被清空
	if (current.length === 0) {
		return null;
	}

	// 被修改
	return current;
}

/**
 * 计算布尔值差异
 *
 * @param current 当前 UI 状态
 * @param original 原始数据
 * @returns undefined | boolean
 *
 * @example
 * getBoolDiff(false, undefined)  // → undefined (没变，原本就是 false)
 * getBoolDiff(true, true)        // → undefined (没变)
 * getBoolDiff(true, false)       // → true (被修改)
 */
export function getBoolDiff(
	current: boolean,
	original: boolean | null | undefined,
): boolean | undefined {
	const normOriginal = original ?? false;

	if (current === normOriginal) {
		return undefined; // 没变
	}

	return current; // 被修改
}

// 导出数据转换工具
export {
	getDisplayGameData,
	getDisplayGameDataList,
} from "./dataTransform";
