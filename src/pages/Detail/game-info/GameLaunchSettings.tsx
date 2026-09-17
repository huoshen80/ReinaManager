import FileOpenIcon from "@mui/icons-material/FileOpen";
import SaveIcon from "@mui/icons-material/Save";
import {
	Alert,
	Box,
	Button,
	Card,
	CardActions,
	CardContent,
	CircularProgress,
	IconButton,
	InputAdornment,
	Stack,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
	Typography,
} from "@mui/material";
import { sep } from "@tauri-apps/api/path";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PathInput } from "@/components/PathInput";
import { useUserPathInspection } from "@/hooks/common/useUserPathInspection";
import { buildGameLaunchUpdatePayload } from "@/metadata/data/metadata";
import { snackbar } from "@/providers/snackBar";
import {
	handleLaunchFile,
	splitExecutablePath,
} from "@/services/fs/fileDialog";
import type { FullGameData, GameData, UpdateGameParams } from "@/types";
import { getUserErrorMessage } from "@/utils/errors";
import { getGameDisplayName } from "@/utils/game";
import { formatSteamAppIdWithPath } from "@/utils/steam";
import { isInvalidExecutableName } from "./gameInfoEditData";
import { SteamLaunchAssociationDialog } from "./SteamLaunchAssociationDialog";
import { useSteamAssociation } from "./useSteamAssociation";

const PATH_SEPARATOR = sep();

interface GameLaunchSettingsProps {
	selectedGame: GameData;
	onSave: (data: UpdateGameParams) => Promise<FullGameData>;
	disabled?: boolean;
}

