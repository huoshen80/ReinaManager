import BackupIcon from "@mui/icons-material/Backup";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import ImageIcon from "@mui/icons-material/Image";
import RestoreIcon from "@mui/icons-material/Restore";
import { CircularProgress, Switch, TextField, Typography } from "@mui/material";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { useQueryClient } from "@tanstack/react-query";
import { type ChangeEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { settingsKeys } from "@/hooks/queries/useSettings";
import { snackbar } from "@/providers/snackBar";
import { restartApp } from "@/services/appExit";
import {
	backupCustomCovers,
	backupDatabase,
	importDatabase,
} from "@/services/fs/dataMaintenance";
import { openDatabaseBackupFolder } from "@/services/fs/savedataBackup";
import { useStore } from "@/store/appStore";
import { getUserErrorMessage } from "@/utils/errors";
import { SettingsGroup, SettingsItem } from "./SettingsLayout";

export const DatabaseBackupSettings = () => {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [isBackingUp, setIsBackingUp] = useState(false);
	const [isBackingCovers, setIsBackingCovers] = useState(false);
	const [isImporting, setIsImporting] = useState(false);
	const {
		autoBackupIncludeCovers,
		autoBackupLastError,
		autoBackupLastSuccessAt,
		autoBackupMinIntervalHours,
		autoBackupOnExit,
		autoBackupRetentionCount,
		setAutoBackupIncludeCovers,
		setAutoBackupMinIntervalHours,
		setAutoBackupOnExit,
		setAutoBackupRetentionCount,
	} = useStore(
		useShallow((s) => ({
			autoBackupIncludeCovers: s.autoBackupIncludeCovers,
			autoBackupLastError: s.autoBackupLastError,
			autoBackupLastSuccessAt: s.autoBackupLastSuccessAt,
			autoBackupMinIntervalHours: s.autoBackupMinIntervalHours,
			autoBackupOnExit: s.autoBackupOnExit,
			autoBackupRetentionCount: s.autoBackupRetentionCount,
			setAutoBackupIncludeCovers: s.setAutoBackupIncludeCovers,
			setAutoBackupMinIntervalHours: s.setAutoBackupMinIntervalHours,
			setAutoBackupOnExit: s.setAutoBackupOnExit,
			setAutoBackupRetentionCount: s.setAutoBackupRetentionCount,
		})),
	);

	const refreshSettings = () => {
		queryClient.invalidateQueries({ queryKey: settingsKeys.allSettings() });
	};

	const handleMinIntervalChange = (event: ChangeEvent<HTMLInputElement>) => {
		setAutoBackupMinIntervalHours(Number(event.target.value));
	};

	const handleRetentionCountChange = (event: ChangeEvent<HTMLInputElement>) => {
		setAutoBackupRetentionCount(Number(event.target.value));
	};

	const lastAutoBackupText = autoBackupLastSuccessAt
		? new Date(autoBackupLastSuccessAt).toLocaleString()
		: t("pages.Settings.databaseBackup.autoNever", "从未自动备份");

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

	const handleImportDatabase = async () => {
		setIsImporting(true);
		try {
			const result = await importDatabase();
			if (result) {
				if (result.success) {
					refreshSettings();
					snackbar.success(
						t(
							"pages.Settings.databaseBackup.importSuccess",
							"数据库导入成功，已备份自定义封面并清空封面缓存，应用将自动重启",
						),
					);
					// 延迟重启应用，让用户看到成功提示
					setTimeout(async () => {
						await restartApp();
					}, 3000);
				} else {
					snackbar.error(
						t(
							"pages.Settings.databaseBackup.importError",
							"数据库导入失败: {{error}}",
							{
								error: result.message,
							},
						),
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
				t(
					"pages.Settings.databaseBackup.importError",
					"数据库导入失败: {{error}}",
					{ error: errorMessage },
				),
			);
		} finally {
			setIsImporting(false);
		}
	};

	return (
		<SettingsGroup
			title={t("pages.Settings.databaseBackup.title", "数据备份与恢复")}
			description={t(
				"pages.Settings.databaseBackup.restoreWarning",
				"恢复数据库将覆盖现有数据，并会先备份自定义封面、清空封面缓存以避免封面错配。导入后应用将自动重启。",
			)}
		>
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
					onClick={handleBackupCustomCovers}
					disabled={isBackingCovers}
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
							"pages.Settings.databaseBackup.autoMinIntervalHours",
							"最小间隔（小时）",
						)}
						type="number"
						size="small"
						value={autoBackupMinIntervalHours}
						onChange={handleMinIntervalChange}
						disabled={!autoBackupOnExit}
						helperText={t(
							"pages.Settings.databaseBackup.autoMinIntervalHelp",
							"填 0 表示每次退出都备份",
						)}
						slotProps={{ htmlInput: { min: 0 } }}
					/>
					<TextField
						label={t(
							"pages.Settings.databaseBackup.autoRetentionCount",
							"最多保留自动备份（份）",
						)}
						type="number"
						size="small"
						value={autoBackupRetentionCount}
						onChange={handleRetentionCountChange}
						disabled={!autoBackupOnExit}
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
						disabled={!autoBackupOnExit}
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
							"pages.Settings.databaseBackup.lastAutoBackupError",
							"上次自动备份失败：{{error}}",
							{ error: autoBackupLastError },
						)}
					</Typography>
				)}
			</Box>
		</SettingsGroup>
	);
};
