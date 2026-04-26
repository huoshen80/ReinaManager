import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import RestorePageIcon from "@mui/icons-material/RestorePage";
import SaveIcon from "@mui/icons-material/Save";
import {
	Checkbox,
	FormControlLabel,
	IconButton,
	Radio,
	RadioGroup,
	Switch,
	Tooltip,
	Typography,
} from "@mui/material";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { path } from "@tauri-apps/api";
import { isEnabled } from "@tauri-apps/plugin-autostart";
import { load } from "@tauri-apps/plugin-store";
import { join } from "pathe";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { useLogLevel, useSetLogLevel } from "@/hooks/queries/useSettings";
import { snackbar } from "@/providers/snackBar";
import { fileService } from "@/services/invoke";
import { toggleAutostart } from "@/services/plugins/autoStartService";
import { useStore } from "@/store/appStore";
import { getUserErrorMessage } from "@/utils/errors";

export const AutoStartSettings = () => {
	const { t } = useTranslation();
	const [autoStart, setAutoStart] = useState(false);

	useEffect(() => {
		const checkAutoStart = async () => {
			setAutoStart(await isEnabled());
		};
		checkAutoStart();
	}, []);

	return (
		<Box className="mb-6">
			<Stack direction="row" alignItems="center" className="min-w-60">
				<Box>
					<InputLabel className="font-semibold mb-1">
						{t("pages.Settings.autoStart")}
					</InputLabel>
				</Box>
				<Switch
					checked={autoStart}
					onChange={() => {
						setAutoStart(!autoStart);
						toggleAutostart();
					}}
					color="primary"
				/>
			</Stack>
		</Box>
	);
};

export const LogLevelSettings = () => {
	const { t } = useTranslation();
	const { data: logLevel = "error" } = useLogLevel();
	const setLogLevelMutation = useSetLogLevel();

	const handleChange = async (event: SelectChangeEvent) => {
		const level = event.target.value as "error" | "warn" | "info" | "debug";
		try {
			await setLogLevelMutation.mutateAsync(level);
			snackbar.success(
				t("pages.Settings.logLevel.changed", `日志级别已切换为 ${level}`, {
					level,
				}),
			);
		} catch {
			snackbar.error(
				t("pages.Settings.logLevel.changeFailed", "切换日志级别失败"),
			);
		}
	};

	const handleOpenLogFolder = async () => {
		try {
			const AppLocalData = await path.appLocalDataDir();
			const logDir = join(AppLocalData, "logs");
			await fileService.openDirectory(logDir);
		} catch (error) {
			const errorMessage = getUserErrorMessage(
				error,
				t,
				t("pages.Settings.logLevel.openFolderFailed", "打开文件夹失败"),
			);
			snackbar.error(
				t("pages.Settings.logLevel.openFolderError", { error: errorMessage }),
			);
		}
	};

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">
				{t("pages.Settings.logLevel.title", "日志设置")}
			</InputLabel>
			<Box className="pl-2 space-y-4">
				<Box>
					<InputLabel className="mb-2 text-sm">
						{t("pages.Settings.logLevel.levelLabel", "日志输出级别")}
					</InputLabel>
					<Typography
						variant="caption"
						color="text.secondary"
						className="block mb-2"
					>
						{t(
							"pages.Settings.logLevel.description",
							"仅当前会话有效，不会保存。用于临时调整后端日志输出详尽程度。",
						)}
					</Typography>
					<Select
						value={logLevel}
						onChange={handleChange}
						className="min-w-40"
						size="small"
					>
						<MenuItem value="error">Error</MenuItem>
						<MenuItem value="warn">Warn</MenuItem>
						<MenuItem value="info">Info</MenuItem>
						<MenuItem value="debug">Debug</MenuItem>
					</Select>
				</Box>
				<Box>
					<Button
						variant="outlined"
						color="primary"
						onClick={handleOpenLogFolder}
						startIcon={<FolderOpenIcon />}
						className="px-6 py-2"
					>
						{t("pages.Settings.logLevel.openFolder", "打开日志文件夹")}
					</Button>
				</Box>
			</Box>
		</Box>
	);
};

