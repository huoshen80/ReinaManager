import {
	Box,
	Button,
	CircularProgress,
	InputLabel,
	Radio,
	RadioGroup,
	FormControlLabel,
	Stack,
} from "@mui/material";
import BackupIcon from "@mui/icons-material/Backup";
import RestoreIcon from "@mui/icons-material/Restore";
import { relaunch } from "@tauri-apps/plugin-process";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { backupDatabase, importDatabase } from "@/utils/database";
import { snackbar } from "@/providers/snackBar";
import { useStore } from "@/store/appStore";

/**
 * 数据库备份与恢复组件
 */
export const DatabaseBackupSettings = () => {
	const { t } = useTranslation();
	const [loading, setLoading] = useState(false);

	const handleBackup = async () => {
		setLoading(true);
		try {
			const res = await backupDatabase();
			if (res.success) snackbar.success(t("pages.Settings.databaseBackup.backupSuccess"));
		} finally { setLoading(false); }
	};

	const handleRestore = async () => {
		const res = await importDatabase();
		if (res?.success) {
			snackbar.success(t("pages.Settings.databaseBackup.importSuccess"));
			setTimeout(relaunch, 2000);
		}
	};

	return (
		<Box className="mb-6">
			<Stack direction="row" spacing={2} alignItems="center">
				<Button variant="contained" onClick={handleBackup} disabled={loading} startIcon={loading ? <CircularProgress size={16} /> : <BackupIcon />}>
					{t("pages.Settings.databaseBackup.backup")}
				</Button>
				<Button variant="outlined" onClick={handleRestore} startIcon={<RestoreIcon />}>
					{t("pages.Settings.databaseBackup.restore")}
				</Button>
			</Stack>
		</Box>
	);
};

/**
 * 计时模式设置组件
 */
export const TimeTrackingModeSettings = () => {
	const { t } = useTranslation();
	const { timeTrackingMode, setTimeTrackingMode } = useStore(
		useShallow((s) => ({
			timeTrackingMode: s.timeTrackingMode,
			setTimeTrackingMode: s.setTimeTrackingMode,
		}))
	);

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">{t("pages.Settings.timeTrackingMode.title")}</InputLabel>
			<RadioGroup value={timeTrackingMode || "playtime"} onChange={(e) => setTimeTrackingMode(e.target.value as any)} className="pl-2">
				<FormControlLabel value="playtime" control={<Radio color="primary" />} label={t("pages.Settings.timeTrackingMode.playtime")} />
				<FormControlLabel value="elapsed" control={<Radio color="primary" />} label={t("pages.Settings.timeTrackingMode.elapsed")} />
			</RadioGroup>
		</Box>
	);
};
