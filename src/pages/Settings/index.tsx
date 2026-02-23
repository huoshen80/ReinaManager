/**
 * @file Settings 页面
 * @description 应用设置页，支持 Bangumi Token 设置、语言切换等功能。
 * @module src/pages/Settings/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - Settings：设置页面主组件
 * - LanguageSelect：语言选择组件
 *
 * 依赖：
 * - @mui/material
 * - @toolpad/core
 * - @/store
 * - @/utils
 * - react-i18next
 */

import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import BackupIcon from "@mui/icons-material/Backup";
import BugReportIcon from "@mui/icons-material/BugReport";
import ClearIcon from "@mui/icons-material/Clear";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import MenuBookIcon from "@mui/icons-material/MenuBook";
import RestoreIcon from "@mui/icons-material/Restore";
import UpdateIcon from "@mui/icons-material/Update";
import {
	Accordion,
	AccordionDetails,
	AccordionSummary,
	Checkbox,
	CircularProgress,
	Divider,
	FormControlLabel,
	IconButton,
	InputAdornment,
	Link,
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
import pkg from "@pkg";
import { path } from "@tauri-apps/api";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { isEnabled } from "@tauri-apps/plugin-autostart";
import { relaunch } from "@tauri-apps/plugin-process";
import { PageContainer } from "@toolpad/core/PageContainer";
import { join } from "pathe";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertConfirmBox } from "@/components/AlertBox";
import { toggleAutostart } from "@/components/AutoStart";
import { PathSettingsModal } from "@/components/PathSettingsModal";
import { snackbar } from "@/components/Snackbar";
import { checkForUpdates } from "@/components/Update";
import { useScrollRestore } from "@/hooks/common/useScrollRestore";
import { settingsService } from "@/services";
import { useStore } from "@/store";
import type { LogLevel } from "@/types";
import { openDatabaseBackupFolder, openurl } from "@/utils";
import { backupDatabase, importDatabase } from "@/utils/database";

/**
 * LanguageSelect 组件
 * 语言选择下拉框，支持中、英、日多语言切换。
 *
 * @component
 * @returns {JSX.Element} 语言选择器
 */
const LanguageSelect = () => {
	const { t, i18n } = useTranslation(); // 使用i18n实例和翻译函数

	// 语言名称映射
	const languageNames = {
		"zh-CN": "简体中文(zh-CN)",
		"zh-TW": "繁体中文(zh-TW)",
		"en-US": "English(en-US)",
		"ja-JP": "日本語(ja-JP)",
	};

	/**
	 * 处理语言切换
	 * @param {SelectChangeEvent} event
	 */
	const handleChange = (event: SelectChangeEvent) => {
		const newLang = event.target.value;
		i18n.changeLanguage(newLang); // 切换语言
	};

	return (
		<Box className="min-w-30 mb-6">
			<InputLabel id="language-select-label" className="mb-2 font-semibold">
				{t("pages.Settings.language")}
			</InputLabel>
			<Select
				labelId="language-select-label"
				id="language-select"
				value={i18n.language}
				onChange={handleChange}
				className="w-60"
				renderValue={(value) =>
					languageNames[value as keyof typeof languageNames]
				}
			>
				<MenuItem value="zh-CN">简体中文(zh-CN)</MenuItem>
				<MenuItem value="zh-TW">繁体中文(zh-TW)</MenuItem>
				<MenuItem value="en-US">English(en-US)</MenuItem>
				<MenuItem value="ja-JP">日本語(ja-JP)</MenuItem>
			</Select>
		</Box>
	);
};

