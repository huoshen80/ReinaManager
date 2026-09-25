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
type ToolSetting = { path: string; enabled: boolean };
type ToolDraft = Record<ToolKind, ToolSetting>;
type SaveController = {
	queuedTools: Set<ToolKind>;
	task: Promise<boolean> | null;
	closing: boolean;
};

type ToolIntegrationModalProps = {
	open: boolean;
	onClose: (paths: ToolPaths) => void;
	focusTool?: ToolKind;
};

const EMPTY_DRAFT: ToolDraft = {
	le: { path: "", enabled: false },
	magpie: { path: "", enabled: false },
};

export function ToolIntegrationModal({
	open,
	onClose,
	focusTool,
}: ToolIntegrationModalProps) {
	const { t } = useTranslation();
	const { data: settings, isPending } = useAllSettings({ enabled: open });
	const updateSettings = useUpdateSettings();
	const [draft, setDraft] = useState<ToolDraft>(EMPTY_DRAFT);
	const [initialized, setInitialized] = useState(false);
	const [isClosing, setIsClosing] = useState(false);
	const draftRef = useRef<ToolDraft>(EMPTY_DRAFT);
	const savedRef = useRef<ToolDraft>(EMPTY_DRAFT);
	const saveControllerRef = useRef<SaveController>({
		queuedTools: new Set<ToolKind>(),
		task: null,
		closing: false,
	});
	const leInspection = useUserPathInspection(draft.le.path);
	const magpieInspection = useUserPathInspection(draft.magpie.path);

	useEffect(() => {
		if (!open) {
			setInitialized(false);
			return;
		}
		if (!settings || initialized) return;
		const nextDraft: ToolDraft = {
			le: {
				path: settings.le_path ?? "",
				enabled: settings.default_le_launch,
			},
			magpie: {
				path: settings.magpie_path ?? "",
				enabled: settings.default_magpie,
			},
		};
		setDraft(nextDraft);
		draftRef.current = nextDraft;
		savedRef.current = nextDraft;
		setInitialized(true);
	}, [open, settings, initialized]);

	const changeTool = (tool: ToolKind, changes: Partial<ToolSetting>) => {
		const nextDraft = {
			...draftRef.current,
			[tool]: { ...draftRef.current[tool], ...changes },
		};
		draftRef.current = nextDraft;
		setDraft(nextDraft);
	};

	const flushQueuedTools = async () => {
		let succeeded = true;
		const controller = saveControllerRef.current;
		while (controller.queuedTools.size > 0) {
			const tool = controller.queuedTools.values().next().value;
			if (!tool) break;
			controller.queuedTools.delete(tool);

			const draftPath = draftRef.current[tool].path;
			const nextPath = draftPath.trim();
			const nextDefault = nextPath ? draftRef.current[tool].enabled : false;
			if (!nextPath && draftRef.current[tool].enabled) {
				changeTool(tool, { enabled: false });
			}

			const saved = savedRef.current[tool];
			const updates: UpdateSettingsParams = {};
			if (nextPath !== saved.path) {
				if (tool === "le") updates.lePath = nextPath || null;
				else updates.magpiePath = nextPath || null;
			}
			if (nextDefault !== saved.enabled) {
				if (tool === "le") updates.defaultLeLaunch = nextDefault;
				else updates.defaultMagpie = nextDefault;
			}
			if (Object.keys(updates).length === 0) continue;

			try {
				await updateSettings.mutateAsync(updates);
				savedRef.current = {
					...savedRef.current,
					[tool]: { path: nextPath, enabled: nextDefault },
				};
				if (
					draftRef.current[tool].path === draftPath &&
					draftPath !== nextPath
				) {
					changeTool(tool, { path: nextPath });
				}
			} catch (error) {
				succeeded = false;
				if (draftRef.current[tool].path === draftPath) {
					controller.queuedTools.delete(tool);
					changeTool(tool, { enabled: savedRef.current[tool].enabled });
				}
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
		}
		return succeeded;
	};

	const queueSave = (tool: ToolKind) => {
		const controller = saveControllerRef.current;
		controller.queuedTools.add(tool);
		if (controller.task) return controller.task;
		const nextPath = draftRef.current[tool].path.trim();
		const nextDefault = nextPath ? draftRef.current[tool].enabled : false;
		if (
			controller.queuedTools.size === 1 &&
			nextPath === savedRef.current[tool].path &&
			nextDefault === savedRef.current[tool].enabled
		) {
			controller.queuedTools.delete(tool);
			return Promise.resolve(true);
		}
		const task = Promise.resolve().then(flushQueuedTools);
		controller.task = task;
		void task.then(() => {
			controller.task = null;
		});
		return task;
	};

	const selectPath = async (tool: ToolKind) => {
		try {
			const selected = await handleExeFile(
				dirname(draftRef.current[tool].path),
			);
			if (selected) {
				changeTool(tool, { path: selected });
				await queueSave(tool);
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
		if (enabled && !draftRef.current[tool].path.trim()) return;
		changeTool(tool, { enabled });
		await queueSave(tool);
	};

	const close = async () => {
		const controller = saveControllerRef.current;
		if (controller.closing) return;
		controller.closing = true;
		setIsClosing(true);
		try {
			controller.queuedTools.add("le");
			if (!(await queueSave("magpie"))) return;
			onClose({
				le: savedRef.current.le.path,
				magpie: savedRef.current.magpie.path,
			});
		} finally {
			controller.closing = false;
			setIsClosing(false);
		}
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
			changeTool(tool, { path: savedRef.current[tool].path });
		}
	};

	const isLoading = open && (isPending || !initialized);
	return (
		<Dialog open={open} onClose={() => void close()} maxWidth="md" fullWidth>
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
									value={draft[tool].path}
									onChange={(value) => changeTool(tool, { path: value })}
									onBlur={() => void queueSave(tool)}
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
									disabled={isLoading || isClosing}
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
													disabled={isLoading || isClosing}
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
											checked={draft[tool].enabled}
											onChange={(event) =>
												void setDefault(tool, event.target.checked)
											}
											disabled={
												isLoading ||
												isClosing ||
												(!draft[tool].path.trim() && !draft[tool].enabled)
											}
										/>
									}
									label={t(
										"components.ToolIntegrationModal.defaultEnabled",
										"新游戏默认启用",
									)}
								/>
								{!draft[tool].path.trim() && (
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
					disabled={isClosing}
				>
					{t("components.PathSettingsModal.close", "关闭")}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
