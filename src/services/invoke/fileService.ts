/**
 * @file 文件与系统操作服务
 * @description 封装文件系统、目录打开与数据库备份/导入相关后端调用
 */

import type { ScanResult } from "@/types";
import { BaseService } from "./base";

export interface BackupResult {
	success: boolean;
	path: string | null;
	message: string;
}

export interface ImportResult {
	success: boolean;
	message: string;
	backup_path: string | null;
}

export interface MoveBackupFolderResult {
	success: boolean;
	message: string;
}

export interface PortableModeResult {
	is_portable: boolean;
}

class FileService extends BaseService {
	/**
	 * 扫描目录下的游戏文件夹
	 */
	async scanDirectoryForGames(path: string): Promise<ScanResult[]> {
		return this.invoke<ScanResult[]>("scan_directory_for_games", { path });
	}

	/**
	 * 打开目录
	 */
	async openDirectory(dirPath: string): Promise<void> {
		return this.invoke<void>("open_directory", { dirPath });
	}

	/**
	 * 判断当前是否为便携模式
	 */
	async isPortableMode(): Promise<PortableModeResult> {
		return this.invoke<PortableModeResult>("is_portable_mode");
	}

	/**
	 * 复制文件
	 */
	async copyFile(src: string, dst: string): Promise<void> {
		return this.invoke<void>("copy_file", { src, dst });
	}

	/**
	 * 删除文件
	 */
	async deleteFile(filePath: string): Promise<void> {
		return this.invoke<void>("delete_file", { filePath });
	}

	/**
	 * 删除指定游戏的自定义封面
	 */
	async deleteGameCovers(gameId: number, coversDir: string): Promise<void> {
		return this.invoke<void>("delete_game_covers", { gameId, coversDir });
	}

	/**
	 * 删除本地的云端封面缓存
	 */
	async deleteCloudCoverCache(gameId: number): Promise<void> {
		return this.invoke<void>("delete_cloud_cache", { gameId });
	}

	/**
	 * 备份数据库
	 */
	async backupDatabase(): Promise<BackupResult> {
		return this.invoke<BackupResult>("backup_database");
	}

	/**
	 * 备份自定义封面（仅自定义封面，不含云端缓存）
	 */
	async backupCustomCovers(): Promise<BackupResult> {
		return this.invoke<BackupResult>("backup_custom_covers");
	}

	/**
	 * 导入数据库
	 */
	async importDatabase(sourcePath: string): Promise<ImportResult> {
		return this.invoke<ImportResult>("import_database", { sourcePath });
	}

	/**
	 * 移动备份文件夹
	 */
	async moveBackupFolder(
		oldPath: string,
		newPath: string,
	): Promise<MoveBackupFolderResult> {
		return this.invoke<MoveBackupFolderResult>("move_backup_folder", {
			oldPath,
			newPath,
		});
	}
}

export const fileService = new FileService();
