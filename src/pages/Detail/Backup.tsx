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
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertConfirmBox } from "@/components/AlertBox";
import { snackbar } from "@/components/Snackbar";
import { useSelectedGame } from "@/hooks/features/games/useGameFacade";
import { useUpdateGame } from "@/hooks/queries/useGames";
import { useSaveDataResources } from "@/hooks/queries/useSavedata";
import { useStore } from "@/store";
import type { SavedataRecord } from "@/types";
import {
	getErrorMessage,
	handleGetFolder,
	openGameBackupFolder,
	openGameSaveDataFolder,
} from "@/utils";

/** 格式化文件大小 */
const formatFileSize = (bytes: number): string => {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
};

/** 格式化时间戳 */
const formatDate = (timestamp: number): string => {
	return new Date(timestamp * 1000).toLocaleString();
};

/**
 * Backup 组件
 * 游戏存档备份页面
 */
export const Backup: React.FC = () => {
	const selectedGameId = useStore((state) => state.selectedGameId);
	const { selectedGame } = useSelectedGame(selectedGameId);
	const updateGameMutation = useUpdateGame();
	const { t } = useTranslation();

	// React Query hooks
	const {
		backupList,
		createBackupMutation,
		deleteBackupMutation,
		restoreBackupMutation,
	} = useSaveDataResources(selectedGame?.id);

	// 备份设置 - 本地状态（统一保存）
	const [saveDataPath, setSaveDataPath] = useState("");
	const [autoSaveEnabled, setAutoSaveEnabled] = useState(false);
	const [maxBackups, setMaxBackups] = useState(20);

	// 对话框状态
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [backupToDelete, setBackupToDelete] = useState<SavedataRecord | null>(
		null,
	);
	const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
	const [backupToRestore, setBackupToRestore] = useState<SavedataRecord | null>(
		null,
	);

	// 从 selectedGame 同步设置状态
	useEffect(() => {
		setAutoSaveEnabled(selectedGame?.autosave === 1);
		setSaveDataPath(selectedGame?.savepath || "");
		setMaxBackups(selectedGame?.maxbackups ?? 20);
	}, [
		selectedGame?.autosave,
		selectedGame?.savepath,
		selectedGame?.maxbackups,
	]);

	// 检测是否有未保存的更改
	const hasUnsavedChanges = useMemo(() => {
		if (!selectedGame) return false;
		return (
			autoSaveEnabled !== (selectedGame.autosave === 1) ||
			saveDataPath !== (selectedGame.savepath || "") ||
			maxBackups !== (selectedGame.maxbackups ?? 20)
		);
	}, [autoSaveEnabled, saveDataPath, maxBackups, selectedGame]);

	const isSaving = updateGameMutation.isPending;

	// 统一保存备份设置
	const handleSaveSettings = async () => {
		if (!selectedGame?.id) return;

		if (maxBackups < 1) {
			snackbar.error(
				t("pages.Detail.Backup.invalidMaxBackups", "最大备份数量必须大于0"),
			);
			return;
		}

		try {
			await updateGameMutation.mutateAsync({
				gameId: selectedGame.id,
				updates: {
					savepath: saveDataPath,
					autosave: saveDataPath !== "" ? (autoSaveEnabled ? 1 : 0) : 0,
					maxbackups: maxBackups,
				},
			});
			snackbar.success(
				t("pages.Detail.Backup.settingsSaved", "备份设置保存成功"),
			);
		} catch (error) {
			snackbar.error(
				`${t("pages.Detail.Backup.settingsSaveFailed", "备份设置保存失败")}: ${getErrorMessage(error)}`,
			);
		}
	};

	// 选择存档文件夹
	const handleSelectSaveDataPath = async () => {
		const selectedPath = await handleGetFolder();
		if (selectedPath) {
			setSaveDataPath(selectedPath);
		}
	};

	// 创建备份
	const handleCreateBackup = async () => {
		if (!selectedGame?.savepath || !selectedGame?.id) {
			snackbar.error(
				t("pages.Detail.Backup.pathRequired", "请先选择存档文件夹"),
			);
			return;
		}

		try {
			await createBackupMutation.mutateAsync({
				gameId: selectedGame.id,
				savePath: selectedGame.savepath,
			});
			snackbar.success(t("pages.Detail.Backup.backupSuccess", "备份创建成功"));
		} catch (error) {
			snackbar.error(
				`${t("pages.Detail.Backup.backupFailed", "备份失败")}: ${getErrorMessage(error)}`,
			);
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
		if (!selectedGame?.savepath) {
			snackbar.error(
				t("pages.Detail.Backup.pathRequired", "请先选择存档文件夹"),
			);
			return;
		}

		try {
			await openGameSaveDataFolder(selectedGame.savepath);
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
		if (!backupToDelete || !selectedGame?.id) return;
		deleteBackupMutation.mutate(
			{
				gameId: selectedGame.id,
				backup: backupToDelete,
			},
			{
				onSuccess: () => {
					snackbar.success(
						t("pages.Detail.Backup.deleteSuccess", "备份删除成功"),
					);
				},
				onError: (error) => {
					snackbar.error(
						`${t("pages.Detail.Backup.deleteFailed", "删除失败")}: ${getErrorMessage(error)}`,
					);
				},
				onSettled: () => {
					setDeleteDialogOpen(false);
					setBackupToDelete(null);
				},
			},
		);
	};

	// 打开恢复确认对话框
	const handleRestoreClick = (backup: SavedataRecord) => {
		if (!selectedGame?.savepath) {
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
		if (!backupToRestore || !selectedGame?.savepath || !selectedGame?.id)
			return;
		try {
			await restoreBackupMutation.mutateAsync({
				gameId: selectedGame.id,
				backup: backupToRestore,
				savePath: selectedGame.savepath,
			});
			snackbar.success(t("pages.Detail.Backup.restoreSuccess", "存档恢复成功"));
			setRestoreDialogOpen(false);
			setBackupToRestore(null);
		} catch (error) {
			snackbar.error(
				`${t("pages.Detail.Backup.restoreFailed", "恢复失败")}: ${getErrorMessage(error)}`,
			);
		}
	};

	return (
		<Box sx={{ p: 3 }}>
			<Stack spacing={3}>
				{/* 备份设置 */}
				<Card>
					<CardContent>
						<Typography variant="h6" gutterBottom>
							{t("pages.Detail.Backup.settings", "备份设置")}
						</Typography>

						<Stack spacing={2}>
							{/* 自动备份开关和最大备份数量 */}
							<Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
								<FormControlLabel
									control={
										<Switch
											checked={autoSaveEnabled}
											onChange={(e) => setAutoSaveEnabled(e.target.checked)}
											disabled={!saveDataPath}
										/>
									}
									label={t("pages.Detail.Backup.autoSave", "自动备份")}
								/>

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
									disabled={isSaving || !selectedGame}
								/>
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
									disabled={isSaving || !selectedGame}
									placeholder={t(
										"pages.Detail.Backup.selectSaveDataFolder",
										"选择存档文件夹",
									)}
								/>
								<Button
									variant="outlined"
									onClick={handleSelectSaveDataPath}
									disabled={isSaving || !selectedGame}
									sx={{ minWidth: "40px", px: 1 }}
								>
									<FolderOpenIcon />
								</Button>
							</Box>

							<Divider />

							{/* 统一保存按钮 */}
							<Button
								variant="contained"
								onClick={handleSaveSettings}
								disabled={isSaving || !selectedGame || !hasUnsavedChanges}
								startIcon={
									isSaving ? <CircularProgress size={16} /> : <SaveIcon />
								}
							>
								{isSaving
									? t("pages.Detail.Backup.saving", "保存中...")
									: t("pages.Detail.Backup.saveSettings", "保存备份设置")}
							</Button>
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
								disabled={
									createBackupMutation.isPending || !selectedGame?.savepath
								}
								startIcon={
									createBackupMutation.isPending ? (
										<CircularProgress size={20} color="inherit" />
									) : (
										<BackupIcon />
									)
								}
							>
								{createBackupMutation.isPending
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
									disabled={!selectedGame?.savepath}
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
															createBackupMutation.isPending ||
															restoreBackupMutation.isPending ||
															!selectedGame?.savepath
														}
														color="primary"
														sx={{ mr: 1 }}
													>
														{restoreBackupMutation.isPending &&
														restoreBackupMutation.variables?.backup.id ===
															backup.id ? (
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
												disabled={
													createBackupMutation.isPending ||
													restoreBackupMutation.isPending ||
													deleteBackupMutation.isPending
												}
												color="error"
											>
												{deleteBackupMutation.isPending ? (
													<CircularProgress size={24} color="error" />
												) : (
													<DeleteIcon />
												)}
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
				isLoading={deleteBackupMutation.isPending}
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
				isLoading={restoreBackupMutation.isPending}
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
