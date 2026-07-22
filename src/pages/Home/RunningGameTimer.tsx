import TimerIcon from "@mui/icons-material/Timer";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TimeTrackingMode } from "@/types";

interface RunningGameTimerProps {
	currentSessionMinutes: number;
	currentSessionSeconds: number;
	startTime: number;
	timeTrackingMode: TimeTrackingMode;
}

function formatSessionTime(totalSeconds: number): string {
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return hours > 0
		? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
		: `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function RunningGameTimer({
	currentSessionMinutes,
	currentSessionSeconds,
	startTime,
	timeTrackingMode,
}: RunningGameTimerProps) {
	const { t } = useTranslation();
	const [elapsedSeconds, setElapsedSeconds] = useState(() =>
		Math.max(0, Math.floor(Date.now() / 1000) - startTime),
	);

	useEffect(() => {
		if (timeTrackingMode !== "elapsed") return;
		const updateElapsed = () =>
			setElapsedSeconds(Math.max(0, Math.floor(Date.now() / 1000) - startTime));
		updateElapsed();
		const intervalId = window.setInterval(updateElapsed, 1000);
		return () => window.clearInterval(intervalId);
	}, [startTime, timeTrackingMode]);

	const totalSeconds =
		timeTrackingMode === "elapsed"
			? elapsedSeconds
			: currentSessionMinutes * 60 + currentSessionSeconds;

	return (
		<Box className="flex items-center gap-1.5">
			<TimerIcon fontSize="small" />
			<Typography className="text-[rgba(255,255,255,.78)] tabular-nums">
				{t("home.focus.currentSession", "本次游玩 {{time}}", {
					time: formatSessionTime(totalSeconds),
				})}
			</Typography>
		</Box>
	);
}
