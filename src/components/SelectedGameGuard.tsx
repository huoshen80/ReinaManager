import { Box, CircularProgress, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useSelectedGame } from "@/hooks/features/games/useGameFacade";
import { useStore } from "@/store/appStore";
import type { SelectedGameWithId } from "@/types";

interface SelectedGameGuardProps {
	children: (selectedGame: SelectedGameWithId) => ReactNode;
	fallback?: ReactNode;
	loadingFallback?: ReactNode;
	notFoundFallback?: ReactNode;
}

const DefaultFallback = ({ message }: { message: string }) => (
	<Box sx={{ p: 3 }}>
		<Typography color="textSecondary">{message}</Typography>
	</Box>
);

const DefaultLoadingFallback = () => {
	const { t } = useTranslation();

	return (
		<Box sx={{ p: 3, display: "flex", alignItems: "center", gap: 1 }}>
			<CircularProgress size={20} />
			<Typography color="textSecondary">{t("pages.Detail.loading")}</Typography>
		</Box>
	);
};

export const SelectedGameGuard = ({
	children,
	fallback,
	loadingFallback,
	notFoundFallback,
}: SelectedGameGuardProps) => {
	const { t } = useTranslation();
	const selectedGameId = useStore((state) => state.selectedGameId);
	const { selectedGame, isLoadingSelectedGame } =
		useSelectedGame(selectedGameId);

	if (!selectedGameId) {
		return (
			fallback ?? (
				<DefaultFallback
					message={t("components.SelectedGameGuard.noSelected", "请先选择游戏")}
				/>
			)
		);
	}

	if (isLoadingSelectedGame) {
		return loadingFallback ?? <DefaultLoadingFallback />;
	}

	if (!selectedGame?.id) {
		return (
			notFoundFallback ?? (
				<DefaultFallback
					message={t(
						"components.SelectedGameGuard.notFound",
						"游戏不存在或已被删除",
					)}
				/>
			)
		);
	}

	return children(selectedGame as SelectedGameWithId);
};
