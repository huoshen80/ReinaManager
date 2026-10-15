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
	Tooltip,
	Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link as RouterLink } from "react-router-dom";
import { useUpdateGame } from "@/hooks/queries/useGames";
import {
	useAllSettings,
	useNextmoeAuth,
	useVndbCurrentUserProfile,
} from "@/hooks/queries/useSettings";
import { useGameStats } from "@/hooks/queries/useStats";
import { buildGameReviewUpdatePayload } from "@/metadata/data/metadata";
import { getSourceIdFromDisplay } from "@/metadata/sourceRecord";
import { getRuntimeSourceAdapter } from "@/metadata/sourceRegistry";
import { snackbar } from "@/providers/snackBar";
import {
	hasUserRating,
	normalizeUserRating,
	pushGameUserReviewToCloud,
	shouldPushUserReview,
	type UserReviewPushResult,
	type UserReviewPushSource,
} from "@/services/cloudUserReview";
import type { GameData } from "@/types";
import { parsePlaytimeInput } from "@/utils/dateTime";
import { getUserErrorMessage } from "@/utils/errors";

interface ReviewProps {
	selectedGame: GameData;
}

interface ParsedRating {
	value: number;
	error?: string;
}

type PushAvailability =
	| "loading"
	| "signedOut"
	| "permissionDenied"
	| "unavailable"
	| "ready";

interface PushOption {
	key: string;
	label: string;
	checked: boolean;
	disabled?: boolean;
	onChange: (checked: boolean) => void;
}

interface PushTargetConfig {
	source: UserReviewPushSource;
	id: string | null | undefined;
	availability: PushAvailability;
	options?: PushOption[];
	notice?: string;
}

interface PushTarget extends PushTargetConfig {
	selected: boolean;
}

function getPushAvailability({
	loading,
	hasToken,
	verificationFailed = false,
	hasPermission = true,
}: {
	loading: boolean;
	hasToken: boolean;
	verificationFailed?: boolean;
	hasPermission?: boolean;
}): PushAvailability {
	if (loading) return "loading";
	if (verificationFailed) return "unavailable";
	if (!hasToken) return "signedOut";
	return hasPermission ? "ready" : "permissionDenied";
}

