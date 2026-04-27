import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
	MixedSourceCandidates,
	MixedSourceEnabled,
	MixedSourceSelection,
} from "@/api/gameMetadataService";
import type { SourceType } from "@/types";
import { SOURCE_KEYS } from "@/types";
import GameSelectDialog, { extractDisplayInfo } from "./GameSelectDialog";

interface MixedSourceConfirmDialogProps {
	open: boolean;
	onClose: () => void;
	candidates: MixedSourceCandidates;
	onConfirm: (
		selection: MixedSourceSelection,
		enabled: MixedSourceEnabled,
	) => void | Promise<void>;
	loading?: boolean;
	title?: string;
}

const SOURCE_LABELS: Record<SourceType, string> = {
	bgm: "BGM",
	vndb: "VNDB",
	ymgal: "YMGal",
	kun: "Kungal",
};

function getDialogMaxWidth(sourceCount: number): "xs" | "sm" | "md" | "lg" {
	if (sourceCount >= 4) {
		return "lg";
	}
	if (sourceCount === 3) {
		return "md";
	}
	if (sourceCount === 2) {
		return "sm";
	}
	return "xs";
}

function buildInitialState(candidates: MixedSourceCandidates): {
	selection: MixedSourceSelection;
	enabled: MixedSourceEnabled;
} {
	const selection: MixedSourceSelection = {};
	const enabled: MixedSourceEnabled = {};

	for (const source of SOURCE_KEYS) {
		const firstGame = candidates[source]?.[0] ?? null;
		selection[source] = firstGame;
		enabled[source] = Boolean(firstGame);
	}

	return { selection, enabled };
}

const MixedSourceConfirmDialog: React.FC<MixedSourceConfirmDialogProps> = ({
	open,
	onClose,
	candidates,
	onConfirm,
	loading = false,
	title,
}) => {
	const { t } = useTranslation();
	const [selection, setSelection] = useState<MixedSourceSelection>({});
	const [enabled, setEnabled] = useState<MixedSourceEnabled>({});
	const [activeSource, setActiveSource] = useState<SourceType | null>(null);

	useEffect(() => {
		if (!open) {
			setActiveSource(null);
			return;
		}

		const initialState = buildInitialState(candidates);
		setSelection(initialState.selection);
		setEnabled(initialState.enabled);
	}, [open, candidates]);

	const selectedSourceCount = useMemo(
		() =>
			SOURCE_KEYS.filter((source) => enabled[source] && selection[source])
				.length,
		[enabled, selection],
	);
	const availableSources = useMemo(
		() => SOURCE_KEYS.filter((source) => (candidates[source]?.length ?? 0) > 0),
		[candidates],
	);
	const desktopColumnCount = Math.max(1, Math.min(4, availableSources.length));
	const tabletColumnCount = Math.max(1, Math.min(2, availableSources.length));

	const activeSourceResults = activeSource ? candidates[activeSource] : [];

	return (
		<>
			<Dialog
				open={open}
				onClose={loading ? undefined : onClose}
				maxWidth={getDialogMaxWidth(availableSources.length)}
				fullWidth
				aria-labelledby="mixed-source-confirm-dialog-title"
			>
				<DialogTitle id="mixed-source-confirm-dialog-title">
					{title ||
						t("components.AddModal.confirmMixedSources", "确认 Mixed 数据源")}
				</DialogTitle>
				<DialogContent dividers>
					<Box
						sx={{
							display: "grid",
							gridTemplateColumns: {
								xs: "1fr",
								sm: `repeat(${tabletColumnCount}, minmax(0, 1fr))`,
								md: `repeat(${desktopColumnCount}, minmax(0, 1fr))`,
							},
							gap: 1.5,
						}}
					>
						{availableSources.map((source) => {
							const selectedGame = selection[source] ?? null;
							const displayInfo = selectedGame
								? extractDisplayInfo(selectedGame, source)
								: null;

							return (
								<Box
									key={source}
									sx={{
										border: "1px solid",
										borderColor: "divider",
										borderRadius: 1,
										p: 1,
										minWidth: 0,
									}}
								>
									<Stack spacing={1}>
										<FormControlLabel
											control={
												<Checkbox
													size="small"
													checked={Boolean(enabled[source])}
													onChange={(event) =>
														setEnabled((prev) => ({
															...prev,
															[source]: event.target.checked,
														}))
													}
													disabled={loading}
												/>
											}
											label={SOURCE_LABELS[source]}
										/>

										{displayInfo ? (
											<Stack direction="row" spacing={1.25} minWidth={0}>
												{displayInfo.image ? (
													<Box
														component="img"
														src={displayInfo.image}
														alt={displayInfo.name}
														sx={{
															width: 72,
															height: 96,
															objectFit: "cover",
															borderRadius: 1,
															flexShrink: 0,
														}}
													/>
												) : (
													<Box
														sx={{
															width: 72,
															height: 96,
															bgcolor: "action.hover",
															borderRadius: 1,
															display: "flex",
															alignItems: "center",
															justifyContent: "center",
															flexShrink: 0,
														}}
													>
														<Typography
															variant="caption"
															color="text.secondary"
														>
															N/A
														</Typography>
													</Box>
												)}
												<Box sx={{ minWidth: 0, flex: "1 1 auto" }}>
													<Typography variant="subtitle2" noWrap>
														{displayInfo.name_cn || displayInfo.name}
													</Typography>
													{displayInfo.name_cn && displayInfo.name && (
														<Typography
															variant="caption"
															color="text.secondary"
															noWrap
															display="block"
														>
															{displayInfo.name}
														</Typography>
													)}
													<Typography
														variant="caption"
														color="primary"
														noWrap
														display="block"
													>
														{displayInfo.sourceLabel}
													</Typography>
													{displayInfo.date && (
														<Typography
															variant="caption"
															color="text.secondary"
															noWrap
															display="block"
														>
															{displayInfo.date}
														</Typography>
													)}
												</Box>
											</Stack>
										) : null}

										<Button
											variant="outlined"
											size="small"
											onClick={() => setActiveSource(source)}
											disabled={loading}
										>
											{t("components.AddModal.viewMore", "查看更多")}
										</Button>
									</Stack>
								</Box>
							);
						})}
					</Box>
				</DialogContent>
				<DialogActions>
					<Button onClick={onClose} disabled={loading}>
						{t("components.AlertBox.cancel", "取消")}
					</Button>
					<Button
						variant="contained"
						onClick={() => onConfirm(selection, enabled)}
						disabled={loading || selectedSourceCount === 0}
						startIcon={
							loading ? <CircularProgress size={16} color="inherit" /> : null
						}
					>
						{loading
							? t("components.AlertBox.processing", "处理中")
							: t("components.AlertBox.confirm", "确认")}
					</Button>
				</DialogActions>
			</Dialog>

			{activeSource && (
				<GameSelectDialog
					open={Boolean(activeSource)}
					onClose={() => setActiveSource(null)}
					results={activeSourceResults}
					onSelect={(game) => {
						setSelection((prev) => ({
							...prev,
							[activeSource]: game,
						}));
						setEnabled((prev) => ({
							...prev,
							[activeSource]: true,
						}));
						setActiveSource(null);
					}}
					loading={loading}
					title={t("components.AddModal.selectGame", "选择游戏")}
					apiSource={activeSource}
				/>
			)}
		</>
	);
};

export default MixedSourceConfirmDialog;
