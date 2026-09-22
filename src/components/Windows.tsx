import DownloadIcon from "@mui/icons-material/Download";
import UpdateIcon from "@mui/icons-material/Update";
import {
	Alert,
	Box,
	Button,
	Checkbox,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControlLabel,
	LinearProgress,
	Stack,
	Typography,
} from "@mui/material";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import type { Update } from "@tauri-apps/plugin-updater";
import parse, { domToReact, Element } from "html-react-parser";
import { marked } from "marked";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { useProxyImageUrlResolver } from "@/hooks/common/useProxyImageUrlResolver";
import { destroyCurrentWindow } from "@/services/appExit";
import { fileService } from "@/services/invoke";
import {
	downloadUpdate,
	installDownloadedUpdate,
	silentCheckForUpdates,
	type UpdateProgress,
} from "@/services/plugins/updateService";
import { useStore } from "@/store/appStore";
import { getUserErrorMessage } from "@/utils/errors";

// 配置 marked 支持 GFM 和换行
marked.setOptions({
	breaks: true,
	gfm: true,
});

/**
 * UpdateModal 更新确认弹窗组件
 */
interface UpdateModalProps {
	open: boolean;
	onClose: () => void;
	update: Update | null;
}

type UpdatePhase = "idle" | "downloading" | "downloaded" | "installing";
const releasedUpdates = new WeakSet<Update>();

const releaseUpdate = async (update: Update): Promise<void> => {
	if (releasedUpdates.has(update)) {
		return;
	}

	releasedUpdates.add(update);
	try {
		await update.close();
	} catch (error) {
		releasedUpdates.delete(update);
		console.error("Failed to release updater resources:", error);
	}
};

