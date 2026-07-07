import SearchIcon from "@mui/icons-material/Search";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import UpdateIcon from "@mui/icons-material/Update";
import {
	Box,
	Button,
	CircularProgress,
	FormControl,
	InputLabel,
	MenuItem,
	Select,
	type SelectChangeEvent,
	TextField,
	ToggleButton,
	ToggleButtonGroup,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import GameSelectDialog from "@/components/AddModal/GameSelectDialog";
import MixedSourceConfirmDialog from "@/components/AddModal/MixedSourceConfirmDialog";
import { useMetadataSearchFlow } from "@/hooks/common/useMetadataSearchFlow";
import { getRuntimeSourceAdapter, REGISTERED_SOURCE_KEYS } from "@/metadata";
import { fetchMetadataForUpdate } from "@/metadata/data/metadata";
import { getSourceIdFromDisplay } from "@/metadata/sourceRecord";
import { snackbar } from "@/providers/snackBar";
import { isBgmAuthExpiredError, withBgmAuth } from "@/services/bgmAuthSession";
import { useStore } from "@/store/appStore";
import type {
	apiSourceType,
	GameCandidateData,
	GameData,
	SourceType,
} from "@/types";
import { isSourceType } from "@/types";
import { getUserErrorMessage } from "@/utils/errors";
import { getGameDisplayName } from "@/utils/game";

interface DataSourceUpdateProps {
	selectedGame: GameData;
	sourceAvailability: Record<SourceType, boolean>;
	onDataFetched: (data: GameCandidateData) => void;
	onDirectDataUpdate: (data: GameCandidateData) => Promise<void>;
	onSourceSwitch: (idType: string) => Promise<void>;
	disabled?: boolean;
}

type SourceIdState = Record<SourceType, string>;

function getSourceIdState(game: GameData): SourceIdState {
	return Object.fromEntries(
		REGISTERED_SOURCE_KEYS.map((source) => {
			return [source, getSourceIdFromDisplay(game, source) || ""];
		}),
	) as SourceIdState;
}

/**
 * DataSourceUpdate 组件
 * 负责从外部数据源更新游戏信息，已知缺少重复游戏检测
 */
export const DataSourceUpdate: React.FC<DataSourceUpdateProps> = ({
	selectedGame,
	sourceAvailability,
	onDataFetched,
	onDirectDataUpdate,
	onSourceSwitch,
	disabled = false,
}) => {
	const { t } = useTranslation();
	const selectedGameDisplayName = getGameDisplayName(selectedGame);

	// 数据源更新相关状态
	const [sourceIds, setSourceIds] = useState<SourceIdState>(() =>
		getSourceIdState(selectedGame),
	);
	const [idType, setIdType] = useState<string>(selectedGame.id_type || "");
	const [searchName, setSearchName] = useState<string>(
		() => selectedGameDisplayName,
	);
	const [isLoading, setIsLoading] = useState(false);
	const [isSwitching, setIsSwitching] = useState(false);
	const { mixedEnabledSources, dataSourceUpdateMode, setDataSourceUpdateMode } =
		useStore(
			useShallow((s) => ({
				mixedEnabledSources: s.mixedEnabledSources,
				dataSourceUpdateMode: s.dataSourceUpdateMode,
				setDataSourceUpdateMode: s.setDataSourceUpdateMode,
			})),
		);
	const showMixedInputs = idType === "mixed";
	const isSearchMode = dataSourceUpdateMode === "search";
	const searchSource: apiSourceType | null =
		idType === "mixed" || isSourceType(idType) ? idType : null;
	const metadataSearchFlow = useMetadataSearchFlow({
		mixedEnabledSources,
		t,
		onResolved: onDirectDataUpdate,
		onError: (message) => snackbar.error(message),
	});
	const isBusy =
		isLoading || isSwitching || metadataSearchFlow.isSearching || disabled;
	const isMixedSourceEnabled = (source: SourceType) =>
		mixedEnabledSources.includes(source);
	const sourceInputs = REGISTERED_SOURCE_KEYS.map((source) => {
		const adapter = getRuntimeSourceAdapter(source);
		return {
			source,
			label: `${adapter.label} ID`,
			value: sourceIds[source],
			setValue: (value: string) =>
				setSourceIds((prev) => ({ ...prev, [source]: value })),
		};
	});
	const hasEnabledMixedSourceId = sourceInputs.some(
		({ source, value }) => isMixedSourceEnabled(source) && Boolean(value),
	);
	const hasManualSourceId =
		idType === "mixed"
			? hasEnabledMixedSourceId
			: isSourceType(idType) && Boolean(sourceIds[idType]);

	const hasSelectedSourceData = (source: SourceType) => {
		return Boolean(
			getSourceIdFromDisplay(selectedGame, source) &&
				sourceAvailability[source],
		);
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
		setSourceIds(getSourceIdState(selectedGame));
		setIdType(selectedGame.id_type || "");
	}, [selectedGame]);

	useEffect(() => {
		setSearchName(selectedGameDisplayName);
	}, [selectedGameDisplayName]);

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
					sourceIds,
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

	const handleSearchByName = async () => {
		const query = searchName.trim();
		if (!query || !searchSource) {
			return;
		}

		await metadataSearchFlow.searchMetadata({
			query,
			source: searchSource,
		});
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
			<Box className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
				<FormControl fullWidth disabled={isBusy}>
					<InputLabel id="id-type-label">
						{t("pages.Detail.DataSourceUpdate.dataSource", "数据源")}
					</InputLabel>
					<Select
						labelId="id-type-label"
						value={idType}
						onChange={handleIdTypeChange}
						label={t("pages.Detail.DataSourceUpdate.dataSource", "数据源")}
						size="small"
					>
						{REGISTERED_SOURCE_KEYS.map((source) => {
							const adapter = getRuntimeSourceAdapter(source);
							return (
								<MenuItem key={source} value={source}>
									{adapter.label}
								</MenuItem>
							);
						})}
						<MenuItem value="mixed">Mixed</MenuItem>
						<MenuItem value="custom" disabled>
							Custom
						</MenuItem>
						<MenuItem value="Whitecloud" disabled>
							Whitecloud
						</MenuItem>
					</Select>
				</FormControl>
				<Button
					variant="outlined"
					color="primary"
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
			</Box>

			<ToggleButtonGroup
				exclusive
				size="small"
				value={dataSourceUpdateMode}
				onChange={(_, value) => {
					if (value) {
						setDataSourceUpdateMode(value);
					}
				}}
				disabled={isBusy}
				sx={{
					width: "100%",
					"& .MuiToggleButton-root": { flex: 1 },
				}}
			>
				<ToggleButton value="search">
					{t("pages.Detail.DataSourceUpdate.searchMode", "名称搜索")}
				</ToggleButton>
				<ToggleButton value="manualId">
					{t("pages.Detail.DataSourceUpdate.manualIdMode", "手动 ID")}
				</ToggleButton>
			</ToggleButtonGroup>

			{isSearchMode ? (
				<Box className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
					<TextField
						label={t("pages.Detail.DataSourceUpdate.searchName", "搜索名称")}
						variant="outlined"
						fullWidth
						size="small"
						value={searchName}
						onChange={(e) => setSearchName(e.target.value)}
						onKeyDown={(event) => {
							if (
								event.key === "Enter" &&
								searchName.trim() &&
								searchSource &&
								!isBusy
							) {
								handleSearchByName();
							}
						}}
						disabled={isBusy}
					/>
					<Button
						variant="contained"
						color="primary"
						fullWidth
						disabled={!searchName.trim() || !searchSource || isBusy}
						onClick={handleSearchByName}
						startIcon={
							metadataSearchFlow.isSearching ? (
								<CircularProgress size={20} color="inherit" />
							) : (
								<SearchIcon />
							)
						}
					>
						{metadataSearchFlow.isSearching
							? t("pages.Detail.DataSourceUpdate.searching", "正在搜索...")
							: t("pages.Detail.DataSourceUpdate.search", "搜索")}
					</Button>
				</Box>
			) : (
				<>
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

					<Button
						variant="contained"
						color="primary"
						fullWidth
						disabled={idType === "custom" || isBusy || !hasManualSourceId}
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
				</>
			)}

			<GameSelectDialog
				open={metadataSearchFlow.searchResultState.open}
				onClose={metadataSearchFlow.closeSearchResult}
				sourceCandidates={metadataSearchFlow.searchResultState.results}
				onSelectCandidate={metadataSearchFlow.selectGame}
				loading={metadataSearchFlow.isSearching}
				title={t(
					"pages.Detail.DataSourceUpdate.selectAndUpdateGame",
					"选择并更新游戏",
				)}
				apiSource={metadataSearchFlow.searchResultState.apiSource}
			/>
			{metadataSearchFlow.mixedCandidateState.open && (
				<MixedSourceConfirmDialog
					open
					onClose={metadataSearchFlow.closeMixedCandidates}
					candidates={metadataSearchFlow.mixedCandidateState.candidates}
					onConfirm={metadataSearchFlow.confirmMixedSelection}
					loading={metadataSearchFlow.isSearching}
					title={t(
						"pages.Detail.DataSourceUpdate.confirmUpdateTitle",
						"确认更新数据源",
					)}
				/>
			)}
		</Box>
	);
};
