import { open } from "@tauri-apps/plugin-dialog";
import {
	type AutoBackupResult,
	type AutoBackupTrigger,
	type BackupResult,
	fileService,
	type ImportResult,
} from "@/services/invoke";

/**
 * 使用 VACUUM INTO 进行数据库热备份
 *
 * 此方法使用 SQLite 的 VACUUM INTO 语句，可以在数据库正在使用时安全地创建备份。
 * VACUUM INTO 会创建一个优化后的数据库副本，同时保持原数据库的完整性。
 *
 * 备份路径从数据库的 user 表中读取配置：
 * - 优先使用 user.db_backup_path（如果设置且非空）
 * - 否则使用默认的 AppData/data/backups 目录（或便携模式下的程序目录）
 *
 * @returns 备份结果，包含备份文件的路径
 */
export async function backupDatabase(): Promise<BackupResult> {
	try {
		const result = await fileService.backupDatabase();
		console.log(`数据库已备份到: ${result.path}`);
		return result;
	} catch (error) {
		console.error("备份数据库失败:", error);
		throw error;
	}
}

/**
 * 备份自定义封面（仅自定义封面，不含云端缓存）
 *
 * 扫描所有 game_{id} 目录，仅复制匹配 cover_{id}_* 的文件，
 * 无自定义封面的目录不会包含在备份中。
 * 备份路径跟随数据库备份路径逻辑。
 *
 * @returns 备份结果，包含备份文件的路径
 */
export async function backupCustomCovers(): Promise<BackupResult> {
	try {
		const result = await fileService.backupCustomCovers();
		if (result.path) {
			console.log(`自定义封面已备份到: ${result.path}`);
		}
		return result;
	} catch (error) {
		console.error("备份自定义封面失败:", error);
		throw error;
	}
}

/**
 * 创建自动备份批次。
 *
 * 后端会使用自动备份专用文件名，并只清理旧的自动备份文件。
 */
export async function createAutoBackup(
	trigger: AutoBackupTrigger,
	includeCovers: boolean,
	maxBackups: number,
): Promise<AutoBackupResult> {
	try {
		const result = await fileService.createAutoBackup({
			trigger,
			includeCovers,
			maxAutoBackups: maxBackups,
		});
		console.log(`自动备份完成: ${result.database.path}`);
		return result;
	} catch (error) {
		console.error("自动备份失败:", error);
		throw error;
	}
}

/**
 * 选择要导入的数据库文件。
 */
export async function selectDatabaseImportFile(): Promise<string | null> {
	return open({
		filters: [{ name: "SQLite Database", extensions: ["db"] }],
		multiple: false,
		directory: false,
	});
}

/**
 * 使用指定数据库文件覆盖当前数据库。
 * 后端会依次备份自定义封面、关闭连接、冷备份当前数据库、清空封面并覆盖数据库文件。
 * 调用方必须在执行前完成重启许可确认，因为后端会关闭当前数据库连接。
 */
export async function importDatabase(filePath: string): Promise<ImportResult> {
	return fileService.importDatabase(filePath);
}
