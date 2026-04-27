import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { SourceType } from "@/types";
import { SOURCE_KEYS } from "@/types";
import type {
	MixedSourceCandidates,
	MixedSourceEnabled,
	MixedSourceSelection,
} from "@/utils/metadata";
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
		return "sm";
	}
	if (sourceCount === 3) {
		return "md";
	}
	if (sourceCount === 2) {
		return "sm";
	}
	return "xs";
}

function getSourceGridClassName(sourceCount: number): string {
	if (sourceCount >= 4) {
		return "grid grid-cols-2 gap-3";
	}
	if (sourceCount === 3) {
		return "grid grid-cols-3 gap-3";
	}
	if (sourceCount === 2) {
		return "grid grid-cols-2 gap-3";
	}
	return "grid grid-cols-1 gap-3";
}

function getCoverClassName(): string {
	return "h-32 w-24";
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
	const sourceGridClassName = getSourceGridClassName(availableSources.length);
	const coverClassName = getCoverClassName();

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
					{title || t("components.AlertBox.confirmAddTitle", "确认添加游戏")}
				</DialogTitle>
				<DialogContent dividers>
					<Box className={sourceGridClassName}>
						{availableSources.map((source) => {
							const selectedGame = selection[source] ?? null;
							const displayInfo = selectedGame
								? extractDisplayInfo(selectedGame, source)
								: null;

							return (
								<Box
									key={source}
									className="min-w-0 border border-solid rounded p-3"
									sx={{ borderColor: "divider" }}
								>
									<div className="flex min-w-0 flex-col gap-3">
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
											<div className="flex min-w-0 items-start gap-3">
												{displayInfo.image ? (
													<Box
														component="img"
														src={displayInfo.image}
														alt={displayInfo.name}
														className={`${coverClassName} flex-shrink-0 rounded object-cover`}
													/>
												) : (
													<Box
														className={`${coverClassName} flex flex-shrink-0 items-center justify-center rounded`}
														sx={{ bgcolor: "action.hover" }}
													>
														<Typography
															variant="caption"
															color="text.secondary"
														>
															N/A
														</Typography>
													</Box>
												)}
												<div className="min-w-0 flex-1 pt-0.5">
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
												</div>
											</div>
										) : null}

										<Button
											variant="outlined"
											size="small"
											onClick={() => setActiveSource(source)}
											disabled={loading}
										>
											{t("components.AddModal.viewMore", "查看更多")}
										</Button>
									</div>
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
