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
import { FormControlLabel } from "@mui/material";
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
import { useMetadataSearchFlow } from "@/hooks/common/useMetadataSearchFlow";
import { useTauriDragDrop } from "@/hooks/common/useTauriDragDrop";
import { useSingleGameAddActions } from "@/hooks/features/games/useGameMetadataFacade";
import { useAddGame } from "@/hooks/queries/useGames";
import { useAllSettings } from "@/hooks/queries/useSettings";
import { showGameAddedSuccess } from "@/providers/snackBar";
import {
	handleExeFile,
	trimDirnameToSearchName,
} from "@/services/fs/fileDialog";
import { useStore } from "@/store/appStore";
import type { GameCandidateData, InsertGameParams } from "@/types";
import { createAbortableRunner } from "@/utils/async";
import { getUserErrorMessage } from "@/utils/errors";
import { ApiSourceRadioGroup } from "./ApiSourceRadioGroup";
import BulkImportTab from "./BulkImportTab";
import GameSelectDialog from "./GameSelectDialog";
import MixedSourceConfirmDialog from "./MixedSourceConfirmDialog";

/**
 * 常量定义
 */
const REQUEST_TIMEOUT_MS = 100000; // 请求超时时间
const ERROR_DISPLAY_DURATION_MS = 5000; // 错误提示显示时长

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
	const hasBgmAuth = Boolean(settings?.bgm_auth);
	const addGameMutation = useAddGame();
	const { addGameFromMetadata, isAddingGame } = useSingleGameAddActions();

	const {
		apiSource,
		setApiSource,
		mixedEnabledSources,
		addModalOpen,
		addModalPath,
		openAddModal,
		closeAddModal,
		setAddModalPath,
	} = useStore(
		useShallow((s) => ({
			apiSource: s.apiSource,
			setApiSource: s.setApiSource,
			mixedEnabledSources: s.mixedEnabledSources,
			addModalOpen: s.addModalOpen,
			addModalPath: s.addModalPath,
			openAddModal: s.openAddModal,
			closeAddModal: s.closeAddModal,
			setAddModalPath: s.setAddModalPath,
		})),
	);
	const [formText, setFormText] = useState("");
	const [error, setError] = useState("");
	const [customLoading, setCustomLoading] = useState(false);
	const [customMode, setCustomMode] = useState(false);
	const [activeTab, setActiveTab] = useState<AddModalTab>("single");
	const previousFocus = useRef<HTMLElement | null>(null);

	// 请求取消控制器
	const abortControllerRef = useRef<AbortController | null>(null);

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

	const handleAddGame = useCallback(
		async (gameData: GameCandidateData) => {
			const game = await addGameFromMetadata(gameData);
			closeAddModal();
			showGameAddedSuccess({ gameId: game.id, navigate, t });
		},
		[addGameFromMetadata, closeAddModal, navigate, t],
	);

	const metadataSearchFlow = useMetadataSearchFlow({
		mixedEnabledSources,
		t,
		onResolved: handleAddGame,
		onError: showError,
	});
	const isBusy =
		customLoading || metadataSearchFlow.isSearching || isAddingGame;

	const { isDragging } = useTauriDragDrop({
		onValidPath: (selectedPath) => {
			if (isBusy) return;
			openAddModal(selectedPath);
		},
	});

	/**
	 * 重置所有状态
	 */
	const resetState = useCallback(() => {
		metadataSearchFlow.reset();
		setFormText("");
		setActiveTab("single");
		setAddModalPath("");
		setError("");
	}, [metadataSearchFlow, setAddModalPath]);

	const handleCloseModal = useCallback(() => {
		if (isBusy) return;
		closeAddModal();
	}, [closeAddModal, isBusy]);

	const cancelOngoingRequest = useCallback(() => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
		}
		abortControllerRef.current = null;
		closeAddModal();
	}, [closeAddModal]);

	/**
	 * 提交表单，处理添加游戏的逻辑。
	 * - 自定义模式下直接添加本地游戏。
	 * - mixed 或自动识别出的 ID 搜索使用预览确认弹窗。
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
			const defaultdata = {
				localpath: addModalPath,
			};
			// 场景1: 自定义模式
			if (customMode) {
				if (!addModalPath) {
					showError(
						t("components.AddModal.noExecutableSelected", "未选择可执行程序"),
					);
					return;
				}
				setCustomLoading(true);
				const customGameData: InsertGameParams = {
					...defaultdata,
					id_type: "custom", // 标记为自定义
					sources: [],
					custom_data: {
						name: formText,
					},
				};
				const game = await addGameMutation.mutateAsync(customGameData);
				closeAddModal();
				showGameAddedSuccess({ gameId: game.id, navigate, t });
				return;
			}

			await metadataSearchFlow.searchMetadata({
				query: formText,
				source: apiSource,
				defaults: {
					localpath: addModalPath,
				},
				withAbort,
			});
		} catch (error) {
			showError(getUserErrorMessage(error, t));
		} finally {
			window.clearTimeout(timeoutId);
			if (abortControllerRef.current === controller) {
				abortControllerRef.current = null;
			}
			setCustomLoading(false);
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
						{t("components.AddModal.dragDropHere", "拖拽文件到这里")}
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
				<DialogTitle>
					{t("components.AddModal.addGame", "添加游戏")}
				</DialogTitle>
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
					sx={{ pt: 2, display: activeTab === "single" ? undefined : "none" }}
				>
					{/* single tab 内容：通过 display 控制显隐，避免切换 tab 时卸载 */}
					<Stack spacing={2} sx={{ pt: 1 }}>
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
							{t("components.AddModal.selectLauncher", "选择启动程序")}
						</Button>
						<TextField
							fullWidth
							size="small"
							value={addModalPath}
							placeholder={t(
								"components.AddModal.dragHint",
								"请选择或拖拽可执行文件或文件夹",
							)}
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
								label={t(
									"components.AddModal.enableCustomMode",
									"启用自定义模式",
								)}
							/>
							<ApiSourceRadioGroup
								value={apiSource}
								sx={{ gap: 1 }}
								onChange={setApiSource}
								disabled={isBusy}
							/>
							{!hasBgmAuth &&
								(apiSource === "bgm" ||
									(apiSource === "mixed" &&
										mixedEnabledSources.includes("bgm"))) && (
									<Alert severity="info" sx={{ py: 0, px: 1.5 }}>
										{t(
											"components.AddModal.bgmNotLoggedInHint",
											"未登录 Bangumi 账号，部分隐藏条目（如 R18）可能无法被搜索到。",
										)}
									</Alert>
								)}
						</Stack>
						{/* 游戏名称输入框 */}
						<TextField
							required
							size="small"
							id="name"
							name="game-name"
							label={
								apiSource === "mixed"
									? t("components.AddModal.gameName", "游戏名称")
									: `${t("components.AddModal.gameName", "游戏名称")} / ${t(
											"components.AddModal.gameIDTips",
											"游戏ID",
										)}`
							}
							type="text"
							fullWidth
							variant="outlined"
							autoComplete="off"
							value={formText}
							onChange={(event) => setFormText(event.target.value)}
						/>
					</Stack>
				</DialogContent>
				{/* bulk tab：始终挂载，通过 hidden prop 控制显隐，保持状态在 tab 切换时不丢失 */}
				<BulkImportTab
					hidden={activeTab !== "bulk"}
					onClose={handleCloseModal}
				/>
				{activeTab === "single" && (
					<DialogActions>
						{/* 取消按钮 */}
						<Button
							variant="outlined"
							onClick={
								metadataSearchFlow.isSearching
									? cancelOngoingRequest
									: handleCloseModal
							}
							disabled={isAddingGame}
						>
							{t("components.AddModal.cancel", "取消")}
						</Button>
						{/* 确认按钮 */}
						<Button
							variant="contained"
							onClick={handleSubmit}
							disabled={formText === "" || isBusy}
							startIcon={isBusy ? <CircularProgress size={20} /> : null}
						>
							{isBusy
								? t("components.AddModal.processing", "处理中...")
								: t("components.AddModal.confirm", "确认")}
						</Button>
					</DialogActions>
				)}
			</Dialog>

			<GameSelectDialog
				open={metadataSearchFlow.searchResultState.open}
				onClose={metadataSearchFlow.closeSearchResult}
				sourceCandidates={metadataSearchFlow.searchResultState.results}
				onSelectCandidate={metadataSearchFlow.selectGame}
				loading={isBusy}
				title={t("components.AddModal.selectGame", "选择游戏")}
				apiSource={metadataSearchFlow.searchResultState.apiSource}
			/>
			{metadataSearchFlow.mixedCandidateState.open && (
				<MixedSourceConfirmDialog
					open
					onClose={metadataSearchFlow.closeMixedCandidates}
					candidates={metadataSearchFlow.mixedCandidateState.candidates}
					onConfirm={metadataSearchFlow.confirmMixedSelection}
					loading={isBusy}
					title={t("components.AlertBox.confirmAddTitle", "确认添加游戏")}
				/>
			)}
		</>
	);
};

export default AddModal;
