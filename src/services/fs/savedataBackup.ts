import { join } from "pathe";
import {
	getAppDataDirPath,
	getDbBackupPath,
	getSavedataBackupPath,
} from "@/services/fs/pathCache";
import { fileService, savedataService } from "@/services/invoke";
import { toError } from "@/utils/errors";

export async function createGameSavedataBackup(
	gameId: number,
	saveDataPath: string,
): Promise<{ folder_name: string; backup_time: number; file_size: number }> {
	try {
		return await savedataService.createBackup(gameId, saveDataPath);
	} catch (error) {
		console.error("创建游戏存档备份失败:", error);
		throw error;
	}
}

export async function openGameBackupFolder(gameId: number): Promise<void> {
	const backupPath = await getSavedataBackupPath(gameId);
	await fileService.openDirectory(backupPath);
}

export async function openGameSaveDataFolder(
	saveDataPath: string,
): Promise<void> {
	if (!saveDataPath) {
		throw new Error("存档路径不能为空");
	}
	await savedataService.openLocation(saveDataPath);
}

export async function openDatabaseBackupFolder(): Promise<void> {
	const backupPath = await getDbBackupPath();
	await fileService.openDirectory(backupPath);
}

export async function moveBackupFolder(
	oldPath: string,
	newPath: string,
): Promise<{ moved: boolean; message: string }> {
	try {
		const appDataDir = getAppDataDirPath();
		const oldBackupDir = oldPath
			? join(oldPath, "backups")
			: join(appDataDir, "backups");
		const newBackupDir = join(newPath, "backups");

		const result = await fileService.moveBackupFolder(
			oldBackupDir,
			newBackupDir,
		);

		return {
			moved: result.success,
			message: result.message,
		};
	} catch (error) {
		console.error("移动备份文件夹失败:", error);
		return {
			moved: false,
			message: toError(error, "Failed to move backup folder").message,
		};
	}
}
