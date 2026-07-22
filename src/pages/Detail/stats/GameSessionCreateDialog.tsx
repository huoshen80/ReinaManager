import {
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControl,
	FormHelperText,
	FormLabel,
	TextField,
	Typography,
} from "@mui/material";
import { type FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

const MAX_DURATION_MINUTES = Math.floor(2_147_483_647 / 60);

const isNonNegativeInteger = (value: string) =>
	value === "" || (/^\d+$/.test(value) && Number.isSafeInteger(Number(value)));

interface GameSessionCreateDialogProps {
	open: boolean;
	isLoading: boolean;
	setOpen: (open: boolean) => void;
	onSubmit: (startTime: number, duration: number) => Promise<boolean>;
}

export function GameSessionCreateDialog({
	open,
	isLoading,
	setOpen,
	onSubmit,
}: GameSessionCreateDialogProps) {
	const { t } = useTranslation();
	const [startTime, setStartTime] = useState("");
	const [durationHours, setDurationHours] = useState("");
	const [durationMinutesPart, setDurationMinutesPart] = useState("");
	const [submitted, setSubmitted] = useState(false);
	const locale = t("common.locale", "zh-CN");
	const validHours = isNonNegativeInteger(durationHours);
	const validMinutesPart =
		isNonNegativeInteger(durationMinutesPart) &&
		Number(durationMinutesPart || 0) <= 59;
	const durationMinutes =
		Number(durationHours || 0) * 60 + Number(durationMinutesPart || 0);
	const startTimestamp = Math.floor(new Date(startTime).getTime() / 1000);
	const validStartTime =
		startTime !== "" &&
		Number.isSafeInteger(startTimestamp) &&
		startTimestamp > 0;
	const validDuration =
		validHours &&
		validMinutesPart &&
		Number.isSafeInteger(durationMinutes) &&
		durationMinutes > 0 &&
		durationMinutes <= MAX_DURATION_MINUTES;
	const endTimestamp =
		validStartTime && validDuration
			? startTimestamp + durationMinutes * 60
			: null;
	const validTimeRange =
		endTimestamp !== null &&
		Number.isSafeInteger(endTimestamp) &&
		endTimestamp <= Math.floor(Date.now() / 1000);

	const endTimeText = useMemo(() => {
		if (endTimestamp === null || !Number.isSafeInteger(endTimestamp)) {
			return "—";
		}

		return new Date(endTimestamp * 1000).toLocaleString(locale);
	}, [endTimestamp, locale]);

	const reset = () => {
		setStartTime("");
		setDurationHours("");
		setDurationMinutesPart("");
		setSubmitted(false);
	};

	const handleClose = () => {
		if (isLoading) {
			return;
		}

		reset();
		setOpen(false);
	};

	const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setSubmitted(true);

		if (!validStartTime || !validDuration || !validTimeRange) {
			return;
		}

		const created = await onSubmit(startTimestamp, durationMinutes);
		if (!created) {
			return;
		}

		reset();
		setOpen(false);
	};

	return (
		<Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
			<form onSubmit={handleSubmit}>
				<DialogTitle>
					{t("pages.Detail.addGameSessionTitle", "添加游玩记录")}
				</DialogTitle>
				<DialogContent>
					<div className="flex flex-col gap-4 pt-3">
						<TextField
							label={t("pages.Detail.sessionStartTime", "开始时间")}
							type="datetime-local"
							value={startTime}
							onChange={(event) => setStartTime(event.target.value)}
							error={submitted && !validStartTime}
							helperText={
								submitted && !validStartTime
									? t(
											"pages.Detail.sessionStartTimeRequired",
											"请选择有效的开始时间",
										)
									: undefined
							}
							slotProps={{ inputLabel: { shrink: true } }}
							disabled={isLoading}
							fullWidth
						/>
						<FormControl error={submitted && !validDuration}>
							<FormLabel>
								{t("pages.Detail.sessionDuration", "游玩时长")}
							</FormLabel>
							<div className="mt-2 flex gap-3">
								<TextField
									label={t("pages.Detail.sessionDurationHours", "小时")}
									type="number"
									value={durationHours}
									onChange={(event) => setDurationHours(event.target.value)}
									error={submitted && !validDuration}
									slotProps={{
										htmlInput: {
											min: 0,
											max: Math.floor(MAX_DURATION_MINUTES / 60),
											step: 1,
										},
									}}
									disabled={isLoading}
									className="min-w-0 flex-1"
								/>
								<TextField
									label={t("pages.Detail.sessionDurationMinutePart", "分钟")}
									type="number"
									value={durationMinutesPart}
									onChange={(event) =>
										setDurationMinutesPart(event.target.value)
									}
									error={submitted && !validDuration}
									slotProps={{
										htmlInput: { min: 0, max: 59, step: 1 },
									}}
									disabled={isLoading}
									className="min-w-0 flex-1"
								/>
							</div>
							{submitted && !validDuration ? (
								<FormHelperText>
									{t(
										"pages.Detail.sessionDurationInvalid",
										"请输入有效的小时和分钟，且总时长必须大于 0",
									)}
								</FormHelperText>
							) : null}
						</FormControl>
						<div>
							<Typography variant="caption" color="text.secondary">
								{t("pages.Detail.sessionEndTime", "结束时间")}
							</Typography>
							<Typography variant="body1">{endTimeText}</Typography>
							{submitted &&
							validStartTime &&
							validDuration &&
							!validTimeRange ? (
								<FormHelperText error className="mx-0">
									{t(
										"pages.Detail.sessionTimeInvalid",
										"结束时间不能晚于当前时间",
									)}
								</FormHelperText>
							) : null}
						</div>
					</div>
				</DialogContent>
				<DialogActions>
					<Button onClick={handleClose} disabled={isLoading}>
						{t("components.AlertBox.cancel", "取消")}
					</Button>
					<Button
						type="submit"
						variant="contained"
						disabled={isLoading}
						startIcon={
							isLoading ? (
								<CircularProgress size={16} color="inherit" />
							) : undefined
						}
					>
						{t("pages.Detail.addGameSession", "添加记录")}
					</Button>
				</DialogActions>
			</form>
		</Dialog>
	);
}