const BgmTokenSettings = () => {
	const { t } = useTranslation();
	const { bgmToken, setBgmToken } = useStore();
	const [inputToken, setInputToken] = useState("");

	useEffect(() => {
		setInputToken(bgmToken);
	}, [bgmToken]);

	/**
	 * 打开 Bangumi Token 获取页面
	 */
	const handleOpen = () => {
		openurl("https://next.bgm.tv/demo/access-token/create");
	};

	/**
	 * 保存BGM Token
	 */
	const handleSaveToken = () => {
		try {
			setBgmToken(inputToken);
			snackbar.success(
				t("pages.Settings.bgmTokenSettings.saveSuccess", "BGM Token 保存成功"),
			);
		} catch (error) {
			console.error(error);
			snackbar.error(
				t("pages.Settings.bgmTokenSettings.saveError", "BGM Token 保存失败"),
			);
		}
	};

	/**
	 * 清除BGM Token输入框
	 */
	const handleClearToken = () => {
		setInputToken("");
	};

	return (
		<Box className="mb-8">
			<InputLabel className="font-semibold mb-4">
				{t("pages.Settings.bgmToken")}
			</InputLabel>

			<Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
				<TextField
					autoComplete="off"
					placeholder={t("pages.Settings.tokenPlaceholder")}
					value={inputToken}
					onChange={(e) => setInputToken(e.target.value)}
					variant="outlined"
					size="medium"
					className="min-w-60"
					slotProps={{
						htmlInput: {
							style: {
								WebkitTextSecurity: "disc",
								textSecurity: "disc",
							},
						},
						input: {
							endAdornment: inputToken && (
								<InputAdornment position="end">
									<IconButton
										onClick={handleClearToken}
										edge="end"
										size="small"
										aria-label={t(
											"pages.Settings.bgmTokenSettings.clearToken",
											"清除令牌",
										)}
									>
										<ClearIcon />
									</IconButton>
								</InputAdornment>
							),
						},
					}}
				/>
				<Button
					variant="contained"
					color="primary"
					onClick={handleSaveToken}
					className="px-6 py-2"
				>
					{t("pages.Settings.saveBtn")}
				</Button>
				<Button
					variant="outlined"
					color="primary"
					onClick={handleOpen}
					className="px-6 py-2"
				>
					{t("pages.Settings.getToken")}
				</Button>
			</Stack>
		</Box>
	);
};

const AutoStartSettings = () => {
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

const NsfwSettings = () => {
	const { t } = useTranslation();
	const { nsfwFilter, setNsfwFilter, nsfwCoverReplace, setNsfwCoverReplace } =
		useStore();

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">
				{t("pages.Settings.nsfw.title")}
			</InputLabel>

			<Box className="pl-2">
				<FormControlLabel
					control={
						<Switch
							checked={nsfwFilter}
							onChange={(e) => setNsfwFilter(e.target.checked)}
							color="primary"
						/>
					}
					label={t("pages.Settings.nsfw.filter")}
				/>

				<FormControlLabel
					control={
						<Switch
							checked={nsfwCoverReplace}
							onChange={(e) => setNsfwCoverReplace(e.target.checked)}
							color="primary"
						/>
					}
					label={t("pages.Settings.nsfw.coverReplace")}
				/>
			</Box>
		</Box>
	);
};

const LogLevelSettings = () => {
	const { t } = useTranslation();
	const { logLevel, setLogLevel: setLogLevelStore } = useStore();

	// 组件挂载时从后端获取当前日志级别
	useEffect(() => {
		const fetchLogLevel = async () => {
			try {
				const level = await settingsService.getLogLevel();
				setLogLevelStore(level);
			} catch (error) {
				console.error("获取日志级别失败:", error);
			}
		};
		if (isTauri()) {
			fetchLogLevel();
		}
	}, [setLogLevelStore]);

	const handleChange = async (event: SelectChangeEvent) => {
		const level = event.target.value as LogLevel;
		setLogLevelStore(level); // 更新 store
		try {
			await settingsService.setLogLevel(level);
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
			await invoke("open_directory", { dirPath: logDir });
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: t("pages.Settings.logLevel.openFolderFailed", "打开文件夹失败");
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
						disabled={!isTauri()}
					>
						{t("pages.Settings.logLevel.openFolder", "打开日志文件夹")}
					</Button>
				</Box>
			</Box>
		</Box>
	);
};

const VndbDataSettings = () => {
	const { t } = useTranslation();

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">
				{t("pages.Settings.vndbData.title", "VNDB 数据设置")}
			</InputLabel>
			<Box className="pl-2 space-y-4">
				<TagTranslationSettings />
				<Divider sx={{ my: 2 }} />
				<SpoilerLevelSettings />
			</Box>
		</Box>
	);
};

