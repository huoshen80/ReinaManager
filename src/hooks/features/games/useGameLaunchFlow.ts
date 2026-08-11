import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateGame } from "@/hooks/queries/useGames";
import { snackbar } from "@/providers/snackBar";
import { handleExeFile, splitExecutablePath } from "@/services/fs/fileDialog";
import { useGamePlayStore } from "@/store/gamePlayStore";
import type { GameData, UpdateGameParams } from "@/types";
import { getUserErrorMessage } from "@/utils/errors";

export function useGameLaunchFlow() {
	const { t } = useTranslation();
	const { mutateAsync: updateGame } = useUpdateGame();
	const launchGame = useGamePlayStore((s) => s.launchGame);

	const syncLocalPath = useCallback(
		async (game: GameData) => {
			let selectedPath: string | null;
			try {
				selectedPath = await handleExeFile(game.localpath);
			} catch (error) {
				snackbar.error(
					`${t("components.LaunchModal.selectExecutableFailed", "选择可执行文件失败")}: ${getUserErrorMessage(error, t)}`,
				);
				return false;
			}

			if (!selectedPath) {
				snackbar.warning(
					t(
						"components.LaunchModal.selectExecutableRequired",
						"请选择可执行文件",
					),
				);
				return false;
			}

			try {
				const executablePathParts = await splitExecutablePath(selectedPath);
				const updateData: UpdateGameParams = {
					...executablePathParts,
				};

				await updateGame({
					gameId: game.id,
					updates: updateData,
				});
				snackbar.success(t("components.LaunchModal.pathSaved", "路径已保存"));
				return true;
			} catch (error) {
				snackbar.error(
					`${t("components.LaunchModal.pathSaveFailed", "保存路径失败")}: ${getUserErrorMessage(error, t)}`,
				);
				return false;
			}
		},
		[t, updateGame],
	);

	const runLaunch = useCallback(
		async (game: GameData) => {
			try {
				if (game.launch_type === "steam") {
					if (!game.steam_launch_id) {
						snackbar.error(
							t(
								"components.LaunchModal.steamLaunchTargetMissing",
								"Steam 启动项无效，请重新关联",
							),
						);
						return;
					}
					if (!game.localpath) {
						snackbar.error(
							t(
								"components.LaunchModal.steamMonitorPathMissing",
								"Steam 游戏监控目录缺失，请重新关联",
							),
						);
						return;
					}

					const result = await launchGame(game.id);
					if (result.status === "failed") {
						snackbar.error(result.message);
					} else if (result.status === "delegated") {
						snackbar.info(
							t(
								"components.LaunchModal.steamTrackingUnavailable",
								"已交由 Steam 启动；当前平台暂不支持跟踪该次游玩",
							),
						);
					}
					return;
				}

				if (!game.localpath) {
					await syncLocalPath(game);
					return;
				}

				if (!game.executable) {
					const synced = await syncLocalPath(game);
					if (!synced) return;
				}

				const result = await launchGame(game.id);
				if (result.status === "failed") snackbar.error(result.message);
			} catch (error) {
				snackbar.error(
					`${t("components.LaunchModal.launchFailed", "游戏启动失败:")}: ${getUserErrorMessage(error, t)}`,
				);
			}
		},
		[launchGame, syncLocalPath, t],
	);

	return {
		launchGame: runLaunch,
		syncLocalPath,
	};
}
