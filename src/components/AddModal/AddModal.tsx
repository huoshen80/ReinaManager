/**
 * @file AddModal 组件
 * @description 用于添加新游戏条目的弹窗组件，支持通过 Bangumi/VNDB/YMgal API 自动获取信息或自定义添加本地游戏，包含错误提示、加载状态、国际化等功能。
 * @module src/components/AddModal/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - AddModal：添加游戏的弹窗组件
 */

import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import FileOpenIcon from "@mui/icons-material/FileOpen";
import { FormControlLabel, Radio, RadioGroup } from "@mui/material";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { basename, dirname } from "pathe";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { gameMetadataService } from "@/api";
import { useTauriDragDrop } from "@/hooks/common/useTauriDragDrop";
import { useSingleGameAddActions } from "@/hooks/features/games/useGameMetadataFacade";
import { useAddGame } from "@/hooks/queries/useGames";
import { useAllSettings } from "@/hooks/queries/useSettings";
import { showGameAddedSuccess } from "@/providers/snackBar";
import { useStore } from "@/store/appStore";
import type { apiSourceType, FullGameData, InsertGameParams } from "@/types";
import {
	createAbortableRunner,
	handleExeFile,
	isAbortError,
	trimDirnameToSearchName,
} from "@/utils/appUtils";
import { getUserErrorMessage } from "@/utils/errors";
import BulkImportTab from "./BulkImportTab";
import GameSearchResultDialog, {
	getPrimaryGameSearchResult,
} from "./GameSearchResultDialog";

/**
 * 常量定义
 */
const REQUEST_TIMEOUT_MS = 100000; // 请求超时时间
const ERROR_DISPLAY_DURATION_MS = 5000; // 错误提示显示时长

interface SearchResultState {
	open: boolean;
	results: FullGameData[];
}

type AddModalTab = "single" | "bulk";

/**
 * 从文件路径中提取文件夹名称并清洗（纯函数，置于组件外以保证稳定引用）
 * @param path 文件路径
 * @returns 搜索名称（从文件夹名提取并清洗后的结果）
 */
function extractFolderName(path: string): string {
	// 使用 pathe 的 dirname 获取父目录，然后获取文件夹名
	const parentDir = dirname(path);
	return trimDirnameToSearchName(basename(parentDir));
}

/**
 * AddModal 组件用于添加新游戏条目。
 *
 * 主要功能：
 * - 支持通过 Bangumi 或 VNDB API 自动获取游戏信息。
 * - 支持自定义模式，允许用户手动选择本地可执行文件并填写名称。
 * - 支持错误提示、加载状态、国际化等功能。
 * - 名称搜索时显示确认弹窗，支持查看更多选择其他结果。
 *
 * @component
 * @returns {JSX.Element} 添加游戏的弹窗组件
 */