const TagTranslationSettings = () => {
	const { t } = useTranslation();
	const { tagTranslation, setTagTranslation } = useStore();

	return (
		<Box className="mb-6">
			<Stack direction="row" alignItems="center" className="min-w-60">
				<Box>
					<InputLabel className="font-semibold mb-1">
						{t("pages.Settings.tagTranslation.title")}
					</InputLabel>
					<Typography variant="caption" color="text.secondary">
						{t("pages.Settings.tagTranslation.description")}
					</Typography>
				</Box>
				<Switch
					checked={tagTranslation}
					onChange={(e) => setTagTranslation(e.target.checked)}
					color="primary"
				/>
			</Stack>
		</Box>
	);
};

const SpoilerLevelSettings = () => {
	const { t } = useTranslation();
	const { spoilerLevel, setSpoilerLevel } = useStore();

	return (
		<Box className="mb-6">
			<Stack direction="row" alignItems="center" spacing={1}>
				<Box>
					<InputLabel className="font-semibold mb-1">
						{t("pages.Settings.spoilerLevel.title")}
					</InputLabel>
					<Typography variant="caption" color="text.secondary">
						{t("pages.Settings.spoilerLevel.description")}
					</Typography>
				</Box>
				<Select
					value={spoilerLevel}
					onChange={(event) => setSpoilerLevel(event.target.value as number)}
					className="min-w-40"
					size="small"
				>
					<MenuItem value={0}>
						{t("pages.Settings.spoilerLevel.level0")}
					</MenuItem>
					<MenuItem value={1}>
						{t("pages.Settings.spoilerLevel.level1")}
					</MenuItem>
					<MenuItem value={2}>
						{t("pages.Settings.spoilerLevel.level2")}
					</MenuItem>
				</Select>
			</Stack>
		</Box>
	);
};

const CardClickModeSettings = () => {
	const { t } = useTranslation();
	const {
		cardClickMode,
		setCardClickMode,
		doubleClickLaunch,
		setDoubleClickLaunch,
		longPressLaunch,
		setLongPressLaunch,
	} = useStore();

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">
				{t("pages.Settings.cardClickMode.title")}
			</InputLabel>
			<Box className="pl-2">
				<RadioGroup
					value={cardClickMode}
					onChange={(e) =>
						setCardClickMode(e.target.value as "navigate" | "select")
					}
					className="pl-2"
				>
					<FormControlLabel
						value="navigate"
						control={<Radio color="primary" />}
						label={t("pages.Settings.cardClickMode.navigate")}
						className="mb-1"
					/>
					<FormControlLabel
						value="select"
						control={<Radio color="primary" />}
						label={t("pages.Settings.cardClickMode.select")}
						className="mb-1"
					/>
				</RadioGroup>

				{/* 双击启动游戏设置 */}
				<Box className="mt-4 pl-2">
					<FormControlLabel
						control={
							<Switch
								checked={doubleClickLaunch}
								onChange={(e) => setDoubleClickLaunch(e.target.checked)}
								color="primary"
							/>
						}
						label={t("pages.Settings.cardClickMode.doubleClickLaunch")}
						className="mb-1"
					/>
					{doubleClickLaunch && cardClickMode === "navigate" && (
						<Typography
							variant="caption"
							color="text.secondary"
							className="block ml-8"
						>
							{t("pages.Settings.cardClickMode.doubleClickLaunchNote")}
						</Typography>
					)}
				</Box>

				{/* 长按启动游戏设置 */}
				<Box className="mt-4 pl-2">
					<FormControlLabel
						control={
							<Switch
								checked={longPressLaunch}
								onChange={(e) => setLongPressLaunch(e.target.checked)}
								color="primary"
							/>
						}
						label={t("pages.Settings.cardClickMode.longPressLaunch")}
						className="mb-1"
					/>
					{longPressLaunch && (
						<Typography
							variant="caption"
							color="text.secondary"
							className="block ml-8"
						>
							{t("pages.Settings.cardClickMode.longPressLaunchNote")}
						</Typography>
					)}
				</Box>
			</Box>
		</Box>
	);
};

