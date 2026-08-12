import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import RestorePageIcon from "@mui/icons-material/RestorePage";
import {
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
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import { path } from "@tauri-apps/api";
import { isEnabled } from "@tauri-apps/plugin-autostart";
import { join } from "pathe";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { useLogLevel, useSetLogLevel } from "@/hooks/queries/useSettings";
import { snackbar } from "@/providers/snackBar";
import { fileService } from "@/services/invoke";
import { toggleAutostart } from "@/services/plugins/autoStartService";
import {
	APP_WINDOW_CONTROLS_STORE_KEY,
	applyAppWindowControlsSetting,
	isAppWindowControlsSupported,
	LINUX_LAUNCH_COMMAND_STORE_KEY,
	loadSettingsStore,
	saveAppWindowControlsSetting,
	SILENT_STARTUP_STORE_KEY,
} from "@/services/plugins/windowControlSettings";
import { useStore } from "@/store/appStore";
import { getUserErrorMessage } from "@/utils/errors";
import { SettingsGroup, SettingsItem } from "./SettingsLayout";

export const AutoStartSettings = () => {
	const { t } = useTranslation();
	const appWindowControlsSupported = isAppWindowControlsSupported();
	const setStoreAppWindowControls = useStore((s) => s.setAppWindowControls);
	const [autoStart, setAutoStart] = useState(false);
	const [silentStartup, setSilentStartup] = useState(false);
	const [silentStartupLoading, setSilentStartupLoading] = useState(true);
	const [appWindowControls, setAppWindowControls] = useState(false);
	const [appWindowControlsLoading, setAppWindowControlsLoading] = useState(
		appWindowControlsSupported,
	);

	useEffect(() => {
		const checkAutoStart = async () => {
			setAutoStart(await isEnabled());
		};
		const loadStartupSettings = async () => {
			try {
				const store = await loadSettingsStore();
				setSilentStartup(
					(await store.get<boolean>(SILENT_STARTUP_STORE_KEY)) ?? false,
				);
				if (appWindowControlsSupported) {
					const enabled =
						(await store.get<boolean>(APP_WINDOW_CONTROLS_STORE_KEY)) ?? false;
					setAppWindowControls(enabled);
					setStoreAppWindowControls(enabled);
				}
			} catch (error) {
				console.error("读取启动设置失败:", error);
			} finally {
				setSilentStartupLoading(false);
				setAppWindowControlsLoading(false);
			}
		};

		void checkAutoStart();
		void loadStartupSettings();
	}, [appWindowControlsSupported, setStoreAppWindowControls]);

	const handleSilentStartupChange = async (enabled: boolean) => {
		setSilentStartup(enabled);
		setSilentStartupLoading(true);

		try {
			const store = await loadSettingsStore();
			await store.set(SILENT_STARTUP_STORE_KEY, enabled);
			await store.save();
		} catch (error) {
			setSilentStartup(!enabled);
			console.error("保存静默启动设置失败:", error);
		} finally {
			setSilentStartupLoading(false);
		}
	};

	const handleAppWindowControlsChange = async (enabled: boolean) => {
		const previous = appWindowControls;
		setAppWindowControls(enabled);
		setStoreAppWindowControls(enabled);
		setAppWindowControlsLoading(true);

		try {
			await saveAppWindowControlsSetting(enabled);
			const controlsActive = await applyAppWindowControlsSetting(enabled);
			setStoreAppWindowControls(controlsActive);
			if (enabled && !controlsActive) {
				snackbar.warning(
					t(
						"pages.Settings.appWindowControlsNotApplied",
						"系统标题栏未能隐藏，已避免显示重复的应用级窗口按钮。",
					),
				);
			}
		} catch (error) {
			setAppWindowControls(previous);
			setStoreAppWindowControls(previous);
			console.error("保存应用级窗口按钮设置失败:", error);
			snackbar.error(
				getUserErrorMessage(
					error,
					t,
					t(
						"pages.Settings.appWindowControlsSaveFailed",
						"保存应用级窗口按钮设置失败",
					),
				),
			);
		} finally {
			setAppWindowControlsLoading(false);
		}
	};

	return (
		<Stack spacing={2}>
			<SettingsItem
				title={t("pages.Settings.autoStart", "开机自启")}
				description={t(
					"pages.Settings.autoStartDescription",
					"系统登录后自动启动应用。",
				)}
			>
				<Switch
					checked={autoStart}
					onChange={() => {
						const enabled = !autoStart;
						setAutoStart(enabled);
						toggleAutostart();
					}}
					color="primary"
				/>
			</SettingsItem>
			<SettingsItem
				title={t("pages.Settings.silentStartup", "静默启动")}
				description={t(
					"pages.Settings.silentStartupDescription",
					"启动时不显示主窗口，应用将在系统托盘中运行。",
				)}
			>
				<Switch
					checked={silentStartup}
					onChange={(event) =>
						void handleSilentStartupChange(event.target.checked)
					}
					disabled={silentStartupLoading}
					color="primary"
				/>
			</SettingsItem>
			{appWindowControlsSupported && (
				<SettingsItem
					title={t("pages.Settings.appWindowControls", "应用级窗口按钮")}
					description={t(
						"pages.Settings.appWindowControlsDescription",
						"开启后使用应用自建的最小化、最大化/还原、关闭按钮；关闭后沿用系统窗口模式。",
					)}
				>
					<Switch
						checked={appWindowControls}
						onChange={(event) =>
							void handleAppWindowControlsChange(event.target.checked)
						}
						disabled={appWindowControlsLoading}
						color="primary"
					/>
				</SettingsItem>
			)}
		</Stack>
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
				t("pages.Settings.logLevel.changed", "日志级别已切换为 {{level}}", {
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
				t(
					"pages.Settings.logLevel.openFolderError",
					"打开日志文件夹失败: {{error}}",
					{ error: errorMessage },
				),
			);
		}
	};

	return (
		<SettingsGroup title={t("pages.Settings.logLevel.title", "日志设置")}>
			<SettingsItem
				title={t("pages.Settings.logLevel.levelLabel", "日志输出级别")}
				description={t(
					"pages.Settings.logLevel.description",
					"仅当前会话有效，不会保存。用于临时调整后端日志输出详尽程度。",
				)}
			>
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
			</SettingsItem>
			<SettingsItem
				stacked
				title={t("pages.Settings.logLevel.openFolder", "打开日志文件夹")}
			>
				<Button
					variant="outlined"
					color="primary"
					onClick={handleOpenLogFolder}
					startIcon={<FolderOpenIcon />}
					className="px-6 py-2"
				>
					{t("pages.Settings.logLevel.openFolder", "打开日志文件夹")}
				</Button>
			</SettingsItem>
		</SettingsGroup>
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
		<SettingsGroup
			title={t("pages.Settings.closeSettings", "关闭设置")}
			description={t(
				"pages.Settings.closeSettingsDescription",
				"点击关闭按钮是否显示关闭确认弹窗，并选择跳过确认弹窗后的默认行为。",
			)}
		>
			<SettingsItem
				title={t("pages.Settings.skipCloseRemind", "不再提醒")}
				description={t(
					"pages.Settings.skipCloseRemindDescription",
					"开启后不再显示关闭确认弹窗，直接执行下方选择的默认行为。",
				)}
			>
				<Switch
					checked={skipCloseRemind}
					onChange={(e) => setSkipCloseRemind(e.target.checked)}
					color="primary"
				/>
			</SettingsItem>
			<Box>
				<RadioGroup
					value={defaultCloseAction}
					onChange={(e) =>
						setDefaultCloseAction(e.target.value as "hide" | "close")
					}
				>
					<FormControlLabel
						value="hide"
						control={<Radio color="primary" />}
						disabled={!skipCloseRemind}
						sx={{ alignItems: "flex-start" }}
						className={
							!skipCloseRemind
								? "mb-2 opacity-50 transition-opacity duration-200"
								: "mb-2"
						}
						label={
							<Box>
								<Typography variant="body2">
									{t("pages.Settings.closeToTray", "最小化到托盘")}
								</Typography>
								<Typography variant="caption" color="text.secondary">
									{t(
										"pages.Settings.closeToTrayDescription",
										"关闭窗口后应用继续在系统托盘中运行。",
									)}
								</Typography>
							</Box>
						}
					/>
					<FormControlLabel
						value="close"
						control={<Radio color="primary" />}
						disabled={!skipCloseRemind}
						sx={{ alignItems: "flex-start" }}
						className={
							!skipCloseRemind
								? "mb-1 opacity-50 transition-opacity duration-200"
								: "mb-1"
						}
						label={
							<Box>
								<Typography variant="body2">
									{t("pages.Settings.closeApp", "直接退出应用")}
								</Typography>
								<Typography variant="caption" color="text.secondary">
									{t(
										"pages.Settings.closeAppDescription",
										"关闭窗口后结束应用进程。",
									)}
								</Typography>
							</Box>
						}
					/>
				</RadioGroup>
			</Box>
		</SettingsGroup>
	);
};

export const TimeTrackingModeSettings = () => {
	const { t } = useTranslation();
	const timeTrackingMode = useStore((s) => s.timeTrackingMode);
	const setTimeTrackingMode = useStore((s) => s.setTimeTrackingMode);

	return (
		<SettingsGroup
			title={t("pages.Settings.timeTrackingMode.title", "游戏计时模式")}
			description={t(
				"pages.Settings.timeTrackingMode.description",
				"选择游戏时间的计算方式，更改仅对之后启动的游戏生效。",
			)}
		>
			<Box>
				<RadioGroup
					value={timeTrackingMode}
					onChange={(e) =>
						setTimeTrackingMode(e.target.value as "playtime" | "elapsed")
					}
				>
					<FormControlLabel
						value="playtime"
						control={<Radio color="primary" />}
						className="mb-2"
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
					/>
					<FormControlLabel
						value="elapsed"
						control={<Radio color="primary" />}
						className="mb-1"
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
					/>
				</RadioGroup>
			</Box>
		</SettingsGroup>
	);
};

export const LinuxLaunchCommandSettings = () => {
	const { t } = useTranslation();
	const [launchCommand, setLaunchCommand] = useState("wine");
	const [isLoading, setIsLoading] = useState(false);
	const [originalCommand, setOriginalCommand] = useState("wine");

	// 加载当前设置的启动命令
	useEffect(() => {
		const loadLaunchCommand = async () => {
			setIsLoading(true);
			try {
				const store = await loadSettingsStore();
				const savedCommand = await store.get<string>(
					LINUX_LAUNCH_COMMAND_STORE_KEY,
				);
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

	const saveLaunchCommand = async (value = launchCommand) => {
		const nextCommand = value.trim() || "wine";
		if (isLoading || nextCommand === originalCommand) return;

		setIsLoading(true);

		try {
			const store = await loadSettingsStore();
			await store.set(LINUX_LAUNCH_COMMAND_STORE_KEY, nextCommand);
			await store.save();
			setLaunchCommand(nextCommand);
			setOriginalCommand(nextCommand);
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
		void saveLaunchCommand("wine");
	};

	return (
		<SettingsGroup
			title={t("pages.Settings.linuxLaunchCommand.title", "Linux 启动命令")}
			description={t(
				"pages.Settings.linuxLaunchCommand.description",
				"设置 Linux 上启动 Windows 可执行文件（.exe）时使用的命令。支持 wine、proton 或其他兼容层命令，也可以是 PATH 中的可执行文件或脚本的完整路径。",
			)}
		>
			<Stack direction="row" spacing={1} alignItems="flex-start">
				<TextField
					label={t(
						"pages.Settings.linuxLaunchCommand.commandLabel",
						"启动命令",
					)}
					variant="outlined"
					value={launchCommand}
					onChange={(e) => setLaunchCommand(e.target.value)}
					onBlur={() => void saveLaunchCommand()}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.nativeEvent.isComposing) {
							event.preventDefault();
							(event.target as HTMLInputElement).blur();
						}
						if (event.key === "Escape") {
							event.preventDefault();
							setLaunchCommand(originalCommand);
						}
					}}
					className="min-w-0 flex-grow"
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
		</SettingsGroup>
	);
};

export const ProxySettings = () => {
	const { t } = useTranslation();
	const proxyConfig = useStore((state) => state.proxyConfig);
	const setProxyConfig = useStore((state) => state.setProxyConfig);
	const [proxyUrl, setProxyUrl] = useState(proxyConfig.url);
	const [proxyUrlError, setProxyUrlError] = useState("");

	useEffect(() => {
		setProxyUrl(proxyConfig.url);
	}, [proxyConfig.url]);

	const validateProxyUrl = (value: string) => {
		if (!/^https?:\/\//i.test(value)) {
			return false;
		}

		try {
			const parsed = new URL(value);
			return (
				(parsed.protocol === "http:" || parsed.protocol === "https:") &&
				Boolean(parsed.hostname)
			);
		} catch {
			return false;
		}
	};

	const saveProxyUrl = () => {
		const value = proxyUrl.trim();
		const currentConfig = useStore.getState().proxyConfig;
		if (!value) {
			setProxyUrl("");
			setProxyUrlError("");
			if (currentConfig.url) {
				setProxyConfig({ url: "" });
			}
			return true;
		}

		if (!validateProxyUrl(value)) {
			setProxyUrlError(
				t(
					"pages.Settings.proxy.invalidUrl",
					"请输入以 http:// 或 https:// 开头的有效代理地址",
				),
			);
			return false;
		}

		setProxyUrl(value);
		setProxyUrlError("");
		if (value !== currentConfig.url) {
			setProxyConfig({ url: value });
		}
		return true;
	};

	const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		setProxyUrl(e.target.value);
		if (proxyUrlError) {
			setProxyUrlError("");
		}
	};

	return (
		<SettingsGroup
			title={t("pages.Settings.proxy.title", "网络代理设置")}
			description={t(
				"pages.Settings.proxy.description",
				"填写代理地址后应用网络请求将使用该代理；留空则使用系统网络设置。",
			)}
		>
			<Box>
				<TextField
					label={t("pages.Settings.proxy.url", "代理服务器地址")}
					variant="outlined"
					value={proxyUrl}
					onChange={handleUrlChange}
					onBlur={saveProxyUrl}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.nativeEvent.isComposing) {
							event.preventDefault();
							saveProxyUrl();
						}
						if (event.key === "Escape") {
							setProxyUrl(proxyConfig.url);
							setProxyUrlError("");
						}
					}}
					error={Boolean(proxyUrlError)}
					helperText={proxyUrlError}
					className="w-full"
					size="small"
					placeholder="http://127.0.0.1:7890"
				/>
			</Box>
		</SettingsGroup>
	);
};
