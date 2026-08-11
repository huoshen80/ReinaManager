import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import PauseRoundedIcon from "@mui/icons-material/PauseRounded";
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import ReplayRoundedIcon from "@mui/icons-material/ReplayRounded";
import {
	Alert,
	Box,
	Button,
	ButtonBase,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	IconButton,
	LinearProgress,
	Paper,
	Stack,
	Tooltip,
	Typography,
} from "@mui/material";
import { type ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import {
	type TaskAction,
	useTaskActions,
	useTasks,
} from "@/hooks/queries/useTasks";
import { snackbar } from "@/providers/snackBar";
import {
	fileService,
	isGameInstallTask,
	type Task,
	type TaskStatus,
} from "@/services/invoke";
import { formatDateLabel, getLocalDateString } from "@/utils/dateTime";
import { getUserErrorMessage } from "@/utils/errors";
import { formatFileSize } from "@/utils/fileSize";
import { getTaskStateLabel } from "@/utils/task";

interface TaskManagerDialogProps {
	open: boolean;
	onClose: () => void;
}

interface TaskGroup {
	date: string;
	tasks: Task[];
}

interface TaskIconButtonProps {
	label: string;
	disabled: boolean;
	color?: "default" | "primary" | "error";
	onClick: () => void;
	children: ReactNode;
}

const deletableStatuses = new Set<TaskStatus>([
	"failed",
	"completed",
	"cancelled",
]);
const retryableStatuses = new Set<TaskStatus>(["failed", "cancelled"]);

function canPauseTask(task: Task) {
	return (
		isGameInstallTask(task) &&
		task.status === "running" &&
		task.stage === "downloading"
	);
}

function canResumeTask(task: Task) {
	return (
		isGameInstallTask(task) &&
		task.status === "paused" &&
		task.stage === "downloading"
	);
}

function canCancelTask(task: Task) {
	if (!isGameInstallTask(task)) return false;
	return (
		task.status === "pending" ||
		task.status === "paused" ||
		(task.status === "running" && task.stage !== "importing_game")
	);
}

function canRetryTask(task: Task) {
	return isGameInstallTask(task) && retryableStatuses.has(task.status);
}

function canDeleteTask(task: Task) {
	return deletableStatuses.has(task.status);
}

function groupTasksByDate(tasks: Task[]): TaskGroup[] {
	const groups: TaskGroup[] = [];
	for (const task of tasks) {
		const date = getLocalDateString(task.created_at);
		const latest = groups.at(-1);
		if (latest?.date === date) {
			latest.tasks.push(task);
		} else {
			groups.push({ date, tasks: [task] });
		}
	}
	return groups;
}

function getStatusColor(status: TaskStatus) {
	switch (status) {
		case "completed":
			return "success" as const;
		case "failed":
			return "error" as const;
		case "paused":
			return "warning" as const;
		case "running":
			return "primary" as const;
		default:
			return "default" as const;
	}
}

function TaskIconButton({
	label,
	disabled,
	color = "default",
	onClick,
	children,
}: TaskIconButtonProps) {
	return (
		<Tooltip title={label}>
			<span>
				<IconButton
					size="small"
					aria-label={label}
					color={color}
					disabled={disabled}
					onClick={onClick}
				>
					{children}
				</IconButton>
			</span>
		</Tooltip>
	);
}

function TaskProgress({ task }: { task: Task }) {
	const total = task.progress_total;
	const progress = total
		? Math.min(100, Math.max(0, (task.progress_current / total) * 100))
		: 0;
	const speed =
		task.status === "running" &&
		task.stage === "downloading" &&
		task.bytes_per_second
			? ` · ${formatFileSize(task.bytes_per_second)}/s`
			: "";
	const color =
		task.status === "failed"
			? "error"
			: task.status === "paused"
				? "warning"
				: "primary";

	return (
		<Box>
			<LinearProgress
				variant={total ? "determinate" : "indeterminate"}
				value={progress}
				color={color}
				sx={{
					height: 6,
					borderRadius: 999,
					"& .MuiLinearProgress-bar": {
						transition: "transform 500ms ease",
					},
				}}
			/>
			<Stack direction="row" justifyContent="space-between" className="mt-1">
				<Typography variant="caption" color="text.secondary">
					{task.progress_unit === "bytes" && total
						? `${formatFileSize(task.progress_current)} / ${formatFileSize(total)}${speed}`
						: `${task.progress_current}${total ? ` / ${total}` : ""}${
								task.progress_unit ? ` ${task.progress_unit}` : ""
							}`}
				</Typography>
				{total ? (
					<Typography variant="caption" color="text.secondary">
						{progress.toFixed(1)}%
					</Typography>
				) : null}
			</Stack>
		</Box>
	);
}

export function TaskManagerDialog({ open, onClose }: TaskManagerDialogProps) {
	const { i18n, t } = useTranslation();
	const navigate = useNavigate();
	const [pendingTaskId, setPendingTaskId] = useState<number | null>(null);
	const tasksQuery = useTasks({ enabled: open, pollActive: true });
	const taskActionMutation = useTaskActions();

	const runTaskAction = async (task: Task, action: TaskAction) => {
		setPendingTaskId(task.id);
		try {
			await taskActionMutation.mutateAsync({ taskId: task.id, action });
		} finally {
			setPendingTaskId(null);
		}
	};

	const handleTaskAction = (task: Task, action: TaskAction) => {
		void runTaskAction(task, action).catch((error) => {
			snackbar.error(getUserErrorMessage(error, t));
		});
	};

	const handleOpenFolder = (path: string) => {
		void fileService.openDirectory(path).catch((error) => {
			snackbar.error(getUserErrorMessage(error, t));
		});
	};

	const tasks = tasksQuery.data ?? [];
	const groups = groupTasksByDate(tasks);
	const getDateLabel = (date: string) =>
		formatDateLabel(date, {
			language: i18n.language,
			todayLabel: t("common.today", "今天"),
			yesterdayLabel: t("common.yesterday", "昨天"),
		});

	return (
		<Dialog
			open={open}
			onClose={onClose}
			fullWidth
			maxWidth="md"
			PaperProps={{
				sx: { maxHeight: "80vh" },
			}}
		>
			<DialogTitle>{t("components.TaskManager.title", "下载任务")}</DialogTitle>
			<DialogContent dividers sx={{ bgcolor: "background.default" }}>
				{tasksQuery.isPending ? (
					<Box className="flex justify-center py-8">
						<CircularProgress />
					</Box>
				) : tasksQuery.isError ? (
					<Alert severity="error">
						{getUserErrorMessage(tasksQuery.error, t)}
					</Alert>
				) : groups.length === 0 ? (
					<Typography color="text.secondary" className="py-8 text-center">
						{t("components.TaskManager.empty", "暂无下载任务")}
					</Typography>
				) : (
					<Stack spacing={2.5}>
						{groups.map((group) => (
							<Box key={group.date}>
								<Typography
									variant="body2"
									fontWeight={700}
									color="text.secondary"
									className="mb-2"
								>
									{getDateLabel(group.date)}
								</Typography>
								<Stack spacing={1.25}>
									{group.tasks.map((task) => {
										const gameInstallTask = isGameInstallTask(task)
											? task
											: null;
										const installResult = gameInstallTask?.result_json;
										const gameId =
											task.status === "completed"
												? installResult?.game_id
												: null;
										const isExpired = task.error_code === "url_expired";
										const isPending = pendingTaskId === task.id;

										return (
											<Paper
												key={task.id}
												variant="outlined"
												className="rounded-xl p-4"
											>
												<Stack spacing={1.5}>
													<Stack
														direction="row"
														alignItems="flex-start"
														justifyContent="space-between"
														spacing={2}
													>
														<Box className="min-w-0 flex-1">
															{gameId ? (
																<ButtonBase
																	className="max-w-full justify-start rounded-md text-left"
																	onClick={() => {
																		navigate(`/libraries/${gameId}`);
																		onClose();
																	}}
																>
																	<Typography
																		fontWeight={700}
																		color="primary"
																		noWrap
																		title={task.title}
																	>
																		{task.title}
																	</Typography>
																</ButtonBase>
															) : (
																<Typography
																	fontWeight={700}
																	noWrap
																	title={task.title}
																>
																	{task.title}
																</Typography>
															)}
															<Typography
																variant="caption"
																color="text.secondary"
																className="block truncate"
															>
																{gameInstallTask
																	? t(
																			"components.TaskManager.gameInstallSource",
																			"游戏安装 · {{provider}} · {{size}}",
																			{
																				provider:
																					gameInstallTask.payload_json.provider,
																				size: formatFileSize(
																					gameInstallTask.payload_json.size,
																				),
																			},
																		)
																	: task.task_type}
															</Typography>
															{task.status === "completed" &&
															installResult?.install_path ? (
																<Typography
																	variant="caption"
																	color="text.secondary"
																	className="block truncate"
																	title={installResult.install_path}
																>
																	{t(
																		"components.TaskManager.installPath",
																		"安装路径：{{path}}",
																		{ path: installResult.install_path },
																	)}
																</Typography>
															) : null}
														</Box>
														<Stack
															direction="row"
															alignItems="center"
															spacing={1}
														>
															<Chip
																size="small"
																color={getStatusColor(task.status)}
																label={getTaskStateLabel(
																	task.status,
																	task.stage,
																	t,
																)}
															/>
															<Stack
																direction="row"
																alignItems="center"
																spacing={0.5}
															>
																{canPauseTask(task) ? (
																	<TaskIconButton
																		label={t(
																			"components.TaskManager.pause",
																			"暂停",
																		)}
																		disabled={isPending}
																		onClick={() =>
																			handleTaskAction(task, "pause")
																		}
																	>
																		<PauseRoundedIcon fontSize="small" />
																	</TaskIconButton>
																) : null}
																{canResumeTask(task) ? (
																	<TaskIconButton
																		label={t(
																			"components.TaskManager.resume",
																			"继续",
																		)}
																		color="primary"
																		disabled={isPending}
																		onClick={() =>
																			handleTaskAction(task, "resume")
																		}
																	>
																		<PlayArrowRoundedIcon fontSize="small" />
																	</TaskIconButton>
																) : null}
																{canRetryTask(task) && !isExpired ? (
																	<TaskIconButton
																		label={t(
																			"components.TaskManager.retry",
																			"重试",
																		)}
																		color="primary"
																		disabled={isPending}
																		onClick={() =>
																			handleTaskAction(task, "retry")
																		}
																	>
																		<ReplayRoundedIcon fontSize="small" />
																	</TaskIconButton>
																) : null}
																{installResult?.install_path ? (
																	<TaskIconButton
																		label={t(
																			"components.TaskManager.openFolder",
																			"打开文件夹",
																		)}
																		disabled={isPending}
																		onClick={() =>
																			handleOpenFolder(
																				installResult.install_path,
																			)
																		}
																	>
																		<FolderOpenRoundedIcon fontSize="small" />
																	</TaskIconButton>
																) : null}
																{canCancelTask(task) ? (
																	<TaskIconButton
																		label={t(
																			"components.TaskManager.cancel",
																			"取消任务",
																		)}
																		color="error"
																		disabled={isPending}
																		onClick={() =>
																			handleTaskAction(task, "cancel")
																		}
																	>
																		<CloseRoundedIcon fontSize="small" />
																	</TaskIconButton>
																) : null}
																{canDeleteTask(task) ? (
																	<TaskIconButton
																		label={t(
																			"components.TaskManager.delete",
																			"删除任务",
																		)}
																		color="error"
																		disabled={isPending}
																		onClick={() =>
																			handleTaskAction(task, "delete")
																		}
																	>
																		<DeleteOutlineRoundedIcon fontSize="small" />
																	</TaskIconButton>
																) : null}
															</Stack>
														</Stack>
													</Stack>

													{task.status !== "completed" ? (
														<TaskProgress task={task} />
													) : null}

													{task.error_message ? (
														<Alert severity={isExpired ? "warning" : "error"}>
															{task.error_message}
														</Alert>
													) : null}
												</Stack>
											</Paper>
										);
									})}
								</Stack>
							</Box>
						))}
					</Stack>
				)}
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>
					{t("components.TaskManager.close", "关闭")}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
