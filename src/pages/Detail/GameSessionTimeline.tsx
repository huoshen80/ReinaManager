import DeleteIcon from "@mui/icons-material/Delete";
import {
	Box,
	Button,
	CircularProgress,
	IconButton,
	Tooltip,
	Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import type { GameSession } from "@/types";
import { formatPlayTime, getLocalDateString } from "@/utils/dateTime";

interface GameSessionTimelineProps {
	sessions: GameSession[];
	isLoading: boolean;
	isFetching: boolean;
	canLoadMore: boolean;
	deletePending: boolean;
	onLoadMore: () => void;
	onDelete: (session: GameSession) => void;
}

const padTimeUnit = (value: number): string => String(value).padStart(2, "0");

const formatClockTime = (date: Date): string =>
	`${padTimeUnit(date.getHours())}:${padTimeUnit(date.getMinutes())}`;

const formatMonthDayTime = (date: Date): string =>
	`${padTimeUnit(date.getMonth() + 1)}/${padTimeUnit(date.getDate())} ${formatClockTime(date)}`;

const formatYearMonthDayTime = (date: Date): string =>
	`${date.getFullYear()}/${formatMonthDayTime(date)}`;

function formatSessionTimeRange(startTime: number, endTime?: number): string {
	if (!endTime) {
		return `${formatClockTime(new Date(startTime * 1000))} -`;
	}

	const start = new Date(startTime * 1000);
	const end = new Date(endTime * 1000);
	const isSameDate =
		start.getFullYear() === end.getFullYear() &&
		start.getMonth() === end.getMonth() &&
		start.getDate() === end.getDate();
	const endText = isSameDate
		? formatClockTime(end)
		: start.getFullYear() === end.getFullYear()
			? formatMonthDayTime(end)
			: formatYearMonthDayTime(end);

	return `${formatClockTime(start)} - ${endText}`;
}

export function GameSessionTimeline({
	sessions,
	isLoading,
	isFetching,
	canLoadMore,
	deletePending,
	onLoadMore,
	onDelete,
}: GameSessionTimelineProps) {
	const { t } = useTranslation();

	if (isLoading) {
		return (
			<Box className="h-[300px] flex items-center justify-center">
				<CircularProgress size={24} />
			</Box>
		);
	}

	if (sessions.length === 0) {
		return (
			<Box className="h-[300px] flex items-center justify-center">
				<Typography color="textSecondary" component="div">
					{t("pages.Detail.noPlaySessions", "暂无游玩记录")}
				</Typography>
			</Box>
		);
	}

	return (
		<Box className="max-h-[360px] overflow-y-auto pr-2">
			{sessions.map((session, index) => {
				const sessionDate = getLocalDateString(session.start_time);
				const previousSessionDate = sessions[index - 1]
					? getLocalDateString(sessions[index - 1].start_time)
					: null;
				const showDate = index === 0 || previousSessionDate !== sessionDate;

				return (
					<Box key={session.session_id}>
						{showDate && (
							<Typography
								variant="subtitle2"
								color="textSecondary"
								className="mt-2 mb-1"
								component="div"
							>
								{sessionDate}
							</Typography>
						)}
						<Box className="relative flex gap-3 py-2 pl-1">
							<Box className="flex flex-col items-center">
								<Box className="w-2 h-2 rounded-full bg-[#1976d2] mt-2" />
								{index !== sessions.length - 1 && (
									<Box className="w-px flex-1 min-h-8 bg-gray-200 mt-1" />
								)}
							</Box>
							<Box className="min-w-0 flex-1">
								<Typography
									variant="body2"
									className="font-medium"
									component="div"
								>
									{formatSessionTimeRange(session.start_time, session.end_time)}
								</Typography>
								<Typography
									variant="body2"
									color="textSecondary"
									component="div"
								>
									{t("pages.Detail.sessionDuration", "时长")}:{" "}
									{formatPlayTime(session.duration ?? 0)}
								</Typography>
							</Box>
							<Tooltip title={t("pages.Detail.deleteGameSession", "删除记录")}>
								<IconButton
									size="small"
									color="error"
									aria-label={t("pages.Detail.deleteGameSession", "删除记录")}
									onClick={() => onDelete(session)}
									disabled={deletePending}
								>
									<DeleteIcon fontSize="small" />
								</IconButton>
							</Tooltip>
						</Box>
					</Box>
				);
			})}
			{canLoadMore && (
				<Box className="flex justify-center py-3">
					<Button variant="outlined" onClick={onLoadMore} disabled={isFetching}>
						{isFetching
							? t("pages.Detail.loading", "加载中...")
							: t("pages.Detail.loadMoreSessions", "加载更多")}
					</Button>
				</Box>
			)}
		</Box>
	);
}