const CloseBtnSettings = () => {
	const { t } = useTranslation();
	const {
		skipCloseRemind,
		defaultCloseAction,
		setSkipCloseRemind,
		setDefaultCloseAction,
	} = useStore();
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

const DatabaseBackupSettings = () => {
	const { t } = useTranslation();
	const [isBackingUp, setIsBackingUp] = useState(false);
	const [isImporting, setIsImporting] = useState(false);

	const handleBackupDatabase = async () => {
		setIsBackingUp(true);

		try {
			const result = await backupDatabase();
			if (result.success) {
				snackbar.success(
					t("pages.Settings.databaseBackup.backupSuccess", {
						path: result.path,
					}),
				);
			} else {
				snackbar.error(
					t("pages.Settings.databaseBackup.backupError", {
						error: result.message,
					}),
				);
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: t("pages.Settings.databaseBackup.backupFailed", "备份失败");
			snackbar.error(
				t("pages.Settings.databaseBackup.backupError", { error: errorMessage }),
			);
		} finally {
			setIsBackingUp(false);
		}
	};

	const handleOpenBackupFolder = async () => {
		try {
			await openDatabaseBackupFolder();
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: t(
							"pages.Settings.databaseBackup.openFolderFailed",
							"打开文件夹失败",
						);
			snackbar.error(
				t("pages.Settings.databaseBackup.openFolderError", {
					error: errorMessage,
				}),
			);
		}
	};

	const handleImportDatabase = async () => {
		setIsImporting(true);
		try {
			const result = await importDatabase();
			if (result) {
				if (result.success) {
					snackbar.success(
						t(
							"pages.Settings.databaseBackup.importSuccess",
							"数据库导入成功，应用将自动重启",
						),
					);
					// 延迟重启应用，让用户看到成功提示
					setTimeout(async () => {
						await relaunch();
					}, 2000);
				} else {
					snackbar.error(
						t("pages.Settings.databaseBackup.importError", {
							error: result.message,
						}),
					);
				}
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: t("pages.Settings.databaseBackup.importFailed", "导入失败");
			snackbar.error(
				t("pages.Settings.databaseBackup.importError", { error: errorMessage }),
			);
		} finally {
			setIsImporting(false);
		}
	};

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">
				{t("pages.Settings.databaseBackup.title", "数据库备份与恢复")}
			</InputLabel>

			<Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
				<Button
					variant="contained"
					color="primary"
					onClick={handleBackupDatabase}
					disabled={isBackingUp || !isTauri()}
					startIcon={
						isBackingUp ? (
							<CircularProgress size={16} color="inherit" />
						) : (
							<BackupIcon />
						)
					}
					className="px-6 py-2"
				>
					{isBackingUp
						? t("pages.Settings.databaseBackup.backing", "备份中...")
						: t("pages.Settings.databaseBackup.backup", "备份数据库")}
				</Button>

				<Button
					variant="outlined"
					color="primary"
					onClick={handleOpenBackupFolder}
					startIcon={<FolderOpenIcon />}
					className="px-6 py-2"
					disabled={!isTauri()}
				>
					{t("pages.Settings.databaseBackup.openFolder", "打开备份文件夹")}
				</Button>

				<Button
					variant="outlined"
					color="warning"
					onClick={handleImportDatabase}
					disabled={isImporting || !isTauri()}
					startIcon={
						isImporting ? (
							<CircularProgress size={16} color="inherit" />
						) : (
							<RestoreIcon />
						)
					}
					className="px-6 py-2"
				>
					{isImporting
						? t("pages.Settings.databaseBackup.importing", "导入中...")
						: t("pages.Settings.databaseBackup.restore", "恢复数据库")}
				</Button>
			</Stack>
			<Typography
				variant="caption"
				color="text.secondary"
				className="block mt-2"
			>
				{t(
					"pages.Settings.databaseBackup.restoreWarning",
					"恢复数据库将覆盖现有数据，请谨慎操作。导入后应用将自动重启。",
				)}
			</Typography>
			<Typography
				variant="caption"
				color="text.secondary"
				className="block mt-1"
			>
				{t(
					"pages.Settings.databaseBackup.pathNote",
					"备份路径配置已移至下方的「数据库备份路径」设置中",
				)}
			</Typography>
		</Box>
	);
};

const PortableModeSettings = () => {
	const { t } = useTranslation();
	const [portableMode, setPortableMode] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [showConfirm, setShowConfirm] = useState(false);
	const [pendingValue, setPendingValue] = useState(false);

	useEffect(() => {
		const loadPortableMode = async () => {
			setIsLoading(true);
			try {
				const enabled = await settingsService.getPortableMode();
				setPortableMode(enabled);
			} catch (error) {
				console.error("加载便携模式状态失败:", error);
			} finally {
				setIsLoading(false);
			}
		};
		loadPortableMode();
	}, []);

	const handleTogglePortableMode = async (
		event: React.ChangeEvent<HTMLInputElement>,
	) => {
		const newValue = event.target.checked;
		// 显示确认对话框
		setPendingValue(newValue);
		setShowConfirm(true);
	};

	const handleConfirmToggle = async () => {
		setShowConfirm(false);
		setIsLoading(true);

		try {
			const result = await settingsService.setPortableMode(pendingValue);
			setPortableMode(pendingValue);

			// 显示详细的迁移结果
			if (result.total_files > 0) {
				const details = [];
				if (result.database_migrated) {
					details.push("数据库文件");
				}
				if (result.database_backups_count > 0) {
					details.push(`${result.database_backups_count} 个数据库备份`);
				}
				if (result.savedata_backups_count > 0) {
					details.push(`${result.savedata_backups_count} 个存档备份`);
				}
				snackbar.success(`${result.message}（${details.join("、")}）`);
			} else {
				snackbar.success(result.message);
			}

			// 如果需要重启，自动重启应用
			if (result.requires_restart) {
				setTimeout(async () => {
					try {
						await relaunch();
					} catch (error) {
						console.error("重启应用失败:", error);
						snackbar.error(
							t("pages.Settings.restartError", "重启失败，请手动重启应用"),
						);
					}
				}, 1500); // 给用户时间看到提示消息
			}
		} catch (error) {
			console.error("切换便携模式失败:", error);

			// 显示详细的错误信息（包含换行符）
			const errorMessage =
				error instanceof Error ? error.message : String(error);

			// 使用多行显示错误信息
			snackbar.error(
				errorMessage ||
					t("pages.Settings.portableMode.toggleError", "切换失败"),
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<>
			<Box className="mb-6">
				<InputLabel className="font-semibold mb-4">
					{t("pages.Settings.portableMode.title", "便携模式")}
				</InputLabel>

				<Stack direction="row" alignItems="center" className="mb-2">
					<FormControlLabel
						control={
							<Switch
								checked={portableMode}
								onChange={handleTogglePortableMode}
								disabled={isLoading || !isTauri()}
								color="primary"
							/>
						}
						label={t("pages.Settings.portableMode.enable", "启用便携模式")}
					/>
				</Stack>

				<Typography
					variant="caption"
					color="text.secondary"
					className="block mt-1"
				>
					{t(
						"pages.Settings.portableMode.description",
						"开启便携模式后，数据库和备份将保存在程序安装目录resources文件夹下，而非系统应用数据目录。适合需要将程序放在U盘或移动硬盘中使用的场景。",
					)}
				</Typography>
			</Box>

			{/* 确认对话框 */}
			<AlertConfirmBox
				open={showConfirm}
				setOpen={setShowConfirm}
				title={t(
					"pages.Settings.portableMode.confirmTitle",
					"确认切换便携模式",
				)}
				message={
					pendingValue
						? t(
								"pages.Settings.portableMode.confirmEnableMessage",
								"启用便携模式后，数据库和备份将迁移至程序安装目录。操作成功后应用将自动重启。",
							)
						: t(
								"pages.Settings.portableMode.confirmDisableMessage",
								"关闭便携模式后，数据库和备份将迁移至系统应用数据目录。操作成功后应用将自动重启。",
							)
				}
				onConfirm={handleConfirmToggle}
				confirmText={t("common.confirm", "确认")}
				confirmColor="warning"
			/>
		</>
	);
};

const TimeTrackingModeSettings = () => {
	const { t } = useTranslation();
	const { timeTrackingMode, setTimeTrackingMode } = useStore();

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

/**
 * AboutSection 组件
 * 关于模块，显示应用信息、版本、更新检查等功能
 */
const AboutSection: React.FC = () => {
	const { t } = useTranslation();
	const { triggerUpdateModal } = useStore();
	const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
	const [updateStatus, setUpdateStatus] = useState<string>("");

	const handleCheckUpdate = async () => {
		setIsCheckingUpdate(true);
		setUpdateStatus("");

		try {
			await checkForUpdates({
				onUpdateFound: (update) => {
					setUpdateStatus(`发现新版本: ${update.version}`);
					// 触发全局更新窗口显示
					triggerUpdateModal(update);
				},
				onNoUpdate: () => {
					setUpdateStatus("当前已是最新版本");
				},
				onError: (error) => {
					setUpdateStatus(`检查更新失败: ${error}`);
				},
			});
		} catch (error) {
			setUpdateStatus(`检查更新出错: ${error}`);
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
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">
				{t("pages.Settings.about.title", "关于")}
			</InputLabel>

			<Box className="pl-2 space-y-3">
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
						color={
							updateStatus.includes("失败") || updateStatus.includes("出错")
								? "error"
								: "primary"
						}
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
							openurl("https://github.com/huoshen80/ReinaManager/issues/new")
						}
						size="small"
					>
						{t("pages.Settings.about.feedback", "问题反馈")}
					</Button>
				</Stack>
			</Box>
		</Box>
	);
};

const DevSettings: React.FC = () => {
	const { t } = useTranslation();

	return (
		<Accordion>
			<AccordionSummary
				expandIcon={<ArrowDropDownIcon />}
				aria-controls="panel2-content"
				id="panel2-header"
			>
				<Tooltip
					title={t(
						"pages.Settings.dev.tooltip",
						"以下功能为实验性功能，请谨慎使用",
					)}
				>
					<Typography component="span">
						{t("pages.Settings.dev.title", "实验性功能")}
					</Typography>
				</Tooltip>
			</AccordionSummary>
			<AccordionDetails>
				<BatchUpdateSettings />
			</AccordionDetails>
		</Accordion>
	);
};

const BatchUpdateSettings: React.FC = () => {
	const { t } = useTranslation();
	const { bgmToken } = useStore();
	const [isUpdatingVndb, setIsUpdatingVndb] = useState(false);
	const [isUpdatingBgm, setIsUpdatingBgm] = useState(false);
	const [updateStatus, setUpdateStatus] = useState<string>("");

	const handleBatchUpdateVndb = async () => {
		setIsUpdatingVndb(true);
		setUpdateStatus("");

		try {
			// 动态导入批量更新函数
			const { batchUpdateVndbData } = await import("@/utils");

			snackbar.info(
				t("pages.Settings.batchUpdate.updating", "正在批量更新 VNDB 数据..."),
			);

			const result = await batchUpdateVndbData();

			if (result.success > 0) {
				const message = t(
					"pages.Settings.batchUpdate.success",
					`成功更新 ${result.success}/${result.total} 个游戏`,
					{ success: result.success, total: result.total },
				);
				setUpdateStatus(message);
				snackbar.success(message);
			}

			if (result.failed > 0) {
				const failedMessage = t(
					"pages.Settings.batchUpdate.partialFailed",
					`${result.failed} 个游戏更新失败`,
					{ failed: result.failed },
				);
				setUpdateStatus((prev) =>
					prev ? `${prev}\n${failedMessage}` : failedMessage,
				);
				snackbar.warning(failedMessage);
			}

			if (result.total === 0) {
				const noGamesMessage = t(
					"pages.Settings.batchUpdate.noGames",
					"没有找到包含 VNDB ID 的游戏",
				);
				setUpdateStatus(noGamesMessage);
				snackbar.info(noGamesMessage);
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: t("pages.Settings.batchUpdate.failed", "批量更新失败");
			setUpdateStatus(errorMessage);
			snackbar.error(
				t("pages.Settings.batchUpdate.error", { message: errorMessage }),
			);
		} finally {
			setIsUpdatingVndb(false);
		}
	};

	const handleBatchUpdateBgm = async () => {
		setIsUpdatingBgm(true);
		setUpdateStatus("");

		try {
			// 动态导入批量更新函数
			const { batchUpdateBgmData } = await import("@/utils");

			snackbar.info(
				t("pages.Settings.batchUpdate.updatingBgm", "正在批量更新 BGM 数据..."),
			);

			if (bgmToken.trim() === "") {
				throw new Error(
					t(
						"pages.Settings.batchUpdate.noBgmToken",
						"更新失败：未设置 BGM Token",
					),
				);
			}
			const result = await batchUpdateBgmData(bgmToken);

			if (result.success > 0) {
				const message = t(
					"pages.Settings.batchUpdate.success",
					`成功更新 ${result.success}/${result.total} 个游戏`,
					{ success: result.success, total: result.total },
				);
				setUpdateStatus(message);
				snackbar.success(message);
			}

			if (result.failed > 0) {
				const failedMessage = t(
					"pages.Settings.batchUpdate.partialFailed",
					`${result.failed} 个游戏更新失败`,
					{ failed: result.failed },
				);
				setUpdateStatus((prev) =>
					prev ? `${prev}\n${failedMessage}` : failedMessage,
				);
				snackbar.warning(failedMessage);
			}

			if (result.total === 0) {
				const noGamesMessage = t(
					"pages.Settings.batchUpdate.noBgmGames",
					"没有找到包含 BGM ID 的游戏",
				);
				setUpdateStatus(noGamesMessage);
				snackbar.info(noGamesMessage);
			}
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: t("pages.Settings.batchUpdate.failed", "批量更新失败");
			setUpdateStatus(errorMessage);
			snackbar.error(
				t("pages.Settings.batchUpdate.errorBgm", { message: errorMessage }),
			);
		} finally {
			setIsUpdatingBgm(false);
		}
	};

	const isUpdating = isUpdatingVndb || isUpdatingBgm;

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">
				{t("pages.Settings.batchUpdate.title", "批量更新数据")}
			</InputLabel>

			<Stack direction="column" spacing={2}>
				<Typography variant="caption" className="mb-2">
					{t(
						"pages.Settings.batchUpdate.description",
						"批量更新功能可用于更新已存在游戏的 BGM/VNDB 数据。当游戏的元数据发生变化时，您可以使用此功能来同步最新的信息。一旦点击更新按钮请耐心等待，更新过程可能需要一些时间。推荐软件更新数据源获取字段时使用。",
					)}
				</Typography>
				<Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
					<Button
						variant="contained"
						color="info"
						onClick={handleBatchUpdateBgm}
						disabled={isUpdating || !isTauri()}
						startIcon={
							isUpdatingBgm ? (
								<CircularProgress size={16} color="inherit" />
							) : (
								<UpdateIcon />
							)
						}
						className="px-6 py-2"
					>
						{isUpdatingBgm
							? t("pages.Settings.batchUpdate.updating", "更新中...")
							: t("pages.Settings.batchUpdate.updateBgm", "批量更新 BGM 数据")}
					</Button>

					<Button
						variant="contained"
						color="primary"
						onClick={handleBatchUpdateVndb}
						disabled={isUpdating || !isTauri()}
						startIcon={
							isUpdatingVndb ? (
								<CircularProgress size={16} color="inherit" />
							) : (
								<UpdateIcon />
							)
						}
						className="px-6 py-2"
					>
						{isUpdatingVndb
							? t("pages.Settings.batchUpdate.updating", "更新中...")
							: t(
									"pages.Settings.batchUpdate.updateVndb",
									"批量更新 VNDB 数据",
								)}
					</Button>
				</Stack>

				{/* 更新状态显示 */}
				{updateStatus && (
					<Typography
						variant="body2"
						color={
							updateStatus.includes("失败") ||
							updateStatus.includes("fail") ||
							updateStatus.includes("错误") ||
							updateStatus.includes("error")
								? "error"
								: "primary"
						}
						className="whitespace-pre-line"
					>
						{updateStatus}
					</Typography>
				)}
			</Stack>
		</Box>
	);
};

/**
 * Settings 组件
 * 应用设置页面，支持 Bangumi Token 设置与保存、获取 Token 链接、语言切换等功能。
 *
 * @component
 * @returns {JSX.Element} 设置页面
 */
export const Settings: React.FC = () => {
	const { t } = useTranslation();
	useScrollRestore("/settings");
	const [pathSettingsModalOpen, setPathSettingsModalOpen] = useState(false);
	return (
		<PageContainer className="max-w-full">
			<Box className="py-4">
				{/* BGM Token 设置 */}
				<BgmTokenSettings />
				<Divider sx={{ my: 3 }} />

				{/* 语言设置 */}
				<LanguageSelect />
				<Divider sx={{ my: 3 }} />

				<VndbDataSettings />
				<Divider sx={{ my: 3 }} />

				{/* NSFW设置 */}
				<NsfwSettings />
				<Divider sx={{ my: 3 }} />

				{/* 卡片点击模式设置 */}
				<CardClickModeSettings />
				<Divider sx={{ my: 3 }} />

				{/* 自启动设置 */}
				<AutoStartSettings />
				<Divider sx={{ my: 3 }} />

				{/* 日志级别设置（不持久化） */}
				<LogLevelSettings />
				<Divider sx={{ my: 3 }} />

				{/* 关闭按钮设置 */}
				<CloseBtnSettings />
				<Divider sx={{ my: 3 }} />

				{/* 便携模式设置 */}
				<PortableModeSettings />
				<Divider sx={{ my: 3 }} />

				{/* 路径设置 */}
				<Box className="mb-6">
					<InputLabel className="font-semibold mb-4">
						{t("pages.Settings.pathSettings.title", "路径设置")}
					</InputLabel>
					<Button
						variant="outlined"
						onClick={() => setPathSettingsModalOpen(true)}
						className="px-4 py-2"
					>
						{t("pages.Settings.pathSettings.openModal", "打开路径设置")}
					</Button>
					<Typography
						variant="caption"
						color="text.secondary"
						className="block mt-2"
					>
						{t(
							"pages.Settings.pathSettings.note",
							"配置游戏存档备份、LE转区软件、Magpie软件、数据库备份等路径",
						)}
					</Typography>
				</Box>
				<Divider sx={{ my: 3 }} />

				{/* 数据库备份与恢复 */}
				<DatabaseBackupSettings />
				<Divider sx={{ my: 3 }} />

				{/* 计时模式设置 */}
				<TimeTrackingModeSettings />
				<Divider sx={{ my: 3 }} />

				{/* 实验性功能 */}
				<DevSettings />
				<br />

				{/* 关于 */}
				<AboutSection />
			</Box>

			{/* 路径设置弹窗 */}
			<PathSettingsModal
				open={pathSettingsModalOpen}
				onClose={() => setPathSettingsModalOpen(false)}
				inSettingsPage={true}
			/>
		</PageContainer>
	);
};
