import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import SaveIcon from "@mui/icons-material/Save";
import {
	Alert,
	Box,
	Button,
	Card,
	CardContent,
	Checkbox,
	CircularProgress,
	FormControlLabel,
	Stack,
	Switch,
	TextField,
	Typography,
} from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useUpdateGame } from "@/hooks/queries/useGames";
import {
	useAllSettings,
	useVndbCurrentUserProfile,
} from "@/hooks/queries/useSettings";
import { useGameStats } from "@/hooks/queries/useStats";
import { buildGameInfoUpdatePayload } from "@/metadata/data/metadata";
import { getSourceIdFromDisplay } from "@/metadata/sourceRecord";
import { snackbar } from "@/providers/snackBar";
import {
	hasUserRating,
	normalizeUserRating,
	pushGameUserReviewToCloud,
	type UserReviewPushResult,
} from "@/services/cloudUserReview";
import type { GameData } from "@/types";
import { parsePlaytimeInput } from "@/utils/dateTime";
import { getUserErrorMessage } from "@/utils/errors";
import { getGameDisplayName } from "@/utils/game";

interface ReviewProps {
	selectedGame: GameData;
}

interface ParsedRating {
	value: number;
	error?: string;
}

function formatRating(value: number | null | undefined) {
	return hasUserRating(value) ? normalizeUserRating(value).toFixed(1) : "0";
}

function parseRatingInput(input: string): ParsedRating {
	const trimmed = input.trim();
	if (!trimmed) return { value: 0 };

	const value = Number(trimmed);
	if (!Number.isFinite(value)) {
		return { value: 0, error: "invalid" };
	}
	if (value === 0) return { value: 0 };
	if (value < 1 || value > 10) {
		return { value: 0, error: "range" };
	}
	return { value: normalizeUserRating(value) };
}

function isSameReviewState(
	selectedGame: GameData,
	rating: number,
	review: string,
) {
	const currentRating = selectedGame.custom_data?.user_rating ?? 0;
	const currentReview = selectedGame.custom_data?.user_review?.trim() ?? "";
	return (
		normalizeUserRating(currentRating) === rating &&
		currentReview === review.trim()
	);
}

function getSourceLabel(source: UserReviewPushResult["source"]) {
	switch (source) {
		case "bgm":
			return "BGM";
		case "vndb":
			return "VNDB";
		case "hikarinagi":
			return "Hikarinagi";
		default:
			return assertNever(source);
	}
}

function assertNever(value: never): never {
	throw new Error(`不支持的评价推送来源: ${String(value)}`);
}

