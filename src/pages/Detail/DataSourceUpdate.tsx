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
import type { FullGameData, GameData } from "@/types";
import { getErrorMessage } from "@/utils/appUtils";
import { fetchMetadataForUpdate } from "@/utils/metadata";

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
	}, [
		selectedGame?.bgm_id,
		selectedGame?.vndb_id,
		selectedGame?.ymgal_id,
		selectedGame?.id_type,
	]);

	// 获取并预览游戏数据
	const handleFetchAndPreview = async () => {
		if (!selectedGame) {
			snackbar.error(
				t("pages.Detail.DataSourceUpdate.noGameSelected", "未选择游戏"),
			);
			return;
		}

		if (idType === "custom") {
			snackbar.error(
				t(
					"pages.Detail.DataSourceUpdate.customModeWarning",
					"自定义模式无法从数据源更新。",
				),
			);
			return;
		}

		if (idType === "mixed" && !bgmId && !vndbId && !ymgalId) {
			snackbar.error(
				t(
					"pages.Detail.DataSourceUpdate.bgmOrVndbIdRequired",
					"Bangumi ID、VNDB ID 或 YMGal ID 不能为空",
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
				bgmToken,
			});
			onDataFetched(result);
		} catch (error) {
			snackbar.error(getErrorMessage(error));
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
