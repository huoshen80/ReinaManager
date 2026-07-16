import { open } from "@tauri-apps/plugin-dialog";
import {
	type BackupResult,
	fileService,
	type ImportResult,
	type WebdavBackupInfo,
} from "@/services/invoke";

export type { WebdavBackupInfo };

export interface AutoBackupResult {
	database: BackupResult;
	covers: BackupResult | null;
}

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
 * 创建退出时自动备份。
 *
 * 后端会使用自动备份专用文件名，并只清理旧的自动备份文件。
 */
export async function createAutoBackup(
	includeCovers: boolean,
	maxBackups: number,
): Promise<AutoBackupResult> {
	try {
		const options = { auto: true, maxAutoBackups: maxBackups };
		const covers = includeCovers
			? await fileService.backupCustomCovers(options)
			: null;
		const database = await fileService.backupDatabase(options);
		const result = { database, covers };
		console.log(`自动备份完成: ${result.database.path}`);
		return result;
	} catch (error) {
		console.error("自动备份失败:", error);
		throw error;
	}
}

/**
 * 导入数据库文件（覆盖现有数据库）
 *
 * 流程：
 * 1. 读取备份目录配置
 * 2. 备份当前自定义封面
 * 3. 关闭当前数据库连接
 * 4. 冷备份当前数据库文件
 * 5. 清空封面目录，避免旧封面按自增 id 错配新数据库
 * 6. 用导入的数据库文件覆盖现有数据库
 *
 * 备份路径从数据库的 user 表中读取配置
 *
 * 注意：由于需要关闭并重新打开数据库连接，导入后需要重启应用以确保数据正确加载
 *
 * @returns Promise<ImportResult | null> 导入成功返回结果对象，取消返回 null
 */
export async function importDatabase(): Promise<ImportResult | null> {
	// 打开文件选择对话框
	const filePath = await open({
		filters: [{ name: "SQLite Database", extensions: ["db"] }],
		multiple: false,
		directory: false,
	});

	if (!filePath) {
		return null; // 用户取消
	}

	// 调用后端命令导入数据库
	const result = await fileService.importDatabase(filePath);

	return result;
}

// ==================== WebDAV 备份 ====================

/**
 * 测试 WebDAV 连接
 */
export async function testWebdavConnection(
	url: string,
	username: string,
	password: string,
): Promise<boolean> {
	try {
		const result = await fileService.testWebdavConnection(url, username, password);
		console.log("WebDAV 连接测试通过");
		return result;
	} catch (error) {
		console.error("WebDAV 连接测试失败:", error);
		throw error;
	}
}

/**
 * 备份数据库到 WebDAV
 */
export async function webdavBackupDatabase(): Promise<BackupResult> {
	try {
		const result = await fileService.webdavBackupDatabase();
		console.log(`数据库已备份到 WebDAV: ${result.path}`);
		return result;
	} catch (error) {
		console.error("WebDAV 备份失败:", error);
		throw error;
	}
}

/**
 * 从 WebDAV 恢复数据库
 */
export async function webdavImportDatabase(
	remoteFilename: string,
): Promise<ImportResult> {
	try {
		const result = await fileService.webdavImportDatabase(remoteFilename);
		console.log(`已从 WebDAV 恢复数据库: ${remoteFilename}`);
		return result;
	} catch (error) {
		console.error("WebDAV 恢复失败:", error);
		throw error;
	}
}

/**
 * 列举 WebDAV 远程备份
 */
export async function listWebdavBackups(): Promise<WebdavBackupInfo[]> {
	try {
		return await fileService.listWebdavBackups();
	} catch (error) {
		console.error("列举 WebDAV 备份失败:", error);
		throw error;
	}
}

/**
 * 删除 WebDAV 远程备份
 */
export async function deleteWebdavBackup(
	remoteFilename: string,
): Promise<void> {
	try {
		await fileService.deleteWebdavBackup(remoteFilename);
		console.log(`已删除 WebDAV 备份: ${remoteFilename}`);
	} catch (error) {
		console.error("删除 WebDAV 备份失败:", error);
		throw error;
	}
}

/**
 * 上传游戏存档备份到 WebDAV
 */
export async function webdavUploadSavedataBackup(
	gameId: number,
	localPath: string,
): Promise<BackupResult> {
	try {
		const result = await fileService.webdavUploadSavedataBackup(gameId, localPath);
		console.log(`游戏存档已上传到 WebDAV: ${result.path}`);
		return result;
	} catch (error) {
		console.error("WebDAV 上传失败:", error);
		throw error;
	}
}

