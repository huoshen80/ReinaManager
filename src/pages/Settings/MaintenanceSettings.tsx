import BackupIcon from "@mui/icons-material/Backup";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import ImageIcon from "@mui/icons-material/Image";
import RestoreIcon from "@mui/icons-material/Restore";
import {
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Switch,
	TextField,
	Typography,
} from "@mui/material";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { message } from "@tauri-apps/plugin-dialog";
import { type ChangeEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { useRefreshSettings } from "@/hooks/queries/useSettings";
import { snackbar } from "@/providers/snackBar";
import {
	type AppTerminationPermit,
	releaseAppTermination,
	requestAppTermination,
	restartApp,
} from "@/services/appExit";
import {
	backupCustomCovers,
	backupDatabase,
	importDatabase,
	selectDatabaseImportFile,
} from "@/services/fs/dataMaintenance";
import { openDatabaseBackupFolder } from "@/services/fs/savedataBackup";
import { useStore } from "@/store/appStore";
import { getUserErrorMessage } from "@/utils/errors";
import { SettingsGroup, SettingsItem } from "./SettingsLayout";

export const DatabaseBackupSettings = () => {
	const { t } = useTranslation();
	const refreshSettings = useRefreshSettings();
	const [isBackingUp, setIsBackingUp] = useState(false);
	const [isBackingCovers, setIsBackingCovers] = useState(false);
	const [isImporting, setIsImporting] = useState(false);
	const [needsRestart, setNeedsRestart] = useState(false);
	const [importRecovery, setImportRecovery] = useState<{
		message: string;
		canRestart: boolean;
	} | null>(null);
	const {
		autoBackupIncludeCovers,
		autoBackupLastError,
		autoBackupLastSuccessAt,
		autoBackupOnExit,
		autoBackupRetentionCount,
		exitBackupMinIntervalHours,
		scheduledBackupEnabled,
		scheduledBackupIntervalHours,
		setAutoBackupIncludeCovers,
		setAutoBackupOnExit,
		setAutoBackupRetentionCount,
		setExitBackupMinIntervalHours,
		setScheduledBackupEnabled,
		setScheduledBackupIntervalHours,
	} = useStore(
		useShallow((s) => ({
			autoBackupIncludeCovers: s.autoBackupIncludeCovers,
			autoBackupLastError: s.autoBackupLastError,
			autoBackupLastSuccessAt: s.autoBackupLastSuccessAt,
			autoBackupOnExit: s.autoBackupOnExit,
			autoBackupRetentionCount: s.autoBackupRetentionCount,
			exitBackupMinIntervalHours: s.exitBackupMinIntervalHours,
			scheduledBackupEnabled: s.scheduledBackupEnabled,
			scheduledBackupIntervalHours: s.scheduledBackupIntervalHours,
			setAutoBackupIncludeCovers: s.setAutoBackupIncludeCovers,
			setAutoBackupOnExit: s.setAutoBackupOnExit,
			setAutoBackupRetentionCount: s.setAutoBackupRetentionCount,
			setExitBackupMinIntervalHours: s.setExitBackupMinIntervalHours,
			setScheduledBackupEnabled: s.setScheduledBackupEnabled,
			setScheduledBackupIntervalHours: s.setScheduledBackupIntervalHours,
		})),
	);

	const handleScheduledIntervalChange = (
		event: ChangeEvent<HTMLInputElement>,
	) => {
		setScheduledBackupIntervalHours(Number(event.target.value));
	};

	const handleExitIntervalChange = (event: ChangeEvent<HTMLInputElement>) => {
		setExitBackupMinIntervalHours(Number(event.target.value));
	};

	const handleRetentionCountChange = (event: ChangeEvent<HTMLInputElement>) => {
		setAutoBackupRetentionCount(Number(event.target.value));
	};

	const lastAutoBackupText = autoBackupLastSuccessAt
		? new Date(autoBackupLastSuccessAt).toLocaleString()
		: t("pages.Settings.databaseBackup.autoNever", "从未自动备份");
	const autoBackupEnabled = scheduledBackupEnabled || autoBackupOnExit;

	const handleBackupDatabase = async () => {
		setIsBackingUp(true);

		try {
			const result = await backupDatabase();
			if (result.success) {
				refreshSettings();
				snackbar.success(
					t(
						"pages.Settings.databaseBackup.backupSuccess",
						"数据库备份成功: {{path}}",
						{
							path: result.path,
						},
					),
				);
			} else {
				snackbar.error(
					t(
						"pages.Settings.databaseBackup.backupError",
						"数据库备份失败: {{error}}",
						{
							error: result.message,
						},
					),
				);
			}
		} catch (error) {
			const errorMessage = getUserErrorMessage(
				error,
				t,
				t("pages.Settings.databaseBackup.backupFailed", "备份失败"),
			);
			snackbar.error(
				t(
					"pages.Settings.databaseBackup.backupError",
					"数据库备份失败: {{error}}",
					{ error: errorMessage },
				),
			);
		} finally {
			setIsBackingUp(false);
		}
	};

	const handleBackupCustomCovers = async () => {
		setIsBackingCovers(true);

		try {
			const result = await backupCustomCovers();
			if (result.success) {
				refreshSettings();
				snackbar.success(
					result.path
						? t(
								"pages.Settings.databaseBackup.coverBackupSuccess",
								"自定义封面备份成功: {{path}}",
								{
									path: result.path,
								},
							)
						: t(
								"pages.Settings.databaseBackup.noCoversToBackup",
								"没有自定义封面需要备份",
							),
				);
			} else {
				snackbar.error(
					t(
						"pages.Settings.databaseBackup.coverBackupError",
						"自定义封面备份失败: {{error}}",
						{
							error: result.message,
						},
					),
				);
			}
		} catch (error) {
			const errorMessage = getUserErrorMessage(
				error,
				t,
				t(
					"pages.Settings.databaseBackup.coverBackupFailed",
					"备份自定义封面失败",
				),
			);
			snackbar.error(
				t(
					"pages.Settings.databaseBackup.coverBackupError",
					"自定义封面备份失败: {{error}}",
					{
						error: errorMessage,
					},
				),
			);
		} finally {
			setIsBackingCovers(false);
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
				t(
					"pages.Settings.databaseBackup.openFolderError",
					"打开备份文件夹失败: {{error}}",
					{
						error: errorMessage,
					},
				),
			);
		}
	};

	const restartAfterImport = async (
		permit?: AppTerminationPermit,
		failureMessage?: string,
	) => {
		if (failureMessage) {
			try {
				await message(
					t(
						"pages.Settings.databaseBackup.restartAfterImportFailure",
						"{{error}}\n\n确认后重启应用。",
						{ error: failureMessage },
					),
					{
						title: t("pages.Settings.databaseBackup.importFailed", "导入失败"),
						kind: "error",
					},
				);
			} catch (error) {
				console.error("显示数据库导入恢复提醒失败:", error);
			}
		}
		try {
			await restartApp(permit);
		} catch (error) {
			console.error("数据库导入后重启应用失败:", error);
			setImportRecovery({
				message: t(
					"pages.Settings.databaseBackup.importRestartFailed",
					"应用重启失败。请重试重启，或关闭应用后重新打开。",
				),
				canRestart: true,
			});
		}
	};

	const handleImportDatabase = async () => {
		setIsImporting(true);
		let restartPermit: AppTerminationPermit | null = null;
		try {
			const filePath = await selectDatabaseImportFile();
			if (!filePath) {
				return;
			}

			restartPermit = await requestAppTermination("restart");
			if (!restartPermit) {
				return;
			}

			const result = await importDatabase(filePath);
			if (result.requires_backup_confirmation) {
				return;
			}
			setNeedsRestart(result.restart_required || result.recovery_path !== null);
			if (!result.success) {
				console.error("数据库导入失败:", result);
				if (result.recovery_path) {
					setImportRecovery({
						message: t(
							"pages.Settings.databaseBackup.manualRecovery",
							"自动回滚未完成，请关闭应用后手动恢复旧的数据库和封面，不要直接重新导入。\n\n旧数据位置：{{path}}",
							{ path: result.recovery_path },
						),
						canRestart: false,
					});
				} else if (result.restart_required) {
					const confirmedPermit = restartPermit;
					restartPermit = null;
					await restartAfterImport(confirmedPermit, result.message);
				} else {
					snackbar.error(
						t(
							"pages.Settings.databaseBackup.importError",
							"数据库导入失败: {{error}}",
							{ error: result.message },
						),
					);
				}
				return;
			}

			snackbar.success(
				result.warning
					? t(
							"pages.Settings.databaseBackup.importSuccessWithoutBackup",
							"数据库导入成功，旧数据已保留，应用将自动重启",
						)
					: t(
							"pages.Settings.databaseBackup.importSuccess",
							"数据库导入成功，旧数据库和自定义封面已备份，应用将自动重启",
						),
			);
			if (result.warning) {
				console.warn("数据库导入提示:", result.warning);
			}

			const confirmedPermit = restartPermit;
			restartPermit = null;
			// 延迟重启应用，让用户看到成功提示。
			setTimeout(() => {
				void restartAfterImport(confirmedPermit);
			}, 3000);
		} catch (error) {
			const errorMessage = getUserErrorMessage(
				error,
				t,
				t("pages.Settings.databaseBackup.importFailed", "导入失败"),
			);
			snackbar.error(
				t(
					"pages.Settings.databaseBackup.importError",
					"数据库导入失败: {{error}}",
					{ error: errorMessage },
				),
			);
		} finally {
			releaseAppTermination(restartPermit);
			setIsImporting(false);
		}
	};

	return (
		<SettingsGroup
			title={t("pages.Settings.databaseBackup.title", "数据备份与恢复")}
			description={t(
				"pages.Settings.databaseBackup.restoreWarning",
				"恢复数据库会备份自定义封面和旧数据库，恢复成功会清空封面并重启软件，失败时会尝试回滚数据。",
			)}
		>
			<Dialog open={importRecovery !== null} disableEscapeKeyDown>
				<DialogTitle>
					{t("pages.Settings.databaseBackup.recoveryTitle", "数据库恢复提醒")}
				</DialogTitle>
				<DialogContent>
					<Typography className="whitespace-pre-wrap break-all">
						{importRecovery?.message}
					</Typography>
				</DialogContent>
				{importRecovery?.canRestart && (
					<DialogActions>
						<Button onClick={() => void restartAfterImport()}>
							{t("pages.Settings.databaseBackup.restartNow", "重启应用")}
						</Button>
					</DialogActions>
				)}
			</Dialog>
			<Stack
				direction="row"
				spacing={2}
				useFlexGap
				alignItems="center"
				flexWrap="wrap"
			>
				<Button
					variant="contained"
					color="primary"
					onClick={handleBackupDatabase}
					disabled={isBackingUp || isImporting || needsRestart}
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
					onClick={handleBackupCustomCovers}
					disabled={isBackingCovers || isImporting || needsRestart}
					startIcon={
						isBackingCovers ? (
							<CircularProgress size={16} color="inherit" />
						) : (
							<ImageIcon />
						)
					}
					className="px-6 py-2"
				>
					{isBackingCovers
						? t("pages.Settings.databaseBackup.backingCovers", "备份封面中...")
						: t("pages.Settings.databaseBackup.backupCovers", "备份自定义封面")}
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
					disabled={
						isImporting || isBackingUp || isBackingCovers || needsRestart
					}
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

			<SettingsItem
				title={t(
					"pages.Settings.databaseBackup.scheduledBackup",
					"定时自动备份",
				)}
				description={t(
					"pages.Settings.databaseBackup.scheduledBackupDescription",
					"应用运行或驻留托盘时按周期备份；启动时若已逾期，会在约 60 秒后补做一次。",
				)}
			>
				<Switch
					checked={scheduledBackupEnabled}
					onChange={(event) => setScheduledBackupEnabled(event.target.checked)}
					color="primary"
				/>
			</SettingsItem>

			<SettingsItem
				title={t(
					"pages.Settings.databaseBackup.autoBackupOnExit",
					"退出时自动备份",
				)}
				description={t(
					"pages.Settings.databaseBackup.autoBackupOnExitDescription",
					"开启后，软件正常退出时会自动备份数据库；如果同时启用自定义封面备份，可能会延长退出时间。",
				)}
			>
				<Switch
					checked={autoBackupOnExit}
					onChange={(event) => setAutoBackupOnExit(event.target.checked)}
					color="primary"
				/>
			</SettingsItem>
			<Box className="space-y-3">
				<Stack direction="row" spacing={2} useFlexGap flexWrap="wrap">
					<TextField
						label={t(
							"pages.Settings.databaseBackup.scheduledIntervalHours",
							"定时备份周期（小时）",
						)}
						type="number"
						size="small"
						value={scheduledBackupIntervalHours}
						onChange={handleScheduledIntervalChange}
						disabled={!scheduledBackupEnabled}
						slotProps={{ htmlInput: { min: 1 } }}
					/>
					<TextField
						label={t(
							"pages.Settings.databaseBackup.exitMinIntervalHours",
							"退出备份最小间隔（小时）",
						)}
						type="number"
						size="small"
						value={exitBackupMinIntervalHours}
						onChange={handleExitIntervalChange}
						disabled={!autoBackupOnExit}
						helperText={t(
							"pages.Settings.databaseBackup.exitMinIntervalHelp",
							"填 0 表示每次退出都备份",
						)}
						slotProps={{ htmlInput: { min: 0 } }}
					/>
					<TextField
						label={t(
							"pages.Settings.databaseBackup.autoRetentionCount",
							"最多保留自动备份（批次）",
						)}
						type="number"
						size="small"
						value={autoBackupRetentionCount}
						onChange={handleRetentionCountChange}
						disabled={!autoBackupEnabled}
						slotProps={{ htmlInput: { min: 1 } }}
					/>
				</Stack>

				<SettingsItem
					title={t(
						"pages.Settings.databaseBackup.autoIncludeCovers",
						"同时备份自定义封面",
					)}
				>
					<Switch
						checked={autoBackupIncludeCovers}
						onChange={(event) =>
							setAutoBackupIncludeCovers(event.target.checked)
						}
						disabled={!autoBackupEnabled}
						color="primary"
					/>
				</SettingsItem>

				<Typography variant="caption" color="text.secondary" className="block">
					{t(
						"pages.Settings.databaseBackup.lastAutoBackup",
						"上次自动备份：{{time}}",
						{ time: lastAutoBackupText },
					)}
				</Typography>
				{autoBackupLastError && (
					<Typography variant="caption" color="error" className="block mt-1">
						{t(
							"pages.Settings.databaseBackup.lastAutoBackupNotice",
							"上次自动备份提示：{{error}}",
							{ error: autoBackupLastError },
						)}
					</Typography>
				)}
			</Box>
		</SettingsGroup>
	);
};
