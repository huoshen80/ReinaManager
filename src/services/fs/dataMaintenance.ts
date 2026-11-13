import { ask, open } from "@tauri-apps/plugin-dialog";
import i18n from "i18next";
import {
	type AutoBackupResult,
	type AutoBackupTrigger,
	type BackupResult,
	fileService,
	type ImportResult,
} from "@/services/invoke";

/** 备份数据库和自定义封面的完整数据包。 */
export async function backupDatabase(): Promise<BackupResult> {
	try {
		const result = await fileService.backupDatabase();
		console.log(`备份已保存到: ${result.path}`);
		return result;
	} catch (error) {
		console.error("备份失败:", error);
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
	maxBackups: number,
): Promise<AutoBackupResult> {
	try {
		const result = await fileService.createAutoBackup({
			trigger,
			maxAutoBackups: maxBackups,
		});
		console.log(`自动备份完成: ${result.backup.path}`);
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
		filters: [{ name: "ReinaManager Backup", extensions: ["db", "7z"] }],
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
			"导入前备份失败：{{error}}\n\n是否跳过失败的备份并继续导入？",
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
