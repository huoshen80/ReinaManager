import BackupIcon from "@mui/icons-material/Backup";
import DeleteIcon from "@mui/icons-material/Delete";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import RestoreIcon from "@mui/icons-material/Restore";
import SaveIcon from "@mui/icons-material/Save";
import {
	Box,
	Button,
	Card,
	CardContent,
	CircularProgress,
	Divider,
	FormControlLabel,
	IconButton,
	List,
	ListItem,
	ListItemSecondaryAction,
	ListItemText,
	Stack,
	Switch,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import { join } from "pathe";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertConfirmBox } from "@/components/AlertBox";
import { snackbar } from "@/components/Snackbar";
import { savedataService } from "@/services";
import { useStore } from "@/store";
import type { SavedataRecord, UpdateGameParams } from "@/types";
import {
	createGameSavedataBackup,
	deleteSavedataBackup,
	getSavedataBackupPath,
	handleGetFolder,
	openGameBackupFolder,
	openGameSaveDataFolder,
	restoreSavedataBackup,
} from "@/utils";
/**
 * Backup 组件
 * 游戏存档备份页面
 *
 * @component
 * @returns 备份页面
 */
export const Backup: React.FC = () => {
	const { selectedGame, updateGame } = useStore();
	const { t } = useTranslation();

	// 状态管理
	const [saveDataPath, setSaveDataPath] = useState<string>("");
	const [backupList, setBackupList] = useState<SavedataRecord[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [backupToDelete, setBackupToDelete] = useState<SavedataRecord | null>(
		null,
	);
	const [isDeleting, setIsDeleting] = useState(false);
	const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(false);
	const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);
	const [restoringBackupId, setRestoringBackupId] = useState<number | null>(
		null,
	);
	const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
	const [backupToRestore, setBackupToRestore] = useState<SavedataRecord | null>(
		null,
	);
	const [maxBackups, setMaxBackups] = useState<number>(20);

	// 加载备份列表函数（用 useCallback 包裹以便放入依赖数组）
	const loadBackupList = useCallback(async () => {
		if (!selectedGame?.id) return;

		try {
			const records = await savedataService.getSavedataRecords(selectedGame.id);
			setBackupList(records);
		} catch (error) {
			console.error("加载备份列表失败:", error);
			snackbar.error(
				t("pages.Detail.Backup.loadBackupsFailed", "加载备份列表失败"),
			);
		}
	}, [selectedGame?.id, t]);

	// 初始化组件，加载备份列表
	useEffect(() => {
		loadBackupList();
	}, [loadBackupList]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: 仅在 selectedGame.autosave 变化时更新
	useEffect(() => {
		if (selectedGame) {
			setAutoSaveEnabled(selectedGame.autosave === 1);
		}
	}, [selectedGame?.autosave]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: 仅在 selectedGame.savepath 变化时更新
	useEffect(() => {
		if (selectedGame) {
			setSaveDataPath(selectedGame.savepath || "");
		}
	}, [selectedGame?.savepath]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: 仅在 selectedGame.maxbackups 变化时更新
	useEffect(() => {
		if (selectedGame) {
			setMaxBackups(selectedGame.maxbackups ?? 20);
		}
	}, [selectedGame?.maxbackups]);

	// 统一的设置更新逻辑
	const handleSettingUpdate = async (
		updateData: UpdateGameParams,
		successMessage: string,
		failureMessage: string,
	) => {
		if (!selectedGame?.id) return;

		setIsUpdatingSettings(true);

		try {
			await updateGame(selectedGame.id, updateData);
			snackbar.success(successMessage);

			// 移除本地状态同步，由 useEffect 负责
			// 这样可以避免重复的状态更新和备份列表刷新
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: t("pages.Detail.Backup.unknownError", "未知错误");
			snackbar.error(`${failureMessage}: ${errorMessage}`);

			// 如果设置失败，由于没有调用 updateGame，useEffect 不会被触发
			// selectedGame 保持原值，所以不需要手动恢复状态

			throw error; // 重新抛出错误以便调用者处理
		} finally {
			setIsUpdatingSettings(false);
		}
	};

	// 选择存档文件夹
	const handleSelectSaveDataPath = async () => {
		const selectedPath = await handleGetFolder();
		if (selectedPath) {
			setSaveDataPath(selectedPath);
		}
	};

	// 更新存档路径
	const handleUpdateSaveDataPath = async () => {
		await handleSettingUpdate(
			{ savepath: saveDataPath },
			t("pages.Detail.Backup.pathUpdateSuccess", "存档路径更新成功"),
			t("pages.Detail.Backup.pathUpdateFailed", "路径更新失败"),
		);
	};

	// 处理自动备份开关
	const handleAutoSaveToggle = async (enabled: boolean) => {
		const message = enabled
			? t("pages.Detail.Backup.autoSaveEnabled", "自动备份已启用")
			: t("pages.Detail.Backup.autoSaveDisabled", "自动备份已禁用");

		await handleSettingUpdate(
			{ autosave: enabled ? 1 : 0 },
			message,
			t("pages.Detail.Backup.autoSaveUpdateFailed", "自动备份设置失败"),
		);
	};

	// 更新最大备份数量
	const handleUpdateMaxBackups = async () => {
		if (!selectedGame?.id || maxBackups < 1) {
			snackbar.error(
				t("pages.Detail.Backup.invalidMaxBackups", "最大备份数量必须大于0"),
			);
			return;
		}

		await handleSettingUpdate(
			{ maxbackups: maxBackups },
			t("pages.Detail.Backup.maxBackupsUpdateSuccess", "最大备份数量更新成功"),
			t("pages.Detail.Backup.maxBackupsUpdateFailed", "最大备份数量更新失败"),
		);
	};

	// 创建备份
	const handleCreateBackup = async () => {
		if (!saveDataPath || !selectedGame?.id) {
			snackbar.error(
				t("pages.Detail.Backup.pathRequired", "请先选择存档文件夹"),
			);
			return;
		}

		setIsLoading(true);

		try {
			await createGameSavedataBackup(selectedGame.id, saveDataPath);
			snackbar.success(t("pages.Detail.Backup.backupSuccess", "备份创建成功"));
			loadBackupList();
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: t("pages.Detail.Backup.unknownError", "未知错误");
			snackbar.error(
				`${t("pages.Detail.Backup.backupFailed", "备份失败")}: ${errorMessage}`,
			);
		} finally {
			setIsLoading(false);
		}
	};

	// 打开备份文件夹
	const handleOpenBackupFolder = async () => {
		if (!selectedGame?.id) return;

		try {
			await openGameBackupFolder(selectedGame.id);
		} catch (error) {
			snackbar.error(
				`${t("pages.Detail.Backup.openBackupFolderFailed", "打开备份文件夹失败")}: ${error}`,
			);
		}
	};

	// 打开存档文件夹
	const handleOpenSaveDataFolder = async () => {
		if (!saveDataPath) {
			snackbar.error(
				t("pages.Detail.Backup.pathRequired", "请先选择存档文件夹"),
			);
			return;
		}

		try {
			await openGameSaveDataFolder(saveDataPath);
		} catch (error) {
			snackbar.error(
				`${t("pages.Detail.Backup.openSaveDataFolderFailed", "打开存档文件夹失败")}: ${error}`,
			);
		}
	};

	// 打开删除确认对话框
	const handleDeleteClick = (backup: SavedataRecord) => {
		setBackupToDelete(backup);
		setDeleteDialogOpen(true);
	};

	// 删除备份
	const handleDeleteBackup = async () => {
		if (!backupToDelete) return;

		setIsDeleting(true);

		try {
			// 获取备份文件完整路径
			const savedataBackupPath = await getSavedataBackupPath(
				selectedGame?.id as number,
			);
			const backupFilePath = join(savedataBackupPath, backupToDelete.file);

			// 删除备份文件
			await deleteSavedataBackup(backupFilePath);

			// 从数据库删除记录
			await savedataService.deleteSavedataRecord(backupToDelete.id);

			snackbar.success(t("pages.Detail.Backup.deleteSuccess", "备份删除成功"));
			loadBackupList();

			// 关闭对话框并清空选中的备份
			setDeleteDialogOpen(false);
			setBackupToDelete(null);
		} catch (error) {
			await savedataService.deleteSavedataRecord(backupToDelete.id);
			const errorMessage =
				error instanceof Error
					? error.message
					: t("pages.Detail.Backup.unknownError", "未知错误");
			snackbar.error(
				`${t("pages.Detail.Backup.deleteFailed", "删除失败")}: ${errorMessage}`,
			);
		} finally {
			setIsDeleting(false);
		}
	};

	// 打开恢复确认对话框
	const handleRestoreClick = (backup: SavedataRecord) => {
		if (!saveDataPath) {
			snackbar.error(
				t("pages.Detail.Backup.pathRequired", "请先选择存档文件夹"),
			);
			return;
		}
		setBackupToRestore(backup);
		setRestoreDialogOpen(true);
	};

	// 确认恢复备份
	const handleConfirmRestore = async () => {
		if (!backupToRestore || !saveDataPath) return;

		setIsRestoring(true);
		setRestoringBackupId(backupToRestore.id);
		setRestoreDialogOpen(false);

		try {
			// 获取备份文件完整路径
			const savedataBackupPath = await getSavedataBackupPath(
				selectedGame?.id as number,
			);
			const backupFilePath = join(savedataBackupPath, backupToRestore.file);

			// 恢复备份
			await restoreSavedataBackup(backupFilePath, saveDataPath);

			snackbar.success(t("pages.Detail.Backup.restoreSuccess", "存档恢复成功"));
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: t("pages.Detail.Backup.unknownError", "未知错误");
			snackbar.error(
				`${t("pages.Detail.Backup.restoreFailed", "恢复失败")}: ${errorMessage}`,
			);
		} finally {
			setIsRestoring(false);
			setRestoringBackupId(null);
			setBackupToRestore(null);
		}
	};

	// 格式化文件大小
	const formatFileSize = (bytes: number): string => {
		if (bytes === 0) return "0 B";
		const k = 1024;
		const sizes = ["B", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
	};

	// 格式化时间
	const formatDate = (timestamp: number): string => {
		return new Date(timestamp * 1000).toLocaleString();
	};

	return (
		<Box sx={{ p: 3 }}>
			<Stack spacing={3}>
				{/* 自动备份设置 */}
				<Card>
					<CardContent>
						<Typography variant="h6" gutterBottom>
							{t("pages.Detail.Backup.settings", "备份设置")}
						</Typography>

						<Stack spacing={2}>
							{/* 自动备份开关和最大备份数量设置 */}
							<Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
								<Tooltip
									title={
										!selectedGame?.savepath
											? t(
													"pages.Detail.Backup.setPathForAutosave",
													"请先设置存档路径以启用自动备份",
												)
											: ""
									}
								>
									{/* 需要一个 div 包裹来让 Tooltip 在 disabled 元素上生效 */}
									<div>
										<FormControlLabel
											control={
												<Switch
													checked={autoSaveEnabled}
													onChange={(e) =>
														handleAutoSaveToggle(e.target.checked)
													}
													disabled={
														isUpdatingSettings || !selectedGame?.savepath
													}
												/>
											}
											label={t("pages.Detail.Backup.autoSave", "自动备份")}
										/>
									</div>
								</Tooltip>

								<Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
									<TextField
										label={t("pages.Detail.Backup.maxBackups", "最大备份数量")}
										type="number"
										variant="outlined"
										size="small"
										value={maxBackups}
										onChange={(e) => {
											const value = Number.parseInt(e.target.value, 10);
											if (!Number.isNaN(value) && value > 0) {
												setMaxBackups(value);
											}
										}}
										disabled={isUpdatingSettings || !selectedGame}
									/>
									<Button
										variant="outlined"
										onClick={handleUpdateMaxBackups}
										disabled={
											isUpdatingSettings || !selectedGame || maxBackups < 1
										}
										startIcon={
											isUpdatingSettings ? (
												<CircularProgress size={16} />
											) : (
												<SaveIcon />
											)
										}
									>
										{t("pages.Detail.Backup.save", "保存")}
									</Button>
								</Box>
							</Box>

							<Divider />

							{/* 存档路径设置 */}
							<Typography variant="subtitle2" color="textSecondary">
								{t("pages.Detail.Backup.savePathSettings", "存档路径设置")}
							</Typography>

							<Box sx={{ display: "flex", gap: 1 }}>
								<TextField
									label={t(
										"pages.Detail.Backup.saveDataPath",
										"存档文件夹路径",
									)}
									variant="outlined"
									fullWidth
									value={saveDataPath}
									onChange={(e) => setSaveDataPath(e.target.value)}
									disabled={isLoading || isUpdatingSettings || !selectedGame}
									placeholder={t(
										"pages.Detail.Backup.selectSaveDataFolder",
										"选择存档文件夹",
									)}
								/>
								<Button
									variant="outlined"
									onClick={handleSelectSaveDataPath}
									disabled={isLoading || isUpdatingSettings || !selectedGame}
									sx={{ minWidth: "40px", px: 1 }}
								>
									<FolderOpenIcon />
								</Button>
								<Button
									variant="outlined"
									onClick={handleUpdateSaveDataPath}
									disabled={
										isLoading ||
										isUpdatingSettings ||
										!selectedGame ||
										!saveDataPath
									}
									startIcon={
										isUpdatingSettings ? (
											<CircularProgress size={16} />
										) : (
											<SaveIcon />
										)
									}
									sx={{ minWidth: "100px" }}
								>
									{isUpdatingSettings
										? t("pages.Detail.Backup.updating", "更新中...")
										: t("pages.Detail.Backup.updatePath", "更新路径")}
								</Button>
							</Box>
						</Stack>
					</CardContent>
				</Card>

				{/* 手动备份操作 */}
				<Card>
					<CardContent>
						<Typography variant="h6" gutterBottom>
							{t("pages.Detail.Backup.manualBackup", "手动备份")}
						</Typography>

						{/* 创建备份按钮 */}
						<Stack spacing={2}>
							<Button
								variant="contained"
								color="primary"
								size="large"
								fullWidth
								onClick={handleCreateBackup}
								disabled={isLoading || !saveDataPath || !selectedGame?.savepath}
								startIcon={
									isLoading ? (
										<CircularProgress size={20} color="inherit" />
									) : (
										<BackupIcon />
									)
								}
							>
								{isLoading
									? t("pages.Detail.Backup.creating", "正在创建备份...")
									: t("pages.Detail.Backup.createBackup", "创建备份")}
							</Button>

							{/* 打开文件夹按钮 */}
							<Stack direction="row" spacing={1}>
								<Button
									variant="outlined"
									size="medium"
									onClick={() => handleOpenBackupFolder()}
									disabled={!selectedGame}
									startIcon={<FolderOpenIcon />}
									sx={{ flex: 1 }}
								>
									{t("pages.Detail.Backup.openBackupFolder", "打开备份文件夹")}
								</Button>

								<Button
									variant="outlined"
									size="medium"
									onClick={() => handleOpenSaveDataFolder()}
									disabled={!saveDataPath || !selectedGame?.savepath}
									startIcon={<FolderOpenIcon />}
									sx={{ flex: 1 }}
								>
									{t(
										"pages.Detail.Backup.openSaveDataFolder",
										"打开存档文件夹",
									)}
								</Button>
							</Stack>
						</Stack>
					</CardContent>
				</Card>

				{/* 备份列表 */}
				<Card>
					<CardContent>
						<Typography variant="h6" gutterBottom>
							{t("pages.Detail.Backup.backupHistory", "备份历史")}
						</Typography>

						{backupList.length === 0 ? (
							<Typography color="textSecondary" component="div">
								{t("pages.Detail.Backup.noBackups", "暂无备份记录")}
							</Typography>
						) : (
							<List>
								{backupList.map((backup) => (
									<ListItem key={backup.id} divider>
										<ListItemText
											primary={backup.file}
											secondary={
												<>
													<Typography
														variant="body2"
														color="textSecondary"
														component="span"
													>
														{t("pages.Detail.Backup.backupTime", "备份时间")}:{" "}
														{formatDate(backup.backup_time)}
													</Typography>
													<br />
													<Typography
														variant="body2"
														color="textSecondary"
														component="span"
													>
														{t("pages.Detail.Backup.fileSize", "文件大小")}:{" "}
														{formatFileSize(backup.file_size)}
													</Typography>
												</>
											}
										/>
										<ListItemSecondaryAction>
											<Tooltip
												title={
													!saveDataPath
														? t(
																"pages.Detail.Backup.setPathForRestore",
																"请先设置存档路径以恢复备份",
															)
														: t("pages.Detail.Backup.restoreBackup", "恢复备份")
												}
											>
												<span>
													<IconButton
														edge="end"
														onClick={() => handleRestoreClick(backup)}
														disabled={
															isLoading ||
															isRestoring ||
															!saveDataPath ||
															!selectedGame?.savepath
														}
														color="primary"
														sx={{ mr: 1 }}
													>
														{isRestoring && restoringBackupId === backup.id ? (
															<CircularProgress size={24} />
														) : (
															<RestoreIcon />
														)}
													</IconButton>
												</span>
											</Tooltip>
											<IconButton
												edge="end"
												onClick={() => handleDeleteClick(backup)}
												disabled={isLoading || isRestoring}
												color="error"
											>
												<DeleteIcon />
											</IconButton>
										</ListItemSecondaryAction>
									</ListItem>
								))}
							</List>
						)}
					</CardContent>
				</Card>
			</Stack>

			{/* 删除确认对话框 */}
			<AlertConfirmBox
				open={deleteDialogOpen}
				setOpen={setDeleteDialogOpen}
				onConfirm={handleDeleteBackup}
				isLoading={isDeleting}
				title={t("components.AlertBox.deleteBackupTitle", "删除备份")}
				message={
					backupToDelete
						? `${t("pages.Detail.Backup.confirmDelete", "确定要删除备份")} "${backupToDelete.file}" ${t("pages.Detail.Backup.confirmDeleteSuffix", "吗？此操作不可撤销。")}`
						: undefined
				}
			/>

			{/* 恢复确认对话框 */}
			<AlertConfirmBox
				open={restoreDialogOpen}
				setOpen={setRestoreDialogOpen}
				onConfirm={handleConfirmRestore}
				isLoading={isRestoring}
				title={t("pages.Detail.Backup.restoreBackupTitle", "恢复存档")}
				message={
					backupToRestore
						? `${t("pages.Detail.Backup.confirmRestore", "确定要恢复备份")} "${backupToRestore.file}"${t("pages.Detail.Backup.confirmRestoreSuffix", " 吗？这将覆盖当前存档，建议在恢复前先创建新备份。")}`
						: undefined
				}
				confirmText={t("pages.Detail.Backup.confirmRestoreButton", "恢复")}
				confirmColor="warning"
			/>
		</Box>
	);
};
