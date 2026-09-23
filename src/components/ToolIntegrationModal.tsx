import FileOpenIcon from "@mui/icons-material/FileOpen";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import InputLabel from "@mui/material/InputLabel";
import Switch from "@mui/material/Switch";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { dirname } from "pathe";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PathInput } from "@/components/PathInput";
import { useUserPathInspection } from "@/hooks/common/useUserPathInspection";
import { useAllSettings, useUpdateSettings } from "@/hooks/queries/useSettings";
import { snackbar } from "@/providers/snackBar";
import { handleExeFile } from "@/services/fs/fileDialog";
import type { UpdateSettingsParams } from "@/types";
import { getUserErrorMessage } from "@/utils/errors";

export type ToolKind = "le" | "magpie";

export type ToolPaths = Record<ToolKind, string>;

type ToolIntegrationModalProps = {
	open: boolean;
	onClose: (paths: ToolPaths) => void;
	focusTool?: ToolKind;
};

const EMPTY_PATHS: ToolPaths = { le: "", magpie: "" };

export function ToolIntegrationModal({
	open,
	onClose,
	focusTool,
}: ToolIntegrationModalProps) {
	const { t } = useTranslation();
	const { data: settings, isPending } = useAllSettings({ enabled: open });
	const updateSettings = useUpdateSettings();
	const [paths, setPaths] = useState<ToolPaths>(EMPTY_PATHS);
	const [isSaving, setIsSaving] = useState(false);
	const initializedRef = useRef(false);
	const savedPathsRef = useRef<ToolPaths>(EMPTY_PATHS);
	const savingRef = useRef(false);
	const leInspection = useUserPathInspection(paths.le, open);
	const magpieInspection = useUserPathInspection(paths.magpie, open);

	useEffect(() => {
		if (!open) {
			initializedRef.current = false;
			return;
		}
		if (!settings || initializedRef.current) return;
		const nextPaths = {
			le: settings.le_path ?? "",
			magpie: settings.magpie_path ?? "",
		};
		setPaths(nextPaths);
		savedPathsRef.current = nextPaths;
		initializedRef.current = true;
	}, [open, settings]);

	const savePath = async (tool: ToolKind, value: string) => {
		const nextPath = value.trim();
		const previousPath = savedPathsRef.current[tool];
		if (nextPath === previousPath) return true;
		if (savingRef.current) return false;
		const updates: UpdateSettingsParams =
			tool === "le"
				? { lePath: nextPath || null }
				: { magpiePath: nextPath || null };
		try {
			savingRef.current = true;
			setIsSaving(true);
			await updateSettings.mutateAsync(updates);
			savedPathsRef.current = { ...savedPathsRef.current, [tool]: nextPath };
			setPaths((current) => ({ ...current, [tool]: nextPath }));
			return true;
		} catch (error) {
			setPaths((current) => ({ ...current, [tool]: previousPath }));
			snackbar.error(
				t(
					"components.ToolIntegrationModal.saveError",
					"保存工具设置失败：{{error}}",
					{
						error: getUserErrorMessage(error, t),
					},
				),
			);
			return false;
		} finally {
			savingRef.current = false;
			setIsSaving(false);
		}
	};

	const selectPath = async (tool: ToolKind) => {
		try {
			const selected = await handleExeFile(dirname(paths[tool]));
			if (selected) {
				setPaths((current) => ({ ...current, [tool]: selected }));
				await savePath(tool, selected);
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

	const setDefault = async (tool: ToolKind, enabled: boolean) => {
		if (enabled && !savedPathsRef.current[tool]) return;
		try {
			await updateSettings.mutateAsync(
				tool === "le"
					? { defaultLeLaunch: enabled }
					: { defaultMagpie: enabled },
			);
		} catch (error) {
			snackbar.error(
				t(
					"components.ToolIntegrationModal.saveError",
					"保存工具设置失败：{{error}}",
					{
						error: getUserErrorMessage(error, t),
					},
				),
			);
		}
	};

	const close = async () => {
		if (savingRef.current) return;
		if (!(await savePath("le", paths.le))) return;
		if (!(await savePath("magpie", paths.magpie))) return;
		onClose(savedPathsRef.current);
	};

	const pathKeyDown = (
		event: React.KeyboardEvent<HTMLDivElement>,
		tool: ToolKind,
	) => {
		if (event.key === "Enter" && !event.nativeEvent.isComposing) {
			event.preventDefault();
			(event.target as HTMLInputElement).blur();
		}
		if (event.key === "Escape") {
			event.preventDefault();
			setPaths((current) => ({
				...current,
				[tool]: savedPathsRef.current[tool],
			}));
		}
	};

	const isLoading = open && (isPending || !initializedRef.current);
	return (
		<Dialog
			open={open}
			onClose={isSaving ? undefined : () => void close()}
			maxWidth="md"
			fullWidth
		>
			<DialogTitle>
				{t("components.ToolIntegrationModal.title", "工具联动")}
			</DialogTitle>
			<DialogContent>
				<Box className="space-y-6">
					{(["le", "magpie"] as const).map((tool) => {
						const isLe = tool === "le";
						const title = isLe
							? t("components.PathSettingsModal.lePath.title", "LE转区软件路径")
							: t(
									"components.PathSettingsModal.magpiePath.title",
									"Magpie软件路径",
								);
						return (
							<Box key={tool}>
								<InputLabel className="font-semibold mb-4">{title}</InputLabel>
								<Typography
									variant="caption"
									color="text.secondary"
									className="block mb-3"
								>
									{isLe
										? t(
												"components.PathSettingsModal.lePath.note",
												"设置LE转区软件的可执行文件路径，用于游戏启动时的转区功能",
											)
										: t(
												"components.PathSettingsModal.magpiePath.note",
												"设置Magpie软件的可执行文件路径，用于游戏画面的放大功能",
											)}
								</Typography>
								<PathInput
									pathType="file"
									inspectionState={isLe ? leInspection : magpieInspection}
									variant="outlined"
									value={paths[tool]}
									onChange={(value) =>
										setPaths((current) => ({ ...current, [tool]: value }))
									}
									onBlur={() => void savePath(tool, paths[tool])}
									onKeyDown={(event) => pathKeyDown(event, tool)}
									fullWidth
									className="mb-2"
									placeholder={
										isLe
											? t(
													"components.PathSettingsModal.lePath.pathPlaceholder",
													"选择名为 LEProc 的可执行程序",
												)
											: t(
													"components.PathSettingsModal.magpiePath.pathPlaceholder",
													"选择名为 Magpie 的可执行程序",
												)
									}
									disabled={isLoading || isSaving}
									autoFocus={focusTool === tool}
									size="small"
									endAdornment={
										<InputAdornment position="end">
											<Tooltip
												title={
													isLe
														? t(
																"components.PathSettingsModal.lePath.selectBtn",
																"选择文件",
															)
														: t(
																"components.PathSettingsModal.magpiePath.selectBtn",
																"选择文件",
															)
												}
											>
												<IconButton
													onMouseDown={(event) => event.preventDefault()}
													onClick={() => void selectPath(tool)}
													disabled={isLoading || isSaving}
													edge="end"
													size="small"
												>
													<FileOpenIcon fontSize="small" />
												</IconButton>
											</Tooltip>
										</InputAdornment>
									}
								/>
								<FormControlLabel
									control={
										<Switch
											checked={
												isLe
													? Boolean(settings?.default_le_launch)
													: Boolean(settings?.default_magpie)
											}
											onChange={(event) =>
												void setDefault(tool, event.target.checked)
											}
											disabled={
												isLoading ||
												isSaving ||
												updateSettings.isPending ||
												!savedPathsRef.current[tool] ||
												paths[tool].trim() !== savedPathsRef.current[tool]
											}
										/>
									}
									label={t(
										"components.ToolIntegrationModal.defaultEnabled",
										"新游戏默认启用",
									)}
								/>
								{!savedPathsRef.current[tool] && (
									<Typography
										variant="caption"
										color="text.secondary"
										className="block"
									>
										{t(
											"components.ToolIntegrationModal.pathRequired",
											"请先保存软件路径，再开启默认选项。",
										)}
									</Typography>
								)}
							</Box>
						);
					})}
				</Box>
			</DialogContent>
			<DialogActions>
				<Button
					onMouseDown={(event) => event.preventDefault()}
					onClick={() => void close()}
					disabled={isSaving}
				>
					{t("components.PathSettingsModal.close", "关闭")}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