function PushTargetRow({
	target,
	results,
	pending,
	disabled,
	onSelect,
}: {
	target: PushTarget;
	results: UserReviewPushResult[];
	pending: boolean;
	disabled: boolean;
	onSelect: (selected: boolean) => void;
}) {
	const { t } = useTranslation();
	const failures = results.filter((result) => !result.success);
	const statusMessage = {
		loading: t("pages.Detail.Review.checkingAccount", "正在检查账号"),
		signedOut: t("pages.Detail.Review.signedOut", "未登录"),
		permissionDenied: t("pages.Detail.Review.permissionDenied", "缺少写入权限"),
		unavailable: t("pages.Detail.Review.accountUnavailable", "账号验证失败"),
		ready: "",
	}[target.availability];
	const statusDetail = {
		loading: statusMessage,
		signedOut: t(
			"pages.Detail.Review.loginToPush",
			"请先在账号设置中登录该站点",
		),
		permissionDenied: t(
			"pages.Detail.Review.vndbWritePermissionRequired",
			"无法推送，请在账号设置中检查 VNDB Token 的 listwrite 权限",
		),
		unavailable: t(
			"pages.Detail.Review.accountUnavailableHint",
			"暂时无法验证账号，请检查网络或在账号设置中检查凭证",
		),
		ready: "",
	}[target.availability];
	const resultColor =
		failures.length === 0
			? "success.main"
			: failures.length === results.length
				? "error.main"
				: "warning.main";
	const resultMessage =
		failures.length === 0
			? results.every((result) => result.kind === "playtime")
				? t("pages.Detail.Review.playtimePushSuccess", "时长推送成功")
				: t("pages.Detail.Review.sourcePushSuccess", "推送成功")
			: failures.length === results.length
				? t("pages.Detail.Review.sourcePushFailed", "推送失败")
				: t("pages.Detail.Review.sourcePushPartial", "部分成功");

	return (
		<Box
			component="li"
			className="list-none border-0 border-b border-solid border-[var(--mui-palette-divider)] py-3 last:border-b-0"
		>
			<Box className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
				<FormControlLabel
					className="m-0"
					control={
						<Checkbox
							size="small"
							checked={target.selected}
							disabled={
								disabled || !target.id || target.availability !== "ready"
							}
							onChange={(event) => onSelect(event.target.checked)}
						/>
					}
					label={
						<Typography variant="subtitle2">
							{getRuntimeSourceAdapter(target.source).label}
						</Typography>
					}
				/>
				<Box className="flex flex-wrap items-center gap-2" aria-live="polite">
					{!target.id ? (
						<Tooltip
							title={t("pages.Detail.Review.missingSourceIdHint", {
								source: getRuntimeSourceAdapter(target.source).label,
								defaultValue:
									"当前游戏尚未关联 {{source}} ID，请先在游戏编辑页补充对应 ID",
							})}
						>
							<Typography
								component="span"
								variant="caption"
								color="textSecondary"
								tabIndex={0}
							>
								{t("pages.Detail.Review.missingSourceId", "未关联 ID")}
							</Typography>
						</Tooltip>
					) : null}
					{pending ? (
						<>
							<CircularProgress size={14} />
							<Typography variant="caption" color="textSecondary">
								{t("pages.Detail.Review.pushing", "推送中...")}
							</Typography>
						</>
					) : results.length > 0 ? (
						<Typography variant="caption" color={resultColor} role="status">
							{resultMessage}
						</Typography>
					) : null}
					{!pending && target.availability !== "ready" ? (
						<Tooltip title={statusDetail}>
							<Typography
								component="span"
								variant="caption"
								color="textSecondary"
								tabIndex={0}
							>
								{statusMessage}
							</Typography>
						</Tooltip>
					) : null}
				</Box>
			</Box>
			{target.selected && target.options?.length ? (
				<Box className="flex flex-wrap items-center gap-x-4 gap-y-1 pl-8 pt-1">
					{target.options.map((option) => (
						<FormControlLabel
							key={option.key}
							className="m-0"
							control={
								<Switch
									size="small"
									checked={option.checked}
									disabled={disabled || option.disabled}
									onChange={(event) => option.onChange(event.target.checked)}
								/>
							}
							label={<Typography variant="body2">{option.label}</Typography>}
						/>
					))}
				</Box>
			) : null}
			{target.selected && target.notice ? (
				<Typography
					variant="caption"
					color="textSecondary"
					component="p"
					className="m-0 pl-8 pt-1"
				>
					{target.notice}
				</Typography>
			) : null}
			{!pending && failures.length > 0 ? (
				<Box className="space-y-1 pl-8 pt-1" role="status">
					{failures.map((result) => (
						<Typography
							key={result.kind}
							variant="caption"
							color="error"
							component="p"
							className="m-0 break-words"
						>
							{t("pages.Detail.Review.pushTargetFailed", {
								source:
									result.kind === "playtime"
										? t("pages.Detail.totalPlayTime", "累计总时长")
										: t("pages.Detail.Review.reviewContent", "评分与评价"),
								message: getUserErrorMessage(result.error, t),
								defaultValue: "{{source}} 推送失败：{{message}}",
							})}
						</Typography>
					))}
				</Box>
			) : null}
		</Box>
	);
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

export const Review: React.FC<ReviewProps> = ({ selectedGame }) => {
	const { t } = useTranslation();
	const updateGameMutation = useUpdateGame();
	const {
		data: settings,
		isLoading: isSettingsLoading,
		isError: isSettingsError,
	} = useAllSettings();
	const { data: gameStats } = useGameStats(selectedGame.id);
	const bgmId = getSourceIdFromDisplay(selectedGame, "bgm");
	const vndbId = getSourceIdFromDisplay(selectedGame, "vndb");
	const hikarinagiId = getSourceIdFromDisplay(selectedGame, "hikarinagi");
	const kunId = getSourceIdFromDisplay(selectedGame, "kun");
	const {
		data: nextmoeAuth,
		isLoading: isNextmoeAuthLoading,
		isError: isNextmoeAuthError,
	} = useNextmoeAuth();
	const {
		data: vndbProfile,
		isLoading: isVndbProfileLoading,
		isError: isVndbProfileError,
	} = useVndbCurrentUserProfile();
	const [ratingInput, setRatingInput] = useState(() =>
		formatRating(selectedGame.custom_data?.user_rating),
	);
	const [reviewInput, setReviewInput] = useState(
		() => selectedGame.custom_data?.user_review ?? "",
	);
	const [sourceSelection, setSourceSelection] = useState<
		Partial<Record<UserReviewPushSource, boolean>>
	>({});
	const [bgmPrivate, setBgmPrivate] = useState(false);
	const [hikarinagiPrivate, setHikarinagiPrivate] = useState(false);
	const [hikarinagiSpoiler, setHikarinagiSpoiler] = useState(false);
	const [kunSpoiler, setKunSpoiler] = useState(false);
	const [pushHikarinagiPlaytime, setPushHikarinagiPlaytime] = useState(true);
	const [pushKunPlaytime, setPushKunPlaytime] = useState(true);
	const [playtimeHoursInput, setPlaytimeHoursInput] = useState("");
	const [playtimeMinutesInput, setPlaytimeMinutesInput] = useState("");
	const [playtimeInitializedGameId, setPlaytimeInitializedGameId] = useState<
		number | null
	>(null);
	const [pushResults, setPushResults] = useState<UserReviewPushResult[]>([]);
	const [pushingSources, setPushingSources] = useState<UserReviewPushSource[]>(
		[],
	);
	const isPushing = pushingSources.length > 0;

	const hasBgmToken = Boolean(settings?.bgm_auth?.access_token);
	const hasVndbToken = Boolean(settings?.vndb_token);
	const hasHikarinagiToken = Boolean(settings?.hikarinagi_auth?.access_token);
	const hasKunToken = Boolean(nextmoeAuth?.access_token);

	useEffect(() => {
		if (
			gameStats === undefined ||
			playtimeInitializedGameId === selectedGame.id
		) {
			return;
		}

		const totalMinutes = Math.max(0, Math.floor(gameStats?.totalMinutes ?? 0));
		setPlaytimeHoursInput(String(Math.floor(totalMinutes / 60)));
		setPlaytimeMinutesInput(String(totalMinutes % 60));
		setPlaytimeInitializedGameId(selectedGame.id);
	}, [gameStats, playtimeInitializedGameId, selectedGame.id]);

	const parsedRating = parseRatingInput(ratingInput);
	const ratingError = Boolean(parsedRating.error);
	const ratingErrorText =
		parsedRating.error === "range"
			? t("pages.Detail.Review.ratingRangeError", "评分只能为 0 或 1-10")
			: parsedRating.error === "invalid"
				? t("pages.Detail.Review.ratingInvalidError", "请输入有效评分")
				: "";
	const roundedRating = Math.round(parsedRating.value);
	const showRoundNotice =
		!ratingError &&
		parsedRating.value > 0 &&
		Math.abs(parsedRating.value - roundedRating) > Number.EPSILON;
	const spoilerLabel = t("pages.Detail.Review.containsSpoilers", "包含剧透");
	const playtimeLabel = t("pages.Detail.Review.pushGameTime", "推送游戏时长");
	const privateLabel = t("pages.Detail.Review.onlyVisibleToMe", "仅自己可见");
	const getRoundNotice = (source: UserReviewPushSource) =>
		showRoundNotice
			? t(
					"pages.Detail.Review.roundedRatingNotice",
					"{{source}} 将按 {{rating}} 分推送",
					{
						source: getRuntimeSourceAdapter(source).label,
						rating: roundedRating,
					},
				)
			: undefined;
	const shouldPushKunReview = shouldPushUserReview("kun", parsedRating.value);
	const targetConfigs: PushTargetConfig[] = [
		{
			source: "bgm",
			id: bgmId,
			availability: getPushAvailability({
				loading: isSettingsLoading,
				hasToken: hasBgmToken,
				verificationFailed: isSettingsError,
			}),
			options: [
				{
					key: "private",
					label: privateLabel,
					checked: bgmPrivate,
					onChange: setBgmPrivate,
				},
			],
			notice: getRoundNotice("bgm"),
		},
		{
			source: "vndb",
			id: vndbId,
			availability: getPushAvailability({
				loading: isSettingsLoading || (hasVndbToken && isVndbProfileLoading),
				hasToken: hasVndbToken,
				verificationFailed:
					isSettingsError ||
					(hasVndbToken &&
						(isVndbProfileError || (!isVndbProfileLoading && !vndbProfile))),
				hasPermission: Boolean(vndbProfile?.permissions.includes("listwrite")),
			}),
		},
		{
			source: "hikarinagi",
			id: hikarinagiId,
			availability: getPushAvailability({
				loading: isSettingsLoading,
				hasToken: hasHikarinagiToken,
				verificationFailed: isSettingsError,
			}),
			options: [
				{
					key: "private",
					label: privateLabel,
					checked: hikarinagiPrivate,
					onChange: setHikarinagiPrivate,
				},
				{
					key: "spoiler",
					label: spoilerLabel,
					checked: hikarinagiSpoiler,
					onChange: setHikarinagiSpoiler,
				},
				{
					key: "playtime",
					label: playtimeLabel,
					checked: pushHikarinagiPlaytime,
					onChange: setPushHikarinagiPlaytime,
				},
			],
			notice: getRoundNotice("hikarinagi"),
		},
		{
			source: "kun",
			id: kunId,
			availability: getPushAvailability({
				loading: isNextmoeAuthLoading,
				hasToken: hasKunToken,
				verificationFailed: isNextmoeAuthError,
			}),
			options: [
				{
					key: "spoiler",
					label: spoilerLabel,
					checked: kunSpoiler,
					disabled: !shouldPushKunReview,
					onChange: setKunSpoiler,
				},
				{
					key: "playtime",
					label: playtimeLabel,
					checked: pushKunPlaytime,
					onChange: setPushKunPlaytime,
				},
			],
			notice:
				!ratingError && !shouldPushKunReview
					? t(
							"pages.Detail.Review.unratedReviewSkipped",
							"未评分，跳过评分与评价",
						)
					: undefined,
		},
	];
	const targets: PushTarget[] = targetConfigs.map((target) => ({
		...target,
		selected:
			Boolean(target.id) &&
			target.availability === "ready" &&
			(sourceSelection[target.source] ?? true),
	}));
	const selectedSources = new Set(
		targets.filter((target) => target.selected).map((target) => target.source),
	);
	const pushSources = new Set(
		[...selectedSources].filter(
			(source) =>
				shouldPushUserReview(source, parsedRating.value) ||
				(source === "kun" && pushKunPlaytime),
		),
	);
	const hasPushTarget = targets.some((target) => Boolean(target.id));
	const shouldPushHikarinagiPlaytime =
		selectedSources.has("hikarinagi") && pushHikarinagiPlaytime;
	const shouldPushKunPlaytime = selectedSources.has("kun") && pushKunPlaytime;
	const showPlaytimeInputs =
		shouldPushHikarinagiPlaytime || shouldPushKunPlaytime;
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
			const updates = buildGameReviewUpdatePayload(selectedGame, {
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
		if (isPushing || pushSources.size === 0) {
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

		const playtimeMinutes = showPlaytimeInputs
			? parsePlaytimeInput(playtimeHoursInput, playtimeMinutesInput)
			: undefined;
		if (playtimeMinutes === null) {
			snackbar.error(
				t("pages.Detail.Review.playtimeInvalid", "请输入有效的小时和分钟"),
			);
			return;
		}

		setPushingSources([...pushSources]);
		setPushResults([]);
		try {
			const results = await pushGameUserReviewToCloud(selectedGame, {
				rating: nextRating.value,
				review: reviewInput,
				pushBgm: pushSources.has("bgm"),
				pushVndb: pushSources.has("vndb"),
				pushHikarinagi: pushSources.has("hikarinagi"),
				pushKun: pushSources.has("kun"),
				bgmPrivate,
				hikarinagiPrivate,
				hikarinagiSpoiler,
				kunSpoiler,
				hikarinagiTimeToFinishMinutes: shouldPushHikarinagiPlaytime
					? playtimeMinutes
					: undefined,
				kunPlaytimeMinutes: shouldPushKunPlaytime ? playtimeMinutes : undefined,
			});
			setPushResults(results);
			if (results.length === 0) return;

			if (results.every((result) => result.success)) {
				snackbar.success(
					results.every((result) => result.kind === "playtime")
						? t("pages.Detail.Review.playtimePushSuccess", "时长推送成功")
						: t("pages.Detail.Review.pushSuccess", "评价推送完成"),
				);
			} else {
				snackbar.error(
					t("pages.Detail.Review.pushPartialFailed", "部分目标推送失败"),
				);
			}
		} catch (error) {
			snackbar.error(getUserErrorMessage(error, t));
		} finally {
			setPushingSources([]);
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
						<Box className="mb-3">
							<Box className="flex flex-wrap items-center justify-between gap-2">
								<Typography variant="h6">
									{t("pages.Detail.Review.cloudPush", "云端推送")}
								</Typography>
								{targets.some(
									(target) =>
										target.availability !== "ready" &&
										target.availability !== "loading",
								) ? (
									<Button
										component={RouterLink}
										to="/settings"
										size="small"
										color="inherit"
										disabled={isPushing}
									>
										{t("pages.Detail.Review.accountSettings", "账号设置")}
									</Button>
								) : null}
							</Box>
							<Typography
								variant="body2"
								color="textSecondary"
								className="mt-1"
							>
								{t(
									"pages.Detail.Review.cloudPushHelperText",
									"将当前评分和评价同步到所选站点",
								)}
							</Typography>
						</Box>
						{!hasPushTarget ? (
							<Alert severity="info">
								{t(
									"pages.Detail.Review.noPushTargets",
									"当前游戏没有支持评价推送的关联 ID",
								)}
							</Alert>
						) : null}
						<Box component="ul" className="m-0 p-0">
							{targets.map((target) => (
								<PushTargetRow
									key={target.source}
									target={target}
									results={pushResults.filter(
										(result) => result.source === target.source,
									)}
									pending={pushingSources.includes(target.source)}
									disabled={isPushing}
									onSelect={(selected) =>
										setSourceSelection((previous) => ({
											...previous,
											[target.source]: selected,
										}))
									}
								/>
							))}
						</Box>
						{showPlaytimeInputs ? (
							<Box className="mt-4 border-0 border-t border-solid border-[var(--mui-palette-divider)] pt-4">
								<Box className="mb-3">
									<Typography variant="subtitle2">
										{t("pages.Detail.totalPlayTime", "累计总时长")}
									</Typography>
									<Typography variant="caption" color="textSecondary">
										{t(
											"pages.Detail.Review.sharedPlaytimeHint",
											"用于已开启时长推送的站点",
										)}
									</Typography>
								</Box>
								<Box className="flex flex-col gap-3 sm:flex-row">
									<TextField
										label={t("pages.Detail.sessionDurationHours", "小时")}
										type="number"
										size="small"
										value={playtimeHoursInput}
										disabled={isPushing}
										onChange={(event) => {
											setPlaytimeHoursInput(event.target.value);
											setPlaytimeInitializedGameId(selectedGame.id);
										}}
										inputProps={{ min: 0, step: 1 }}
										className="w-full sm:w-35"
									/>
									<TextField
										label={t("pages.Detail.sessionDurationMinutePart", "分钟")}
										type="number"
										size="small"
										value={playtimeMinutesInput}
										disabled={isPushing}
										onChange={(event) => {
											setPlaytimeMinutesInput(event.target.value);
											setPlaytimeInitializedGameId(selectedGame.id);
										}}
										inputProps={{ min: 0, max: 59, step: 1 }}
										className="w-full sm:w-35"
									/>
								</Box>
							</Box>
						) : null}
						<Box className="mt-5">
							<Button
								variant="contained"
								fullWidth
								startIcon={
									isPushing ? (
										<CircularProgress size={16} color="inherit" />
									) : (
										<CloudUploadIcon />
									)
								}
								disabled={
									isPushing ||
									updateGameMutation.isPending ||
									ratingError ||
									pushSources.size === 0
								}
								onClick={handlePush}
							>
								{isPushing
									? t("pages.Detail.Review.pushing", "推送中...")
									: t("pages.Detail.Review.pushToSites", {
											count: pushSources.size,
											defaultValue: "推送到 {{count}} 个站点",
										})}
							</Button>
						</Box>
					</CardContent>
				</Card>
			</Stack>
		</Box>
	);
};
