/**
 * @file PathSettingsModal 路径设置弹窗组件
 * @description 统一的路径设置弹窗，包含游戏存档备份路径、LE转区软件路径、Magpie软件路径、数据库备份路径设置
 * @module src/components/PathSettingsModal/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要功能：
 * - 统一的路径设置弹窗
 * - 条件渲染：设置页面显示所有路径，非设置页面只显示LE和Magpie路径
 * - 集成路径选择、保存等功能
 *
 * 依赖：
 * - @mui/material
 * - @mui/icons-material
 * - @tauri-apps/api/dialog
 * - @/services/settingsService
 * - @/store
 * - react-i18next
 */

import FileOpenIcon from "@mui/icons-material/FileOpen";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { dirname } from "pathe";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAllSettings, useUpdateSettings } from "@/hooks/queries/useSettings";
import { snackbar } from "@/providers/snackBar";
import { handleExeFile, handleFolder } from "@/services/fs/fileDialog";
import { getAppDataDirPath } from "@/services/fs/pathCache";
import { moveBackupFolder } from "@/services/fs/savedataBackup";
import { getUserErrorMessage } from "@/utils/errors";

/**
 * 路径设置弹窗组件属性
 */
interface PathSettingsModalProps {
	open: boolean;
	onClose: () => void;
	/** 是否在设置页面显示，如果为false只显示LE和Magpie路径 */
	inSettingsPage?: boolean;
}

interface PathSettingsDraft {
	savePath: string;
	lePath: string;
	magpiePath: string;
	dbBackupPath: string;
}

const EMPTY_DRAFT: PathSettingsDraft = {
	savePath: "",
	lePath: "",
	magpiePath: "",
	dbBackupPath: "",
};

/**
 * 路径设置弹窗组件
 * @param {PathSettingsModalProps} props
 * @returns {JSX.Element}
 */
