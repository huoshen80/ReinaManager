import UpdateIcon from "@mui/icons-material/Update";
import {
	Box,
	Button,
	CircularProgress,
	FormControl,
	InputLabel,
	MenuItem,
	Select as MuiSelect,
	type SelectChangeEvent,
	TextField,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { gameMetadataService } from "@/api";
import { isYmgalDataComplete } from "@/api/gameMetadataService";
import { snackbar } from "@/components/Snackbar";
import type { FullGameData, GameData } from "@/types";

interface DataSourceUpdateProps {
	bgmToken: string;
	selectedGame: GameData | null;
	onDataFetched: (data: FullGameData) => void;
	disabled?: boolean;
}

/**
 * DataSourceUpdate 组件
 * 负责从外部数据源(BGM, VNDB, YMGal, Mixed)更新游戏信息 已知缺少重复游戏检测
 */
export const DataSourceUpdate: React.FC<DataSourceUpdateProps> = ({
	bgmToken,
	selectedGame,
	onDataFetched,
	disabled = false,
}) => {
	const { t } = useTranslation();

	// 数据源更新相关状态
	const [bgmId, setBgmId] = useState<string>(selectedGame?.bgm_id || "");
	const [vndbId, setVndbId] = useState<string>(selectedGame?.vndb_id || "");
	const [ymgalId, setYmgalId] = useState<string>(selectedGame?.ymgal_id || "");
	const [idType, setIdType] = useState<string>(selectedGame?.id_type || "");
	const [isLoading, setIsLoading] = useState(false);

	useEffect(() => {
		setBgmId(selectedGame?.bgm_id || "");
		setVndbId(selectedGame?.vndb_id || "");
		setYmgalId(selectedGame?.ymgal_id || "");
		setIdType(selectedGame?.id_type || "");
	}, [selectedGame]);

	// 重构的数据获取逻辑
	const fetchGameData = useCallback(async () => {
		if (!selectedGame) {
			throw new Error(
				t("pages.Detail.DataSourceUpdate.noGameSelected", "未选择游戏"),
			);
		}

		if (idType === "custom") {
			throw new Error(
				t(
					"pages.Detail.DataSourceUpdate.customModeWarning",
					"自定义模式无法从数据源更新。",
				),
			);
		}

		// 根据idType决定如何调用服务层
		let apiData: FullGameData | null = null;

		if (idType === "bgm" && bgmId) {
			// BGM 单一数据源
			apiData = await gameMetadataService.getGameById(bgmId, idType, bgmToken);
		} else if (idType === "vndb" && vndbId) {
			// VNDB 单一数据源
			apiData = await gameMetadataService.getGameById(vndbId, idType);
		} else if (idType === "ymgal" && ymgalId) {
			// YMGal 单一数据源
			apiData = await gameMetadataService.getGameById(ymgalId, idType);
		} else if (idType === "mixed") {
			// Mixed 混合数据源
			if (!bgmId && !vndbId && !ymgalId) {
				throw new Error(
					t(
						"pages.Detail.DataSourceUpdate.bgmOrVndbIdRequired",
						"Bangumi ID、VNDB ID 或 YMGal ID 不能为空",
					),
				);
			}
			apiData = await gameMetadataService.getGameByIds({
				bgmId: bgmId,
				vndbId: vndbId,
				ymgalId: ymgalId,
				bgmToken,
			});
		} else {
			throw new Error(
				t("pages.Detail.DataSourceUpdate.invalidIdType", "无效的ID类型"),
			);
		}

		if (!apiData) {
			throw new Error(
				t(
					"pages.Detail.DataSourceUpdate.noDataFetched",
					"未获取到数据或数据源无效。",
				),
			);
		}

		// 检查 YMGal 数据是否完整，如果不完整则重新获取
		if (apiData.ymgal_id && !isYmgalDataComplete(apiData.ymgal_data)) {
			// 重新获取完整的 YMGal 数据
			const completeYmgalData = await gameMetadataService.getGameByIds({
				ymgalId: apiData.ymgal_id,
			});

			if (completeYmgalData?.ymgal_data) {
				// 合并完整的数据
				apiData.ymgal_data = completeYmgalData.ymgal_data;
				apiData.date = completeYmgalData.date || apiData.date;
			}
		}

		return apiData;
	}, [idType, bgmId, vndbId, ymgalId, bgmToken, selectedGame, t]);

	// 获取并预览游戏数据
	const handleFetchAndPreview = async () => {
		setIsLoading(true);
		try {
			const result = await fetchGameData();
			onDataFetched(result);
		} catch (error) {
			const errorMessage =
				error instanceof Error
					? error.message
					: t("pages.Detail.DataSourceUpdate.unknownError", "未知错误");
			snackbar.error(errorMessage);
		} finally {
			setIsLoading(false);
		}
	};

	// 处理数据源选择变更
	const handleIdTypeChange = (event: SelectChangeEvent) => {
		setIdType(event.target.value);
	};

	return (
		<Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
			{/* ID 类型选择框 */}
			<FormControl fullWidth disabled={isLoading || disabled || !selectedGame}>
				<InputLabel id="id-type-label">
					{t("pages.Detail.DataSourceUpdate.dataSource", "数据源")}
				</InputLabel>
				<MuiSelect
					labelId="id-type-label"
					value={idType}
					onChange={handleIdTypeChange}
					label={t("pages.Detail.DataSourceUpdate.dataSource", "数据源")}
				>
					<MenuItem value="bgm">Bangumi</MenuItem>
					<MenuItem value="vndb">VNDB</MenuItem>
					<MenuItem value="ymgal">YMGal</MenuItem>
					<MenuItem value="mixed">Mixed</MenuItem>
					<MenuItem value="custom">Custom</MenuItem>
					<MenuItem value="Whitecloud" disabled>
						Whitecloud
					</MenuItem>
				</MuiSelect>
			</FormControl>

			{/* Bangumi ID 编辑框 */}
			{(idType === "bgm" || idType === "mixed") && (
				<TextField
					label={t("pages.Detail.DataSourceUpdate.bgmId", "Bangumi ID")}
					variant="outlined"
					fullWidth
					value={bgmId}
					onChange={(e) => setBgmId(e.target.value)}
					disabled={isLoading || disabled}
					required={idType === "bgm"}
				/>
			)}

			{/* VNDB ID 编辑框 */}
			{(idType === "vndb" || idType === "mixed") && (
				<TextField
					label={t("pages.Detail.DataSourceUpdate.vndbId", "VNDB ID")}
					variant="outlined"
					fullWidth
					value={vndbId}
					onChange={(e) => setVndbId(e.target.value)}
					disabled={isLoading || disabled}
					required={idType === "vndb"}
				/>
			)}

			{/* YMGal ID 编辑框 */}
			{(idType === "ymgal" || idType === "mixed") && (
				<TextField
					label={t("pages.Detail.DataSourceUpdate.ymgalId", "YMGal ID")}
					variant="outlined"
					fullWidth
					value={ymgalId}
					onChange={(e) => setYmgalId(e.target.value)}
					disabled={isLoading || disabled}
					required={idType === "ymgal"}
				/>
			)}

			{/* 更新按钮 */}
			<Button
				variant="contained"
				color="primary"
				size="large"
				fullWidth
				disabled={
					idType === "custom" ||
					isLoading ||
					disabled ||
					!selectedGame ||
					(idType === "bgm" && !bgmId) ||
					(idType === "vndb" && !vndbId) ||
					(idType === "ymgal" && !ymgalId) ||
					(idType === "mixed" && !bgmId && !vndbId && !ymgalId)
				}
				onClick={handleFetchAndPreview}
				startIcon={
					isLoading ? (
						<CircularProgress size={20} color="inherit" />
					) : (
						<UpdateIcon />
					)
				}
			>
				{isLoading
					? t("pages.Detail.DataSourceUpdate.loading", "正在获取...")
					: t(
							"pages.Detail.DataSourceUpdate.updateFromSource",
							"从数据源更新数据",
						)}
			</Button>
		</Box>
	);
};