export const CloseBtnSettings = () => {
	const { t } = useTranslation();
	const {
		skipCloseRemind,
		defaultCloseAction,
		setSkipCloseRemind,
		setDefaultCloseAction,
	} = useStore(
		useShallow((s) => ({
			skipCloseRemind: s.skipCloseRemind,
			defaultCloseAction: s.defaultCloseAction,
			setSkipCloseRemind: s.setSkipCloseRemind,
			setDefaultCloseAction: s.setDefaultCloseAction,
		})),
	);
	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">
				{t("pages.Settings.closeSettings")}
			</InputLabel>
			<Box className="pl-2">
				<FormControlLabel
					control={
						<Checkbox
							checked={skipCloseRemind}
							onChange={(e) => setSkipCloseRemind(e.target.checked)}
							color="primary"
						/>
					}
					label={t("pages.Settings.skipCloseRemind")}
					className="mb-2"
				/>
				<RadioGroup
					value={defaultCloseAction}
					onChange={(e) =>
						setDefaultCloseAction(e.target.value as "hide" | "close")
					}
					className="pl-4"
				>
					<FormControlLabel
						value="hide"
						control={<Radio color="primary" />}
						label={t("pages.Settings.closeToTray")}
						disabled={!skipCloseRemind}
						className={
							!skipCloseRemind
								? "opacity-50 transition-opacity duration-200"
								: ""
						}
					/>
					<FormControlLabel
						value="close"
						control={<Radio color="primary" />}
						label={t("pages.Settings.closeApp")}
						disabled={!skipCloseRemind}
						className={
							!skipCloseRemind
								? "opacity-50 transition-opacity duration-200"
								: ""
						}
					/>
				</RadioGroup>
			</Box>
		</Box>
	);
};

export const TimeTrackingModeSettings = () => {
	const { t } = useTranslation();
	const timeTrackingMode = useStore((s) => s.timeTrackingMode);
	const setTimeTrackingMode = useStore((s) => s.setTimeTrackingMode);

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">
				{t("pages.Settings.timeTrackingMode.title", "游戏计时模式")}
			</InputLabel>
			<Box className="pl-2">
				<Typography
					variant="caption"
					color="text.secondary"
					className="block mb-3"
				>
					{t(
						"pages.Settings.timeTrackingMode.description",
						"选择游戏时间的计算方式，影响游戏运行时的时间显示和统计记录。",
					)}
				</Typography>
				<RadioGroup
					value={timeTrackingMode}
					onChange={(e) =>
						setTimeTrackingMode(e.target.value as "playtime" | "elapsed")
					}
					className="pl-2"
				>
					<FormControlLabel
						value="playtime"
						control={<Radio color="primary" />}
						label={
							<Box>
								<Typography variant="body2">
									{t(
										"pages.Settings.timeTrackingMode.playtime",
										"真实游戏时间（默认）",
									)}
								</Typography>
								<Typography variant="caption" color="text.secondary">
									{t(
										"pages.Settings.timeTrackingMode.playtimeDesc",
										"仅计算游戏窗口在前台时的时间，切换到其他窗口时暂停计时",
									)}
								</Typography>
							</Box>
						}
						className="mb-2"
					/>
					<FormControlLabel
						value="elapsed"
						control={<Radio color="primary" />}
						label={
							<Box>
								<Typography variant="body2">
									{t("pages.Settings.timeTrackingMode.elapsed", "游戏启动时间")}
								</Typography>
								<Typography variant="caption" color="text.secondary">
									{t(
										"pages.Settings.timeTrackingMode.elapsedDesc",
										"计算从游戏启动到结束的总时间，不区分前台后台",
									)}
								</Typography>
							</Box>
						}
						className="mb-1"
					/>
				</RadioGroup>
			</Box>
		</Box>
	);
};

