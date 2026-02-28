import SyncAltIcon from "@mui/icons-material/SyncAlt";
import {
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Stack,
	Typography,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchUserCollection, updateUserCollection } from "@/api/bgm";
import { snackbar } from "@/components/Snackbar";
import { useSelectedGame } from "@/hooks/features/games/useGameFacade";
import { useUpdateGame } from "@/hooks/queries/useGames";
import { useBgmProfile, useBgmToken } from "@/hooks/queries/useSettings";
import { useStore } from "@/store";

const bgmTypeToLocalMap: Record<number, number> = {
	1: 1, // WISH -> 想玩
	2: 3, // COLLECT -> 玩过
	3: 2, // DO -> 在玩
	4: 4, // ON_HOLD -> 搁置
	5: 5, // DROPPED -> 抛弃
};

const localToBgmTypeMap: Record<number, number> = {
	1: 1,
	3: 2,
	2: 3,
	4: 4,
	5: 5,
};

// Todo i18n状态
const statusLabels: Record<number, string> = {
	1: "想玩 (Wish)",
	2: "在玩 (Playing)",
	3: "玩过 (Played)",
	4: "搁置 (On Hold)",
	5: "抛弃 (Dropped)",
};

const SyncBangumiModal = () => {
	const { t } = useTranslation();
	const { data: bgmToken = "" } = useBgmToken();
	const { data: bgmProfile } = useBgmProfile();
	const bgmProfileUsername = bgmProfile?.[0] ?? "";

	const selectedGameId = useStore((s) => s.selectedGameId);
	const syncBangumiModalOpen = useStore((s) => s.syncBangumiModalOpen);
	const closeSyncBangumiModal = useStore((s) => s.closeSyncBangumiModal);

	const { selectedGame } = useSelectedGame(selectedGameId);
	const updateGameMutation = useUpdateGame();

	const [loading, setLoading] = useState(false);
	const [bgmStatus, setBgmStatus] = useState<number | null>(null);

	useEffect(() => {
		const loadBgmStatus = async () => {
			if (
				syncBangumiModalOpen &&
				selectedGame?.bgm_id &&
				bgmToken &&
				bgmProfileUsername
			) {
				setLoading(true);
				try {
					const res = await fetchUserCollection(
						bgmProfileUsername,
						selectedGame.bgm_id,
						bgmToken,
					);
					if (res?.type) {
						setBgmStatus(res.type);
					} else {
						setBgmStatus(null);
					}
				} catch (error) {
					console.error("Failed to load BGM collection", error);
					setBgmStatus(null);
				} finally {
					setLoading(false);
				}
			}
		};
		loadBgmStatus();
	}, [
		syncBangumiModalOpen,
		selectedGame?.bgm_id,
		bgmToken,
		bgmProfileUsername,
	]);

	const handleClose = () => {
		setBgmStatus(null);
		closeSyncBangumiModal();
	};

	const handleOverwriteLocal = async () => {
		if (!selectedGame || selectedGame.id === undefined || bgmStatus === null)
			return;
		const mappedLocalStatus = bgmTypeToLocalMap[bgmStatus];
		if (!mappedLocalStatus) return;

		setLoading(true);
		try {
			await updateGameMutation.mutateAsync({
				gameId: selectedGame.id,
				updates: { clear: mappedLocalStatus as number },
			});
			snackbar.success(
				t("components.SyncBangumiModal.syncSuccess", "已同步到本地"),
			);
			handleClose();
		} catch (error) {
			console.error("Failed to overwrite local", error);
			snackbar.error(t("components.SyncBangumiModal.syncFailed", "同步失败"));
		} finally {
			setLoading(false);
		}
	};

	const handleOverwriteBgm = async () => {
		if (
			!selectedGame ||
			selectedGame.id === undefined ||
			!selectedGame.bgm_id ||
			!bgmToken ||
			!bgmProfileUsername
		)
			return;
		const localStatus = selectedGame.clear;
		if (!localStatus) return;
		const mappedBgmType = localToBgmTypeMap[localStatus as number];
		if (!mappedBgmType) return;

		setLoading(true);
		try {
			const success = await updateUserCollection(
				bgmProfileUsername,
				selectedGame.bgm_id,
				mappedBgmType as number,
				bgmToken,
			);
			if (success) {
				snackbar.success(
					t("components.SyncBangumiModal.syncSuccess", "已同步到 Bangumi"),
				);
				handleClose();
			} else {
				throw new Error("API sync failed");
			}
		} catch (error) {
			console.error("Failed to overwrite BGM", error);
			snackbar.error(t("components.SyncBangumiModal.syncFailed", "同步失败"));
		} finally {
			setLoading(false);
		}
	};

	const localStatusStr = selectedGame?.clear
		? statusLabels[selectedGame.clear] || "未知"
		: "无";
	const bgmStatusStr = bgmStatus
		? statusLabels[bgmTypeToLocalMap[bgmStatus]] || "未知"
		: "无";

	return (
		<Dialog
			open={syncBangumiModalOpen}
			onClose={loading ? undefined : handleClose}
			maxWidth="sm"
			fullWidth
		>
			<DialogTitle>
				{t("components.SyncBangumiModal.title", "同步 Bangumi 收藏状态")}
			</DialogTitle>
			<DialogContent>
				<Stack spacing={3} sx={{ mt: 1 }}>
					{(!bgmToken || !bgmProfileUsername) && (
						<Typography color="error">
							{t(
								"components.SyncBangumiModal.noToken",
								"请先在设置中配置 Bangumi Token 并获取用户资料",
							)}
						</Typography>
					)}
					<Stack
						direction="row"
						justifyContent="space-around"
						alignItems="center"
					>
						<Stack alignItems="center" spacing={1}>
							<Typography variant="subtitle2" color="text.secondary">
								本地状态
							</Typography>
							<Typography variant="h6">{localStatusStr}</Typography>
						</Stack>
						<SyncAltIcon color="primary" sx={{ fontSize: 40 }} />
						<Stack alignItems="center" spacing={1}>
							<Typography variant="subtitle2" color="text.secondary">
								Bangumi 状态
							</Typography>
							{loading ? (
								<CircularProgress size={24} />
							) : (
								<Typography variant="h6">{bgmStatusStr}</Typography>
							)}
						</Stack>
					</Stack>
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button onClick={handleClose} disabled={loading}>
					取消
				</Button>
				<Button
					variant="outlined"
					onClick={handleOverwriteLocal}
					disabled={
						loading || !bgmToken || !bgmProfileUsername || bgmStatus === null
					}
				>
					覆写本地
				</Button>
				<Button
					variant="contained"
					onClick={handleOverwriteBgm}
					disabled={
						loading || !bgmToken || !bgmProfileUsername || !selectedGame?.clear
					}
				>
					覆写 Bangumi
				</Button>
			</DialogActions>
		</Dialog>
	);
};

export default SyncBangumiModal;
