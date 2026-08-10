import RefreshRoundedIcon from "@mui/icons-material/RefreshRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";
import {
	Alert,
	Box,
	Button,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	InputAdornment,
	Radio,
	Stack,
	TextField,
	Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { snackbar } from "@/providers/snackBar";
import { normalizeDirectoryPath } from "@/services/fs/fileDialog";
import { fileService } from "@/services/invoke";
import type {
	SteamLaunchTarget,
	SteamLaunchTargetScanResult,
} from "@/services/invoke/fileService";
import { getUserErrorMessage } from "@/utils/errors";
import {
	formatSteamAppIdWithPath,
	getSteamInstallDirectoryName,
} from "@/utils/steam";

interface SteamLaunchAssociationDialogProps {
	open: boolean;
	currentLocalPath: string;
	initialTarget?: SteamLaunchTarget;
	initialScanResult?: SteamLaunchTargetScanResult;
	onScanResult: (result: SteamLaunchTargetScanResult) => void;
	onClose: () => void;
	onConfirm: (target: SteamLaunchTarget) => void;
}

function mergeTargets(
	current: readonly SteamLaunchTarget[],
	next: readonly SteamLaunchTarget[],
): SteamLaunchTarget[] {
	const byLaunchId = new Map(
		current.map((target) => [target.steam_launch_id, target]),
	);
	for (const target of next) {
		byLaunchId.set(target.steam_launch_id, target);
	}
	return Array.from(byLaunchId.values());
}

export function isSteamTargetPathMatch(
	target: SteamLaunchTarget,
	currentLocalPath: string,
): boolean {
	const currentDirectory = normalizeDirectoryPath(currentLocalPath);
	const targetDirectory = normalizeDirectoryPath(target.localpath);
	const targetInstallDirectory = getSteamInstallDirectoryName(targetDirectory);
	const currentInstallDirectory =
		getSteamInstallDirectoryName(currentDirectory);
	const sameDirectory =
		Boolean(targetDirectory) && targetDirectory === currentDirectory;
	const sameSteamInstallDirectory =
		Boolean(targetInstallDirectory) &&
		targetInstallDirectory === currentInstallDirectory;
	return sameDirectory || sameSteamInstallDirectory;
}

export function SteamLaunchAssociationDialog({
	open,
	currentLocalPath,
	initialTarget,
	initialScanResult,
	onScanResult,
	onClose,
	onConfirm,
}: SteamLaunchAssociationDialogProps) {
	const { t } = useTranslation();
	const [targets, setTargets] = useState<SteamLaunchTarget[]>(() =>
		mergeTargets(
			initialTarget ? [initialTarget] : [],
			initialScanResult?.targets ?? [],
		),
	);
	const [selectedLaunchId, setSelectedLaunchId] = useState(
		initialTarget?.steam_launch_id ?? "",
	);
	const [warnings, setWarnings] = useState<string[]>(
		initialScanResult?.warnings ?? [],
	);
	const [searchText, setSearchText] = useState("");
	const [scanning, setScanning] = useState(false);
	const hasScanned = useRef(Boolean(initialScanResult));
	const displayedTargets = useMemo(() => {
		const normalizedSearch = searchText.trim().toLocaleLowerCase();
		return targets
			.map((target) => ({
				target,
				pathMatch: isSteamTargetPathMatch(target, currentLocalPath),
			}))
			.filter(({ target }) => {
				if (!normalizedSearch) return true;
				return (
					target.name.toLocaleLowerCase().includes(normalizedSearch) ||
					target.steam_launch_id.includes(normalizedSearch)
				);
			})
			.toSorted(
				(left, right) => Number(right.pathMatch) - Number(left.pathMatch),
			);
	}, [currentLocalPath, searchText, targets]);
	const selectedTarget = targets.find(
		(target) => target.steam_launch_id === selectedLaunchId,
	);
	const busy = scanning;

	const scanSteamTargets = useCallback(async () => {
		setScanning(true);
		try {
			const result = await fileService.scanSteamLaunchTargets();
			setWarnings(result.warnings);
			onScanResult(result);
			setTargets((current) => mergeTargets(current, result.targets));
			const pathMatches = result.targets.filter((target) =>
				isSteamTargetPathMatch(target, currentLocalPath),
			);
			if (!selectedLaunchId && pathMatches.length === 1) {
				setSelectedLaunchId(pathMatches[0].steam_launch_id);
			}
		} catch (error) {
			snackbar.error(getUserErrorMessage(error, t));
		} finally {
			setScanning(false);
		}
	}, [currentLocalPath, onScanResult, selectedLaunchId, t]);

	useEffect(() => {
		if (!open || hasScanned.current) return;
		hasScanned.current = true;
		void scanSteamTargets();
	}, [open, scanSteamTargets]);

	return (
		<Dialog
			open={open}
			onClose={busy ? undefined : onClose}
			fullWidth
			maxWidth="md"
		>
			<DialogTitle>
				{t(
					"pages.Detail.GameInfoEdit.associateSteamTitle",
					"确定关联 Steam 启动项",
				)}
			</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
					<Typography color="text.secondary">
						{t(
							"pages.Detail.GameInfoEdit.associateSteamDescription",
							"自动扫描本机 Steam 启动项，并匹配当前游戏路径。",
						)}
					</Typography>
					<Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
						<Button
							variant="outlined"
							startIcon={
								scanning ? (
									<CircularProgress size={18} />
								) : (
									<RefreshRoundedIcon />
								)
							}
							onClick={() => void scanSteamTargets()}
							disabled={busy}
						>
							{t(
								"pages.Detail.GameInfoEdit.scanSteamLibrary",
								"重新扫描 Steam 启动项",
							)}
						</Button>
					</Stack>
					{warnings.length > 0 ? (
						<Alert severity="warning">{warnings.slice(0, 3).join("；")}</Alert>
					) : null}
					{targets.length > 0 ? (
						<TextField
							size="small"
							value={searchText}
							onChange={(event) => setSearchText(event.target.value)}
							placeholder={t(
								"pages.Detail.GameInfoEdit.searchSteamLaunchItem",
								"搜索游戏名称或启动 ID",
							)}
							slotProps={{
								input: {
									startAdornment: (
										<InputAdornment position="start">
											<SearchRoundedIcon fontSize="small" />
										</InputAdornment>
									),
								},
							}}
						/>
					) : null}
					<Box sx={{ maxHeight: "45vh", overflowY: "auto" }}>
						{displayedTargets.length === 0 ? (
							<Alert severity="info">
								{scanning
									? t(
											"pages.Detail.GameInfoEdit.scanningSteamLibrary",
											"正在扫描 Steam 启动项...",
										)
									: t(
											"pages.Detail.GameInfoEdit.noSteamLaunchItems",
											"未找到可用的 Steam 启动项。",
										)}
							</Alert>
						) : (
							<Stack spacing={1}>
								{displayedTargets.map(({ target, pathMatch }) => {
									return (
										<Box
											key={target.steam_launch_id}
											className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded border border-solid border-[var(--mui-palette-divider)] px-2 py-2"
											sx={{
												cursor: "pointer",
												bgcolor:
													target.steam_launch_id === selectedLaunchId
														? "action.selected"
														: undefined,
											}}
											onClick={() =>
												setSelectedLaunchId(target.steam_launch_id)
											}
										>
											<Radio
												checked={target.steam_launch_id === selectedLaunchId}
												onChange={() =>
													setSelectedLaunchId(target.steam_launch_id)
												}
												slotProps={{
													input: {
														"aria-label": t(
															"pages.Detail.GameInfoEdit.selectSteamLaunchItem",
															"选择 {{name}}",
															{ name: target.name },
														),
													},
												}}
											/>
											<Box className="min-w-0">
												<Stack
													direction="row"
													spacing={1}
													useFlexGap
													flexWrap="wrap"
												>
													<Typography fontWeight={600}>
														{target.name}
													</Typography>
													{pathMatch ? (
														<Chip
															size="small"
															color="success"
															label={t(
																"pages.Detail.GameInfoEdit.executableMatched",
																"已匹配当前游戏路径",
															)}
														/>
													) : null}
												</Stack>
												<Typography
													variant="caption"
													color="text.secondary"
													noWrap
												>
													{formatSteamAppIdWithPath(
														target.steam_launch_id,
														target.localpath,
													)}
												</Typography>
											</Box>
										</Box>
									);
								})}
							</Stack>
						)}
					</Box>
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button variant="outlined" onClick={onClose} disabled={busy}>
					{t("pages.Detail.GameInfoEdit.cancel", "取消")}
				</Button>
				<Button
					variant="contained"
					disabled={!selectedTarget || busy}
					onClick={() => {
						if (selectedTarget) onConfirm(selectedTarget);
					}}
				>
					{t("pages.Detail.GameInfoEdit.confirm", "确定")}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
