import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import {
	Accordion,
	AccordionDetails,
	AccordionSummary,
	Box,
	Stack,
	Typography,
} from "@mui/material";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ViewGameBox } from "@/components/AlertBox";
import { SelectedGameGuard } from "@/components/SelectedGameGuard";
import { useGameIndex } from "@/hooks/features/games/useGameListFacade";
import { useUpdateGame } from "@/hooks/queries/useGames";
import { getRuntimeSourceAdapter } from "@/metadata";
import {
	buildMetadataUpdatePayload,
	type MetadataFetchResult,
} from "@/metadata/data/metadata";
import { snackbar } from "@/providers/snackBar";
import type { GameData, UpdateGameParams } from "@/types";
import { getUserErrorMessage } from "@/utils/errors";
import { EMPTY_SOURCE_AVAILABILITY } from "@/utils/game/gameIndex";
import { DataSourceUpdate } from "./DataSourceUpdate";
import { GameInfoEdit } from "./game-info/GameInfoEdit";
import { GameLaunchSettings } from "./game-info/GameLaunchSettings";

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
			{(selectedGame) => (
				<EditContent key={selectedGame.id} selectedGame={selectedGame} />
			)}
		</SelectedGameGuard>
	);
};

function EditContent({ selectedGame }: { selectedGame: GameData }) {
	const updateGameMutation = useUpdateGame();
	const { t } = useTranslation();
	const id = selectedGame.id;
	const { index: gameIndex, isLoading: isGameIndexLoading } = useGameIndex();

	// UI 状态
	const [metadataUpdate, setMetadataUpdate] = useState<{
		data: MetadataFetchResult["data"];
		payload: UpdateGameParams;
		failedSources: MetadataFetchResult["failedSources"];
	} | null>(null);
	const [openViewBox, setOpenViewBox] = useState(false);
	const [isSavingMetadata, setIsSavingMetadata] = useState(false);
	const sourceAvailability =
		gameIndex.sourceAvailabilityById.get(id) ?? EMPTY_SOURCE_AVAILABILITY;
	const rawGame = gameIndex.rawById.get(id);

	const saveMetadata = async (
		payload: UpdateGameParams,
		failedSources: MetadataFetchResult["failedSources"] = [],
	) => {
		setIsSavingMetadata(true);
		try {
			await updateGameMutation.mutateAsync({
				gameId: id,
				updates: { ...payload, refresh_source_covers: true },
			});
			setOpenViewBox(false);
			if (failedSources.length > 0) {
				snackbar.warning(
					t(
						"pages.Detail.Edit.updatePartialSuccess",
						"游戏信息已更新；{{sources}} 获取失败，已保留其已有数据。",
						{
							sources: failedSources
								.map((source) => getRuntimeSourceAdapter(source).label)
								.join(" / "),
						},
					),
				);
			} else {
				snackbar.success(
					t("pages.Detail.Edit.updateSuccess", "游戏信息已更新"),
				);
			}
		} finally {
			setIsSavingMetadata(false);
		}
	};

	const handleConfirmGameUpdate = async () => {
		if (!metadataUpdate || isSavingMetadata) return;
		try {
			await saveMetadata(metadataUpdate.payload, metadataUpdate.failedSources);
		} catch (error) {
			snackbar.error(getUserErrorMessage(error, t));
		}
	};

	// 需要预览时，确认保存复用同一份写入计划。
	const previewMetadata = (result: MetadataFetchResult) => {
		if (!rawGame) return;
		setMetadataUpdate({
			...result,
			payload: buildMetadataUpdatePayload(result, rawGame),
		});
		setOpenViewBox(true);
	};

	const handleDataSourceFetched = async (result: MetadataFetchResult) => {
		if (!rawGame || isSavingMetadata) return;
		const completeSourceCount = result.data.sources.filter(
			(record) => record.data != null,
		).length;
		// 关联 ID 不算完整来源；是否预览取决于结果，不取决于单源或 Mixed 入口。
		if (completeSourceCount === 1 && result.failedSources.length === 0) {
			await saveMetadata(buildMetadataUpdatePayload(result, rawGame));
			return;
		}
		previewMetadata(result);
	};

	const handleSelectedMetadata = async (result: MetadataFetchResult) => {
		if (!rawGame || isSavingMetadata) return;
		// 名称搜索已确认候选，失败来源由写入计划保留，无需重复确认。
		await saveMetadata(
			buildMetadataUpdatePayload(result, rawGame),
			result.failedSources,
		);
	};

	// 只切换当前展示/合并使用的数据源，不重新拉取元数据
	const handleSourceSwitch = async (idType: string) => {
		await updateGameMutation.mutateAsync({
			gameId: id,
			updates: { id_type: idType },
		});
		snackbar.success(t("pages.Detail.Edit.updateSuccess", "游戏信息已更新"));
	};

	// 处理游戏信息保存
	const handleGameInfoSave = async (data: UpdateGameParams) => {
		const updatedGame = await updateGameMutation.mutateAsync({
			gameId: id,
			updates: data,
		});
		snackbar.success(t("pages.Detail.Edit.updateSuccess", "游戏信息已更新"));
		return updatedGame;
	};

	return (
		<Box sx={{ p: 3 }}>
			{/* 游戏更新确认弹窗 */}
			{metadataUpdate && (
				<ViewGameBox
					open={openViewBox}
					setOpen={setOpenViewBox}
					onConfirm={handleConfirmGameUpdate}
					gameDraft={metadataUpdate.data}
					isLoading={isSavingMetadata}
					warningMessage={
						metadataUpdate.failedSources.length > 0
							? t(
									"components.AlertBox.metadataFetchFailed",
									"{{sources}} 获取失败，将保留其已有数据。下方为本次成功获取的结果。",
									{
										sources: metadataUpdate.failedSources
											.map((source) => getRuntimeSourceAdapter(source).label)
											.join(" / "),
									},
								)
							: undefined
					}
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
							{t(
								"pages.Detail.Edit.dataSourceEditAndUpdate",
								"数据源编辑与更新",
							)}
						</Typography>
					</AccordionSummary>
					<AccordionDetails>
						<DataSourceUpdate
							selectedGame={selectedGame}
							sourceAvailability={sourceAvailability}
							onDataFetched={handleDataSourceFetched}
							onDirectDataUpdate={handleSelectedMetadata}
							onSourceSwitch={handleSourceSwitch}
							disabled={isGameIndexLoading || !rawGame || isSavingMetadata}
						/>
					</AccordionDetails>
				</Accordion>

				{/* 第二部分：游戏资料编辑 */}
				<GameInfoEdit
					selectedGame={selectedGame}
					rawGame={rawGame}
					onSave={handleGameInfoSave}
				/>

				{/* 第三部分：启动设置 */}
				<GameLaunchSettings
					selectedGame={selectedGame}
					onSave={handleGameInfoSave}
				/>
			</Stack>
		</Box>
	);
}
