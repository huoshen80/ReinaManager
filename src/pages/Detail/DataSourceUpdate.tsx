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
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { snackbar } from "@/providers/snackBar";
import type { FullGameData, SelectedGameWithId } from "@/types";
import { getUserErrorMessage } from "@/utils/errors";
import { fetchMetadataForUpdate } from "@/utils/metadata";

interface DataSourceUpdateProps {
	bgmToken: string;
	selectedGame: SelectedGameWithId;
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
	const [bgmId, setBgmId] = useState<string>(selectedGame.bgm_id || "");
	const [vndbId, setVndbId] = useState<string>(selectedGame.vndb_id || "");
	const [ymgalId, setYmgalId] = useState<string>(selectedGame.ymgal_id || "");
	const [kunId, setKunId] = useState<string>(selectedGame.kun_id || "");
	const [idType, setIdType] = useState<string>(selectedGame.id_type || "");
	const [isLoading, setIsLoading] = useState(false);
	const showMixedInputs = idType === "mixed";

	useEffect(() => {
		setBgmId(selectedGame.bgm_id || "");
		setVndbId(selectedGame.vndb_id || "");
		setYmgalId(selectedGame.ymgal_id || "");
		setKunId(selectedGame.kun_id || "");
		setIdType(selectedGame.id_type || "");
	}, [
		selectedGame.bgm_id,
		selectedGame.vndb_id,
		selectedGame.ymgal_id,
		selectedGame.kun_id,
		selectedGame.id_type,
	]);

	// 获取并预览游戏数据
	const handleFetchAndPreview = async () => {
		if (idType === "custom") {
			snackbar.error(
				t(
					"pages.Detail.DataSourceUpdate.customModeWarning",
					"自定义模式无法从数据源更新。",
				),
			);
			return;
		}

		try {
			setIsLoading(true);
			const result = await fetchMetadataForUpdate({
				selectedGame,
				idType,
				bgmId,
				vndbId,
				ymgalId,
				kunId,
				bgmToken,
			});
			onDataFetched(result);
		} catch (error) {
			snackbar.error(getUserErrorMessage(error, t));
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
			<FormControl fullWidth disabled={isLoading || disabled}>
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
					<MenuItem value="kun">Kungal</MenuItem>
					<MenuItem value="mixed">Mixed</MenuItem>
					<MenuItem value="custom">Custom</MenuItem>
					<MenuItem value="Whitecloud" disabled>
						Whitecloud
					</MenuItem>
				</MuiSelect>
			</FormControl>

			{/* Bangumi ID 编辑框 */}
			{(idType === "bgm" || showMixedInputs) && (
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
			{(idType === "vndb" || showMixedInputs) && (
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
			{(idType === "ymgal" || showMixedInputs) && (
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

			{/* Kungal ID 编辑框 */}
			{(idType === "kun" || showMixedInputs) && (
				<TextField
					label={t("pages.Detail.DataSourceUpdate.kunId", "Kungal ID")}
					variant="outlined"
					fullWidth
					value={kunId}
					onChange={(e) => setKunId(e.target.value)}
					disabled={isLoading || disabled}
					required={idType === "kun"}
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
					(idType === "bgm" && !bgmId) ||
					(idType === "vndb" && !vndbId) ||
					(idType === "ymgal" && !ymgalId) ||
					(idType === "kun" && !kunId) ||
					(idType === "mixed" && !(bgmId || vndbId || ymgalId || kunId))
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
