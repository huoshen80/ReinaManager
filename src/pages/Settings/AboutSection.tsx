import BugReportIcon from "@mui/icons-material/BugReport";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import UpdateIcon from "@mui/icons-material/Update";
import GitHubIcon from "@mui/icons-material/GitHub";
import {
	Box,
	Button,
	CircularProgress,
	Link,
	Stack,
	Typography,
} from "@mui/material";
import pkg from "@pkg";
import { open as openurl } from "@tauri-apps/plugin-shell";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "@/store/appStore";
import { checkForUpdates } from "@/services/plugins/updateService";
import { snackbar } from "@/providers/snackBar";
import { getUserErrorMessage } from "@/utils/errors";

/**
 * 关于应用设置组件
 */
export const AboutSection = () => {
	const { t } = useTranslation();
	const triggerUpdateModal = useStore((s) => s.triggerUpdateModal);
	const [checking, setChecking] = useState(false);

	const handleCheckUpdate = async () => {
		setChecking(true);
		try {
			await checkForUpdates({
				onUpdateFound: (update) => triggerUpdateModal(update),
				onNoUpdate: () => snackbar.info(t("pages.Settings.about.noUpdate", "当前已是最新版本")),
				onError: (err) => snackbar.error(getUserErrorMessage(err, t)),
			});
		} finally { setChecking(false); }
	};

	return (
		<Box className="mt-8 p-8 bg-black/5 rounded-3xl text-center">
			<Typography variant="h5" className="font-bold mb-1">ReinaManager</Typography>
			<Typography variant="body2" color="text.secondary" className="mb-6">
				v{pkg.version} - {t("pages.Settings.about.tagline", "一款优雅的 Galgame 资源管理器")}
			</Typography>

			<Stack direction="row" spacing={3} justifyContent="center" className="mb-8">
				<Button
					variant="contained"
					startIcon={checking ? <CircularProgress size={16} color="inherit" /> : <UpdateIcon />}
					onClick={handleCheckUpdate}
					disabled={checking}
					className="rounded-full px-6"
				>
					{t("pages.Settings.about.checkUpdate", "检查更新")}
				</Button>
				<Button
					variant="outlined"
					startIcon={<GitHubIcon />}
					onClick={() => openurl("https://github.com/huoshen80/ReinaManager")}
					className="rounded-full px-6"
				>
					GitHub
				</Button>
			</Stack>

			<Stack direction="row" spacing={4} justifyContent="center">
				<Link
					component="button"
					variant="caption"
					onClick={() => openurl("https://reina.huoshen80.top")}
					sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', textDecoration: 'none' }}
				>
					<MenuBookIcon sx={{ fontSize: 16 }} /> {t("pages.Settings.about.docs", "使用文档")}
				</Link>
				<Link
					component="button"
					variant="caption"
					onClick={() => openurl("https://github.com/huoshen80/ReinaManager/issues")}
					sx={{ display: 'flex', alignItems: 'center', gap: 0.5, color: 'text.secondary', textDecoration: 'none' }}
				>
					<BugReportIcon sx={{ fontSize: 16 }} /> {t("pages.Settings.about.feedback", "问题反馈")}
				</Link>
			</Stack>
		</Box>
	);
};
