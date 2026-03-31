import {
	Box,
	Button,
	Checkbox,
	Divider,
	FormControlLabel,
	InputLabel,
	MenuItem,
	Radio,
	RadioGroup,
	Select,
	Stack,
	Switch,
	TextField,
	Typography,
} from "@mui/material";
import { path } from "@tauri-apps/api";
import { load } from "@tauri-apps/plugin-store";
import { join } from "pathe";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { snackbar } from "@/providers/snackBar";
import { fileService } from "@/services/invoke";
import { useStore } from "@/store/appStore";
import { useLogLevel, useSetLogLevel, useBgmToken } from "@/hooks/queries/useSettings";

/**
 * 启动命令设置组件 (Linux 专用)
 */
const LinuxLaunchCommandSettings = () => {
	const { t } = useTranslation();
	if (import.meta.env.TAURI_ENV_PLATFORM !== "linux") return null;

	const [launchCommand, setLaunchCommand] = useState("wine");
	const [isLoading, setIsLoading] = useState(false);
	const [originalCommand, setOriginalCommand] = useState("wine");

	const STORE_KEY = "linux_launch_command";
	const STORE_PATH = "settings.json";

	useEffect(() => {
		const loadCmd = async () => {
			setIsLoading(true);
			try {
				const store = await load(STORE_PATH, { autoSave: false, defaults: { [STORE_KEY]: "wine" } });
				const saved = await store.get<string>(STORE_KEY);
				if (saved) { setLaunchCommand(saved); setOriginalCommand(saved); }
			} finally { setIsLoading(false); }
		};
		loadCmd();
	}, []);

	const handleSave = async () => {
		setIsLoading(true);
		try {
			const store = await load(STORE_PATH, { autoSave: false, defaults: {} });
			await store.set(STORE_KEY, launchCommand.trim() || "wine");
			await store.save();
			setOriginalCommand(launchCommand.trim());
			snackbar.success(t("pages.Settings.linuxLaunchCommand.saveSuccess", "保存成功"));
		} finally { setIsLoading(false); }
	};

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-2">{t("pages.Settings.linuxLaunchCommand.title", "Linux 启动命令")}</InputLabel>
			<Stack direction="row" spacing={2} alignItems="center">
				<TextField
					value={launchCommand}
					onChange={(e) => setLaunchCommand(e.target.value)}
					size="small"
					className="flex-grow"
					placeholder="wine"
				/>
				<Button variant="contained" onClick={handleSave} disabled={isLoading || launchCommand === originalCommand}>
					{t("pages.Settings.saveBtn")}
				</Button>
			</Stack>
		</Box>
	);
};

/**
 * 日志级别设置组件
 */
const LogLevelSettings = () => {
	const { t } = useTranslation();
	const { data: logLevel = "error" } = useLogLevel();
	const setLogLevelMutation = useSetLogLevel();

	const handleOpenLogFolder = async () => {
		const AppLocalData = await path.appLocalDataDir();
		await fileService.openDirectory(join(AppLocalData, "logs"));
	};

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-2">{t("pages.Settings.logLevel.title", "运行日志")}</InputLabel>
			<Stack direction="row" spacing={2} alignItems="center">
				<Select value={logLevel} onChange={(e) => setLogLevelMutation.mutate(e.target.value as any)} size="small" className="w-32">
					<MenuItem value="error">Error</MenuItem>
					<MenuItem value="warn">Warn</MenuItem>
					<MenuItem value="info">Info</MenuItem>
					<MenuItem value="debug">Debug</MenuItem>
				</Select>
				<Button variant="outlined" onClick={handleOpenLogFolder}>
					{t("pages.Settings.logLevel.openFolder", "查看日志")}
				</Button>
			</Stack>
		</Box>
	);
};

/**
 * 关闭按钮行为组件
 */
const CloseBtnSettings = () => {
	const { t } = useTranslation();
	const { skipCloseRemind, setSkipCloseRemind, defaultCloseAction, setDefaultCloseAction } = useStore(
		useShallow((s) => ({
			skipCloseRemind: s.skipCloseRemind,
			setSkipCloseRemind: s.setSkipCloseRemind,
			defaultCloseAction: s.defaultCloseAction,
			setDefaultCloseAction: s.setDefaultCloseAction,
		}))
	);

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-2">{t("pages.Settings.closeBtn.title", "关闭按钮行为")}</InputLabel>
			<FormControlLabel
				control={<Checkbox checked={skipCloseRemind} onChange={(e) => setSkipCloseRemind(e.target.checked)} />}
				label={t("pages.Settings.skipCloseRemind", "不再询问，直接执行默认动作")}
			/>
			{skipCloseRemind && (
				<RadioGroup value={defaultCloseAction} onChange={(e) => setDefaultCloseAction(e.target.value as any)} className="ml-8 mt-2">
					<FormControlLabel value="hide" control={<Radio color="primary" />} label={t("pages.Settings.closeToTray", "最小化到托盘")} />
					<FormControlLabel value="close" control={<Radio color="primary" />} label={t("pages.Settings.closeApp", "完全退出程序")} />
				</RadioGroup>
			)}
		</Box>
	);
};

/**
 * 开发者选项组件
 */
const DevSettings = () => {
	const { t } = useTranslation();
	const { isDev, setIsDev } = useStore(
		useShallow((s) => ({
			isDev: s.isDev,
			setIsDev: s.setIsDev,
		}))
	);
	const { data: realBgmToken = "" } = useBgmToken();
	const [updating, setUpdating] = useState(false);

	const handleBatchUpdate = async () => {
		setUpdating(true);
		try {
			const { batchUpdateBgmData } = await import("@/utils/appUtils");
			const res = await batchUpdateBgmData(realBgmToken);
			snackbar.info(`已更新 ${res.success} 个项目`);
		} finally { setUpdating(false); }
	};

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">{t("pages.Settings.advanced", "高级与实验性功能")}</InputLabel>
			<FormControlLabel
				control={<Switch checked={isDev} onChange={(e) => setIsDev(e.target.checked)} color="warning" />}
				label={t("pages.Settings.devMode", "开发者模式")}
			/>
			{isDev && (
				<Box className="mt-4 p-4 bg-orange-50 rounded">
					<Typography variant="caption" className="block mb-2 text-orange-800">
						警告：批量更新会向 BGM 接口发送大量请求，请确保 Token 已设置。
					</Typography>
					<Button variant="contained" color="warning" onClick={handleBatchUpdate} disabled={updating} sx={{ mt: 1 }}>
						{updating ? "更新中..." : "批量同步 BGM 元数据"}
					</Button>
				</Box>
			)}
		</Box>
	);
};

/**
 * 高级设置主组件
 */
export const AdvancedSettings = () => {
	return (
		<Box>
			<LogLevelSettings />
			<Divider sx={{ my: 3 }} />
			<CloseBtnSettings />
			<Divider sx={{ my: 3 }} />
			<LinuxLaunchCommandSettings />
			<DevSettings />
		</Box>
	);
};
