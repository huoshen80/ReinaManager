import { path } from "@tauri-apps/api";
import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import { resourceDir } from "@tauri-apps/api/path";
import { open as openDirectory } from "@tauri-apps/plugin-dialog";
import { open } from "@tauri-apps/plugin-shell";
import i18next, { t } from "i18next";
import { snackbar } from "@/components/Snackbar";
import { gameService, savedataService } from "@/services";
import { useScrollStore } from "@/store/scrollStore";
import type { GameData, HanleGamesProps } from "@/types";
import { getDisplayGameData } from "./dataTransform";

// 导出 API 数据转换工具
export {
	type AppendFields,
	transformApiGameData,
} from "./apiDataTransform";

// 缓存资源目录路径
let cachedResourceDirPath: string | null = null;

/**
 * 初始化资源目录路径缓存
 * 应该在应用启动时调用
 */
export const initResourceDirPath = async (): Promise<string> => {
	if (!cachedResourceDirPath) {
		cachedResourceDirPath = await resourceDir();
	}
	return cachedResourceDirPath;
};

/**
 * 获取缓存的资源目录路径（同步）
 * 如果未初始化则返回空字符串
 */
export const getResourceDirPath = (): string => {
	return cachedResourceDirPath || "";
};

// import { createTheme } from '@mui/material/styles';

export const time_now = () => {
	// 获取当前时间
	const currentDate = new Date();

	return currentDate;
};

export const getLocalDateString = (timestamp?: number): string => {
	const date = timestamp ? new Date(timestamp * 1000) : new Date();
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

// export const Buttontheme = createTheme({
//   components: {
//     MuiButton: {
//       styleOverrides: {
//         root: {
//           textTransform: 'none', // 禁用所有按钮的文本大写转换
//         },
//       },
//     },
//   },
// });

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

export const handleDirectory = async () => {
	const path = await openDirectory({
		multiple: false,
		directory: false,
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
	const customCoverFolder = `${resourceFolder}\\resources\\covers\\game_${gameID}`;
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
			const customCoverPath = `${customCoverFolder}\\cover_${game.id}_${game.custom_cover}`;

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
 * @param gameId 游戏ID
 * @param sourcePath 存档源路径
 * @param backupRootDir 备份根目录
 * @returns 备份信息
 */
export async function createSavedataBackup(
	gameId: number,
	sourcePath: string,
	backupRootDir: string,
): Promise<BackupInfo> {
	try {
		const result = await invoke<BackupInfo>("create_savedata_backup", {
			gameId,
			sourcePath,
			backupRootDir,
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
 * 获取应用数据目录路径
 * @returns 应用数据目录路径
 */
export async function getAppDataDir(): Promise<string> {
	try {
		const appDataDir = await path.appDataDir();
		return appDataDir;
	} catch (error) {
		console.error("获取应用数据目录失败:", error);
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
	const { settingsService } = await import("@/services");
	const saveRootPath = await settingsService.getSaveRootPath();

	try {
		// 获取备份根目录
		const appDataDir = await getAppDataDir();
		const backupRootDir =
			saveRootPath === "" ? `${appDataDir}/backups` : `${saveRootPath}/backups`;
		// 创建备份
		const backupInfo = await createSavedataBackup(
			gameId,
			saveDataPath,
			backupRootDir,
		);

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
	const { settingsService } = await import("@/services");
	const saveRootPath = await settingsService.getSaveRootPath();
	try {
		const appDataDir = await getAppDataDir();
		const backupGameDir =
			saveRootPath === ""
				? `${appDataDir}/backups/game_${gameId}`
				: `${saveRootPath}/backups/game_${gameId}`;
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
		const appDataDir = await getAppDataDir();
		const backupDir = `${appDataDir}/data/backups`;
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
		const appDataDir = await getAppDataDir();

		// 确定旧备份目录和新备份目录路径
		const oldBackupDir = oldPath
			? `${oldPath}/backups`
			: `${appDataDir}/backups`;
		const newBackupDir = `${newPath}/backups`;

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
		const tags =
			typeof game.tags === "string" ? JSON.parse(game.tags) : game.tags;
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

// 导出数据转换工具
export {
	dateToTimestamp,
	formatTimestamp,
	gameDataToDisplay,
	getDisplayGameData,
	getDisplayGameDataList,
	rawGameDataToDisplay,
	timestampToDate,
	// 兼容旧名称
	toDisplayGameData,
	toDisplayGameDataList,
} from "./dataTransform";
