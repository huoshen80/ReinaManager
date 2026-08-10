import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { snackbar } from "@/providers/snackBar";
import { fileService } from "@/services/invoke";
import type {
	SteamLaunchTarget,
	SteamLaunchTargetScanResult,
} from "@/services/invoke/fileService";
import type { GameData, GameLaunchType } from "@/types";
import { getUserErrorMessage } from "@/utils/errors";
import { isSteamTargetPathMatch } from "./SteamLaunchAssociationDialog";

interface UseSteamAssociationOptions {
	selectedGame: GameData;
	gameName: string;
	localPath: string;
	executable: string;
	onLocalPathChange: (path: string) => void;
	onExecutableChange: (executable: string) => void;
}

interface SteamAssociationGame {
	id: number;
	launch_type?: GameLaunchType | null;
	steam_launch_id?: string | null;
}

export function useSteamAssociation({
	selectedGame,
	gameName,
	localPath,
	executable,
	onLocalPathChange,
	onExecutableChange,
}: UseSteamAssociationOptions) {
	const { t } = useTranslation();
	const [launchType, setLaunchType] = useState<GameLaunchType>("local");
	const [steamLaunchId, setSteamLaunchId] = useState("");
	const [steamTarget, setSteamTarget] = useState<SteamLaunchTarget | null>(
		null,
	);
	const [dialogOpen, setDialogOpen] = useState(false);
	const [dialogInitialTarget, setDialogInitialTarget] = useState<
		SteamLaunchTarget | undefined
	>();
	const [scanResult, setScanResult] = useState<
		SteamLaunchTargetScanResult | undefined
	>();
	const [scanning, setScanning] = useState(false);
	const scanRequestIdRef = useRef(0);
	const activeGameIdRef = useRef(selectedGame.id);

	const syncDraft = useCallback(
		(
			gameId: number,
			nextLaunchType: GameLaunchType,
			nextSteamLaunchId: string,
		) => {
			activeGameIdRef.current = gameId;
			scanRequestIdRef.current += 1;
			setLaunchType(nextLaunchType);
			setSteamLaunchId(nextSteamLaunchId);
			setSteamTarget(null);
			setDialogOpen(false);
			setDialogInitialTarget(undefined);
			setScanning(false);
		},
		[],
	);
	const syncFromGame = useCallback(
		(game: SteamAssociationGame) =>
			syncDraft(
				game.id,
				game.launch_type ?? "local",
				game.steam_launch_id ?? "",
			),
		[syncDraft],
	);

	useEffect(() => {
		syncDraft(
			selectedGame.id,
			selectedGame.launch_type ?? "local",
			selectedGame.steam_launch_id ?? "",
		);
	}, [
		selectedGame.id,
		selectedGame.launch_type,
		selectedGame.steam_launch_id,
		syncDraft,
	]);

	const closeDialog = useCallback(() => {
		setDialogOpen(false);
		setDialogInitialTarget(undefined);
	}, []);

	const openAssociation = useCallback(
		(initialTarget?: SteamLaunchTarget) => {
			setDialogInitialTarget(
				initialTarget ??
					steamTarget ??
					(steamLaunchId
						? {
								steam_launch_id: steamLaunchId,
								name: gameName,
								localpath: localPath || undefined,
								executable: executable || undefined,
							}
						: undefined),
			);
			setDialogOpen(true);
		},
		[executable, gameName, localPath, steamLaunchId, steamTarget],
	);

	const confirmAssociation = useCallback(
		(target: SteamLaunchTarget) => {
			setLaunchType("steam");
			setSteamLaunchId(target.steam_launch_id);
			setSteamTarget(target);
			onLocalPathChange(target.localpath ?? "");
			onExecutableChange(target.executable ?? "");
			closeDialog();
		},
		[closeDialog, onExecutableChange, onLocalPathChange],
	);

	const resolveAssociation = useCallback(async () => {
		const requestId = ++scanRequestIdRef.current;
		const gameId = activeGameIdRef.current;
		setScanning(true);
		try {
			const result = scanResult ?? (await fileService.scanSteamLaunchTargets());
			if (
				requestId !== scanRequestIdRef.current ||
				gameId !== activeGameIdRef.current
			) {
				return;
			}

			setScanResult(result);
			const pathMatches = result.targets.filter((target) =>
				isSteamTargetPathMatch(target, localPath),
			);
			if (pathMatches.length === 1) {
				confirmAssociation(pathMatches[0]);
				return;
			}

			setScanning(false);
			openAssociation();
		} catch (error) {
			if (
				requestId === scanRequestIdRef.current &&
				gameId === activeGameIdRef.current
			) {
				snackbar.error(getUserErrorMessage(error, t));
			}
		} finally {
			if (
				requestId === scanRequestIdRef.current &&
				gameId === activeGameIdRef.current
			) {
				setScanning(false);
			}
		}
	}, [confirmAssociation, localPath, openAssociation, scanResult, t]);

	const handleLaunchTypeChange = useCallback(
		(nextLaunchType: GameLaunchType | null) => {
			if (!nextLaunchType || nextLaunchType === launchType) return;
			if (nextLaunchType === "local") {
				setLaunchType("local");
				return;
			}
			if (steamLaunchId) {
				setLaunchType("steam");
				return;
			}
			void resolveAssociation();
		},
		[launchType, resolveAssociation, steamLaunchId],
	);

	return {
		launchType,
		steamLaunchId,
		steamTarget,
		dialog: {
			open: dialogOpen,
			initialTarget: dialogInitialTarget,
			scanResult,
			scanning,
			setScanResult,
		},
		actions: {
			handleLaunchTypeChange,
			openAssociation,
			confirmAssociation,
			closeDialog,
			syncFromGame,
		},
	};
}
