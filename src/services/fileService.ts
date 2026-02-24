/**
 * @file 文件与系统操作服务
 * @description 封装文件系统、目录打开与数据库备份/导入相关后端调用
 */

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

class FileService extends BaseService {
	/**
	 * 打开目录
	 */
	async openDirectory(dirPath: string): Promise<void> {
		return this.invoke<void>("open_directory", { dirPath });
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
	 * 备份数据库
	 */
	async backupDatabase(): Promise<BackupResult> {
		return this.invoke<BackupResult>("backup_database");
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
