import BackupIcon from "@mui/icons-material/Backup";
import CleaningServicesIcon from "@mui/icons-material/CleaningServices";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import RestoreIcon from "@mui/icons-material/Restore";
import StorageIcon from "@mui/icons-material/Storage";
import {
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Menu,
	MenuItem,
	Switch,
	TextField,
	Typography,
} from "@mui/material";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { message } from "@tauri-apps/plugin-dialog";
import { type ChangeEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useBlocker } from "react-router-dom";
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
	backupDatabase,
	importDatabase,
	selectDatabaseImportFile,
} from "@/services/fs/dataMaintenance";
import { openDatabaseBackupFolder } from "@/services/fs/savedataBackup";
import { fileService } from "@/services/invoke";
import { useStore } from "@/store/appStore";
import { getUserErrorMessage } from "@/utils/errors";
import { formatFileSize } from "@/utils/fileSize";
import { SettingsGroup, SettingsItem } from "./SettingsLayout";

export const DatabaseBackupSettings = () => {
	const { t } = useTranslation();
	const refreshSettings = useRefreshSettings();
	const [isBackingUp, setIsBackingUp] = useState(false);
	const [backupAnchor, setBackupAnchor] = useState<HTMLElement | null>(null);
	const [isImporting, setIsImporting] = useState(false);
	const [needsRestart, setNeedsRestart] = useState(false);
	const [importRecovery, setImportRecovery] = useState<{
		message: string;
		canRestart: boolean;
	} | null>(null);
	const blocker = useBlocker(isImporting || needsRestart);
	useEffect(() => {
		if (blocker.state === "blocked") {
			blocker.reset();
		}
	}, [blocker]);
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

	const handleBackupDatabase = async (includeCovers: boolean) => {
		setBackupAnchor(null);
		setIsBackingUp(true);

		try {
			const result = await backupDatabase(includeCovers);
			if (result.success) {
				refreshSettings();
				snackbar.success(
					t(
						"pages.Settings.databaseBackup.backupSuccess",
						"备份成功: {{path}}",
						{
							path: result.path,
						},
					),
				);
			} else {
				snackbar.error(
					t(
						"pages.Settings.databaseBackup.backupError",
						"备份失败: {{error}}",
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
				t("pages.Settings.databaseBackup.backupError", "备份失败: {{error}}", {
					error: errorMessage,
				}),
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
		setIsImporting(true);
		setImportRecovery(null);
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
			if (!(await restartApp(permit))) {
				throw new Error("未取得应用重启许可");
			}
		} catch (error) {
			console.error("数据库导入后重启应用失败:", error);
			setImportRecovery({
				message: t(
					"pages.Settings.databaseBackup.importRestartFailed",
					"应用重启失败。请重试重启，或关闭应用后重新打开。",
				),
				canRestart: true,
			});
		} finally {
			setIsImporting(false);
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
						message:
							t(
								"pages.Settings.databaseBackup.manualRecovery",
								"自动回滚未完成，请关闭应用后手动恢复旧数据，不要直接重新导入。\n\n旧数据库位置：{{path}}",
								{ path: result.recovery_path },
							) +
							(result.covers_recovery_path
								? `\n\n${t(
										"pages.Settings.databaseBackup.coversRecoveryPath",
										"旧自定义封面位置：{{path}}",
										{ path: result.covers_recovery_path },
									)}`
								: ""),
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

			if (result.warning) {
				console.warn("数据库导入提示:", result.warning);
			}

			const confirmedPermit = restartPermit;
			restartPermit = null;
			await restartAfterImport(confirmedPermit);
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
				"恢复前会备份当前数据，成功后重启，失败时尝试回滚。数据包恢复包含封面。",
			)}
		>
			<Dialog
				open={isImporting || needsRestart || importRecovery !== null}
				disableEscapeKeyDown
				aria-labelledby="database-import-title"
				aria-describedby="database-import-status"
			>
				<DialogTitle id="database-import-title">
					{importRecovery
						? t("pages.Settings.databaseBackup.recoveryTitle", "数据库恢复提醒")
						: t("pages.Settings.databaseBackup.importing", "导入中...")}
				</DialogTitle>
				<DialogContent>
					{importRecovery ? (
						<Typography
							id="database-import-status"
							className="whitespace-pre-wrap break-all"
						>
							{importRecovery.message}
						</Typography>
					) : (
						<Stack
							direction="row"
							spacing={2}
							alignItems="center"
							role="status"
						>
							<CircularProgress size={24} aria-hidden="true" />
							<Typography id="database-import-status">
								{t(
									"pages.Settings.databaseBackup.importProgress",
									"正在恢复数据，完成后将自动重启。请勿关闭应用。",
								)}
							</Typography>
						</Stack>
					)}
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
					onClick={(event) => setBackupAnchor(event.currentTarget)}
					disabled={isBackingUp || isImporting || needsRestart}
					startIcon={
						isBackingUp ? (
							<CircularProgress size={16} color="inherit" />
						) : (
							<BackupIcon />
						)
					}
					aria-haspopup="menu"
					aria-expanded={Boolean(backupAnchor)}
					aria-controls={backupAnchor ? "backup-options" : undefined}
					className="px-6 py-2"
				>
					{isBackingUp
						? t("pages.Settings.databaseBackup.backing", "备份中...")
						: t("pages.Settings.databaseBackup.backupMenu", "备份")}
				</Button>
				<Menu
					id="backup-options"
					anchorEl={backupAnchor}
					open={Boolean(backupAnchor)}
					onClose={() => setBackupAnchor(null)}
					anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
					transformOrigin={{ vertical: "top", horizontal: "left" }}
					slotProps={{
						paper: { elevation: 3, className: "mt-1 !rounded-lg min-w-56" },
						list: { className: "!py-1" },
					}}
				>
					<MenuItem
						onClick={() => void handleBackupDatabase(true)}
						disabled={isBackingUp || isImporting || needsRestart}
						className="!gap-3 !py-2"
					>
						<BackupIcon fontSize="small" color="action" />
						<Box>
							<Typography variant="body2">
								{t("pages.Settings.databaseBackup.backup", "备份数据")}
							</Typography>
							<Typography variant="caption" color="text.secondary">
								{t(
									"pages.Settings.databaseBackup.dataScope",
									"数据库和自定义封面",
								)}
							</Typography>
						</Box>
					</MenuItem>
					<MenuItem
						onClick={() => void handleBackupDatabase(false)}
						disabled={isBackingUp || isImporting || needsRestart}
						className="!gap-3 !py-2"
					>
						<StorageIcon fontSize="small" color="action" />
						<Typography variant="body2">
							{t(
								"pages.Settings.databaseBackup.backupDatabaseOnly",
								"仅备份数据库",
							)}
						</Typography>
					</MenuItem>
				</Menu>

				<Button
					variant="outlined"
					color="warning"
					onClick={handleImportDatabase}
					disabled={isImporting || isBackingUp || needsRestart}
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
						: t("pages.Settings.databaseBackup.restore", "恢复备份")}
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
			</Stack>

			<Typography variant="caption" color="text.secondary" className="block">
				{t(
					"pages.Settings.databaseBackup.backupContentsHelp",
					"数据备份包含数据库和自定义封面；恢复支持 .7z 数据包和 .db 数据库文件。",
				)}
			</Typography>

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
					description={t(
						"pages.Settings.databaseBackup.autoIncludeCoversHelp",
						"关闭时仅备份数据库。开启后生成完整数据包，会增加耗时和体积，退出时可能需要等待。",
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

export function CoverCleanupSettings() {
	const { t } = useTranslation();
	const [isCleaning, setIsCleaning] = useState(false);
	const handleCleanup = async () => {
		if (isCleaning) return;
		setIsCleaning(true);
		try {
			const result = await fileService.cleanUnusedCovers();
			const text = t(
				"pages.Settings.coverCleanup.result",
				"已删除 {{deleted}} 个文件，释放 {{size}}；失败 {{failed}} 个",
				{
					deleted: result.deleted_files,
					size: formatFileSize(result.freed_bytes),
					failed: result.failed_files,
				},
			);
			if (result.failed_files) snackbar.warning(text);
			else snackbar.success(text);
		} catch (error) {
			snackbar.error(getUserErrorMessage(error, t));
		} finally {
			setIsCleaning(false);
		}
	};
	return (
		<SettingsItem
			title={t("pages.Settings.coverCleanup.title", "清理无用封面文件")}
			description={t(
				"pages.Settings.coverCleanup.description",
				"删除不再使用的云端和自定义封面残留，保留正在使用的封面。",
			)}
		>
			<Button
				variant="outlined"
				onClick={handleCleanup}
				disabled={isCleaning}
				startIcon={
					isCleaning ? (
						<CircularProgress size={16} color="inherit" />
					) : (
						<CleaningServicesIcon />
					)
				}
			>
				{isCleaning
					? t("pages.Settings.coverCleanup.cleaning", "清理中...")
					: t("pages.Settings.coverCleanup.action", "清理无用文件")}
			</Button>
		</SettingsItem>
	);
}
