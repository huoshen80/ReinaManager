/**
 * @file PathSettingsModal 路径设置弹窗组件
 * @description 游戏安装、存档备份与数据库备份路径设置
 * @module src/components/PathSettingsModal/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要功能：
 * - 统一的路径设置弹窗
 * - 设置页面集中管理安装与备份路径
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
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PathInput } from "@/components/PathInput";
import { useUserPathInspection } from "@/hooks/common/useUserPathInspection";
import {
	useAllSettings,
	useChangeSavedataBackupRoot,
	useUpdateSettings,
} from "@/hooks/queries/useSettings";
import { snackbar } from "@/providers/snackBar";
import { handleFolder } from "@/services/fs/fileDialog";
import type { UpdateSettingsParams } from "@/types";
import { getUserErrorMessage } from "@/utils/errors";

/**
 * 路径设置弹窗组件属性
 */
interface PathSettingsModalProps {
	open: boolean;
	onClose: () => void;
}

interface PathSettingsDraft {
	installRootPath: string;
	savePath: string;
	dbBackupPath: string;
}

const EMPTY_DRAFT: PathSettingsDraft = {
	installRootPath: "",
	savePath: "",
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
	const changeSavedataBackupRootMutation = useChangeSavedataBackupRoot();
	const installRootInspection = useUserPathInspection(draft.installRootPath);
	const savePathInspection = useUserPathInspection(draft.savePath);
	const dbBackupPathInspection = useUserPathInspection(draft.dbBackupPath);

	const initDraft = useCallback(
		(settings: NonNullable<typeof settingsData>) => {
			const nextDraft: PathSettingsDraft = {
				installRootPath: settings.install_root_path ?? "",
				savePath: settings.save_root_path ?? "",
				dbBackupPath: settings.db_backup_path ?? "",
			};

			setDraft(nextDraft);
			setInitialDraft(nextDraft);
			initialDraftRef.current = nextDraft;
		},
		[],
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
			nextDraft.installRootPath !== previousDraft.installRootPath ||
			nextDraft.savePath !== previousDraft.savePath ||
			nextDraft.dbBackupPath !== previousDraft.dbBackupPath;

		if (!isDirty || isSubmittingRef.current) return !isSubmittingRef.current;

		const updates: UpdateSettingsParams = {};
		const changedFields: string[] = [];
		if (nextDraft.installRootPath !== previousDraft.installRootPath) {
			updates.installRootPath = nextDraft.installRootPath || null;
			changedFields.push(
				t(
					"components.PathSettingsModal.installRootPath.title",
					"游戏安装根目录",
				),
			);
		}
		if (nextDraft.savePath !== previousDraft.savePath) {
			changedFields.push(
				t("components.PathSettingsModal.savePath.title", "游戏存档备份根目录"),
			);
		}
		if (nextDraft.dbBackupPath !== previousDraft.dbBackupPath) {
			updates.dbBackupPath = nextDraft.dbBackupPath || null;
			changedFields.push(
				t(
					"components.PathSettingsModal.dbBackupPath.title",
					"数据库备份根目录",
				),
			);
		}

		try {
			isSubmittingRef.current = true;
			setIsSubmitting(true);
			let persistedDraft = previousDraft;
			if (nextDraft.savePath !== previousDraft.savePath) {
				const migration = await changeSavedataBackupRootMutation.mutateAsync({
					newPath: nextDraft.savePath,
				});
				if (migration.status === "saved_with_warning") {
					if (migration.residue_path) {
						snackbar.warning(
							t(
								"components.PathSettingsModal.savePath.moveBackupWarning",
								"备份路径已保存，但旧备份目录清理不完整：{{error}}",
								{ error: migration.residue_path },
							),
						);
					} else {
						snackbar.warning(
							t(
								"components.PathSettingsModal.savePath.skipMigrationWarning",
								"备份路径已保存，但未迁移旧备份：{{error}}。旧备份位置：{{path}}",
								{
									error: migration.message,
									path: migration.old_path ?? t("common.unknown", "未知"),
								},
							),
						);
					}
				}
				if (migration.cleaned_record_count > 0) {
					snackbar.info(
						t(
							"components.PathSettingsModal.savePath.cleanedRecords",
							"备份路径已保存，并清理了 {{count}} 条失效备份记录",
							{ count: migration.cleaned_record_count },
						),
					);
				}
				persistedDraft = { ...persistedDraft, savePath: nextDraft.savePath };
				setInitialDraft(persistedDraft);
				initialDraftRef.current = persistedDraft;
				await savePathInspection.inspect(nextDraft.savePath);
			}
			if (Object.keys(updates).length > 0) {
				await updateSettingsMutation.mutateAsync(updates);
			}

			setDraft(nextDraft);
			setInitialDraft(nextDraft);
			initialDraftRef.current = nextDraft;

			return true;
		} catch (error) {
			snackbar.error(
				t(
					"components.PathSettingsModal.saveFieldError",
					"保存{{field}}失败：{{error}}",
					{
						field: changedFields.join("、"),
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
					{/* 一键安装游戏目录设置 */}
					<Box>
						<InputLabel className="font-semibold mb-4">
							{t(
								"components.PathSettingsModal.installRootPath.title",
								"游戏安装根目录",
							)}
						</InputLabel>
						<Typography
							variant="caption"
							color="text.secondary"
							className="block mb-3"
						>
							{t(
								"components.PathSettingsModal.installRootPath.note",
								"书音等来源的一键安装会把游戏解压到此目录",
							)}
						</Typography>
						<PathInput
							pathType="directory"
							inspectionState={installRootInspection}
							variant="outlined"
							value={draft.installRootPath}
							onChange={(value) => updateDraft("installRootPath", value)}
							onBlur={() => void saveDraft(draft)}
							onKeyDown={(event) => handlePathKeyDown(event, "installRootPath")}
							fullWidth
							className="mb-2"
							placeholder={t(
								"components.PathSettingsModal.installRootPath.pathPlaceholder",
								"游戏将默认装在这个目录下",
							)}
							disabled={isLoading}
							size="small"
							endAdornment={
								<InputAdornment position="end">
									<Tooltip
										title={t(
											"components.PathSettingsModal.installRootPath.selectBtn",
											"选择目录",
										)}
									>
										<IconButton
											onMouseDown={(event) => event.preventDefault()}
											onClick={() => handleSelectFolder("installRootPath")}
											disabled={isLoading}
											edge="end"
											size="small"
										>
											<FolderOpenIcon fontSize="small" />
										</IconButton>
									</Tooltip>
								</InputAdornment>
							}
						/>
					</Box>

					{/* 游戏存档备份路径设置 */}
					<Box>
						<InputLabel className="font-semibold mb-4">
							{t(
								"components.PathSettingsModal.savePath.title",
								"游戏存档备份根目录",
							)}
						</InputLabel>
						<Typography
							variant="caption"
							color="text.secondary"
							className="block mb-3"
						>
							{t(
								"components.PathSettingsModal.savePath.note",
								"设置游戏存档的备份根目录，留空将使用默认路径",
							)}
						</Typography>
						<PathInput
							pathType="directory"
							inspectionState={savePathInspection}
							variant="outlined"
							value={draft.savePath}
							onChange={(value) => updateDraft("savePath", value)}
							onBlur={() => void saveDraft(draft)}
							onKeyDown={(event) => handlePathKeyDown(event, "savePath")}
							fullWidth
							className="mb-2"
							placeholder={t(
								"components.PathSettingsModal.savePath.pathPlaceholder",
								"游戏存档将默认备份到这个目录下",
							)}
							disabled={isLoading}
							size="small"
							endAdornment={
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
							}
						/>
					</Box>

					{/* 数据库备份路径设置 */}
					<Box>
						<InputLabel className="font-semibold mb-4">
							{t(
								"components.PathSettingsModal.dbBackupPath.title",
								"数据库备份根目录",
							)}
						</InputLabel>
						<Typography
							variant="caption"
							color="text.secondary"
							className="block mb-3"
						>
							{t(
								"components.PathSettingsModal.dbBackupPath.note",
								"设置数据库的备份根目录，留空将使用默认路径",
							)}
						</Typography>
						<PathInput
							pathType="directory"
							inspectionState={dbBackupPathInspection}
							variant="outlined"
							value={draft.dbBackupPath}
							onChange={(value) => updateDraft("dbBackupPath", value)}
							onBlur={() => void saveDraft(draft)}
							onKeyDown={(event) => handlePathKeyDown(event, "dbBackupPath")}
							fullWidth
							className="mb-2"
							placeholder={t(
								"components.PathSettingsModal.dbBackupPath.pathPlaceholder",
								"数据库将默认备份到这个目录下",
							)}
							disabled={isLoading}
							size="small"
							endAdornment={
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
							}
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
