import { ask, open } from "@tauri-apps/plugin-dialog";
import i18n from "i18next";
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
 * 后端先验证并迁移临时库，备份失败时保持旧库可用，仅在用户确认后重试。
 * 调用方须预先取得重启许可，并按结果处理关闭连接后的恢复重启。
 */
export async function importDatabase(filePath: string): Promise<ImportResult> {
	const result = await fileService.importDatabase(filePath);
	if (!result.requires_backup_confirmation) {
		return result;
	}

	const confirmed = await ask(
		i18n.t(
			"pages.Settings.databaseBackup.continueWithoutBackupMessage",
			"导入前备份失败：{{error}}\n\n是否跳过失败的备份并继续导入？本次替换仍会保留旧数据库和封面用于回滚。",
			{ error: result.message },
		),
		{
			title: i18n.t(
				"pages.Settings.databaseBackup.continueWithoutBackupTitle",
				"导入前备份失败",
			),
			kind: "warning",
			okLabel: i18n.t(
				"pages.Settings.databaseBackup.continueWithoutBackup",
				"跳过备份并继续",
			),
			cancelLabel: i18n.t("common.cancel", "取消"),
		},
	);

	return confirmed ? fileService.importDatabase(filePath, true) : result;
}
