import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

/** 数据库备份结果 */
interface BackupResult {
	success: boolean;
	path: string | null;
	message: string;
}

/** 数据库导入结果 */
interface ImportResult {
	success: boolean;
	message: string;
	backup_path: string | null;
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
		const result = await invoke<BackupResult>("backup_database");
		console.log(`数据库已备份到: ${result.path}`);
		return result;
	} catch (error) {
		console.error("备份数据库失败:", error);
		throw error;
	}
}

/**
 * 导入数据库文件（覆盖现有数据库）
 *
 * 流程：
 * 1. 关闭当前数据库连接
 * 2. 使用 fs::copy 备份当前数据库（冷备份，性能更好）
 * 3. 用导入的数据库文件覆盖现有数据库
 * 4. 重新建立数据库连接
 *
 * 备份路径从数据库的 user 表中读取配置
 *
 * 注意：由于需要关闭并重新打开数据库连接，导入后需要重启应用以确保数据正确加载
 *
 * @returns Promise<ImportResult | null> 导入成功返回结果对象，取消返回 null
 */
export async function importDatabase(): Promise<string | null> {
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
	await invoke("import_database", {
		sourcePath: filePath as string,
	});

	return filePath as string;
}
