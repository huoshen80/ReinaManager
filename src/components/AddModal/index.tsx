/**
 * @file AddModal 组件
 * @description 用于添加新游戏条目的弹窗组件，支持通过 Bangumi/VNDB API 自动获取信息或自定义添加本地游戏，包含错误提示、加载状态、国际化等功能。
 * @module src/components/AddModal/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - AddModal：添加游戏的弹窗组件
 *
 * 依赖：
 * - @mui/material
 * - @tauri-apps/plugin-dialog
 * - @tauri-apps/api/core
 * - @/api/bgm
 * - @/api/vndb
 * - @/store
 * - @/utils
 * - react-i18next
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
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { basename, dirname } from "pathe";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { gameMetadataService } from "@/api";
import { isYmgalDataComplete } from "@/api/gameMetadataService";
import { ViewGameBox } from "@/components/AlertBox";
import { snackbar } from "@/components/Snackbar";
import { useTauriDragDrop } from "@/hooks/common/useTauriDragDrop";
import { useStore } from "@/store/";
import type { FullGameData, InsertGameParams } from "@/types";
import { handleDirectory } from "@/utils";
import GameSelectDialog from "./GameSelectDialog";

/**
 * 常量定义
 */
const REQUEST_TIMEOUT_MS = 100000; // 请求超时时间
const ERROR_DISPLAY_DURATION_MS = 5000; // 错误提示显示时长

/**
 * 弹窗状态类型定义
 */
interface DialogState {
	confirm: {
		open: boolean;
		data: FullGameData | null;
		showViewMore: boolean;
	};
	select: {
		open: boolean;
		results: FullGameData[];
	};
}

/**
 * 从游戏数据构建 InsertGameParams
 * @param gameData 游戏数据
 * @param fallbackIdType 备用 id_type
 * @param fallbackDate 备用 date
 * @returns InsertGameParams 对象
 */
function buildInsertData(
	gameData: FullGameData,
	fallbackIdType?: string,
	fallbackDate?: string,
): InsertGameParams {
	return {
		bgm_id: gameData.bgm_id,
		vndb_id: gameData.vndb_id,
		ymgal_id: gameData.ymgal_id,
		id_type: gameData.id_type || fallbackIdType || "mixed",
		date: fallbackDate,
		localpath: gameData.localpath ?? undefined,
		bgm_data: gameData.bgm_data ?? undefined,
		vndb_data: gameData.vndb_data ?? undefined,
		ymgal_data: gameData.ymgal_data ?? undefined,
		custom_data: gameData.custom_data ?? undefined,
	};
}

/**
 * 从 YMGal ID 获取完整数据并与现有数据整合
 * @param ymgalId YMGal ID
 * @param existingData 现有数据
 * @param bgmToken BGM Token
 * @returns 整合后的完整数据，如果获取失败则返回 null
 */
async function fetchYmgalAndMerge(
	ymgalId: string | number,
	existingData: FullGameData,
	bgmToken?: string,
): Promise<FullGameData | null> {
	const results = await gameMetadataService.searchGames({
		query: ymgalId.toString(),
		source: "ymgal",
		bgmToken,
		isIdSearch: true,
	});

	if (results.length === 0) {
		return null;
	}

	const ymgalData = results[0];
	// 整合数据：使用已有的 BGM/VNDB 数据 + 新的 YMGal 完整数据
	return {
		id_type: "mixed",
		bgm_id: existingData.bgm_id,
		bgm_data: existingData.bgm_data ?? undefined,
		vndb_id: existingData.vndb_id,
		vndb_data: existingData.vndb_data ?? undefined,
		ymgal_id: ymgalData.ymgal_id,
		ymgal_data: ymgalData.ymgal_data,
		date: existingData.date,
		localpath: existingData.localpath,
		custom_data: existingData.custom_data ?? undefined,
	};
}

/**
 * 从文件路径中提取文件夹名称（纯函数，置于组件外以保证稳定引用）
 * @param path 文件路径
 * @returns 文件夹名称
 */
