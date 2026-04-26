import BugReportIcon from "@mui/icons-material/BugReport";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import UpdateIcon from "@mui/icons-material/Update";
import { CircularProgress, Link, Typography } from "@mui/material";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import pkg from "@pkg";
import { open as openurl } from "@tauri-apps/plugin-shell";
import type React from "react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { checkForUpdates } from "@/services/plugins/updateService";
import { useStore } from "@/store/appStore";
import { getUserErrorMessage } from "@/utils/errors";

export const AboutSection: React.FC = () => {
	const { t } = useTranslation();
	const triggerUpdateModal = useStore((s) => s.triggerUpdateModal);
	const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
	const [updateStatus, setUpdateStatus] = useState<string>("");
	const [isUpdateStatusError, setIsUpdateStatusError] = useState(false);

	const handleCheckUpdate = async () => {
		setIsCheckingUpdate(true);
		setUpdateStatus("");
		setIsUpdateStatusError(false);

		try {
			await checkForUpdates({
				onUpdateFound: (update) => {
					setUpdateStatus(
						t("pages.Settings.about.updateFound", "发现新版本：{{version}}", {
							version: update.version,
						}),
					);
					setIsUpdateStatusError(false);
					// 触发全局更新窗口显示
					triggerUpdateModal(update);
				},
				onNoUpdate: () => {
					setUpdateStatus(
						t("pages.Settings.about.noUpdate", "当前已是最新版本"),
					);
					setIsUpdateStatusError(false);
				},
				onError: (error) => {
					setUpdateStatus(
						t("pages.Settings.about.checkFailed", "检查更新失败：{{error}}", {
							error: getUserErrorMessage(error, t),
						}),
					);
					setIsUpdateStatusError(true);
				},
			});
		} catch (error) {
			setUpdateStatus(
				t("pages.Settings.about.checkFailed", "检查更新失败：{{error}}", {
					error: getUserErrorMessage(error, t),
				}),
			);
			setIsUpdateStatusError(true);
		} finally {
			setIsCheckingUpdate(false);
		}
	};

	const openGitHub = () => {
		openurl("https://github.com/huoshen80/ReinaManager");
	};

	const openBlog = () => {
		openurl("https://huoshen80.top");
	};

	return (
		<Box className="space-y-3">
			{/* 版本信息和更新按钮 */}
			<Stack direction="row" alignItems="center" spacing={2}>
				<Typography variant="body2">
					<strong>{t("pages.Settings.about.version", "版本")}: </strong>v
					{pkg.version}
				</Typography>
				<Button
					variant="outlined"
					startIcon={
						isCheckingUpdate ? (
							<CircularProgress size={16} color="inherit" />
						) : (
							<UpdateIcon />
						)
					}
					onClick={handleCheckUpdate}
					disabled={isCheckingUpdate}
					size="small"
				>
					{isCheckingUpdate
						? t("pages.Settings.about.checking", "检查中...")
						: t("pages.Settings.about.checkUpdate", "检查更新")}
				</Button>
			</Stack>
			{/* 更新状态显示 */}
			{updateStatus && (
				<Typography
					variant="body2"
					color={isUpdateStatusError ? "error" : "primary"}
				>
					{updateStatus}
				</Typography>
			)}
			{/* 作者信息 */}
			<Typography variant="body2">
				<strong>{t("pages.Settings.about.author", "作者")}: </strong>
				huoshen80
			</Typography>{" "}
			{/* 使用文档和问题反馈 */}
			{/* 项目链接 */}
			<Typography variant="body2">
				<strong>{t("pages.Settings.about.github", "项目地址")}: </strong>
				<Link
					component="button"
					variant="body2"
					onClick={openGitHub}
					sx={{ textDecoration: "none" }}
				>
					https://github.com/huoshen80/ReinaManager
				</Link>
			</Typography>
			{/* 作者博客链接 */}
			<Typography variant="body2">
				<strong>{t("pages.Settings.about.blog", "作者博客")}: </strong>
				<Link
					component="button"
					variant="body2"
					onClick={openBlog}
					sx={{ textDecoration: "none" }}
				>
					https://huoshen80.top
				</Link>
			</Typography>
			{/* 使用文档和问题反馈 */}
			<Stack direction="row" spacing={2} flexWrap="wrap">
				<Button
					variant="outlined"
					startIcon={<MenuBookIcon />}
					onClick={() => openurl("https://reina.huoshen80.top")}
					size="small"
				>
					{t("pages.Settings.about.docs", "使用文档")}
				</Button>
				<Button
					variant="outlined"
					color="secondary"
					startIcon={<BugReportIcon />}
					onClick={() =>
						openurl(
							"https://github.com/huoshen80/ReinaManager/issues/new/choose",
						)
					}
					size="small"
				>
					{t("pages.Settings.about.feedback", "问题反馈")}
				</Button>
			</Stack>
		</Box>
	);
};
