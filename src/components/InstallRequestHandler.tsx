import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import {
	Alert,
	Box,
	Button,
	Checkbox,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControlLabel,
	IconButton,
	InputAdornment,
	Link,
	Stack,
	TextField,
	Typography,
} from "@mui/material";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAllSettings, useUpdateSettings } from "@/hooks/queries/useSettings";
import { useTaskCache } from "@/hooks/queries/useTasks";
import { buildInsertGameData } from "@/metadata/data/metadata";
import { queryClient } from "@/providers/queryClient";
import { snackbar } from "@/providers/snackBar";
import { handleFolder } from "@/services/fs/fileDialog";
import {
	type GameInstallMetadataRequestedEvent,
	type InstallCompletedEvent,
	type InstallFailedEvent,
	type InstallRequest,
	isGameInstallTask,
	type TaskProgressEvent,
	taskService,
} from "@/services/invoke";
import { withMetadataAuth } from "@/services/metadataAuth";
import { createMetadataSession } from "@/services/requestContext";
import type { SourceType } from "@/types";
import { AppError, getUserErrorMessage, isHttpStatus } from "@/utils/errors";
import { formatFileSize } from "@/utils/fileSize";

type DialogStage = "confirm" | "preparing";

export function InstallRequestHandler() {
	const { t } = useTranslation();
	const { data: settings, isPending: settingsPending } = useAllSettings();
	const hasHikarinagiToken = Boolean(settings?.hikarinagi_auth?.access_token);
	const updateSettingsMutation = useUpdateSettings();
	const [queue, setQueue] = useState<InstallRequest[]>([]);
	const [request, setRequest] = useState<InstallRequest | null>(null);
	const [stage, setStage] = useState<DialogStage>("confirm");
	const [installPath, setInstallPath] = useState("");
	const [saveAsDefault, setSaveAsDefault] = useState(true);
	const { fetchTasks, invalidateTasks, prependTask, updateTaskProgress } =
		useTaskCache();

	const importingTaskIdsRef = useRef(new Set<number>());
	const drainingRef = useRef(false);
	const drainAgainRef = useRef(false);
	// 监听器生命周期不应随语言切换重建；事件回调通过 ref 读取最新翻译函数。
	const translationRef = useRef(t);
	translationRef.current = t;

	const resetDialog = useCallback(() => {
		setRequest(null);
		setStage("confirm");
	}, []);

	useEffect(() => {
		if (request || queue.length === 0 || settingsPending) return;
		const nextRequest = queue[0];
		setRequest(nextRequest);
		setQueue((current) => current.slice(1));
		setStage("confirm");
		const defaultRootPath = settings?.install_root_path ?? "";
		setInstallPath(defaultRootPath);
		setSaveAsDefault(defaultRootPath === "");
	}, [queue, request, settings?.install_root_path, settingsPending]);

	const handleBrowsePath = useCallback(async () => {
		const selected = await handleFolder(installPath);
		if (selected) {
			setInstallPath(selected);
		}
	}, [installPath]);

	const drainPendingProtocolEvents = useCallback(async () => {
		if (drainingRef.current) {
			drainAgainRef.current = true;
			return;
		}
		drainingRef.current = true;
		try {
			do {
				drainAgainRef.current = false;
				const [requests, rejections] = await Promise.all([
					taskService.takePendingRequests(),
					taskService.takePendingRejections(),
				]);
				if (requests.length > 0) {
					setQueue((current) => [...current, ...requests]);
				}
				for (const rejection of rejections) {
					snackbar.error(
						translationRef.current(
							"components.InstallRequest.invalidRequest",
							"安装请求无效：{{error}}",
							{ error: rejection.message },
						),
					);
				}
			} while (drainAgainRef.current);
		} catch (error) {
			console.error("读取安装协议请求失败:", error);
		} finally {
			drainingRef.current = false;
		}
	}, []);

	const importGameMetadata = useCallback(
		async (taskId: number) => {
			if (importingTaskIdsRef.current.has(taskId)) return;
			importingTaskIdsRef.current.add(taskId);
			try {
				const tasks = await fetchTasks();
				const task = tasks.find((current) => current.id === taskId);
				if (
					!task ||
					!isGameInstallTask(task) ||
					task.status !== "running" ||
					task.stage !== "matching_metadata"
				) {
					return;
				}

				const bgmId = task.payload_json.bgm_id ?? undefined;
				const hikarinagiId = task.payload_json.hikarinagi_id ?? undefined;
				const vndbId = task.payload_json.vndb_id ?? undefined;
				const shouldFetchHikarinagi =
					Boolean(hikarinagiId) && hasHikarinagiToken;
				const enabledSources: SourceType[] = [];
				if (bgmId) enabledSources.push("bgm");
				if (vndbId) enabledSources.push("vndb");
				if (shouldFetchHikarinagi) enabledSources.push("hikarinagi");
				const customMetadataResult = {
					data: {
						id_type: "custom",
						sources: [],
						custom_data: { name: task.payload_json.title },
					},
					failedSources: enabledSources,
				};
				const metadataResult =
					enabledSources.length === 0
						? customMetadataResult
						: await withMetadataAuth(
								enabledSources,
								async ({ bgmToken, hikarinagiToken }) => {
									const session = createMetadataSession({
										bgmToken,
										hikarinagiToken,
									});
									try {
										return await session.getGameByIds({
											sourceIds: {
												bgm: bgmId,
												vndb: vndbId,
												...(shouldFetchHikarinagi
													? { hikarinagi: hikarinagiId }
													: {}),
											},
											enabledSources,
										});
									} catch (error) {
										const metadataNotFound =
											isHttpStatus(error, 404) ||
											(error instanceof AppError &&
												error.code === "metadata_not_found");
										if (!metadataNotFound) throw error;

										return customMetadataResult;
									}
								},
								{ requireHikarinagi: shouldFetchHikarinagi },
							);
				const insertData = await buildInsertGameData(metadataResult.data);
				await taskService.completeGameInstall(taskId, insertData);
			} catch (error) {
				const message = getUserErrorMessage(error, translationRef.current);
				try {
					await taskService.failGameInstallMetadata(taskId, message);
				} catch (updateError) {
					console.error("记录安装元数据失败状态失败:", updateError);
					snackbar.error(message);
				}
			} finally {
				importingTaskIdsRef.current.delete(taskId);
				void invalidateTasks();
			}
		},
		[fetchTasks, hasHikarinagiToken, invalidateTasks],
	);

	useEffect(() => {
		let disposed = false;
		const unlisteners: UnlistenFn[] = [];
		const cleanupListeners = () => {
			for (const unlisten of unlisteners.splice(0)) unlisten();
		};
		const register = async () => {
			const registrations: Array<() => Promise<UnlistenFn>> = [
				() =>
					listen("game-install-requested", () => {
						void drainPendingProtocolEvents();
					}),
				() =>
					listen("game-install-request-rejected", () => {
						void drainPendingProtocolEvents();
					}),
				() =>
					listen<TaskProgressEvent>("task-progress", (event) => {
						updateTaskProgress(event.payload);
					}),
				() =>
					listen<GameInstallMetadataRequestedEvent>(
						"game-install-metadata-requested",
						(event) => {
							void importGameMetadata(event.payload.task_id);
						},
					),
				() =>
					listen<InstallCompletedEvent>("game-install-completed", (event) => {
						queryClient.invalidateQueries({ queryKey: ["games"] });
						void invalidateTasks();
						if (event.payload.executable_missing) {
							snackbar.warning(
								translationRef.current(
									"components.InstallRequest.completedWithoutExecutable",
									"游戏文件安装完成，请在游戏设置中手动配置启动程序",
								),
							);
						} else {
							snackbar.success(
								translationRef.current(
									"components.InstallRequest.completed",
									"游戏安装成功",
								),
							);
						}
					}),
				() =>
					listen<InstallFailedEvent>("game-install-failed", (event) => {
						void invalidateTasks();
						snackbar.error(event.payload.error_message);
					}),
			];
			for (const registration of registrations) {
				const unlisten = await registration();
				if (disposed) {
					unlisten();
					return;
				}
				unlisteners.push(unlisten);
			}
			if (!disposed) {
				await drainPendingProtocolEvents();
				const tasks = await fetchTasks();
				for (const task of tasks) {
					if (
						isGameInstallTask(task) &&
						task.status === "running" &&
						task.stage === "matching_metadata"
					) {
						void importGameMetadata(task.id);
					}
				}
			}
		};
		void register().catch((error) => {
			cleanupListeners();
			console.error("初始化安装协议监听失败", error);
		});
		return () => {
			disposed = true;
			cleanupListeners();
		};
	}, [
		drainPendingProtocolEvents,
		fetchTasks,
		importGameMetadata,
		invalidateTasks,
		updateTaskProgress,
	]);

	const startTask = async (
		currentRequest: InstallRequest,
		installRoot: string,
	) => {
		const createdTask = await taskService.createGameInstallTask(
			currentRequest,
			installRoot,
		);
		prependTask(createdTask);
		void invalidateTasks();
	};

	const prepareInstall = async () => {
		if (!request) return;
		const trimmedPath = installPath.trim();
		if (!trimmedPath) {
			snackbar.error(
				t("components.InstallRequest.pathRequired", "请先选择或输入安装路径"),
			);
			return;
		}
		setStage("preparing");
		try {
			await startTask(request, trimmedPath);
		} catch (error) {
			setStage("confirm");
			snackbar.error(getUserErrorMessage(error, t));
			return;
		}

		let defaultPathSaveError: string | null = null;
		if (saveAsDefault && trimmedPath !== settings?.install_root_path) {
			try {
				await updateSettingsMutation.mutateAsync({
					installRootPath: trimmedPath,
				});
			} catch (error) {
				defaultPathSaveError = getUserErrorMessage(error, t);
			}
		}

		resetDialog();
		if (defaultPathSaveError) {
			snackbar.warning(
				t(
					"components.InstallRequest.defaultPathSaveFailed",
					"安装任务已创建，但默认路径保存失败：{{error}}",
					{ error: defaultPathSaveError },
				),
			);
			return;
		}
		snackbar.success(
			t(
				"components.InstallRequest.queued",
				"已添加到下载任务，可在后台查看进度",
			),
		);
	};

	const bgmId = request?.bgm_id;
	const vndbId = request?.vndb_id;
	const hikarinagiId = request?.hikarinagi_id;
	const formattedVndbId = vndbId
		? vndbId.startsWith("v")
			? vndbId
			: `v${vndbId}`
		: "";
	const requestOrigin = request ? new URL(request.url).origin : "";

	const open = Boolean(request);
	return (
		<Dialog
			open={open}
			onClose={stage === "confirm" ? resetDialog : undefined}
			maxWidth="sm"
			fullWidth
			disableEscapeKeyDown={stage === "preparing"}
		>
			<DialogTitle>
				{t("components.InstallRequest.title", "安装游戏")}
			</DialogTitle>
			<DialogContent>
				{stage === "confirm" && request && (
					<Stack spacing={2}>
						<Alert severity="warning">
							{t(
								"components.InstallRequest.sourceRiskWarning",
								"此安装请求来自 {{provider}}（{{origin}}）。应用允许访问自定义下载地址，包括内网服务；仅在你信任该来源和下载地址时继续。",
								{
									provider: request.provider,
									origin: requestOrigin,
								},
							)}
						</Alert>
						<Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
							<Typography variant="h6">{request.title}</Typography>
							<Typography variant="body2" color="text.secondary">
								{request.file_name} · {formatFileSize(request.size)}
							</Typography>
							<Typography
								variant="body2"
								color="text.secondary"
								sx={{
									display: "inline-flex",
									alignItems: "center",
									gap: 0.5,
								}}
							>
								{t("components.InstallRequest.providerLabel", "来源：")}
								{request.url ? (
									<Link
										component="button"
										variant="body2"
										onClick={() => void openUrl(request.url)}
										sx={{
											fontWeight: 500,
											textDecoration: "none",
											"&:hover": { textDecoration: "underline" },
										}}
									>
										{request.provider}
									</Link>
								) : (
									<span>{request.provider}</span>
								)}
							</Typography>
							{(bgmId || vndbId || hikarinagiId) && (
								<Stack
									direction="row"
									spacing={1}
									alignItems="center"
									flexWrap="wrap"
								>
									<Typography variant="body2" color="text.secondary">
										{t("components.InstallRequest.metadataLabel", "元数据：")}
									</Typography>
									{bgmId && (
										<Chip
											label={`Bangumi ${bgmId}`}
											size="small"
											variant="outlined"
											clickable
											onClick={() =>
												void openUrl(`https://bgm.tv/subject/${bgmId}`)
											}
											sx={{ borderRadius: 1 }}
										/>
									)}
									{vndbId && (
										<Chip
											label={`VNDB ${formattedVndbId}`}
											size="small"
											variant="outlined"
											clickable
											onClick={() =>
												void openUrl(`https://vndb.org/${formattedVndbId}`)
											}
											sx={{ borderRadius: 1 }}
										/>
									)}
									{hikarinagiId && (
										<Chip
											label={`Hikarinagi ${hikarinagiId}`}
											size="small"
											variant="outlined"
											clickable
											onClick={() =>
												void openUrl(
													`https://www.hikarinagi.org/galgames/${hikarinagiId}`,
												)
											}
											sx={{ borderRadius: 1 }}
										/>
									)}
								</Stack>
							)}
						</Box>
						<Stack spacing={1} sx={{ pt: 1 }}>
							<TextField
								label={t("components.InstallRequest.installPath", "安装路径")}
								value={installPath}
								onChange={(e) => setInstallPath(e.target.value)}
								placeholder={t(
									"components.InstallRequest.installPathPlaceholder",
									"选择用于安装游戏的目录",
								)}
								size="small"
								fullWidth
								InputProps={{
									endAdornment: (
										<InputAdornment position="end">
											<IconButton
												onClick={() => void handleBrowsePath()}
												edge="end"
												size="small"
												title={t("common.browse", "浏览")}
											>
												<FolderOpenIcon fontSize="small" />
											</IconButton>
										</InputAdornment>
									),
								}}
							/>
							<FormControlLabel
								control={
									<Checkbox
										checked={saveAsDefault}
										onChange={(e) => setSaveAsDefault(e.target.checked)}
										size="small"
									/>
								}
								label={
									<Typography variant="body2">
										{t(
											"components.InstallRequest.saveAsDefaultPath",
											"设为默认路径",
										)}
									</Typography>
								}
							/>
						</Stack>
					</Stack>
				)}

				{stage === "preparing" && (
					<Stack alignItems="center" spacing={2} sx={{ py: 4 }}>
						<CircularProgress />
						<Typography>
							{t("components.InstallRequest.preparing", "正在准备安装…")}
						</Typography>
					</Stack>
				)}
			</DialogContent>
			<DialogActions>
				{stage === "confirm" && (
					<>
						<Button onClick={resetDialog}>{t("common.cancel", "取消")}</Button>
						<Button
							variant="contained"
							disabled={!installPath.trim()}
							onClick={() => void prepareInstall()}
						>
							{t("components.InstallRequest.confirm", "确认安装")}
						</Button>
					</>
				)}
			</DialogActions>
		</Dialog>
	);
}