export const GameLaunchSettings: React.FC<GameLaunchSettingsProps> = ({
	selectedGame,
	onSave,
	disabled = false,
}) => {
	const { t } = useTranslation();
	const [localPath, setLocalPath] = useState(selectedGame.localpath ?? "");
	const [executable, setExecutable] = useState(selectedGame.executable ?? "");
	const [isLoading, setIsLoading] = useState(false);
	const localPathInspection = useUserPathInspection(localPath);
	const comparisonLocalPath =
		localPathInspection.inspection?.resolved_path ?? localPath;
	const steam = useSteamAssociation({
		selectedGame,
		gameName: getGameDisplayName(selectedGame),
		localPath,
		comparisonLocalPath,
		executable,
		onLocalPathChange: setLocalPath,
		onExecutableChange: setExecutable,
	});

	// biome-ignore lint/correctness/useExhaustiveDependencies: 切换到路径相同的另一款游戏时也必须重置未保存草稿
	useEffect(() => {
		setLocalPath(selectedGame.localpath ?? "");
		setExecutable(selectedGame.executable ?? "");
	}, [selectedGame.id, selectedGame.localpath, selectedGame.executable]);

	const effectiveSteamLaunchId =
		steam.launchType === "steam" ? steam.steamLaunchId : "";
	const hasChanges =
		localPath !== (selectedGame.localpath ?? "") ||
		executable !== (selectedGame.executable ?? "") ||
		steam.launchType !== (selectedGame.launch_type ?? "local") ||
		effectiveSteamLaunchId !== (selectedGame.steam_launch_id ?? "");

	const handleSelectExecutable = async () => {
		try {
			const selection = await handleLaunchFile(localPath);
			if (!selection) return;
			if (selection.launchType === "steam") {
				steam.actions.openAssociation(selection.target);
				return;
			}

			const executablePathParts = await splitExecutablePath(selection.path);
			if (executablePathParts) {
				setLocalPath(executablePathParts.localpath);
				setExecutable(executablePathParts.executable);
			}
		} catch (error) {
			snackbar.error(
				`${t("pages.Detail.GameInfoEdit.selectExecutableFailed", "选择可执行文件失败")}: ${getUserErrorMessage(error, t)}`,
			);
		}
	};

	const handleSave = async () => {
		if (!hasChanges) return;
		if (steam.launchType === "steam" && !steam.steamLaunchId.trim()) {
			snackbar.error(
				t(
					"pages.Detail.GameInfoEdit.steamLaunchItemRequired",
					"请选择 Steam 启动项",
				),
			);
			return;
		}
		if (steam.launchType === "steam" && !localPath.trim()) {
			snackbar.error(
				t(
					"pages.Detail.GameInfoEdit.steamMonitorPathRequired",
					"Steam 启动需要有效的游戏目录用于运行监控",
				),
			);
			return;
		}
		if (!localPath.trim() && executable.trim()) {
			snackbar.error(
				t(
					"pages.Detail.GameInfoEdit.localPathRequiredForExecutable",
					"填写可执行文件时，游戏目录不能为空",
				),
			);
			return;
		}
		if (isInvalidExecutableName(executable)) {
			snackbar.error(
				t(
					"pages.Detail.GameInfoEdit.invalidExecutable",
					"可执行文件必须是单个文件名，不能包含路径分隔符",
				),
			);
			return;
		}

		setIsLoading(true);
		try {
			const updateData = buildGameLaunchUpdatePayload(selectedGame, {
				newLocalPath: localPath,
				newExecutable: executable,
				newLaunchType: steam.launchType,
				newSteamLaunchId: effectiveSteamLaunchId,
			});
			if (Object.keys(updateData).length === 0) return;

			const updatedGame = await onSave(updateData);
			setLocalPath(updatedGame.localpath ?? "");
			setExecutable(updatedGame.executable ?? "");
			steam.actions.syncFromGame(updatedGame);
		} catch (error) {
			snackbar.error(
				`${t("pages.Detail.GameInfoEdit.saveLaunchSettingsFailed", "保存启动设置失败")}: ${getUserErrorMessage(error, t)}`,
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<>
			<Card>
				<CardContent>
					<Typography variant="h6" gutterBottom>
						{t("pages.Detail.GameInfoEdit.launchSettings", "启动设置")}
					</Typography>
					<Stack spacing={2}>
						<ToggleButtonGroup
							exclusive
							value={steam.launchType}
							onChange={(_, value) =>
								steam.actions.handleLaunchTypeChange(value)
							}
							disabled={
								isLoading ||
								disabled ||
								steam.dialog.scanning ||
								localPathInspection.isLoading
							}
							aria-label={t("pages.Detail.GameInfoEdit.launchType", "启动方式")}
							size="small"
							fullWidth
						>
							<ToggleButton
								value="local"
								aria-label={t(
									"pages.Detail.GameInfoEdit.localLaunch",
									"本地程序",
								)}
							>
								{t("pages.Detail.GameInfoEdit.localLaunch", "本地程序")}
							</ToggleButton>
							<ToggleButton
								value="steam"
								aria-label={t("pages.Detail.GameInfoEdit.steamLaunch", "Steam")}
							>
								{steam.dialog.scanning ? (
									<CircularProgress size={16} />
								) : (
									t("pages.Detail.GameInfoEdit.steamLaunch", "Steam")
								)}
							</ToggleButton>
						</ToggleButtonGroup>

						{steam.launchType === "steam" ? (
							<Stack spacing={1.5}>
								{steam.steamLaunchId ? (
									<Box className="rounded border border-solid border-[var(--mui-palette-divider)] p-3">
										<Typography fontWeight={600}>
											{t("pages.Detail.GameInfoEdit.steamGame", "Steam 游戏")}
										</Typography>
										<Typography variant="body2" color="text.secondary">
											{steam.steamTarget?.name ??
												getGameDisplayName(selectedGame)}
										</Typography>
										<Typography variant="caption" color="text.secondary">
											{formatSteamAppIdWithPath(steam.steamLaunchId, localPath)}
										</Typography>
									</Box>
								) : (
									<Alert severity="info">
										{t(
											"pages.Detail.GameInfoEdit.noSteamAssociation",
											"尚未关联 Steam 启动项",
										)}
									</Alert>
								)}
								<Box>
									<Button
										variant="outlined"
										onClick={() => steam.actions.openAssociation()}
										disabled={isLoading || disabled}
									>
										{steam.steamLaunchId
											? t(
													"pages.Detail.GameInfoEdit.changeSteamAssociation",
													"更换关联",
												)
											: t(
													"pages.Detail.GameInfoEdit.selectFromSteamLibrary",
													"从 Steam 库选择",
												)}
									</Button>
								</Box>
							</Stack>
						) : null}

						<Box className="flex flex-col items-start gap-2 sm:flex-row">
							<PathInput
								pathType="directory"
								inspectionState={localPathInspection}
								label={t("pages.Detail.GameInfoEdit.localPath", "游戏目录")}
								variant="outlined"
								value={localPath}
								onChange={setLocalPath}
								disabled={isLoading || disabled}
								validationError={
									!localPath.trim() && executable.trim()
										? t(
												"pages.Detail.GameInfoEdit.localPathRequiredForExecutable",
												"填写可执行文件时，游戏目录不能为空",
											)
										: undefined
								}
								className="min-w-0 flex-[2]"
								endAdornment={
									<InputAdornment position="end">
										<Typography aria-hidden color="text.secondary">
											{PATH_SEPARATOR}
										</Typography>
									</InputAdornment>
								}
							/>
							<TextField
								label={t("pages.Detail.GameInfoEdit.executable", "可执行文件")}
								variant="outlined"
								value={executable}
								onChange={(event) => setExecutable(event.target.value)}
								disabled={isLoading || disabled}
								error={isInvalidExecutableName(executable)}
								helperText={
									isInvalidExecutableName(executable)
										? t(
												"pages.Detail.GameInfoEdit.invalidExecutable",
												"可执行文件必须是单个文件名，不能包含路径分隔符",
											)
										: undefined
								}
								className="min-w-40 flex-1"
								slotProps={{
									input: {
										endAdornment:
											steam.launchType === "local" ? (
												<InputAdornment position="end">
													<IconButton
														onClick={handleSelectExecutable}
														disabled={isLoading || disabled}
														edge="end"
														size="small"
													>
														<FileOpenIcon />
													</IconButton>
												</InputAdornment>
											) : null,
									},
								}}
							/>
						</Box>
					</Stack>
				</CardContent>
				<CardActions className="px-4 pb-4">
					<Button
						variant="contained"
						fullWidth
						onClick={handleSave}
						disabled={isLoading || disabled || !hasChanges}
						startIcon={
							isLoading ? (
								<CircularProgress size={20} color="inherit" />
							) : (
								<SaveIcon />
							)
						}
					>
						{isLoading
							? t("pages.Detail.GameInfoEdit.saving", "保存中...")
							: t(
									"pages.Detail.GameInfoEdit.saveLaunchSettings",
									"保存启动设置",
								)}
					</Button>
				</CardActions>
			</Card>

			{steam.dialog.open ? (
				<SteamLaunchAssociationDialog
					open
					currentLocalPath={comparisonLocalPath}
					initialTarget={steam.dialog.initialTarget}
					initialScanResult={steam.dialog.scanResult}
					onScanResult={steam.dialog.setScanResult}
					onClose={steam.actions.closeDialog}
					onConfirm={steam.actions.confirmAssociation}
				/>
			) : null}
		</>
	);
};
