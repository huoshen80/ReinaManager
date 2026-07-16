import CloudIcon from "@mui/icons-material/Cloud";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import DeleteIcon from "@mui/icons-material/Delete";
import RestoreIcon from "@mui/icons-material/Restore";
import {
	Box,
	Button,
	CircularProgress,
		Dialog,
		DialogActions,
		DialogContent,
		DialogTitle,
	IconButton,
	List,
	ListItem,
	
	ListItemText,
	Switch,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import Stack from "@mui/material/Stack";
import { useQueryClient } from "@tanstack/react-query";
import { relaunch } from "@tauri-apps/plugin-process";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { settingsKeys } from "@/hooks/queries/useSettings";
import { snackbar } from "@/providers/snackBar";
import {
	deleteWebdavBackup,
	listWebdavBackups,
	testWebdavConnection,
	type WebdavBackupInfo,
	webdavBackupDatabase,
	webdavImportDatabase,
} from "@/services/fs/dataMaintenance";
import { settingsService } from "@/services/invoke";
import { getUserErrorMessage } from "@/utils/errors";
import { SettingsGroup } from "./SettingsLayout";

export const WebDavBackupSettings = () => {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const [isTesting, setIsTesting] = useState(false);
	const [isSavingConfig, setIsSavingConfig] = useState(false);
	const [isBackingUp, setIsBackingUp] = useState(false);
	const [isImporting, setIsImporting] = useState(false);
	const [remoteBackups, setRemoteBackups] = useState<WebdavBackupInfo[]>([]);
	const [isLoadingBackups, setIsLoadingBackups] = useState(false);
	const [isDeleting, setIsDeleting] = useState<string | null>(null);
	const [configStatus, setConfigStatus] = useState<{
		loaded: boolean;
		url: string;
		username: string;
		password: string;
		root: string;
		enabled: boolean;
	}>({
		loaded: false,
		url: "",
		username: "",
		password: "",
		root: "Reinamanager",
		enabled: false,
	});

	// 加载 WebDAV 配置
	useEffect(() => {
		const loadConfig = async () => {
			try {
				const settings = await settingsService.getAllSettings();
				setConfigStatus({
					loaded: true,
					url: settings.webdav_url ?? "",
					username: settings.webdav_username ?? "",
					password: settings.webdav_password ?? "",
					root: settings.webdav_root || "Reinamanager",
					enabled: settings.webdav_enabled ?? false,
				});
			} catch {
				setConfigStatus((prev) => ({ ...prev, loaded: true }));
			}
		};
		loadConfig();
	}, []);

	const isConfigValid =
		configStatus.url.trim() !== "" &&
		configStatus.username.trim() !== "" &&
		configStatus.password.trim() !== "";

	const handleSaveConfig = async () => {
		setIsSavingConfig(true);
		try {
			await settingsService.updateSettings({
				webdavUrl: configStatus.url || null,
				webdavUsername: configStatus.username || null,
				webdavPassword: configStatus.password || null,
				webdavRoot: configStatus.root || null,
				webdavEnabled: configStatus.enabled,
			});
			snackbar.success(
				t("pages.Settings.webdavBackup.configSaved", "WebDAV 配置已保存"),
			);
		} catch (error) {
			const errorMessage = getUserErrorMessage(
				error,
				t,
				t("pages.Settings.webdavBackup.configSaveFailed", "保存配置失败"),
			);
			snackbar.error(
				t(
					"pages.Settings.webdavBackup.configSaveError",
					"保存 WebDAV 配置失败: {{error}}",
					{ error: errorMessage },
				),
			);
		} finally {
			setIsSavingConfig(false);
		}
	};

	const handleTestConnection = async () => {
		if (!isConfigValid) {
			snackbar.warning(
				t(
					"pages.Settings.webdavBackup.configIncomplete",
					"请先填写 URL、用户名和密码",
				),
			);
			return;
		}
		setIsTesting(true);
		try {
			await testWebdavConnection(
				configStatus.url,
				configStatus.username,
				configStatus.password,
			);
			snackbar.success(
				t("pages.Settings.webdavBackup.connectionSuccess", "WebDAV 连接成功"),
			);
		} catch (error) {
			const errorMessage = getUserErrorMessage(
				error,
				t,
				t(
					"pages.Settings.webdavBackup.connectionFailed",
					"连接 WebDAV 失败",
				),
			);
			snackbar.error(
				t(
					"pages.Settings.webdavBackup.connectionError",
					"WebDAV 连接失败: {{error}}",
					{ error: errorMessage },
				),
			);
		} finally {
			setIsTesting(false);
		}
	};

	const handleBackup = async () => {
		if (!configStatus.enabled) {
			snackbar.warning(
				t(
					"pages.Settings.webdavBackup.notEnabled",
					"请先启用 WebDAV",
				),
			);
			return;
		}
		setIsBackingUp(true);
		try {
			// 先保存配置，确保后端能读取到最新的凭据
			await handleSaveConfig();
			const result = await webdavBackupDatabase();
			if (result.success) {
				refreshSettings();
				snackbar.success(
					t(
						"pages.Settings.webdavBackup.backupSuccess",
						"WebDAV 备份成功: {{path}}",
						{ path: result.path ?? "" },
					),
				);
			} else {
				snackbar.error(
					t(
						"pages.Settings.webdavBackup.backupError",
						"WebDAV 备份失败: {{error}}",
						{ error: result.message },
					),
				);
			}
		} catch (error) {
			const errorMessage = getUserErrorMessage(
				error,
				t,
				t("pages.Settings.webdavBackup.backupFailed", "WebDAV 备份失败"),
			);
			snackbar.error(
				t(
					"pages.Settings.webdavBackup.backupError",
					"WebDAV 备份失败: {{error}}",
					{ error: errorMessage },
				),
			);
		} finally {
			setIsBackingUp(false);
		}
	};


	const handleImport = async (filename: string) => {
		setIsImporting(true);
		try {
			const result = await webdavImportDatabase(filename);
			if (result.success) {
				refreshSettings();
				snackbar.success(
					t(
						"pages.Settings.webdavBackup.importSuccess",
						"WebDAV 数据库导入成功，应用将自动重启",
					),
				);
				setTimeout(async () => {
					await relaunch();
				}, 3000);
			} else {
				snackbar.error(
					t(
						"pages.Settings.webdavBackup.importError",
						"WebDAV 数据库导入失败: {{error}}",
						{ error: result.message },
					),
				);
			}
		} catch (error) {
			const errorMessage = getUserErrorMessage(
				error,
				t,
				t("pages.Settings.webdavBackup.importFailed", "导入失败"),
			);
			snackbar.error(
				t(
					"pages.Settings.webdavBackup.importError",
					"WebDAV 数据库导入失败: {{error}}",
					{ error: errorMessage },
				),
			);
		} finally {
			setIsImporting(false);
		}
	};

	const handleDelete = async (filename: string) => {
		setIsDeleting(filename);
		try {
			await deleteWebdavBackup(filename);
			snackbar.success(
				t(
					"pages.Settings.webdavBackup.deleteSuccess",
					"已删除远程备份: {{name}}",
					{ name: filename },
				),
			);
			setRemoteBackups((prev) => prev.filter((b) => b.name !== filename));
		} catch (error) {
			const errorMessage = getUserErrorMessage(
				error,
				t,
				t("pages.Settings.webdavBackup.deleteFailed", "删除失败"),
			);
			snackbar.error(errorMessage);
		} finally {
			setIsDeleting(null);
		}
	};
		const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);

	const handleOpenRestoreDialog = async () => {
		if (!configStatus.enabled) return;
		setRestoreDialogOpen(true);
		setIsLoadingBackups(true);
		try {
			const backups = await listWebdavBackups();
			setRemoteBackups(backups);
		} catch (error) {
			const errorMessage = getUserErrorMessage(
				error,
				t,
				t("pages.Settings.webdavBackup.listFailed", "列举备份失败"),
			);
			snackbar.error(errorMessage);
		} finally {
			setIsLoadingBackups(false);
		}
	};

	const refreshSettings = () => {
		queryClient.invalidateQueries({ queryKey: settingsKeys.allSettings() });
	};

	return (
		<SettingsGroup
			title={
				<Box className="flex items-center justify-between w-full">
					<Typography variant="subtitle1" component="h3" className="font-semibold">
						{t(
							"pages.Settings.webdavBackup.title",
							"WebDAV 备份与恢复",
						)}
					</Typography>
					<Box className="flex items-center gap-1">
						<Typography variant="body2" color="text.secondary">
							{t("pages.Settings.webdavBackup.enable", "启用 WebDAV")}
						</Typography>
						<Switch
							checked={configStatus.enabled}
							onChange={async (e) => {
								const newEnabled = e.target.checked;
								setConfigStatus((prev) => ({
									...prev,
									enabled: newEnabled,
								}));
								// 切换时自动保存
								try {
									await settingsService.updateSettings({
										webdavUrl: configStatus.url || null,
										webdavUsername: configStatus.username || null,
										webdavPassword: configStatus.password || null,
										webdavEnabled: newEnabled,
									});
								} catch (error) {
									// 保存失败则回滚
									setConfigStatus((prev) => ({
										...prev,
										enabled: !newEnabled,
									}));
								}
							}}
							color="primary"
							size="small"
						/>
					</Box>
				</Box>
			}
			description={t(
				"pages.Settings.webdavBackup.description",
				"配置 WebDAV 远程存储，将数据库备份上传到远程服务器，或从远程备份恢复。",
			)}
		>
			
			{/* WebDAV 配置区域 */}
			<Box
				className="space-y-3"
				sx={{ opacity: configStatus.enabled ? 1 : 0.5, pointerEvents: configStatus.enabled ? "auto" : "none" }}>
				<Typography variant="subtitle2" className="font-semibold">
					{t("pages.Settings.webdavBackup.configTitle", "服务器配置")}
				</Typography>
				<Box className="space-y-3">
					<TextField
						fullWidth
						size="small"
						label={t("pages.Settings.webdavBackup.url", "WebDAV URL")}
						placeholder="https://example.com/remote.php/dav/files/user/"
						value={configStatus.url}
						onChange={(e) =>
							setConfigStatus((prev) => ({ ...prev, url: e.target.value }))
						}
					/>
					<Box className="flex gap-2">
						<TextField
							fullWidth
							size="small"
							label={t("pages.Settings.webdavBackup.username", "用户名")}
							value={configStatus.username}
							onChange={(e) =>
								setConfigStatus((prev) => ({
									...prev,
									username: e.target.value,
								}))
							}
						/>
						<TextField
							fullWidth
							size="small"
							type="password"
							label={t("pages.Settings.webdavBackup.password", "密码")}
							value={configStatus.password}
							onChange={(e) =>
								setConfigStatus((prev) => ({
									...prev,
									password: e.target.value,
								}))
							}
						/>
					</Box>

					<Box className="flex items-center gap-2">
						<Button
							variant="outlined"
							color="primary"
							onClick={handleTestConnection}
							disabled={isTesting || !isConfigValid}
							startIcon={
								isTesting ? (
									<CircularProgress size={16} color="inherit" />
								) : (
									<CloudIcon />
								)
							}
						>
							{isTesting
								? t(
										"pages.Settings.webdavBackup.testing",
										"测试中...",
									)
								: t(
										"pages.Settings.webdavBackup.testConnection",
										"测试连接",
									)}
						</Button>
						<Button
							variant="contained"
							color="primary"
							onClick={handleSaveConfig}
							disabled={isSavingConfig}
						>
							{isSavingConfig
								? t(
										"pages.Settings.webdavBackup.saving",
										"保存中...",
									)
								: t(
										"pages.Settings.webdavBackup.saveConfig",
										"保存配置",
									)}
						</Button>
				</Box>
			</Box>

			</Box>
			{/* WebDAV 操作区域 */}
			<Box
				className="space-y-3"
				sx={{ opacity: configStatus.enabled ? 1 : 0.5, pointerEvents: configStatus.enabled ? "auto" : "none" }}>
				<Typography variant="subtitle2" className="font-semibold">
					{t("pages.Settings.webdavBackup.actionsTitle", "操作")}
				</Typography>
				<Stack direction="row" spacing={2} useFlexGap flexWrap="wrap">
					<Button
						variant="contained"
						color="primary"
						onClick={handleBackup}
						disabled={isBackingUp || !configStatus.enabled}
						startIcon={
							isBackingUp ? (
								<CircularProgress size={16} color="inherit" />
							) : (
								<CloudUploadIcon />
							)
						}
					>
						{isBackingUp
							? t(
									"pages.Settings.webdavBackup.backingUp",
									"备份中...",
								)
							: t(
									"pages.Settings.webdavBackup.backup",
									"备份到 WebDAV",
								)}
					</Button>
					<Button
						variant="outlined"
						color="warning"
						onClick={handleOpenRestoreDialog}
						disabled={isLoadingBackups || !configStatus.enabled}
						startIcon={
							isLoadingBackups ? (
								<CircularProgress size={16} color="inherit" />
							) : (
								<RestoreIcon />
							)
						}
					>
						{t(
							"pages.Settings.webdavBackup.refreshRestore",
							"从 WebDAV 恢复",
						)}
					</Button>
				</Stack>

					{/* 远程备份恢复对话框 */}
					<Dialog
						open={restoreDialogOpen}
						onClose={() => setRestoreDialogOpen(false)}
						maxWidth="sm"
						fullWidth
					>
						<DialogTitle>
							{t(
								"pages.Settings.webdavBackup.restoreDialogTitle",
								"从 WebDAV 恢复",
							)}
						</DialogTitle>
						<DialogContent>
							{isLoadingBackups && (
								<Box className="flex items-center gap-2 py-4">
									<CircularProgress size={20} />
									<Typography variant="body2" color="text.secondary">
										{t(
											"pages.Settings.webdavBackup.loadingList",
											"加载远程备份列表...",
										)}
									</Typography>
								</Box>
							)}
							{!isLoadingBackups && remoteBackups.length > 0 && (
								<List dense>
									{remoteBackups.map((backup) => (
										<ListItem
											key={backup.name}
											secondaryAction={
												<>
													<Tooltip
														title={t(
															"pages.Settings.webdavBackup.restoreTooltip",
															"恢复此备份",
														)}
													>
														<IconButton
															edge="end"
																onClick={() => handleImport(backup.name)}
																disabled={isImporting}
																size="small"
														>
															<RestoreIcon fontSize="small" />
														</IconButton>
													</Tooltip>
													<Tooltip
														title={t(
															"pages.Settings.webdavBackup.deleteTooltip",
															"删除备份",
														)}
													>
														<IconButton
															edge="end"
																onClick={() => handleDelete(backup.name)}
																disabled={isDeleting === backup.name}
																size="small"
																color="error"
														>
															{isDeleting === backup.name ? (
																<CircularProgress size={16} />
															) : (
																<DeleteIcon fontSize="small" />
															)}
														</IconButton>
													</Tooltip>
												</>
											}
										>
											<ListItemText
												primary={backup.name}
												secondary={
													backup.size > 0
														? `${(backup.size / 1024).toFixed(1)} KB`
														: ""
												}
											/>
										</ListItem>
									))}
								</List>
							)}
							{!isLoadingBackups && remoteBackups.length === 0 && (
								<Typography variant="body2" color="text.secondary" className="py-4 text-center">
									{t(
										"pages.Settings.webdavBackup.noBackups",
										"暂无远程备份文件",
									)}
								</Typography>
							)}
						</DialogContent>
						<DialogActions>
							<Button onClick={() => setRestoreDialogOpen(false)} color="primary">
								{t("common.close", "关闭")}
							</Button>
						</DialogActions>
					</Dialog>

				</Box>

		</SettingsGroup>
	);
};