const UpdateModal: React.FC<UpdateModalProps> = ({ open, onClose, update }) => {
	const { t } = useTranslation();
	const resolveImageUrl = useProxyImageUrlResolver();
	const [phase, setPhase] = useState<UpdatePhase>("idle");
	const [progress, setProgress] = useState<UpdateProgress | null>(null);
	const [downloadError, setDownloadError] = useState<string>("");
	const [isPortable, setIsPortable] = useState(false);
	const isBusy = phase === "downloading" || phase === "installing";

	useEffect(() => {
		if (open) {
			fileService.isPortableMode().then((res) => {
				setIsPortable(res.is_portable);
			});
		}
	}, [open]);

	useEffect(() => {
		return () => {
			if (update) {
				void releaseUpdate(update);
			}
		};
	}, [update]);

	const handleManualUpdate = async () => {
		try {
			await openUrl("https://github.com/huoshen80/ReinaManager/releases");
		} catch (error) {
			console.error("Failed to open manual update link:", error);
		}
	};

	// 使用 marked 渲染 Markdown 内容，并处理链接点击
	const renderedBody = useMemo(() => {
		if (!update?.body) return null;

		// 使用 marked 将 Markdown 转为 HTML（支持 details 内的 Markdown）
		const htmlContent = marked.parse(update.body) as string;

		// 使用 html-react-parser 将 HTML 转为 React 元素，并自定义链接行为
		return parse(htmlContent, {
			replace(domNode) {
				if (
					domNode instanceof Element &&
					domNode.type === "tag" &&
					domNode.name === "img" &&
					domNode.attribs?.src
				) {
					domNode.attribs.src =
						resolveImageUrl(domNode.attribs.src) ?? domNode.attribs.src;
					return domNode;
				}

				// 只处理 <a> 标签
				if (
					domNode instanceof Element &&
					domNode.type === "tag" &&
					domNode.name === "a"
				) {
					const href = domNode.attribs?.href;
					return (
						<a
							href={href}
							onClick={async (e) => {
								e.preventDefault();
								if (href) {
									try {
										await openUrl(href);
									} catch (error) {
										console.error("Failed to open link:", error);
									}
								}
							}}
							style={{
								color: "#1976d2",
								textDecoration: "underline",
								cursor: "pointer",
							}}
						>
							{domToReact(domNode.children as never)}
						</a>
					);
				}
				return domNode;
			},
		});
	}, [resolveImageUrl, update?.body]);

	const handleUpdate = async () => {
		if (!update) return;

		setDownloadError("");

		try {
			if (phase !== "downloaded") {
				setPhase("downloading");
				setProgress(null);
				await downloadUpdate(update, {
					onProgress: (progress) => {
						setProgress(progress);
					},
				});
				setPhase("downloaded");
			}

			setPhase("installing");
			const result = await installDownloadedUpdate(update);
			if (result === "cancelled") {
				setPhase("downloaded");
			}
		} catch (error) {
			setDownloadError(getUserErrorMessage(error, t));
			setPhase((currentPhase) =>
				currentPhase === "downloading" ? "idle" : "downloaded",
			);
		}
	};

	const handleCancel = async () => {
		if (isBusy || !update) return;

		try {
			await releaseUpdate(update);
		} finally {
			setPhase("idle");
			setProgress(null);
			setDownloadError("");
			onClose();
		}
	};

	if (!update) return null;

	return (
		<Dialog
			open={open}
			onClose={() => void handleCancel()}
			maxWidth="sm"
			fullWidth
			disableEscapeKeyDown={isBusy}
		>
			<DialogTitle>
				<Stack direction="row" alignItems="center" spacing={1}>
					<UpdateIcon color="primary" />
					<Typography variant="h6">
						{t("components.Window.UpdateModal.title", "发现新版本")}
					</Typography>
				</Stack>
			</DialogTitle>

			<DialogContent>
				<Box className="space-y-4">
					{isPortable && (
						<Alert severity="warning">
							{t(
								"components.Window.UpdateModal.portableWarning",
								"您正在使用便携版，自动更新可能无法工作。建议点击“手动更新”下载最新版本的压缩包进行替换（需要完整覆盖）。",
							)}
						</Alert>
					)}

					{/* 版本信息 */}
					<Box>
						<Typography variant="body2" color="text.secondary" gutterBottom>
							{t("components.Window.UpdateModal.newVersion", "新版本")}
						</Typography>
						<Chip
							label={`v${update.version}`}
							color="primary"
							variant="outlined"
							size="small"
						/>
					</Box>

					{/* 更新日期 */}
					{update.date && (
						<Box>
							<Typography variant="body2" color="text.secondary" gutterBottom>
								{t("components.Window.UpdateModal.releaseDate", "发布日期")}
							</Typography>
							<Typography variant="body2">
								{new Date(update.date as string).toLocaleDateString()}
							</Typography>
						</Box>
					)}

					{/* 更新说明 */}
					{update.body && (
						<Box>
							<Typography variant="body2" color="text.secondary" gutterBottom>
								{t("components.Window.UpdateModal.changelog", "更新说明")}
							</Typography>
							<Box
								sx={{
									p: 2,
									borderRadius: 1,
									overflow: "auto",
									border: "1px solid",
									borderColor: "divider",
								}}
							>
								{renderedBody}
							</Box>
						</Box>
					)}

					{/* 下载进度 */}
					{phase === "downloading" && (
						<Box>
							<Typography variant="body2" color="text.secondary" gutterBottom>
								{t(
									"components.Window.UpdateModal.downloading",
									"正在下载更新...",
								)}
							</Typography>
							{progress && (
								<Box>
									<LinearProgress
										variant="determinate"
										value={progress.percentage}
										sx={{ mb: 1 }}
									/>
									<Typography variant="caption" color="text.secondary">
										{progress.percentage}% (
										{Math.round(progress.downloaded / 1024 / 1024)}MB /{" "}
										{Math.round(progress.contentLength / 1024 / 1024)}MB)
									</Typography>
								</Box>
							)}
							{!progress && <LinearProgress sx={{ mb: 1 }} />}
						</Box>
					)}

					{phase === "downloaded" && (
						<Alert severity="info">
							{t(
								"components.Window.UpdateModal.downloaded",
								"更新已下载，可以安装并重启应用。",
							)}
						</Alert>
					)}

					{phase === "installing" && (
						<Alert severity="info">
							{t(
								"components.Window.UpdateModal.installing",
								"正在安装更新并准备重启...",
							)}
						</Alert>
					)}

					{/* 错误信息 */}
					{downloadError && (
						<Box>
							<Typography variant="body2" color="error">
								{downloadError}
							</Typography>
						</Box>
					)}
				</Box>
			</DialogContent>

			<DialogActions>
				<Button
					onClick={async () => {
						useStore.getState().setSkippedUpdateVersion(update.version);
						await handleCancel();
					}}
					disabled={isBusy}
					color="inherit"
					sx={{ mr: "auto" }}
				>
					{t("components.Window.UpdateModal.skipVersion", "跳过此版本")}
				</Button>
				<Button
					onClick={() => void handleCancel()}
					disabled={isBusy}
					color="inherit"
				>
					{t("components.Window.UpdateModal.cancel", "取消")}
				</Button>
				<Button
					onClick={() => void handleUpdate()}
					disabled={isBusy}
					variant="contained"
					startIcon={
						phase === "downloading" ? <DownloadIcon /> : <UpdateIcon />
					}
				>
					{phase === "downloading"
						? t("components.Window.UpdateModal.downloading", "正在下载更新...")
						: phase === "installing"
							? t(
									"components.Window.UpdateModal.installing",
									"正在安装更新并准备重启...",
								)
							: phase === "downloaded"
								? t(
										"components.Window.UpdateModal.installAndRestart",
										"安装并重启",
									)
								: t("components.Window.UpdateModal.update", "立即更新")}
				</Button>
				<Button
					onClick={handleManualUpdate}
					disabled={isBusy}
					variant="outlined"
					color="primary"
				>
					{t("components.Window.UpdateModal.manualUpdate", "手动更新")}
				</Button>
			</DialogActions>
		</Dialog>
	);
};