export const LinuxLaunchCommandSettings = () => {
	const { t } = useTranslation();
	const [launchCommand, setLaunchCommand] = useState("wine");
	const [isLoading, setIsLoading] = useState(false);
	const [originalCommand, setOriginalCommand] = useState("wine");

	// 持久化 Linux 启动命令的存储键
	const STORE_KEY = "linux_launch_command";
	const STORE_PATH = "settings.json";

	// 加载当前设置的启动命令
	useEffect(() => {
		const loadLaunchCommand = async () => {
			setIsLoading(true);
			try {
				const store = await load(STORE_PATH, {
					autoSave: false,
					defaults: {
						[STORE_KEY]: "wine",
					},
				});
				const savedCommand = await store.get<string>(STORE_KEY);
				if (savedCommand) {
					setLaunchCommand(savedCommand);
					setOriginalCommand(savedCommand);
				}
			} catch (error) {
				console.error("加载 Linux 启动命令失败:", error);
			} finally {
				setIsLoading(false);
			}
		};
		loadLaunchCommand();
	}, []);

	const handleSaveCommand = async () => {
		setIsLoading(true);

		try {
			const store = await load(STORE_PATH, { autoSave: false, defaults: {} });
			await store.set(STORE_KEY, launchCommand.trim() || "wine");
			await store.save();
			setOriginalCommand(launchCommand.trim() || "wine");
			snackbar.success(
				t(
					"pages.Settings.linuxLaunchCommand.saveSuccess",
					"Linux 启动命令已保存",
				),
			);
		} catch (error) {
			console.error("保存 Linux 启动命令失败:", error);
			snackbar.error(
				t("pages.Settings.linuxLaunchCommand.saveError", "保存失败"),
			);
		} finally {
			setIsLoading(false);
		}
	};

	const handleReset = () => {
		setLaunchCommand("wine");
	};

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">
				{t("pages.Settings.linuxLaunchCommand.title", "Linux 启动命令")}
			</InputLabel>

			<Typography
				variant="caption"
				color="text.secondary"
				className="block mb-3"
			>
				{t(
					"pages.Settings.linuxLaunchCommand.description",
					"设置 Linux 上启动 Windows 可执行文件（.exe）时使用的命令。支持 wine、proton 或其他兼容层命令，也可以是 PATH 中的可执行文件或脚本的完整路径。",
				)}
			</Typography>

			<Stack direction="row" spacing={2} alignItems="center" className="mb-2">
				<TextField
					label={t(
						"pages.Settings.linuxLaunchCommand.commandLabel",
						"启动命令",
					)}
					variant="outlined"
					value={launchCommand}
					onChange={(e) => setLaunchCommand(e.target.value)}
					className="min-w-60 flex-grow"
					placeholder="wine"
					disabled={isLoading}
					size="small"
					helperText={t(
						"pages.Settings.linuxLaunchCommand.helperText",
						"例如: wine, /usr/bin/wine, ~/scripts/run-game.sh",
					)}
				/>

				<Tooltip
					title={t(
						"pages.Settings.linuxLaunchCommand.resetTooltip",
						"重置为默认值 (wine)",
					)}
				>
					<IconButton
						onClick={handleReset}
						disabled={isLoading || launchCommand === "wine"}
						color="default"
					>
						<RestorePageIcon />
					</IconButton>
				</Tooltip>

				<Button
					variant="contained"
					color="primary"
					onClick={handleSaveCommand}
					disabled={isLoading || launchCommand === originalCommand}
					startIcon={<SaveIcon />}
					className="px-4 py-2"
				>
					{t("pages.Settings.linuxLaunchCommand.saveBtn", "保存")}
				</Button>
			</Stack>

			<Typography
				variant="caption"
				color="text.secondary"
				className="block mt-2"
			>
				{t(
					"pages.Settings.linuxLaunchCommand.note",
					"注意：更改此设置后，需要重新启动游戏才能生效。",
				)}
			</Typography>
		</Box>
	);
};
