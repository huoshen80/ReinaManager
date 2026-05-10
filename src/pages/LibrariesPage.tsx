import { Box, CircularProgress, Typography } from "@mui/material";
import { useTranslation } from "react-i18next";
import { VirtualCardsGrid } from "@/components/Cards";
import { useGameListFacade } from "@/hooks/features/games/useGameListFacade";

export const Libraries: React.FC = () => {
	const { t } = useTranslation();
	const { gameIds, isLoading } = useGameListFacade();

	if (isLoading) {
		return (
			<Box
				display="flex"
				justifyContent="center"
				alignItems="center"
				minHeight="50vh"
			>
				<CircularProgress />
			</Box>
		);
	}

	if (gameIds.length === 0) {
		return (
			<Box
				display="flex"
				justifyContent="center"
				alignItems="center"
				minHeight="50vh"
			>
				<Typography variant="h6" color="text.secondary">
					{t("pages.Libraries.empty", {
						defaultValue: "暂无游戏，请先添加游戏",
					})}
				</Typography>
			</Box>
		);
	}

	return <VirtualCardsGrid gameIds={gameIds} />;
};
