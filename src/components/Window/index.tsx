import DownloadIcon from "@mui/icons-material/Download";
import UpdateIcon from "@mui/icons-material/Update";
import {
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
import {
	checkForUpdates,
	downloadAndInstallUpdate,
	silentCheckForUpdates,
	type UpdateProgress,
} from "@/components/Update";
import { useStore } from "@/store";

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

const UpdateModal: React.FC<UpdateModalProps> = ({ open, onClose, update }) => {
	const { t } = useTranslation();
	const [isDownloading, setIsDownloading] = useState(false);
	const [progress, setProgress] = useState<UpdateProgress | null>(null);
	const [downloadError, setDownloadError] = useState<string>("");

	// 使用 marked 渲染 Markdown 内容，并处理链接点击
	const renderedBody = useMemo(() => {
		if (!update?.body) return null;

		// 使用 marked 将 Markdown 转为 HTML（支持 details 内的 Markdown）
		const htmlContent = marked.parse(update.body) as string;

		// 使用 html-react-parser 将 HTML 转为 React 元素，并自定义链接行为
		return parse(htmlContent, {
			replace(domNode) {
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
	}, [update?.body]);

	const handleUpdate = async () => {
		if (!update) return;

		setIsDownloading(true);
		setDownloadError("");
		setProgress(null);

		try {
			await downloadAndInstallUpdate(update, {
				onProgress: (progress) => {
					setProgress(progress);
				},
				onDownloadComplete: () => {
					// 下载完成，应用即将重启
				},
				onError: (error) => {
					setDownloadError(error);
					setIsDownloading(false);
				},
			});
		} catch (error) {
			setDownloadError(error instanceof Error ? error.message : "更新失败");
			setIsDownloading(false);
		}
	};

	const handleCancel = () => {
		if (!isDownloading) {
			onClose();
		}
	};

	if (!update) return null;

	return (
		<Dialog
			open={open}
			onClose={handleCancel}
			maxWidth="sm"
			fullWidth
			disableEscapeKeyDown={isDownloading}
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
					{isDownloading && (
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
				<Button onClick={handleCancel} disabled={isDownloading} color="inherit">
					{t("components.Window.UpdateModal.cancel", "取消")}
				</Button>
				<Button
					onClick={handleUpdate}
					disabled={isDownloading}
					variant="contained"
					startIcon={isDownloading ? <DownloadIcon /> : <UpdateIcon />}
				>
					{isDownloading
						? t("components.Window.UpdateModal.downloading", "下载中...")
						: t("components.Window.UpdateModal.update", "立即更新")}
				</Button>
			</DialogActions>
		</Dialog>
	);
};

const WindowsHandler: React.FC = () => {
	const {
		showUpdateModal,
		pendingUpdate,
		setDefaultCloseAction,
		setSkipCloseRemind,
		setShowUpdateModal,
		setPendingUpdate,
	} = useStore(
		useShallow((s) => ({
			showUpdateModal: s.showUpdateModal,
			pendingUpdate: s.pendingUpdate,
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
					w.destroy();
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
			try {
				const result = await silentCheckForUpdates();
				if (result.hasUpdate) {
					// 静默检查到更新，但不立即显示，等用户空闲时提醒
					setTimeout(() => {
						// 再次检查更新以获取增强的Update对象
						checkForUpdates({
							onUpdateFound: (update) => {
								useStore.getState().setPendingUpdate(update);
								useStore.getState().setShowUpdateModal(true);
							},
							onNoUpdate: () => {
								// 静默忽略
							},
							onError: () => {
								// 静默忽略错误
							},
						});
					}, 5000); // 5秒后显示更新提醒
				}
			} catch (error) {
				console.error("检查更新失败", error);
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
	const handleClose = () => {
		setDefaultCloseAction("close");
		setOpen(false);
		getCurrentWindow().destroy();
	};

	return (
		<>
			<Dialog open={open} onClose={handleCancel}>
				<DialogTitle>{t("components.Window.closeDialog.title")}</DialogTitle>
				<DialogContent>
					<Typography variant="body1" sx={{ mb: 2 }}>
						{t("components.Window.closeDialog.message")}
					</Typography>
					<FormControlLabel
						control={
							<Checkbox
								checked={useStore.getState().skipCloseRemind}
								onChange={(e) => {
									setSkipCloseRemind(e.target.checked);
								}}
								color="primary"
							/>
						}
						label={t("components.Window.closeDialog.dontRemind")}
					/>
				</DialogContent>
				<DialogActions>
					<Button onClick={handleHide}>
						{t("components.Window.closeDialog.minimizeToTray")}
					</Button>
					<Button onClick={handleClose} color="primary">
						{t("components.Window.closeDialog.exitApp")}
					</Button>
				</DialogActions>
			</Dialog>

			{/* 更新确认弹窗 */}
			<UpdateModal
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
