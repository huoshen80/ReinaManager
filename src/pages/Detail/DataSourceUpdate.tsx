import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
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
import { getRuntimeSourceAdapter } from "@/metadata";
import { snackbar } from "@/providers/snackBar";
import { useStore } from "@/store/appStore";
import type { GameCandidateData, GameData, SourceType } from "@/types";
import { isSourceType } from "@/types";
import { isBgmAuthExpiredError, withBgmAuth } from "@/utils/bgmAuthSession";
import { getUserErrorMessage } from "@/utils/errors";
import { fetchMetadataForUpdate } from "@/utils/gameData/metadata";

interface DataSourceUpdateProps {
	selectedGame: GameData;
	sourceAvailability: Record<SourceType, boolean>;
	onDataFetched: (data: GameCandidateData) => void;
	onSourceSwitch: (idType: string) => Promise<void>;
	disabled?: boolean;
}

/**
 * DataSourceUpdate 组件
 * 负责从外部数据源(BGM, VNDB, YMGal, Mixed)更新游戏信息 已知缺少重复游戏检测
 */
export const DataSourceUpdate: React.FC<DataSourceUpdateProps> = ({
	selectedGame,
	sourceAvailability,
	onDataFetched,
	onSourceSwitch,
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
	const [isSwitching, setIsSwitching] = useState(false);
	const mixedEnabledSources = useStore((s) => s.mixedEnabledSources);
	const showMixedInputs = idType === "mixed";
	const isBusy = isLoading || isSwitching || disabled;
	const isMixedSourceEnabled = (source: SourceType) =>
		mixedEnabledSources.includes(source);
	const sourceInputs = [
		{
			source: "bgm",
			label: t("pages.Detail.DataSourceUpdate.bgmId", "Bangumi ID"),
			value: bgmId,
			setValue: setBgmId,
		},
		{
			source: "vndb",
			label: t("pages.Detail.DataSourceUpdate.vndbId", "VNDB ID"),
			value: vndbId,
			setValue: setVndbId,
		},
		{
			source: "ymgal",
			label: t("pages.Detail.DataSourceUpdate.ymgalId", "YMGal ID"),
			value: ymgalId,
			setValue: setYmgalId,
		},
		{
			source: "kun",
			label: t("pages.Detail.DataSourceUpdate.kunId", "Kungal ID"),
			value: kunId,
			setValue: setKunId,
		},
	] as const;
	const hasEnabledMixedSourceId = sourceInputs.some(
		({ source, value }) => isMixedSourceEnabled(source) && Boolean(value),
	);

	const hasSelectedSourceData = (source: SourceType) => {
		const { idKey } = getRuntimeSourceAdapter(source);
		return Boolean(selectedGame[idKey] && sourceAvailability[source]);
	};

	const canSwitchSource = () => {
		if (
			!idType ||
			idType === selectedGame.id_type ||
			idType === "custom" ||
			idType === "Whitecloud"
		) {
			return false;
		}
		if (idType === "mixed") {
			return mixedEnabledSources.some((source) =>
				hasSelectedSourceData(source),
			);
		}
		if (isSourceType(idType)) {
			return hasSelectedSourceData(idType);
		}
		return false;
	};

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
			const fetchMetadata = (bgmToken?: string) =>
				fetchMetadataForUpdate({
					selectedGame,
					idType,
					bgm_id: bgmId,
					vndb_id: vndbId,
					ymgal_id: ymgalId,
					kun_id: kunId,
					enabledSources: idType === "mixed" ? mixedEnabledSources : undefined,
					bgmToken,
				});
			const usesBgmSource =
				idType === "bgm" || (idType === "mixed" && isMixedSourceEnabled("bgm"));
			const result = usesBgmSource
				? await withBgmAuth(fetchMetadata)
				: await fetchMetadata();
			onDataFetched(result);
		} catch (error) {
			if (isBgmAuthExpiredError(error)) {
				return;
			}
			snackbar.error(getUserErrorMessage(error, t));
		} finally {
			setIsLoading(false);
		}
	};

	// 处理数据源选择变更
	const handleIdTypeChange = (event: SelectChangeEvent) => {
		setIdType(event.target.value);
	};

	const handleSwitchSource = async () => {
		if (!canSwitchSource()) {
			snackbar.error(
				t(
					"pages.Detail.DataSourceUpdate.sourceSwitchUnavailable",
					"当前游戏没有该数据源的本地数据，无法仅切换显示源。",
				),
			);
			return;
		}

		try {
			setIsSwitching(true);
			await onSourceSwitch(idType);
		} catch (error) {
			snackbar.error(getUserErrorMessage(error, t));
		} finally {
			setIsSwitching(false);
		}
	};

	return (
		<Box className="flex flex-col gap-5">
			{/* ID 类型选择框 */}
			<FormControl fullWidth disabled={isBusy}>
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
					<MenuItem value="custom" disabled>
						Custom
					</MenuItem>
					<MenuItem value="Whitecloud" disabled>
						Whitecloud
					</MenuItem>
				</MuiSelect>
			</FormControl>

			{sourceInputs.map(({ source, label, value, setValue }) =>
				idType === source ||
				(showMixedInputs && isMixedSourceEnabled(source)) ? (
					<TextField
						key={source}
						label={label}
						variant="outlined"
						fullWidth
						value={value}
						onChange={(e) => setValue(e.target.value)}
						disabled={isBusy}
						required={idType === source}
					/>
				) : null,
			)}

			{/* 操作按钮 */}
			<Box className="grid grid-cols-1 gap-2 sm:grid-cols-2">
				<Button
					variant="outlined"
					color="primary"
					size="large"
					fullWidth
					disabled={!canSwitchSource() || isBusy}
					onClick={handleSwitchSource}
					startIcon={
						isSwitching ? (
							<CircularProgress size={20} color="inherit" />
						) : (
							<SwapHorizIcon />
						)
					}
				>
					{isSwitching
						? t("pages.Detail.DataSourceUpdate.switchingSource", "正在切换...")
						: t(
								"pages.Detail.DataSourceUpdate.switchDisplaySource",
								"切换显示源",
							)}
				</Button>

				<Button
					variant="contained"
					color="primary"
					size="large"
					fullWidth
					disabled={
						idType === "custom" ||
						isBusy ||
						(idType === "bgm" && !bgmId) ||
						(idType === "vndb" && !vndbId) ||
						(idType === "ymgal" && !ymgalId) ||
						(idType === "kun" && !kunId) ||
						(idType === "mixed" && !hasEnabledMixedSourceId)
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
		</Box>
	);
};
