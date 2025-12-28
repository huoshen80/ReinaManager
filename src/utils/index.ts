import { path } from "@tauri-apps/api";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { resourceDir } from "@tauri-apps/api/path";
import { open as openDirectory } from "@tauri-apps/plugin-dialog";
import { open } from "@tauri-apps/plugin-shell";
import i18next, { t } from "i18next";
import { join } from "pathe";
import { fetchBgmByIds } from "@/api/bgm";
import { fetchVNDBByIds } from "@/api/vndb";
import { snackbar } from "@/components/Snackbar";
import { gameService, savedataService, settingsService } from "@/services";
import { useScrollStore } from "@/store/scrollStore";
import type {
	BgmData,
	GameData,
	HanleGamesProps,
	RawGameData,
	VndbData,
} from "@/types";
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
let cachedDbBackupPath: string | null = null;
let cachedSavedataBackupPath: string | null = null;

/**
 * 路径初始化结果类型
 */
export interface PathInitResult {
	resourceDir: string; // 资源目录路径
	appDataDir: string; // 应用数据目录（便携或标准）
	isPortableMode: boolean; // 是否便携模式
	dbPath: string; // 数据库文件路径
	dbBackupPath: string; // 数据库备份目录路径
	savedataBackupPath: string; // 存档备份目录路径
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

	// 5 & 6. 并行获取数据库备份路径和存档备份路径
	await Promise.all([refreshDbBackupPath(), refreshSavedataBackupPath()]);

	return {
		resourceDir: cachedResourceDirPath,
		appDataDir: cachedAppDataDir || "",
		isPortableMode: cachedIsPortableMode,
		dbPath: cachedDbPath || "",
		dbBackupPath: cachedDbBackupPath || "",
		savedataBackupPath: cachedSavedataBackupPath || "",
	};
};

/**
 * 刷新数据库备份路径缓存
 * 用于用户修改数据库备份路径配置后更新缓存
 */
export const refreshDbBackupPath = async (): Promise<void> => {
	if (!cachedAppDataDir) {
		console.warn("应用数据目录未初始化，无法刷新数据库备份路径");
		return;
	}

	const customDbBackupPath = await settingsService.getDbBackupPath();
	if (customDbBackupPath && customDbBackupPath.trim() !== "") {
		cachedDbBackupPath = customDbBackupPath;
	} else {
		cachedDbBackupPath = join(cachedAppDataDir, "data", "backups");
	}
};

/**
 * 刷新存档备份路径缓存
 * 用于用户修改存档根路径配置后更新缓存
 */