const WindowsHandler: React.FC = () => {
	const {
		showUpdateModal,
		pendingUpdate,
		skipCloseRemind,
		setDefaultCloseAction,
		setSkipCloseRemind,
		setShowUpdateModal,
		setPendingUpdate,
	} = useStore(
		useShallow((s) => ({
			showUpdateModal: s.showUpdateModal,
			pendingUpdate: s.pendingUpdate,
			skipCloseRemind: s.skipCloseRemind,
			setDefaultCloseAction: s.setDefaultCloseAction,
			setSkipCloseRemind: s.setSkipCloseRemind,
			setShowUpdateModal: s.setShowUpdateModal,
			setPendingUpdate: s.setPendingUpdate,
		})),
	);
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const w = getCurrentWindow();
		let unlisten = () => {};
		// 拦截关闭
		// onCloseRequested API provides preventDefault
		w.onCloseRequested(async (event) => {
			// prevent default close behavior when necessary
			event.preventDefault();
			// 获取最新的状态值，避免闭包陷阱
			const currentSkipRemind = useStore.getState().skipCloseRemind;
			const currentDefaultAction = useStore.getState().defaultCloseAction;

			if (currentSkipRemind) {
				if (currentDefaultAction === "hide") {
					w.hide();
				} else {
					await destroyCurrentWindow();
				}
			} else {
				setOpen(true);
			}
		}).then((fn) => {
			unlisten = fn;
		});
		return () => {
			unlisten();
		};
	}, []); // 移除依赖项，避免重复注册监听器

	// 应用启动时静默检查更新
	useEffect(() => {
		const performSilentUpdateCheck = async () => {
			const update = await silentCheckForUpdates();
			if (update) {
				const skippedVersion = useStore.getState().skippedUpdateVersion;
				if (update.version === skippedVersion) {
					await update.close();
					return;
				}
				useStore.getState().setPendingUpdate(update);
				useStore.getState().setShowUpdateModal(true);
			}
		};

		performSilentUpdateCheck();
	}, []);

	const handleCancel = () => {
		setSkipCloseRemind(false);
		setOpen(false);
	};
	const handleHide = () => {
		setDefaultCloseAction("hide");
		setOpen(false);
		getCurrentWindow().hide();
	};
	const handleClose = async () => {
		setDefaultCloseAction("close");
		setOpen(false);
		await destroyCurrentWindow();
	};

	return (
		<>
			<Dialog open={open} onClose={handleCancel}>
				<DialogTitle>
					{t("components.Window.closeDialog.title", "关闭应用")}
				</DialogTitle>
				<DialogContent>
					<Typography variant="body1" sx={{ mb: 2 }}>
						{t(
							"components.Window.closeDialog.message",
							"请选择操作：直接退出 或 最小化到托盘？",
						)}
					</Typography>
					<FormControlLabel
						control={
							<Checkbox
								checked={skipCloseRemind}
								onChange={(e) => {
									setSkipCloseRemind(e.target.checked);
								}}
								color="primary"
							/>
						}
						label={t("components.Window.closeDialog.dontRemind", "不再提醒")}
					/>
				</DialogContent>
				<DialogActions>
					<Button onClick={handleHide}>
						{t("components.Window.closeDialog.minimizeToTray", "最小化到托盘")}
					</Button>
					<Button onClick={() => handleClose()} color="primary">
						{t("components.Window.closeDialog.exitApp", "退出应用")}
					</Button>
				</DialogActions>
			</Dialog>

			{/* 更新确认弹窗 */}
			<UpdateModal
				key={pendingUpdate?.version ?? "no-update"}
				open={showUpdateModal}
				onClose={() => {
					setShowUpdateModal(false);
					setPendingUpdate(null);
				}}
				update={pendingUpdate}
			/>
		</>
	);
};

export default WindowsHandler;