function extractFolderName(path: string): string {
	// 使用 pathe 的 dirname 获取父目录，然后获取文件夹名
	const parentDir = dirname(path);
	return basename(parentDir);
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

	const bgmToken = useStore((state) => state.bgmToken);
	const apiSource = useStore((state) => state.apiSource);
	const setApiSource = useStore((state) => state.setApiSource);
	const addGame = useStore((state) => state.addGame);
	const addModalOpen = useStore((state) => state.addModalOpen);
	const addModalPath = useStore((state) => state.addModalPath);
	const openAddModal = useStore((state) => state.openAddModal);
	const closeAddModal = useStore((state) => state.closeAddModal);
	const setAddModalPath = useStore((state) => state.setAddModalPath);

	const [formText, setFormText] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [customMode, setCustomMode] = useState(false);
	// 保留 ID 搜索状态
	const [isID, setisID] = useState(false);
	const previousFocus = useRef<HTMLElement | null>(null);

	// 弹窗状态（合并相关状态）
	const [dialogState, setDialogState] = useState<DialogState>({
		confirm: {
			open: false,
			data: null,
			showViewMore: false,
		},
		select: {
			open: false,
			results: [],
		},
	});

	// 请求取消控制器
	const abortControllerRef = useRef<AbortController | null>(null);

	const { isDragging } = useTauriDragDrop({
		onValidPath: (selectedPath) => {
			if (loading) return;
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
		setFormText("");
		setAddModalPath("");
		setError("");
		setDialogState({
			confirm: { open: false, data: null, showViewMore: false },
			select: { open: false, results: [] },
		});
		closeAddModal();
	}, [setAddModalPath, closeAddModal]);

	const checkGameExists = useCallback((gameData: InsertGameParams): boolean => {
		const currentGames = useStore.getState().games;
		return currentGames.some((game) => {
			if (gameData.bgm_id && game.bgm_id === gameData.bgm_id) return true;
			return false;
		});
	}, []);

	const finalizeAddGame = useCallback(
		async (gameData: InsertGameParams) => {
			const insertData: InsertGameParams = {
				...gameData,
				localpath: addModalPath,
			};

			if (checkGameExists(insertData)) {
				showError(t("components.AddModal.gameExists"));
				return;
			}

			const gameId = await addGame(gameData);
			resetState();

			// 显示带跳转按钮的成功提示
			if (gameId) {
				snackbar.success(t("components.Snackbar.gameAddedSuccess"), {
					action: (
						<Button
							color="inherit"
							size="small"
							onClick={() => navigate(`/libraries/${gameId}`)}
						>
							{t("components.Snackbar.viewDetails")}
						</Button>
					),
				});
			}
		},
		[
			addGame,
			checkGameExists,
			addModalPath,
			t,
			showError,
			navigate,
			resetState,
		],
	);

	/**
	 * 检查游戏是否已存在
	 */
	// 删除旧实现（已由 useCallback 版本替代）

	/**
	 * 处理确认弹窗的确认操作
	 */
	const handleConfirmAdd = useCallback(async () => {
		const finaldata = dialogState.confirm.data;
		if (!finaldata) return;

		// 检查是否需要重新获取完整数据
		const needsCompleteData =
			finaldata.id_type === "ymgal" ||
			(finaldata.id_type === "mixed" &&
				finaldata.ymgal_id &&
				!isYmgalDataComplete(finaldata.ymgal_data));

		if (needsCompleteData) {
			try {
				setLoading(true);
				let result: FullGameData | null = null;

				if (finaldata.id_type === "ymgal") {
					// 纯 ymgal 类型：重新获取完整数据
					const results = await gameMetadataService.searchGames({
						query: finaldata.ymgal_id?.toString() || "",
						source: "ymgal",
						bgmToken,
						defaults: {
							localpath: finaldata.localpath ?? undefined,
						},
					});
					result = results.length > 0 ? results[0] : null;
				} else if (finaldata.id_type === "mixed" && finaldata.ymgal_id) {
					// mixed 类型：只获取 YMGal 的完整数据，保留已有的 BGM/VNDB 数据
					result = await fetchYmgalAndMerge(
						finaldata.ymgal_id,
						finaldata,
						bgmToken,
					);
				}

				if (!result) {
					showError(t("components.AddModal.noResultsYmgal"));
					return;
				}

				// 使用公共函数构建 InsertGameParams 并添加游戏
				finalizeAddGame(
					buildInsertData(result, finaldata.id_type, finaldata.date),
				);
			} catch (error) {
				const errorMessage =
					error instanceof Error
						? error.message
						: t("components.AddModal.unknownError");
				showError(errorMessage);
			} finally {
				setLoading(false);
			}
		} else if (finaldata.id_type) {
			// 数据已完整，直接添加
			finalizeAddGame(finaldata as InsertGameParams);
		}
	}, [finalizeAddGame, dialogState.confirm.data, showError, t, bgmToken]);

	/**
	 * 处理确认弹窗的取消操作
	 */
	const handleConfirmCancel = useCallback(() => {
		setDialogState((prev) => ({
			...prev,
			confirm: { open: false, data: null, showViewMore: false },
		}));
	}, []);

	const cancelOngoingRequest = useCallback(() => {
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
		}
		abortControllerRef.current = null;
		setLoading(false);
		resetState();
	}, [resetState]);

	/**
	 * 处理"查看更多"按钮点击
	 */
	const handleViewMore = useCallback(() => {
		setDialogState((prev) => ({
			...prev,
			confirm: { ...prev.confirm, open: false },
			select: { ...prev.select, open: true },
		}));
	}, []);

	/**
	 * 处理从列表中选择游戏
	 */
	const handleSelectGame = useCallback(
		(index: number) => {
			const selectedGame = dialogState.select.results[index];
			if (selectedGame) {
				setDialogState((prev) => ({
					confirm: {
						open: true,
						data: selectedGame,
						showViewMore: prev.confirm.showViewMore,
					},
					select: { ...prev.select, open: false },
				}));
			}
		},
		[dialogState.select.results],
	);

	/**
	 * 从单一数据源获取游戏数据（通过 ID 或名称搜索）
	 * @returns { apiData: 第一个结果, allResults: 所有结果, canViewMore: 是否有更多结果 }
	 */
	const fetchFromDataSource = async (): Promise<{
		apiData: FullGameData | null;
		allResults: FullGameData[];
		canViewMore: boolean;
	}> => {
		// 统一使用gameMetadataService.searchGames
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
			// 默认错误
			throw new Error(t("components.AddModal.noResults"));
		}

		// 返回第一个结果作为主要数据，保留所有结果用于查看更多
		return {
			apiData: searchResults[0],
			allResults: searchResults,
			canViewMore: searchResults.length > 1,
		};
	};

	/**
	 * 提交表单，处理添加游戏的逻辑。
	 * - 自定义模式下直接添加本地游戏。
	 * - ID搜索模式下显示确认弹窗后添加。
	 * - 名称搜索模式下显示确认弹窗，支持查看更多。
	 */
	const handleSubmit = async () => {
		if (loading) return;
		const controller = new AbortController();
		if (abortControllerRef.current) abortControllerRef.current.abort();
		abortControllerRef.current = controller;

		const abortPromise = new Promise<never>((_, reject) => {
			controller.signal.addEventListener("abort", () => {
				reject(new DOMException("Aborted", "AbortError"));
			});
		});

		const withAbort = <T,>(promise: Promise<T>) =>
			Promise.race([promise, abortPromise]) as Promise<T>;

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
				await finalizeAddGame(customGameData);
				return;
			}

			// 场景2-4: 通过 API 获取数据
			const { apiData, allResults, canViewMore } = await withAbort(
				fetchFromDataSource(),
			);

			// 保存搜索结果并打开确认弹窗
			// 现在apiData和allResults已经包含了defaults
			setDialogState({
				confirm: {
					open: true,
					data: apiData,
					// 安全锁：防止 UI 出现点击无效的按钮
					showViewMore: apiSource === "mixed" ? false : canViewMore,
				},
				select: {
					open: false,
					results: allResults, // allResults中的项目已经包含defaults
				},
			});
		} catch (error) {
			if (error instanceof DOMException && error.name === "AbortError") {
				return;
			}
			const errorMessage =
				error instanceof Error
					? error.message
					: t("components.AddModal.unknownError");
			showError(errorMessage);
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
					if (reason !== "backdropClick" && !loading) {
						closeAddModal();
					}
				}}
				closeAfterTransition={false}
				aria-labelledby="addgame-dialog-title"
			>
				{/* 错误提示 */}
				{error && <Alert severity="error">{error}</Alert>}
				<DialogTitle>{t("components.AddModal.addGame")}</DialogTitle>
				<DialogContent>
					{/* 选择本地可执行文件 */}
					<Button
						className="w-md"
						variant="contained"
						onClick={async () => {
							const result = await handleDirectory();
							if (result) setAddModalPath(result);
						}}
						startIcon={<FileOpenIcon />}
					>
						{t("components.AddModal.selectLauncher")}
					</Button>
					<p>
						<input
							className="w-md"
							type="text"
							value={addModalPath}
							placeholder={t("components.AddModal.dragHint")}
							readOnly
						/>
					</p>
					{/* 自定义模式和 API 来源切换 */}
					<div>
						<Switch
							checked={customMode}
							onChange={() => {
								setCustomMode(!customMode);
							}}
							disabled={loading}
						/>
						<span>{t("components.AddModal.enableCustomMode")}</span>
						<RadioGroup
							className="ml-2"
							row
							value={apiSource}
							onChange={(e) =>
								setApiSource(
									e.target.value as "bgm" | "vndb" | "ymgal" | "mixed",
								)
							}
						>
							<FormControlLabel
								value="bgm"
								control={<Radio />}
								label="Bangumi"
								disabled={loading}
							/>
							<FormControlLabel
								value="vndb"
								control={<Radio />}
								label="VNDB"
								disabled={loading}
							/>
							<FormControlLabel
								value="ymgal"
								control={<Radio />}
								label="YMGal"
								disabled={loading}
							/>
							<FormControlLabel
								value="mixed"
								control={<Radio />}
								label="Mixed"
								disabled={loading}
							/>
						</RadioGroup>
						<Switch
							checked={isID}
							onChange={() => {
								setisID(!isID);
							}}
							disabled={loading}
						/>
						<span>{t("components.AddModal.idSearch")}</span>
					</div>
					{/* 游戏名称输入框 */}
					<TextField
						required
						margin="dense"
						id="name"
						name="game-name"
						label={
							!isID
								? t("components.AddModal.gameName")
								: t("components.AddModal.gameIDTips")
						}
						type="text"
						fullWidth
						variant="standard"
						autoComplete="off"
						value={formText}
						onChange={(event) => setFormText(event.target.value)}
					/>
				</DialogContent>
				<DialogActions>
					{/* 取消按钮 */}
					<Button variant="outlined" onClick={cancelOngoingRequest}>
						{t("components.AddModal.cancel")}
					</Button>
					{/* 确认按钮 */}
					<Button
						variant="contained"
						onClick={handleSubmit}
						disabled={formText === "" || loading}
						startIcon={loading ? <CircularProgress size={20} /> : null}
					>
						{loading
							? t("components.AddModal.processing")
							: t("components.AddModal.confirm")}
					</Button>
				</DialogActions>
			</Dialog>

			{/* 确认游戏信息弹窗 */}
			{dialogState.confirm.open && (
				<ViewGameBox
					fullgame={dialogState.confirm.data}
					open={dialogState.confirm.open}
					setOpen={(open) => {
						if (!open) handleConfirmCancel();
					}}
					onConfirm={handleConfirmAdd}
					showExtraButton={dialogState.confirm.showViewMore}
					extraButtonText={t("components.AddModal.viewMore", "查看更多")}
					extraButtonColor="primary"
					extraButtonVariant="outlined"
					onExtraButtonClick={handleViewMore}
					isLoading={loading}
				/>
			)}
			{/* 游戏列表选择弹窗 */}
			{dialogState.select.open && apiSource !== "mixed" && (
				<GameSelectDialog
					open={dialogState.select.open}
					onClose={() =>
						setDialogState((prev) => ({
							...prev,
							select: { ...prev.select, open: false },
						}))
					}
					results={dialogState.select.results}
					onSelect={handleSelectGame}
					title={t("components.AddModal.selectGame", "选择游戏")}
					apiSource={apiSource}
				/>
			)}
		</>
	);
};

export default AddModal;