const AddModal: React.FC = () => {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const { data: settings } = useAllSettings();
	const bgmToken = settings?.bgm_token ?? "";
	const addGameMutation = useAddGame();
	const { addGameFromMetadata, isAddingGame } = useSingleGameAddActions();

	const {
		apiSource,
		setApiSource,
		addModalOpen,
		addModalPath,
		openAddModal,
		closeAddModal,
		setAddModalPath,
	} = useStore(
		useShallow((s) => ({
			apiSource: s.apiSource,
			setApiSource: s.setApiSource,
			addModalOpen: s.addModalOpen,
			addModalPath: s.addModalPath,
			openAddModal: s.openAddModal,
			closeAddModal: s.closeAddModal,
			setAddModalPath: s.setAddModalPath,
		})),
	);

	const [formText, setFormText] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [customMode, setCustomMode] = useState(false);
	// 保留 ID 搜索状态
	const [isID, setisID] = useState(false);
	const [activeTab, setActiveTab] = useState<AddModalTab>("single");
	const previousFocus = useRef<HTMLElement | null>(null);

	const [searchResultState, setSearchResultState] = useState<SearchResultState>(
		{
			open: false,
			results: [],
		},
	);

	// 请求取消控制器
	const abortControllerRef = useRef<AbortController | null>(null);
	const isBusy = loading || isAddingGame;

	const { isDragging } = useTauriDragDrop({
		onValidPath: (selectedPath) => {
			if (isBusy) return;
			openAddModal(selectedPath);
		},
	});

	const showError = useCallback((message: string) => {
		setError(message);
		setTimeout(() => setError(""), ERROR_DISPLAY_DURATION_MS);
	}, []);

	/**
	 * 当路径变化时，自动提取文件夹名作为游戏名。
	 */
	useEffect(() => {
		if (addModalPath) {
			setFormText(extractFolderName(addModalPath));
		}
	}, [addModalPath]);

	useEffect(() => {
		if (addModalOpen) {
			previousFocus.current = document.activeElement as HTMLElement;
			return;
		}

		if (previousFocus.current) {
			previousFocus.current.focus();
		}
	}, [addModalOpen]);

	/**
	 * 重置所有状态
	 */
	const resetState = useCallback(() => {
		setSearchResultState({ open: false, results: [] });
		setFormText("");
		setActiveTab("single");
		setAddModalPath("");
		setError("");
	}, [setAddModalPath]);

	const handleCloseModal = useCallback(() => {
		if (isBusy) return;
		closeAddModal();
	}, [closeAddModal, isBusy]);

	const handleAddGame = useCallback(
		async (gameData: FullGameData) => {
			const gameId = await addGameFromMetadata(gameData);
			closeAddModal();
			showGameAddedSuccess({ gameId, navigate, t });
		},
		[addGameFromMetadata, closeAddModal, navigate, t],
	);

	const handleCloseSearchResult = useCallback(() => {
		setSearchResultState({ open: false, results: [] });
	}, []);

	/**
	 * 处理预览确认弹窗的确认操作
	 */
	const handleConfirmAdd = useCallback(async () => {
		const finaldata = getPrimaryGameSearchResult(searchResultState.results);
		if (!finaldata) return;

		try {
			await handleAddGame(finaldata);
		} catch (error) {
			showError(getUserErrorMessage(error, t));
		}
	}, [handleAddGame, searchResultState.results, showError, t]);

	const cancelOngoingRequest = useCallback(() => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
		}
		abortControllerRef.current = null;
		setLoading(false);
		closeAddModal();
	}, [closeAddModal]);

	/**
	 * 处理从列表中选择游戏
	 */
	const handleSelectGame = useCallback(
		async (selectedGame: FullGameData) => {
			if (!selectedGame || isBusy) {
				return;
			}

			try {
				await handleAddGame(selectedGame);
			} catch (error) {
				showError(getUserErrorMessage(error, t));
			}
		},
		[handleAddGame, isBusy, showError, t],
	);

	/**
	 * 获取搜索结果，并根据数据源决定使用哪种弹窗
	 */
	const fetchFromDataSource = async (): Promise<FullGameData[]> => {
		const searchResults = await gameMetadataService.searchGames({
			query: formText,
			source: apiSource === "mixed" ? undefined : apiSource,
			bgmToken,
			isIdSearch: isID,
			defaults: {
				localpath: addModalPath,
			},
		});

		if (searchResults.length === 0) {
			// 根据数据源和搜索类型抛出更具体的错误
			if (apiSource === "mixed") {
				throw new Error(t("components.AddModal.noResultsMixed"));
			}
			if (apiSource === "bgm") {
				// 检查 BGM 数据源是否缺少 token
				if (!bgmToken) {
					throw new Error(t("components.AddModal.noBgmToken"));
				}

				throw new Error(t("components.AddModal.noResultsBgm"));
			}
			if (apiSource === "vndb") {
				throw new Error(t("components.AddModal.noResultsVndb"));
			}
			if (apiSource === "ymgal") {
				throw new Error(t("components.AddModal.noResultsYmgal"));
			}
			if (apiSource === "kun") {
				throw new Error(
					t("components.AddModal.noResultsKun", "Kungal 未找到相关结果"),
				);
			}
			// 默认错误
			throw new Error(t("components.AddModal.noResults"));
		}

		return searchResults;
	};

	/**
	 * 提交表单，处理添加游戏的逻辑。
	 * - 自定义模式下直接添加本地游戏。
	 * - mixed 或 ID 搜索使用预览确认弹窗。
	 * - 单一数据源的名称搜索使用列表选择弹窗，并在选择后直接添加。
	 */
	const handleSubmit = async () => {
		if (isBusy) return;
		const { controller, withAbort } = createAbortableRunner();
		if (abortControllerRef.current) abortControllerRef.current.abort();
		abortControllerRef.current = controller;

		const timeoutId = window.setTimeout(() => {
			controller.abort();
			showError(t("components.AddModal.timeout", "请求超时，请稍后重试"));
		}, REQUEST_TIMEOUT_MS);

		try {
			setLoading(true);

			const defaultdata = {
				localpath: addModalPath,
			};
			// 场景1: 自定义模式
			if (customMode) {
				if (!addModalPath) {
					showError(t("components.AddModal.noExecutableSelected"));
					return;
				}
				const customGameData: InsertGameParams = {
					...defaultdata,
					id_type: "custom", // 标记为自定义
					custom_data: {
						name: formText,
					},
				};
				const gameId = await addGameMutation.mutateAsync(customGameData);
				closeAddModal();
				showGameAddedSuccess({ gameId, navigate, t });
				return;
			}

			// 场景2-4: 通过 API 获取数据
			const results = await withAbort(fetchFromDataSource());
			setSearchResultState({
				open: true,
				results,
			});
		} catch (error) {
			if (isAbortError(error)) {
				return;
			}
			showError(getUserErrorMessage(error, t));
		} finally {
			window.clearTimeout(timeoutId);
			if (abortControllerRef.current === controller) {
				abortControllerRef.current = null;
			}
			setLoading(false);
		}
	};

	return (
		<>
			{/* 拖拽遮罩层 */}
			{isDragging && (
				<Box className="fixed inset-0 z-[9999] bg-[rgba(25,118,210,0.15)] backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none">
					<CloudUploadIcon className="text-[80px] text-[#1976d2] mb-2 opacity-90" />
					<Typography
						variant="h5"
						className="text-2xl font-semibold text-[#1976d2] text-center opacity-90"
					>
						{t("components.AddModal.dragDropHere")}
					</Typography>
				</Box>
			)}
			<Dialog
				open={addModalOpen}
				onClose={(_, reason) => {
					// 加载时防止关闭弹窗
					if (reason !== "backdropClick" && !isBusy) {
						handleCloseModal();
					}
				}}
				closeAfterTransition={false}
				aria-labelledby="addgame-dialog-title"
				fullWidth
				maxWidth={activeTab === "bulk" ? "lg" : "sm"}
				slotProps={{
					paper: {
						sx:
							activeTab === "bulk"
								? {
										height: "min(88vh, 920px)",
										display: "flex",
										flexDirection: "column",
									}
								: undefined,
					},
					transition: {
						onExited: resetState,
					},
				}}
			>
				{/* 错误提示 */}
				{error && <Alert severity="error">{error}</Alert>}
				<DialogTitle>{t("components.AddModal.addGame")}</DialogTitle>
				<Tabs
					value={activeTab}
					onChange={(_, value: AddModalTab) => setActiveTab(value)}
					variant="fullWidth"
				>
					<Tab
						value="single"
						label={t("components.AddModal.singleTab", "单个添加")}
						disabled={isBusy}
					/>
					<Tab
						value="bulk"
						label={t("components.AddModal.bulkTab", "批量导入")}
						disabled={isBusy}
					/>
				</Tabs>
				<DialogContent
					sx={
						activeTab === "bulk"
							? {
									pt: 2,
									display: "flex",
									flex: "1 1 auto",
									minHeight: 0,
									overflow: "hidden",
								}
							: { pt: 2 }
					}
				>
					{/* single tab 内容：通过 display 控制显隐，避免切换 tab 时卸载 */}
					<Stack
						spacing={2}
						sx={{ pt: 1, display: activeTab === "single" ? undefined : "none" }}
					>
						{/* 选择本地可执行文件 */}
						<Button
							fullWidth
							variant="contained"
							onClick={async () => {
								const result = await handleExeFile();
								if (result) setAddModalPath(result);
							}}
							startIcon={<FileOpenIcon />}
							disabled={isBusy}
						>
							{t("components.AddModal.selectLauncher")}
						</Button>
						<TextField
							fullWidth
							size="small"
							value={addModalPath}
							placeholder={t("components.AddModal.dragHint")}
							InputProps={{ readOnly: true }}
						/>
						{/* 自定义模式和 API 来源切换 */}
						<Stack spacing={1}>
							<FormControlLabel
								control={
									<Switch
										checked={customMode}
										onChange={() => {
											setCustomMode(!customMode);
										}}
										disabled={isBusy}
									/>
								}
								label={t("components.AddModal.enableCustomMode")}
							/>
							<RadioGroup
								row
								value={apiSource}
								sx={{ gap: 1 }}
								onChange={(e) => setApiSource(e.target.value as apiSourceType)}
							>
								<FormControlLabel
									value="bgm"
									control={<Radio />}
									label="Bangumi"
									disabled={isBusy}
								/>
								<FormControlLabel
									value="vndb"
									control={<Radio />}
									label="VNDB"
									disabled={isBusy}
								/>
								<FormControlLabel
									value="ymgal"
									control={<Radio />}
									label="YMGal"
									disabled={isBusy}
								/>
								<FormControlLabel
									value="kun"
									control={<Radio />}
									label="Kun"
									disabled={isBusy}
								/>
								<FormControlLabel
									value="mixed"
									control={<Radio />}
									label="Mixed"
									disabled={isBusy}
								/>
							</RadioGroup>
							<FormControlLabel
								control={
									<Switch
										checked={isID}
										onChange={() => {
											setisID(!isID);
										}}
										disabled={isBusy}
									/>
								}
								label={t("components.AddModal.idSearch")}
							/>
						</Stack>
						{/* 游戏名称输入框 */}
						<TextField
							required
							size="small"
							id="name"
							name="game-name"
							label={
								!isID
									? t("components.AddModal.gameName")
									: t("components.AddModal.gameIDTips")
							}
							type="text"
							fullWidth
							variant="outlined"
							autoComplete="off"
							value={formText}
							onChange={(event) => setFormText(event.target.value)}
						/>
					</Stack>
					{/* bulk tab：始终挂载，通过 hidden prop 控制显隐，保持状态在 tab 切换时不丢失 */}
					<BulkImportTab
						hidden={activeTab !== "bulk"}
						onClose={handleCloseModal}
					/>
				</DialogContent>
				{activeTab === "single" && (
					<DialogActions>
						{/* 取消按钮 */}
						<Button
							variant="outlined"
							onClick={loading ? cancelOngoingRequest : handleCloseModal}
							disabled={isAddingGame}
						>
							{t("components.AddModal.cancel")}
						</Button>
						{/* 确认按钮 */}
						<Button
							variant="contained"
							onClick={handleSubmit}
							disabled={formText === "" || isBusy}
							startIcon={isBusy ? <CircularProgress size={20} /> : null}
						>
							{isBusy
								? t("components.AddModal.processing")
								: t("components.AddModal.confirm")}
						</Button>
					</DialogActions>
				)}
			</Dialog>

			<GameSearchResultDialog
				open={searchResultState.open}
				onClose={handleCloseSearchResult}
				results={searchResultState.results}
				onSelect={handleSelectGame}
				onConfirmPreview={handleConfirmAdd}
				loading={isBusy}
				apiSource={apiSource}
				isIdSearch={isID}
				previewTitle={t("components.AlertBox.confirmAddTitle", "确认添加游戏")}
				selectTitle={t("components.AddModal.selectGame", "选择游戏")}
			/>
		</>
	);
};

export default AddModal;
