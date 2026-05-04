import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import {
	Accordion,
	AccordionDetails,
	AccordionSummary,
	Box,
	Card,
	CardContent,
	Stack,
	Typography,
} from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ViewGameBox } from "@/components/AlertBox";
import { SelectedGameGuard } from "@/components/SelectedGameGuard";
import { useUpdateGame } from "@/hooks/queries/useGames";
import { useAllSettings } from "@/hooks/queries/useSettings";
import { snackbar } from "@/providers/snackBar";
import { fileService } from "@/services/invoke";
import type { GameCandidateData, GameData, UpdateGameParams } from "@/types";
import { getUserErrorMessage } from "@/utils/errors";
import { buildMetadataUpdatePayload } from "@/utils/metadata";
import { DataSourceUpdate } from "./DataSourceUpdate";
import { GameInfoEdit } from "./GameInfoEdit";

/**
 * Edit 组件
 * 游戏信息编辑页面主组件，管理子组件之间的状态和交互
 *
 * @component
 * @returns 编辑页面
 */
export const Edit: React.FC = () => {
	return (
		<SelectedGameGuard>
			{(selectedGame) => <EditContent selectedGame={selectedGame} />}
		</SelectedGameGuard>
	);
};

function EditContent({ selectedGame }: { selectedGame: GameData }) {
	const { data: settings } = useAllSettings();
	const bgmToken = settings?.bgm_token ?? "";
	const updateGameMutation = useUpdateGame();
	const { t } = useTranslation();
	const id = selectedGame.id;

	// UI 状态
	const [gameData, setGameData] = useState<GameCandidateData | null>(null);
	const [openViewBox, setOpenViewBox] = useState(false);

	// 确认更新游戏数据（从数据源）
	const handleConfirmGameUpdate = async () => {
		if (gameData) {
			await fileService.deleteCloudCoverCache(id);
			const updateData: UpdateGameParams = buildMetadataUpdatePayload(gameData);
			await updateGameMutation.mutateAsync({ gameId: id, updates: updateData });
			setOpenViewBox(false);
			snackbar.success(t("pages.Detail.Edit.updateSuccess", "游戏信息已更新"));
		}
	};

	// 处理数据源获取的数据
	const handleDataSourceFetched = (result: GameCandidateData) => {
		setGameData(result);
		setOpenViewBox(true);
	};

	// 处理游戏信息保存
	const handleGameInfoSave = async (data: UpdateGameParams) => {
		try {
			await updateGameMutation.mutateAsync({ gameId: id, updates: data });
			snackbar.success(
				t("pages.Detail.Edit.updateSuccess", "游戏信息已成功更新"),
			);
		} catch (error) {
			snackbar.error(getUserErrorMessage(error, t));
			throw error; // 重新抛出错误，让子组件知道操作失败
		}
	};

	return (
		<Box sx={{ p: 3 }}>
			{/* 游戏更新确认弹窗 */}
			{gameData && (
				<ViewGameBox
					open={openViewBox}
					setOpen={setOpenViewBox}
					onConfirm={handleConfirmGameUpdate}
					fullgame={gameData}
					title={t(
						"components.AlertBox.confirmUpdateTitle",
						"确认更新游戏信息",
					)}
				/>
			)}

			<Stack spacing={4}>
				{/* 第一部分：数据源更新 */}
				<Accordion>
					<AccordionSummary
						expandIcon={<ArrowDropDownIcon />}
						aria-controls="data-source-update-content"
						id="data-source-update-header"
					>
						<Typography variant="h6" component="span">
							{t("pages.Detail.Edit.dataSourceUpdate", "数据源更新")}
						</Typography>
					</AccordionSummary>
					<AccordionDetails>
						<DataSourceUpdate
							bgmToken={bgmToken}
							selectedGame={selectedGame}
							onDataFetched={handleDataSourceFetched}
						/>
					</AccordionDetails>
				</Accordion>

				{/* 第二部分：游戏资料编辑 */}
				<Card>
					<CardContent>
						<Typography variant="h6" gutterBottom>
							{t("pages.Detail.Edit.gameInfoEdit", "游戏资料编辑")}
						</Typography>
						<GameInfoEdit
							selectedGame={selectedGame}
							onSave={handleGameInfoSave}
						/>
					</CardContent>
				</Card>
			</Stack>
		</Box>
	);
}