export const refreshSavedataBackupPath = async (): Promise<void> => {
	if (!cachedAppDataDir) {
		console.warn("应用数据目录未初始化，无法刷新存档备份路径");
		return;
	}

	const customSaveRootPath = await settingsService.getSaveRootPath();
	if (customSaveRootPath && customSaveRootPath.trim() !== "") {
		cachedSavedataBackupPath = join(customSaveRootPath, "backups");
	} else {
		cachedSavedataBackupPath = join(cachedAppDataDir, "backups");
	}
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
 * 获取缓存的数据库备份路径（同步）
 */
export const getDbBackupPath = (): string => {
	return cachedDbBackupPath || "";
};

/**
 * 获取缓存的存档备份路径（同步）
 */
export const getSavedataBackupPath = (): string => {
	return cachedSavedataBackupPath || "";
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

// 启动游戏并开始监控
export async function launchGameWithTracking(
	gamePath: string,
	gameId: number,
	args?: string[],
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
export const handleFolder = async () => {
	const path = await openDirectory({
		multiple: false,
		directory: true,
		filters: [
			{
				name: t("utils.handleDirectory.folder"),
				extensions: ["*"],
			},
		],
	});
	if (path === null) return null;
	return path;
};
export const handleExeFile = async (defaultPath: string = "") => {
	const path = await openDirectory({
		multiple: false,
		directory: false,
		defaultPath: defaultPath,
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
	if (game.custom_name) {
		return game.custom_name;
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
	if (game.custom_cover && game.id) {
		// 获取缓存的资源目录路径
		const customCoverFolder = getcustomCoverFolder(game.id);
		if (customCoverFolder) {
			// 使用数据库的custom_cover字段作为完整文件名（包含版本信息）
			// 例如：custom_cover = "jpg_1703123456789"
			const customCoverPath = join(
				customCoverFolder,
				`cover_${game.id}_${game.custom_cover}`,
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
	return game.image || "";
};

/**
 * 切换游戏通关状态的通用函数
 * @param gameId 游戏ID
 * @param getGameById 获取游戏数据的函数
 * @param onSuccess 成功回调函数，返回新的通关状态
 * @param updateGamesInStore 可选：更新store中games数组的函数
 * @returns Promise<void>
 */
export const toggleGameClearStatus = async (
	gameId: number,
	onSuccess?: (newStatus: 1 | 0, gameData: GameData) => void,
	updateGamesInStore?: (gameId: number, newClearStatus: 1 | 0) => void,
): Promise<void> => {
	try {
		const fullgame = await gameService.getGameById(gameId);
		if (!fullgame) {
			console.error("游戏数据未找到");
			return;
		}
		const game = getDisplayGameData(fullgame);

		const newClearStatus = game.clear === 1 ? 0 : 1;
		await gameService.updateGameWithRelated(gameId, {
			game: { clear: newClearStatus as 1 | 0 },
		});

		// 更新store中的games数组
		if (updateGamesInStore) {
			updateGamesInStore(gameId, newClearStatus as 1 | 0);
		}

		// 调用成功回调
		if (onSuccess) {
			onSuccess(newClearStatus as 1 | 0, {
				...game,
				clear: newClearStatus as 1 | 0,
			});
		}
	} catch (error) {
		console.error("更新游戏通关状态失败:", error);
		throw error;
	}
};

// ==================== 备份相关 API 调用 ====================

export interface BackupInfo {
	folder_name: string;
	backup_time: number;
	file_size: number;
	backup_path: string;
}

/**
 * 创建游戏存档备份
 *
 * 备份目录将根据以下优先级确定（由后端处理）：
 * 1. 用户设置的自定义存档路径/backups
 * 2. 便携模式：程序目录/backups
 * 3. 非便携模式：AppData/backups
 *
 * @param gameId 游戏ID
 * @param sourcePath 存档文件夹路径
 * @returns 备份信息
 */
export async function createSavedataBackup(
	gameId: number,
	sourcePath: string,
): Promise<BackupInfo> {
	try {
		const result = await invoke<BackupInfo>("create_savedata_backup", {
			gameId,
			sourcePath,
		});
		return result;
	} catch (error) {
		console.error("创建备份失败:", error);
		throw error;
	}
}

/**
 * 删除备份文件
 * @param backupFilePath 备份文件完整路径
 */
export async function deleteSavedataBackup(
	backupFilePath: string,
): Promise<void> {
	try {
		await invoke("delete_savedata_backup", {
			backupFilePath,
		});
	} catch (error) {
		console.error("删除备份文件失败:", error);
		throw error;
	}
}

/**
 * 恢复存档备份
 * @param backupFilePath 备份文件完整路径
 * @param targetPath 目标恢复路径
 */
export async function restoreSavedataBackup(
	backupFilePath: string,
	targetPath: string,
): Promise<void> {
	try {
		await invoke("restore_savedata_backup", {
			backupFilePath,
			targetPath,
		});
	} catch (error) {
		console.error("恢复备份失败:", error);
		throw error;
	}
}

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
		const backupInfo = await createSavedataBackup(gameId, saveDataPath);

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
	try {
		const savedataBackupPath = getSavedataBackupPath();
		const backupGameDir = join(savedataBackupPath, `game_${gameId}`);
		// 使用后端函数打开文件夹
		await invoke("open_directory", { dirPath: backupGameDir });
	} catch (error) {
		snackbar.error(i18next.t("components.Snackbar.failedOpenBackupFolder"));
		console.error("打开备份文件夹失败:", error);
		throw error;
	}
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

	try {
		// 使用后端函数打开文件夹
		await invoke("open_directory", { dirPath: saveDataPath });
	} catch (error) {
		snackbar.error(i18next.t("components.Snackbar.failedOpenSaveFolder"));
		console.error("打开存档文件夹失败:", error);
		throw error;
	}
}

/**
 * 打开数据库备份文件夹
 */
export async function openDatabaseBackupFolder(): Promise<void> {
	try {
		const backupDir = getDbBackupPath();
		// 使用后端函数打开文件夹
		await invoke("open_directory", { dirPath: backupDir });
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
export function isNsfwGame(tags: string[]): boolean {
	if (!tags || tags.length === 0) return false;

	// 检查是否包含R18相关标签
	const hasR18Tag = tags.some((tag) => tag.includes("R18"));
	if (hasR18Tag) return true;

	// 检查是否包含拔作标签
	if (tags.includes("拔作")) return true;

	// 如果tags均为英文且没有包含No Sexual Content 也为NSFW
	// biome-ignore lint/suspicious/noControlCharactersInRegex: 非字面上的控制字符
	const allEnglish = tags.every((tag) => /^[\x00-\x7F]+$/.test(tag));
	return allEnglish && !tags.includes("No Sexual Content");
}

/**
 * 通过tags中的R18来判断是否为NSFW并过滤
 * @param data 游戏数据数组
 * @param nsfwFilter 是否启用NSFW过滤
 * @returns 过滤后的游戏数据
 */
export function applyNsfwFilter(
	data: GameData[],
	nsfwFilter: boolean,
): GameData[] {
	if (!nsfwFilter) return data;
	return data.filter((game) => {
		const tags = game.tags || [];
		return !isNsfwGame(tags);
	});
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
				game: RawGameData;
				bgm_data: BgmData | null;
				vndb_data: VndbData | null;
				other_data: null;
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
		const updates: Array<[number, BgmData | VndbData]> = [];

		for (const [gameId, apiId] of idPairs) {
			const data = resultsTemp.find((result) => {
				if (type === "bgm") {
					return result.game.bgm_id === apiId;
				}
				return result.game.vndb_id === apiId;
			});

			if (data?.[updateKeyName]) {
				updates.push([gameId, data[updateKeyName]]);
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
			if (updateKeyName === "bgm_data") {
				await gameService.updateBatch(
					undefined,
					updates as Array<[number, BgmData]>,
					undefined,
					undefined,
				);
			} else {
				await gameService.updateBatch(
					undefined,
					undefined,
					updates as Array<[number, VndbData]>,
					undefined,
				);
			}
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

// 导出数据转换工具
export {
	getDisplayGameData,
	getDisplayGameDataList,
} from "./dataTransform";

/**
 * 从目录名中移除括号内容，提取搜索用的游戏名
 * 例如: "[社团名] 游戏名 (版本)" -> "游戏名"
 */
export function trimDirnameToSearchName(dirName: string): string {
	/**
	 * 尝试移除一对括号及其内容
	 */
	function trimOnce(name: string, open: string, close: string): string {
		const trimmed = name.trim();
		if (trimmed.startsWith(open)) {
			const pos = trimmed.indexOf(close);
			if (pos !== -1) {
				return trimmed.slice(pos + close.length).trim();
			}
		}
		return trimmed;
	}

	/**
	 * 循环移除所有括号直到没有变化
	 */
	function trim(name: string): string {
		let currentName = name;

		while (true) {
			let trimmed = trimOnce(currentName, "[", "]");
			trimmed = trimOnce(trimmed, "(", ")");
			trimmed = trimOnce(trimmed, "【", "】");

			// 如果没有变化则退出循环
			if (trimmed === currentName) {
				break;
			}
			currentName = trimmed;
		}

		return currentName.trim();
	}

	return trim(dirName);
}
