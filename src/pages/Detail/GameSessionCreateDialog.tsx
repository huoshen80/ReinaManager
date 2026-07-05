import {
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Stack,
	TextField,
} from "@mui/material";
import { type FormEvent, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

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
	const [duration, setDuration] = useState("");
	const [submitted, setSubmitted] = useState(false);
	const durationMinutes = Number(duration);
	const startTimestamp = Math.floor(new Date(startTime).getTime() / 1000);
	const validStartTime = startTime !== "" && Number.isFinite(startTimestamp);
	const validDuration =
		duration !== "" && Number.isInteger(durationMinutes) && durationMinutes > 0;
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
			return "";
		}

		return new Date(endTimestamp * 1000).toLocaleString(
			t("common.locale", "zh-CN"),
		);
	}, [endTimestamp, t]);

	const reset = () => {
		setStartTime("");
		setDuration("");
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
					<Stack spacing={2} className="pt-1">
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
						<TextField
							label={t(
								"pages.Detail.sessionDurationMinutes",
								"游玩时长（分钟）",
							)}
							type="number"
							value={duration}
							onChange={(event) => setDuration(event.target.value)}
							error={submitted && !validDuration}
							helperText={
								submitted && !validDuration
									? t(
											"pages.Detail.sessionDurationInvalid",
											"请输入大于 0 的整数分钟",
										)
									: undefined
							}
							slotProps={{ htmlInput: { min: 1, step: 1 } }}
							disabled={isLoading}
							fullWidth
						/>
						<TextField
							label={t("pages.Detail.sessionEndTime", "结束时间")}
							value={endTimeText}
							error={
								submitted && validStartTime && validDuration && !validTimeRange
							}
							helperText={
								submitted && validStartTime && validDuration && !validTimeRange
									? t(
											"pages.Detail.sessionTimeInvalid",
											"结束时间不能晚于当前时间",
										)
									: undefined
							}
							slotProps={{ input: { readOnly: true } }}
							fullWidth
						/>
					</Stack>
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