export const Review: React.FC<ReviewProps> = ({ selectedGame }) => {
	const { t } = useTranslation();
	const updateGameMutation = useUpdateGame();
	const { data: settings, isLoading: isSettingsLoading } = useAllSettings();
	const { data: gameStats } = useGameStats(selectedGame.id);
	const bgmId = getSourceIdFromDisplay(selectedGame, "bgm");
	const vndbId = getSourceIdFromDisplay(selectedGame, "vndb");
	const hikarinagiId = getSourceIdFromDisplay(selectedGame, "hikarinagi");
	const hasVndbId = Boolean(vndbId);
	const { data: vndbProfile, isLoading: isVndbProfileLoading } =
		useVndbCurrentUserProfile({ enabled: hasVndbId });
	const [ratingInput, setRatingInput] = useState(() =>
		formatRating(selectedGame.custom_data?.user_rating),
	);
	const [reviewInput, setReviewInput] = useState(
		() => selectedGame.custom_data?.user_review ?? "",
	);
	const [pushBgm, setPushBgm] = useState(Boolean(bgmId));
	const [pushVndb, setPushVndb] = useState(Boolean(vndbId));
	const [pushHikarinagi, setPushHikarinagi] = useState(Boolean(hikarinagiId));
	const [bgmPrivate, setBgmPrivate] = useState(false);
	const [hikarinagiSpoiler, setHikarinagiSpoiler] = useState(false);
	const [pushHikarinagiPlaytime, setPushHikarinagiPlaytime] = useState(true);
	const [hikarinagiHoursInput, setHikarinagiHoursInput] = useState("0");
	const [hikarinagiMinutesInput, setHikarinagiMinutesInput] = useState("0");
	const [playtimeInitializedGameId, setPlaytimeInitializedGameId] = useState<
		number | null
	>(null);
	const [pushResults, setPushResults] = useState<UserReviewPushResult[]>([]);
	const [isPushing, setIsPushing] = useState(false);
	const [pushDefaultsApplied, setPushDefaultsApplied] = useState(false);

	const hasBgmToken = Boolean(settings?.bgm_auth?.access_token);
	const hasVndbToken = Boolean(settings?.vndb_token);
	const hasHikarinagiToken = Boolean(settings?.hikarinagi_auth?.access_token);
	const canPushBgm = Boolean(bgmId && hasBgmToken);
	const canPushVndb = Boolean(
		vndbId && hasVndbToken && vndbProfile?.permissions.includes("listwrite"),
	);
	const canPushHikarinagi = Boolean(hikarinagiId && hasHikarinagiToken);
	const isPushCapabilityLoading =
		isSettingsLoading ||
		Boolean(hasVndbId && hasVndbToken && isVndbProfileLoading);
	const effectivePushBgm = pushBgm && canPushBgm;
	const effectivePushVndb = pushVndb && canPushVndb;
	const effectivePushHikarinagi = pushHikarinagi && canPushHikarinagi;
	const hikarinagiPlaytimeInputsDisabled =
		!effectivePushHikarinagi || !pushHikarinagiPlaytime;

	useEffect(() => {
		if (
			gameStats === undefined ||
			playtimeInitializedGameId === selectedGame.id
		) {
			return;
		}

		const totalMinutes = Math.max(0, Math.floor(gameStats?.totalMinutes ?? 0));
		setHikarinagiHoursInput(String(Math.floor(totalMinutes / 60)));
		setHikarinagiMinutesInput(String(totalMinutes % 60));
		setPlaytimeInitializedGameId(selectedGame.id);
	}, [gameStats, playtimeInitializedGameId, selectedGame.id]);

	useEffect(() => {
		if (pushDefaultsApplied || isPushCapabilityLoading) return;

		setPushBgm(canPushBgm);
		setPushVndb(canPushVndb);
		setPushHikarinagi(canPushHikarinagi);
		setPushDefaultsApplied(true);
	}, [
		canPushBgm,
		canPushHikarinagi,
		canPushVndb,
		isPushCapabilityLoading,
		pushDefaultsApplied,
	]);

	const parsedRating = useMemo(
		() => parseRatingInput(ratingInput),
		[ratingInput],
	);
	const ratingError = Boolean(parsedRating.error);
	const ratingErrorText =
		parsedRating.error === "range"
			? t("pages.Detail.Review.ratingRangeError", "评分只能为 0 或 1-10")
			: parsedRating.error === "invalid"
				? t("pages.Detail.Review.ratingInvalidError", "请输入有效评分")
				: "";
	const bgmRate = Math.round(parsedRating.value);
	const hikarinagiRate = Math.round(parsedRating.value);
	const showBgmRoundNotice =
		effectivePushBgm &&
		parsedRating.value > 0 &&
		Math.abs(parsedRating.value - bgmRate) > Number.EPSILON;
	const showHikarinagiRoundNotice =
		effectivePushHikarinagi &&
		parsedRating.value > 0 &&
		Math.abs(parsedRating.value - hikarinagiRate) > Number.EPSILON;
	const hasLocalChanges =
		!ratingError &&
		!isSameReviewState(selectedGame, parsedRating.value, reviewInput);

	const saveReviewDraft = useCallback(async () => {
		const nextRating = parseRatingInput(ratingInput);
		if (nextRating.error) {
			snackbar.error(
				nextRating.error === "range"
					? t("pages.Detail.Review.ratingRangeError", "评分只能为 0 或 1-10")
					: t("pages.Detail.Review.ratingInvalidError", "请输入有效评分"),
			);
			setRatingInput(formatRating(selectedGame.custom_data?.user_rating));
			return false;
		}

		if (isSameReviewState(selectedGame, nextRating.value, reviewInput)) {
			setRatingInput(formatRating(nextRating.value));
			return true;
		}

		try {
			const updates = buildGameInfoUpdatePayload(selectedGame, {
				newLocalPath: selectedGame.localpath ?? "",
				newName: getGameDisplayName(selectedGame),
				newUserRating: nextRating.value,
				newUserReview: reviewInput,
			});
			if (Object.keys(updates).length === 0) {
				setRatingInput(formatRating(nextRating.value));
				return true;
			}

			await updateGameMutation.mutateAsync({
				gameId: selectedGame.id,
				updates,
			});
			setRatingInput(formatRating(nextRating.value));
			snackbar.success(t("pages.Detail.Review.saveSuccess", "评价已保存"));
			return true;
		} catch (error) {
			snackbar.error(getUserErrorMessage(error, t));
			return false;
		}
	}, [ratingInput, reviewInput, selectedGame, t, updateGameMutation]);

	const handlePush = async () => {
		if (!effectivePushBgm && !effectivePushVndb && !effectivePushHikarinagi) {
			return;
		}

		const nextRating = parseRatingInput(ratingInput);
		if (nextRating.error) {
			snackbar.error(
				nextRating.error === "range"
					? t("pages.Detail.Review.ratingRangeError", "评分只能为 0 或 1-10")
					: t("pages.Detail.Review.ratingInvalidError", "请输入有效评分"),
			);
			return;
		}

		const hikarinagiTimeToFinishMinutes =
			effectivePushHikarinagi && pushHikarinagiPlaytime
				? parsePlaytimeInput(hikarinagiHoursInput, hikarinagiMinutesInput)
				: undefined;
		if (
			effectivePushHikarinagi &&
			pushHikarinagiPlaytime &&
			hikarinagiTimeToFinishMinutes === null
		) {
			snackbar.error(
				t("pages.Detail.Review.playtimeInvalid", "请输入有效的小时和分钟"),
			);
			return;
		}

		setIsPushing(true);
		setPushResults([]);
		try {
			const results = await pushGameUserReviewToCloud(selectedGame, {
				rating: nextRating.value,
				review: reviewInput,
				pushBgm: effectivePushBgm,
				pushVndb: effectivePushVndb,
				pushHikarinagi: effectivePushHikarinagi,
				bgmPrivate,
				hikarinagiSpoiler,
				hikarinagiTimeToFinishMinutes:
					hikarinagiTimeToFinishMinutes ?? undefined,
			});
			setPushResults(results);

			if (results.every((result) => result.success)) {
				snackbar.success(t("pages.Detail.Review.pushSuccess", "评价推送完成"));
			} else {
				snackbar.error(
					t("pages.Detail.Review.pushPartialFailed", "部分目标推送失败"),
				);
			}
		} finally {
			setIsPushing(false);
		}
	};

	return (
		<Box sx={{ p: 3 }}>
			<Stack spacing={3}>
				<Card>
					<CardContent>
						<Typography variant="h6" gutterBottom>
							{t("pages.Detail.Review.localReview", "本地评价")}
						</Typography>
						<Stack spacing={3}>
							<TextField
								label={t("pages.Detail.Review.myRating", "我的评分")}
								type="number"
								size="small"
								value={ratingInput}
								onChange={(event) => setRatingInput(event.target.value)}
								error={ratingError}
								helperText={
									ratingErrorText ||
									t(
										"pages.Detail.Review.ratingHelperText",
										"0 表示清空评分；1-10 支持一位小数",
									)
								}
								inputProps={{ min: 0, max: 10, step: 0.1 }}
								sx={{ width: { xs: "100%", sm: 180 } }}
							/>
							<TextField
								label={t("pages.Detail.Review.myReview", "我的评价")}
								value={reviewInput}
								onChange={(event) => setReviewInput(event.target.value)}
								fullWidth
								multiline
								minRows={6}
								maxRows={12}
								helperText={t(
									"pages.Detail.Review.reviewHelperText",
									"评分和评价会一起保存到本地",
								)}
								InputProps={{
									sx: {
										"& textarea": {
											resize: "vertical",
											overflow: "auto !important",
										},
									},
								}}
							/>
							<Button
								variant="contained"
								fullWidth
								startIcon={
									updateGameMutation.isPending ? (
										<CircularProgress size={16} />
									) : (
										<SaveIcon />
									)
								}
								disabled={
									updateGameMutation.isPending ||
									ratingError ||
									!hasLocalChanges
								}
								onClick={() => void saveReviewDraft()}
							>
								{updateGameMutation.isPending
									? t("pages.Detail.Review.saving", "保存中...")
									: t("pages.Detail.Review.save", "保存本地评价")}
							</Button>
						</Stack>
					</CardContent>
				</Card>

				<Card>
					<CardContent>
						<Typography variant="h6" gutterBottom>
							{t("pages.Detail.Review.cloudPush", "云端推送")}
						</Typography>
						<Typography variant="body2" color="textSecondary" gutterBottom>
							{t(
								"pages.Detail.Review.cloudPushHelperText",
								"推送会使用当前表单内容覆盖所选站点的评分、评价和游戏时长",
							)}
						</Typography>
						<Stack spacing={1.5}>
							<Box
								sx={{
									border: 1,
									borderColor: "divider",
									borderRadius: 1,
									p: 1,
								}}
							>
								<Stack
									direction={{ xs: "column", sm: "row" }}
									spacing={1}
									alignItems={{ xs: "flex-start", sm: "center" }}
								>
									<FormControlLabel
										sx={{ m: 0 }}
										control={
											<Checkbox
												checked={effectivePushBgm}
												disabled={!canPushBgm}
												onChange={(event) => setPushBgm(event.target.checked)}
											/>
										}
										label="BGM"
									/>
									<FormControlLabel
										sx={{ m: 0 }}
										control={
											<Switch
												checked={bgmPrivate}
												disabled={!effectivePushBgm}
												onChange={(event) =>
													setBgmPrivate(event.target.checked)
												}
											/>
										}
										label={t("pages.Detail.Review.bgmPrivate", "BGM 私密")}
									/>
								</Stack>
							</Box>

							<Box
								sx={{
									border: 1,
									borderColor: "divider",
									borderRadius: 1,
									p: 1,
								}}
							>
								<Stack
									direction={{ xs: "column", sm: "row" }}
									spacing={1}
									alignItems={{ xs: "flex-start", sm: "center" }}
								>
									<FormControlLabel
										sx={{ m: 0 }}
										control={
											<Checkbox
												checked={effectivePushVndb}
												disabled={!canPushVndb}
												onChange={(event) => setPushVndb(event.target.checked)}
											/>
										}
										label="VNDB"
									/>
								</Stack>
							</Box>

							<Box
								sx={{
									border: 1,
									borderColor: "divider",
									borderRadius: 1,
									p: 1,
								}}
							>
								<Stack
									direction={{ xs: "column", sm: "row" }}
									spacing={1}
									alignItems={{ xs: "flex-start", sm: "center" }}
								>
									<FormControlLabel
										sx={{ m: 0 }}
										control={
											<Checkbox
												checked={effectivePushHikarinagi}
												disabled={!canPushHikarinagi}
												onChange={(event) =>
													setPushHikarinagi(event.target.checked)
												}
											/>
										}
										label="Hikarinagi"
									/>
									<FormControlLabel
										sx={{ m: 0 }}
										control={
											<Switch
												checked={hikarinagiSpoiler}
												disabled={!effectivePushHikarinagi}
												onChange={(event) =>
													setHikarinagiSpoiler(event.target.checked)
												}
											/>
										}
										label={t(
											"pages.Detail.Review.hikarinagiSpoiler",
											"包含剧透",
										)}
									/>
									<FormControlLabel
										sx={{ m: 0 }}
										control={
											<Switch
												checked={pushHikarinagiPlaytime}
												disabled={!effectivePushHikarinagi}
												onChange={(event) =>
													setPushHikarinagiPlaytime(event.target.checked)
												}
											/>
										}
										label={t(
											"pages.Detail.Review.pushGameTime",
											"推送游戏时长",
										)}
									/>
								</Stack>
								<Stack
									direction={{ xs: "column", sm: "row" }}
									spacing={1}
									sx={{ mt: 1 }}
								>
									<TextField
										label={t("pages.Detail.sessionDurationHours", "小时")}
										type="number"
										size="small"
										value={hikarinagiHoursInput}
										disabled={hikarinagiPlaytimeInputsDisabled}
										onChange={(event) =>
											setHikarinagiHoursInput(event.target.value)
										}
										inputProps={{ min: 0, step: 1 }}
										sx={{ width: { xs: "100%", sm: 140 } }}
									/>
									<TextField
										label={t("pages.Detail.sessionDurationMinutePart", "分钟")}
										type="number"
										size="small"
										value={hikarinagiMinutesInput}
										disabled={hikarinagiPlaytimeInputsDisabled}
										onChange={(event) =>
											setHikarinagiMinutesInput(event.target.value)
										}
										inputProps={{ min: 0, max: 59, step: 1 }}
										sx={{ width: { xs: "100%", sm: 140 } }}
									/>
								</Stack>
							</Box>

							<Button
								variant="contained"
								startIcon={
									isPushing ? (
										<CircularProgress size={16} />
									) : (
										<CloudUploadIcon />
									)
								}
								disabled={
									isPushing ||
									updateGameMutation.isPending ||
									(!effectivePushBgm &&
										!effectivePushVndb &&
										!effectivePushHikarinagi)
								}
								onClick={handlePush}
							>
								{t("pages.Detail.Review.push", "推送")}
							</Button>
						</Stack>
						{showBgmRoundNotice && (
							<Alert severity="info" sx={{ mt: 2 }}>
								{t(
									"pages.Detail.Review.bgmRoundNotice",
									"BGM 将按 {{rating}} 分推送",
									{ rating: bgmRate },
								)}
							</Alert>
						)}
						{showHikarinagiRoundNotice && (
							<Alert severity="info" sx={{ mt: 2 }}>
								{t(
									"pages.Detail.Review.hikarinagiRoundNotice",
									"Hikarinagi 将按 {{rating}} 分推送",
									{ rating: hikarinagiRate },
								)}
							</Alert>
						)}
						{pushResults.length > 0 && (
							<Stack spacing={1} sx={{ mt: 2 }}>
								{pushResults.map((result) => (
									<Alert
										key={result.source}
										severity={result.success ? "success" : "error"}
									>
										{result.success
											? t("pages.Detail.Review.pushTargetSuccess", {
													source: getSourceLabel(result.source),
													defaultValue: "{{source}} 推送成功",
												})
											: t("pages.Detail.Review.pushTargetFailed", {
													source: getSourceLabel(result.source),
													message: result.error
														? getUserErrorMessage(result.error, t)
														: t("errors.requestFailed", "请求失败，请稍后重试"),
													defaultValue: "{{source}} 推送失败：{{message}}",
												})}
									</Alert>
								))}
							</Stack>
						)}
					</CardContent>
				</Card>
			</Stack>
		</Box>
	);
};