export const PathSettingsModal: React.FC<PathSettingsModalProps> = ({
	open,
	onClose,
	inSettingsPage = true,
}) => {
	const { t } = useTranslation();
	const [draft, setDraft] = useState<PathSettingsDraft>(EMPTY_DRAFT);
	const [initialDraft, setInitialDraft] =
		useState<PathSettingsDraft>(EMPTY_DRAFT);
	const initialDraftRef = useRef<PathSettingsDraft>(EMPTY_DRAFT);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const isSubmittingRef = useRef(false);
	const { data: settingsData, isPending } = useAllSettings({ enabled: open });
	const updateSettingsMutation = useUpdateSettings();

	const initDraft = useCallback(
		(settings: NonNullable<typeof settingsData>) => {
			const nextDraft: PathSettingsDraft = {
				savePath: inSettingsPage ? (settings.save_root_path ?? "") : "",
				lePath: settings.le_path ?? "",
				magpiePath: settings.magpie_path ?? "",
				dbBackupPath: inSettingsPage ? (settings.db_backup_path ?? "") : "",
			};

			setDraft(nextDraft);
			setInitialDraft(nextDraft);
			initialDraftRef.current = nextDraft;
		},
		[inSettingsPage],
	);

	useEffect(() => {
		if (!open || !settingsData) {
			return;
		}
		initDraft(settingsData);
	}, [open, settingsData, initDraft]);

	const isLoading = open && isPending;

	const updateDraft = (key: keyof PathSettingsDraft, value: string) => {
		setDraft((prev) => ({
			...prev,
			[key]: value,
		}));
	};

	/**
	 * 自动保存路径设置
	 */
	const saveDraft = async (nextDraft: PathSettingsDraft) => {
		const previousDraft = initialDraftRef.current;
		const isDirty =
			nextDraft.savePath !== previousDraft.savePath ||
			nextDraft.lePath !== previousDraft.lePath ||
			nextDraft.magpiePath !== previousDraft.magpiePath ||
			nextDraft.dbBackupPath !== previousDraft.dbBackupPath;

		if (!isDirty || isSubmittingRef.current) return !isSubmittingRef.current;

		try {
			isSubmittingRef.current = true;
			setIsSubmitting(true);
			await updateSettingsMutation.mutateAsync({
				saveRootPath: inSettingsPage ? nextDraft.savePath || null : undefined,
				dbBackupPath: inSettingsPage
					? nextDraft.dbBackupPath || null
					: undefined,
				lePath: nextDraft.lePath || null,
				magpiePath: nextDraft.magpiePath || null,
			});

			setDraft(nextDraft);
			setInitialDraft(nextDraft);
			initialDraftRef.current = nextDraft;

			if (inSettingsPage && previousDraft.savePath !== nextDraft.savePath) {
				try {
					await moveBackupFolder(
						previousDraft.savePath,
						nextDraft.savePath === ""
							? getAppDataDirPath()
							: nextDraft.savePath,
					);
				} catch (moveError) {
					snackbar.warning(
						t(
							"components.PathSettingsModal.savePath.moveBackupWarning",
							"备份路径已保存，但迁移旧备份失败：{{error}}",
							{
								error: getUserErrorMessage(moveError, t),
							},
						),
					);
				}
			}

			return true;
		} catch (error) {
			snackbar.error(
				t(
					"components.PathSettingsModal.saveError",
					"保存路径设置失败：{{error}}",
					{
						error: getUserErrorMessage(error, t),
					},
				),
			);
			return false;
		} finally {
			isSubmittingRef.current = false;
			setIsSubmitting(false);
		}
	};

	/**
	 * 选择文件夹的通用处理函数
	 */
	const handleSelectFolder = async (key: keyof PathSettingsDraft) => {
		try {
			const selectedPath = await handleFolder(draft[key]);
			if (selectedPath) {
				const nextDraft = { ...draft, [key]: selectedPath };
				setDraft(nextDraft);
				await saveDraft(nextDraft);
			}
		} catch (error) {
			snackbar.error(
				t(
					"components.PathSettingsModal.selectFolderError",
					"选择目录失败：{{error}}",
					{
						error: getUserErrorMessage(error, t),
					},
				),
			);
		}
	};

	/**
	 * 选择文件的通用处理函数
	 */
	const handleSelectExeFile = async (key: keyof PathSettingsDraft) => {
		try {
			const currentPath = draft[key];
			const selectedPath = await handleExeFile(dirname(currentPath));
			if (selectedPath) {
				const nextDraft = { ...draft, [key]: selectedPath };
				setDraft(nextDraft);
				await saveDraft(nextDraft);
			}
		} catch (error) {
			snackbar.error(
				t(
					"components.PathSettingsModal.selectFileError",
					"选择文件失败：{{error}}",
					{
						error: getUserErrorMessage(error, t),
					},
				),
			);
		}
	};

	const handleClose = async () => {
		if (await saveDraft(draft)) {
			onClose();
		}
	};

	const handlePathKeyDown = (
		event: React.KeyboardEvent<HTMLDivElement>,
		key: keyof PathSettingsDraft,
	) => {
		if (event.key === "Enter" && !event.nativeEvent.isComposing) {
			event.preventDefault();
			(event.target as HTMLInputElement).blur();
		}
		if (event.key === "Escape") {
			event.preventDefault();
			updateDraft(key, initialDraft[key]);
		}
	};

	return (
		<Dialog
			open={open}
			onClose={isSubmitting ? undefined : () => void handleClose()}
			maxWidth="md"
			fullWidth
			PaperProps={{
				sx: { minHeight: "60vh" },
			}}
		>
			<DialogTitle>
				{t("components.PathSettingsModal.title", "路径设置")}
			</DialogTitle>
			<DialogContent>
				<Box className="space-y-6">
					{inSettingsPage && (
						<>
							{/* 游戏存档备份路径设置 */}
							<Box>
								<InputLabel className="font-semibold mb-4">
									{t(
										"components.PathSettingsModal.savePath.title",
										"游戏存档备份路径",
									)}
								</InputLabel>
								<Typography
									variant="caption"
									color="text.secondary"
									className="block mb-3"
								>
									{t(
										"components.PathSettingsModal.savePath.note",
										"设置游戏存档的备份根目录路径，留空将使用默认路径",
									)}
								</Typography>
								<TextField
									label={t(
										"components.PathSettingsModal.savePath.pathLabel",
										"备份根目录路径",
									)}
									variant="outlined"
									value={draft.savePath}
									onChange={(e) => updateDraft("savePath", e.target.value)}
									onBlur={() => void saveDraft(draft)}
									onKeyDown={(event) => handlePathKeyDown(event, "savePath")}
									fullWidth
									className="mb-2"
									placeholder={t(
										"components.PathSettingsModal.savePath.pathPlaceholder",
										"留空使用默认路径",
									)}
									disabled={isLoading}
									size="small"
									InputProps={{
										endAdornment: (
											<InputAdornment position="end">
												<Tooltip
													title={t(
														"components.PathSettingsModal.savePath.selectBtn",
														"选择目录",
													)}
												>
													<IconButton
														onMouseDown={(event) => event.preventDefault()}
														onClick={() => handleSelectFolder("savePath")}
														disabled={isLoading}
														edge="end"
														size="small"
													>
														<FolderOpenIcon fontSize="small" />
													</IconButton>
												</Tooltip>
											</InputAdornment>
										),
									}}
								/>
							</Box>

							{/* 数据库备份路径设置 */}
							<Box>
								<InputLabel className="font-semibold mb-4">
									{t(
										"components.PathSettingsModal.dbBackupPath.title",
										"数据库备份路径",
									)}
								</InputLabel>
								<Typography
									variant="caption"
									color="text.secondary"
									className="block mb-3"
								>
									{t(
										"components.PathSettingsModal.dbBackupPath.note",
										"设置数据库备份文件的保存路径，留空将使用默认路径（AppData/data/backups），或便携模式下的程序目录",
									)}
								</Typography>
								<TextField
									label={t(
										"components.PathSettingsModal.dbBackupPath.pathLabel",
										"备份保存路径",
									)}
									variant="outlined"
									value={draft.dbBackupPath}
									onChange={(e) => updateDraft("dbBackupPath", e.target.value)}
									onBlur={() => void saveDraft(draft)}
									onKeyDown={(event) =>
										handlePathKeyDown(event, "dbBackupPath")
									}
									fullWidth
									className="mb-2"
									placeholder={t(
										"components.PathSettingsModal.dbBackupPath.pathPlaceholder",
										"留空使用默认路径",
									)}
									disabled={isLoading}
									size="small"
									InputProps={{
										endAdornment: (
											<InputAdornment position="end">
												<Tooltip
													title={t(
														"components.PathSettingsModal.dbBackupPath.selectBtn",
														"选择目录",
													)}
												>
													<IconButton
														onMouseDown={(event) => event.preventDefault()}
														onClick={() => handleSelectFolder("dbBackupPath")}
														disabled={isLoading}
														edge="end"
														size="small"
													>
														<FolderOpenIcon fontSize="small" />
													</IconButton>
												</Tooltip>
											</InputAdornment>
										),
									}}
								/>
							</Box>
						</>
					)}

					{/* LE转区软件路径设置 */}
					<Box>
						<InputLabel className="font-semibold mb-4">
							{t("components.PathSettingsModal.lePath.title", "LE转区软件路径")}
						</InputLabel>
						<Typography
							variant="caption"
							color="text.secondary"
							className="block mb-3"
						>
							{t(
								"components.PathSettingsModal.lePath.note",
								"设置LE转区软件的可执行文件路径，用于游戏启动时的转区功能",
							)}
						</Typography>
						<TextField
							label={t(
								"components.PathSettingsModal.lePath.pathLabel",
								"LE转区软件路径",
							)}
							variant="outlined"
							value={draft.lePath}
							onChange={(e) => updateDraft("lePath", e.target.value)}
							onBlur={() => void saveDraft(draft)}
							onKeyDown={(event) => handlePathKeyDown(event, "lePath")}
							fullWidth
							className="mb-2"
							placeholder={t(
								"components.PathSettingsModal.lePath.pathPlaceholder",
								"选择LE转区软件的可执行文件",
							)}
							disabled={isLoading}
							size="small"
							InputProps={{
								endAdornment: (
									<InputAdornment position="end">
										<Tooltip
											title={t(
												"components.PathSettingsModal.lePath.selectBtn",
												"选择文件",
											)}
										>
											<IconButton
												onMouseDown={(event) => event.preventDefault()}
												onClick={() => handleSelectExeFile("lePath")}
												disabled={isLoading}
												edge="end"
												size="small"
											>
												<FileOpenIcon fontSize="small" />
											</IconButton>
										</Tooltip>
									</InputAdornment>
								),
							}}
						/>
					</Box>

					{/* Magpie软件路径设置 */}
					<Box>
						<InputLabel className="font-semibold mb-4">
							{t(
								"components.PathSettingsModal.magpiePath.title",
								"Magpie软件路径",
							)}
						</InputLabel>
						<Typography
							variant="caption"
							color="text.secondary"
							className="block mb-3"
						>
							{t(
								"components.PathSettingsModal.magpiePath.note",
								"设置Magpie软件的可执行文件路径，用于游戏画面的放大功能",
							)}
						</Typography>
						<TextField
							label={t(
								"components.PathSettingsModal.magpiePath.pathLabel",
								"Magpie软件路径",
							)}
							variant="outlined"
							value={draft.magpiePath}
							onChange={(e) => updateDraft("magpiePath", e.target.value)}
							onBlur={() => void saveDraft(draft)}
							onKeyDown={(event) => handlePathKeyDown(event, "magpiePath")}
							fullWidth
							className="mb-2"
							placeholder={t(
								"components.PathSettingsModal.magpiePath.pathPlaceholder",
								"选择Magpie软件的可执行文件",
							)}
							disabled={isLoading}
							size="small"
							InputProps={{
								endAdornment: (
									<InputAdornment position="end">
										<Tooltip
											title={t(
												"components.PathSettingsModal.magpiePath.selectBtn",
												"选择文件",
											)}
										>
											<IconButton
												onMouseDown={(event) => event.preventDefault()}
												onClick={() => handleSelectExeFile("magpiePath")}
												disabled={isLoading}
												edge="end"
												size="small"
											>
												<FileOpenIcon fontSize="small" />
											</IconButton>
										</Tooltip>
									</InputAdornment>
								),
							}}
						/>
					</Box>
				</Box>
			</DialogContent>
			<DialogActions>
				<Button
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => void handleClose()}
					disabled={isSubmitting}
				>
					{t("components.PathSettingsModal.close", "关闭")}
				</Button>
			</DialogActions>
		</Dialog>
	);
};
