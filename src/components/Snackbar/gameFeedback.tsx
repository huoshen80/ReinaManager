import Button from "@mui/material/Button";
import type { TFunction } from "i18next";
import type { NavigateFunction } from "react-router-dom";
import { snackbar } from "./index";

interface ShowGameAddedSuccessParams {
	gameId: number | null | undefined;
	navigate: NavigateFunction;
	t: TFunction;
}

export function showGameAddedSuccess({
	gameId,
	navigate,
	t,
}: ShowGameAddedSuccessParams) {
	if (!gameId) {
		return;
	}

	snackbar.success(t("components.Snackbar.gameAddedSuccess"), {
		action: (
			<Button
				color="inherit"
				size="small"
				onClick={() => navigate(`/libraries/${gameId}`)}
			>
				{t("components.Snackbar.viewDetails")}
			</Button>
		),
	});
}
