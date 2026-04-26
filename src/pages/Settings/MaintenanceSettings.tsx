import BackupIcon from "@mui/icons-material/Backup";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import RestoreIcon from "@mui/icons-material/Restore";
import { CircularProgress, Typography } from "@mui/material";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import InputLabel from "@mui/material/InputLabel";
import Stack from "@mui/material/Stack";
import { relaunch } from "@tauri-apps/plugin-process";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { snackbar } from "@/providers/snackBar";
import { openDatabaseBackupFolder } from "@/utils/appUtils";
import { backupDatabase, importDatabase } from "@/utils/database";
import { getUserErrorMessage } from "@/utils/errors";

export const DatabaseBackupSettings = () => {
	const { t } = useTranslation();
	const [isBackingUp, setIsBackingUp] = useState(false);
	const [isImporting, setIsImporting] = useState(false);

	const handleBackupDatabase = async () => {
		setIsBackingUp(true);

		try {
			const result = await backupDatabase();
			if (result.success) {
				snackbar.success(
					t("pages.Settings.databaseBackup.backupSuccess", {
						path: result.path,
					}),
				);
			} else {
				snackbar.error(
					t("pages.Settings.databaseBackup.backupError", {
						error: result.message,
					}),
				);
			}
		} catch (error) {
			const errorMessage = getUserErrorMessage(
				error,
				t,
				t("pages.Settings.databaseBackup.backupFailed", "备份失败"),
			);
			snackbar.error(
				t("pages.Settings.databaseBackup.backupError", { error: errorMessage }),
			);
		} finally {
			setIsBackingUp(false);
		}
	};

	const handleOpenBackupFolder = async () => {
		try {
			await openDatabaseBackupFolder();
		} catch (error) {
			const errorMessage = getUserErrorMessage(
				error,
				t,
				t("pages.Settings.databaseBackup.openFolderFailed", "打开文件夹失败"),
			);
			snackbar.error(
				t("pages.Settings.databaseBackup.openFolderError", {
					error: errorMessage,
				}),
			);
		}
	};

	const handleImportDatabase = async () => {
		setIsImporting(true);
		try {
			const result = await importDatabase();
			if (result) {
				if (result.success) {
					snackbar.success(
						t(
							"pages.Settings.databaseBackup.importSuccess",
							"数据库导入成功，应用将自动重启",
						),
					);
					// 延迟重启应用，让用户看到成功提示
					setTimeout(async () => {
						await relaunch();
					}, 2000);
				} else {
					snackbar.error(
						t("pages.Settings.databaseBackup.importError", {
							error: result.message,
						}),
					);
				}
			}
		} catch (error) {
			const errorMessage = getUserErrorMessage(
				error,
				t,
				t("pages.Settings.databaseBackup.importFailed", "导入失败"),
			);
			snackbar.error(
				t("pages.Settings.databaseBackup.importError", { error: errorMessage }),
			);
		} finally {
			setIsImporting(false);
		}
	};

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">
				{t("pages.Settings.databaseBackup.title", "数据库备份与恢复")}
			</InputLabel>

			<Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
				<Button
					variant="contained"
					color="primary"
					onClick={handleBackupDatabase}
					disabled={isBackingUp}
					startIcon={
						isBackingUp ? (
							<CircularProgress size={16} color="inherit" />
						) : (
							<BackupIcon />
						)
					}
					className="px-6 py-2"
				>
					{isBackingUp
						? t("pages.Settings.databaseBackup.backing", "备份中...")
						: t("pages.Settings.databaseBackup.backup", "备份数据库")}
				</Button>

				<Button
					variant="outlined"
					color="primary"
					onClick={handleOpenBackupFolder}
					startIcon={<FolderOpenIcon />}
					className="px-6 py-2"
				>
					{t("pages.Settings.databaseBackup.openFolder", "打开备份文件夹")}
				</Button>

				<Button
					variant="outlined"
					color="warning"
					onClick={handleImportDatabase}
					disabled={isImporting}
					startIcon={
						isImporting ? (
							<CircularProgress size={16} color="inherit" />
						) : (
							<RestoreIcon />
						)
					}
					className="px-6 py-2"
				>
					{isImporting
						? t("pages.Settings.databaseBackup.importing", "导入中...")
						: t("pages.Settings.databaseBackup.restore", "恢复数据库")}
				</Button>
			</Stack>
			<Typography
				variant="caption"
				color="text.secondary"
				className="block mt-2"
			>
				{t(
					"pages.Settings.databaseBackup.restoreWarning",
					"恢复数据库将覆盖现有数据，请谨慎操作。导入后应用将自动重启。",
				)}
			</Typography>
			<Typography
				variant="caption"
				color="text.secondary"
				className="block mt-1"
			>
				{t(
					"pages.Settings.databaseBackup.pathNote",
					"备份路径配置已移至下方的「数据库备份路径」设置中",
				)}
			</Typography>
		</Box>
	);
};
