import { fileService, savedataService } from "@/services/invoke";

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
	await savedataService.openBackupFolder(gameId);
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
	await fileService.openDatabaseBackupFolder();
}
