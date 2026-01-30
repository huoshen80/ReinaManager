import AccessTimeIcon from "@mui/icons-material/AccessTime";
import {
	Box,
	Button,
	Card,
	CardContent,
	Stack,
	Typography,
} from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router";
import { ViewGameBox } from "@/components/AlertBox";
import { EditPlayTimeDialog } from "@/components/EditPlayTimeDialog";
import { snackbar } from "@/components/Snackbar";
import { useStore } from "@/store";
import type { FullGameData, UpdateGameParams } from "@/types";
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
	const { bgmToken, updateGame, selectedGame } = useStore();
	const id = Number(useLocation().pathname.split("/").pop());
	const { t } = useTranslation();

	// UI 状态
	const [gameData, setGameData] = useState<FullGameData | null>(null);
	const [openViewBox, setOpenViewBox] = useState(false);
	const [editTimeOpen, setEditTimeOpen] = useState(false);

	// 确认更新游戏数据（从数据源）
	const handleConfirmGameUpdate = () => {
		if (gameData) {
			// 根据新的数据源类型，清除其他数据源的数据
			const updateData: UpdateGameParams = { ...gameData };

			switch (gameData.id_type) {
				case "bgm":
					// 只保留 bgm_data，清除其他数据源
					updateData.vndb_data = null;
					updateData.ymgal_data = null;
					break;
				case "vndb":
					// 只保留 vndb_data，清除其他数据源
					updateData.bgm_data = null;
					updateData.ymgal_data = null;
					break;
				case "ymgal":
					// 只保留 ymgal_data，清除其他数据源
					updateData.bgm_data = null;
					updateData.vndb_data = null;
					break;
				case "mixed":
					// 对于混合模式，如果某个数据源的ID为空，则清除对应的数据和ID
					if (!gameData.bgm_id) {
						updateData.bgm_data = null;
						updateData.bgm_id = null;
					}
					if (!gameData.vndb_id) {
						updateData.vndb_data = null;
						updateData.vndb_id = null;
					}
					if (!gameData.ymgal_id) {
						updateData.ymgal_data = null;
						updateData.ymgal_id = null;
					}
					break;
			}

			updateGame(id, updateData);
			setOpenViewBox(false);
			snackbar.success(t("pages.Detail.Edit.updateSuccess", "游戏信息已更新"));
		}
	};

	// 处理数据源获取的数据
	const handleDataSourceFetched = (result: FullGameData) => {
		setGameData(result);
		setOpenViewBox(true);
	};

	// 处理游戏信息保存
	const handleGameInfoSave = async (data: UpdateGameParams) => {
		if (!selectedGame) return;

		try {
			await updateGame(id, data);
			snackbar.success(
				t("pages.Detail.Edit.updateSuccess", "游戏信息已成功更新"),
			);
		} catch (error) {
			const errorMsg =
				error instanceof Error
					? error.message
					: t("pages.Detail.Edit.unknownError", "未知错误");
			snackbar.error(errorMsg);
			throw error; // 重新抛出错误，让子组件知道操作失败
		}
	};

	return (
		<Box sx={{ p: 3 }}>
			{/* 游戏更新确认弹窗 */}
			<ViewGameBox
				open={openViewBox}
				setOpen={setOpenViewBox}
				onConfirm={handleConfirmGameUpdate}
				fullgame={gameData}
			/>

			<Stack spacing={4}>
				{/* 第一部分：数据源更新 */}
				<Card>
					<CardContent>
						<Typography variant="h6" gutterBottom>
							{t("pages.Detail.Edit.dataSourceUpdate", "数据源更新")}
						</Typography>
						<DataSourceUpdate
							bgmToken={bgmToken}
							selectedGame={selectedGame}
							onDataFetched={handleDataSourceFetched}
						/>
					</CardContent>
				</Card>

				{/* 第二部分：游戏资料编辑 */}
				<Card>
					<CardContent>
						<Box className="flex justify-between items-center mb-4">
							<Typography variant="h6">
								{t("pages.Detail.Edit.gameInfoEdit", "游戏资料编辑")}
							</Typography>
							<Button
								variant="outlined"
								startIcon={<AccessTimeIcon />}
								onClick={() => setEditTimeOpen(true)}
								size="small"
							>
								{t("components.RightMenu.editPlayTime", "编辑时间")}
							</Button>
						</Box>
						<GameInfoEdit
							selectedGame={selectedGame}
							onSave={handleGameInfoSave}
						/>
					</CardContent>
				</Card>

				<EditPlayTimeDialog
					open={editTimeOpen}
					onClose={() => setEditTimeOpen(false)}
					gameId={id}
				/>
			</Stack>
		</Box>
	);
};
