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

import AddIcon from "@mui/icons-material/Add";
import FileOpenIcon from "@mui/icons-material/FileOpen";
import { FormControlLabel, Radio, RadioGroup } from "@mui/material";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import { isTauri } from "@tauri-apps/api/core";
import { basename, dirname } from "pathe";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchBgmById, fetchBgmByName } from "@/api/bgm";
import { fetchMixedData } from "@/api/mixed";
import { fetchVndbById, fetchVndbByName } from "@/api/vndb";
import { fetchYmById, fetchYmByName } from "@/api/ymgal";
import { ViewGameBox } from "@/components/AlertBox";
import { useModal } from "@/components/Toolbar";
import { useStore } from "@/store/";
import type { FullGameData, InsertGameParams } from "@/types";
import { handleExeFile } from "@/utils";
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
	const { bgmToken, games, apiSource, setApiSource, addGame } = useStore();
	const { isopen, handleOpen, handleClose } = useModal();
	const [formText, setFormText] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);
	const [path, setPath] = useState("");
	const [customMode, setCustomMode] = useState(false);
	// 保留 ID 搜索状态
	const [isID, setisID] = useState(false);

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

	const showError = useCallback((message: string) => {
		setError(message);
		setTimeout(() => setError(""), ERROR_DISPLAY_DURATION_MS);
	}, []);

	/**
	 * 当路径变化时，自动提取文件夹名作为游戏名。
	 */
	useEffect(() => {
		if (path) {
			setFormText(extractFolderName(path));
		}
	}, [path]);

	/**
	 * 重置所有状态
	 */
	const resetState = useCallback(() => {
		setFormText("");
		setPath("");
		setError("");
		setDialogState({
			confirm: { open: false, data: null, showViewMore: false },
			select: { open: false, results: [] },
		});
	}, []);

	const checkGameExists = useCallback(
		(gameData: InsertGameParams): boolean => {
			return games.some((game) => {
				if (gameData.bgm_id && game.bgm_id === gameData.bgm_id) return true;
				if (gameData.vndb_id && game.vndb_id === gameData.vndb_id) return true;
				return false;
			});
		},
		[games],
	);

	const finalizeAddGame = useCallback(
		(gameData: InsertGameParams) => {
			const insertData: InsertGameParams = {
				...gameData,
				localpath: path,
			};

			if (checkGameExists(insertData)) {
				showError(t("components.AddModal.gameExists"));
				return;
			}

			addGame(insertData);
			resetState();
			handleClose();
		},
		[addGame, checkGameExists, handleClose, path, resetState, showError, t],
	);

	/**
	 * 检查游戏是否已存在
	 */
	// 删除旧实现（已由 useCallback 版本替代）

	/**
	 * 处理确认弹窗的确认操作
	 */
	const handleConfirmAdd = useCallback(async () => {
		if (!dialogState.confirm.data) return;

		// 如果是 ymgal 数据源且数据不完整（没有 summary 和 aliases），先获取完整数据
		if (dialogState.confirm.data.id_type === "ymgal") {
			try {
				setLoading(true);
				const result = await fetchYmById(
					Number(dialogState.confirm.data.ymgal_id),
				);

				if (typeof result === "string") {
					showError(result);
					return;
				}

				// 合并路径信息，确保 id_type 存在
				// 从 FullGameData 转换为 InsertGameParams（过滤 null 值）
				const insertData: InsertGameParams = {
					bgm_id: result.bgm_id,
					vndb_id: result.vndb_id,
					ymgal_id: result.ymgal_id,
					id_type: result.id_type || "ymgal",
					date: result.date,
					localpath: dialogState.confirm.data.localpath ?? undefined,
					autosave: dialogState.confirm.data.autosave,
					clear: dialogState.confirm.data.clear,
					bgm_data: result.bgm_data ?? undefined,
					vndb_data: result.vndb_data ?? undefined,
					ymgal_data: result.ymgal_data ?? undefined,
					custom_data: result.custom_data ?? undefined,
				};

				finalizeAddGame(insertData);
			} catch (error) {
				const errorMessage =
					error instanceof Error
						? error.message
						: t("components.AddModal.unknownError");
				showError(errorMessage);
			} finally {
				setLoading(false);
			}
		} else if (dialogState.confirm.data.id_type) {
			// 确保 id_type 存在后再调用
			finalizeAddGame(dialogState.confirm.data as InsertGameParams);
		}
	}, [finalizeAddGame, dialogState.confirm.data, showError, t]);

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
		handleClose();
	}, [handleClose, resetState]);

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
		let apiData: FullGameData | null = null;
		let allResults: FullGameData[] = [];
		let canViewMore = false;

		if (apiSource === "bgm") {
			// Bangumi 数据源
			if (isID) {
				const result = await fetchBgmById(formText, bgmToken);
				if (typeof result === "string") throw new Error(result);
				apiData = result;
			} else {
				const result = await fetchBgmByName(formText, bgmToken);
				if (typeof result === "string") throw new Error(result);
				allResults = result;
				apiData = result[0];
				canViewMore = result.length > 1;
			}
		} else if (apiSource === "vndb") {
			// VNDB 数据源
			if (isID) {
				const result = await fetchVndbById(formText);
				if (typeof result === "string") throw new Error(result);
				apiData = result;
			} else {
				const result = await fetchVndbByName(formText);
				if (typeof result === "string") throw new Error(result);
				allResults = result;
				apiData = result[0];
				canViewMore = result.length > 1;
			}
		} else if (apiSource === "ymgal") {
			// YMGal 数据源
			if (isID) {
				const result = await fetchYmById(Number(formText));
				if (typeof result === "string") throw new Error(result);
				apiData = result;
			} else {
				const result = await fetchYmByName(formText);
				if (typeof result === "string") throw new Error(result);
				allResults = result;
				apiData = result[0];
				canViewMore = result.length > 1;
			}
		} else {
			// Mixed 混合数据源（不支持查看更多）
			const { bgmId, vndbId } = isID ? parseGameId(formText) : {};

			if (isID && !bgmId && !vndbId) {
				throw new Error(t("components.AddModal.invalidIDFormat"));
			}

			const { bgm_data, vndb_data } = await fetchMixedData({
				bgm_id: bgmId,
				vndb_id: vndbId,
				name: !isID ? formText : undefined,
				BGM_TOKEN: bgmToken,
			});

			if (!bgm_data && !vndb_data) {
				throw new Error(t("components.AddModal.noDataSource"));
			}

			// 合并两个数据源
			apiData = {
				...bgm_data,
				...vndb_data,
				id_type: "mixed",
				bgm_data: bgm_data?.bgm_data || undefined,
				vndb_data: vndb_data?.vndb_data || undefined,
			};
		}

		return { apiData, allResults, canViewMore };
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
				localpath: path,
				autosave: 0,
				clear: 0,
			};

			// 场景1: 自定义模式
			if (customMode) {
				if (!path) {
					showError(t("components.AddModal.noExecutableSelected"));
					return;
				}

				const customGameData: InsertGameParams = {
					...defaultdata,
					id_type: "custom",
					custom_data: {
						name: formText,
					},
				};

				addGame(customGameData);
				setFormText("");
				setPath("");
				handleClose();
				return;
			}

			// 场景2-4: 通过 API 获取数据
			const { apiData, allResults, canViewMore } = await withAbort(
				fetchFromDataSource(),
			);

			if (!apiData) {
				showError(t("components.AddModal.noDataSource"));
				return;
			}

			// 合并默认数据（路径信息）
			const fullGameData: FullGameData = {
				...apiData,
				...defaultdata,
			};

			// 保存搜索结果并打开确认弹窗
			setDialogState({
				confirm: {
					open: true,
					data: fullGameData,
					showViewMore: canViewMore,
				},
				select: {
					open: false,
					results: allResults.map((item) => ({
						...item,
						...defaultdata,
					})),
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

	/**
	 * 解析游戏 ID，判断是 Bangumi ID 还是 VNDB ID
	 * @param input 用户输入的文本
	 * @param isID 是否为 ID 搜索模式
	 * @returns 包含 bgmId 和 vndbId 的对象
	 */
	const parseGameId = (input: string): { bgmId?: string; vndbId?: string } => {
		if (!isID) {
			return {}; // 如果不是 ID 搜索模式，返回空对象
		}

		// VNDB ID 格式：v + 数字（如 v17, v1234）
		if (/^v\d+$/i.test(input)) {
			return { vndbId: input };
		}

		// Bangumi ID 格式：纯数字字符串（如 123, 456789）
		if (/^\d+$/.test(input)) {
			return { bgmId: input };
		}

		// 如果格式不匹配，返回空对象
		return {};
	};

	return (
		<>
			{/* 添加游戏按钮，点击后弹窗打开 */}
			<Button onClick={handleOpen} startIcon={<AddIcon />}>
				{t("components.AddModal.addGame")}
			</Button>
			<Dialog
				open={isopen}
				onClose={(_, reason) => {
					// 加载时防止关闭弹窗
					if (reason !== "backdropClick" && !loading) {
						handleClose();
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
							const result = await handleExeFile();
							if (result) setPath(result);
						}}
						startIcon={<FileOpenIcon />}
						disabled={!isTauri()}
					>
						{t("components.AddModal.selectLauncher")}
					</Button>
					<p>
						<input
							className="w-md"
							type="text"
							value={path}
							placeholder={t("components.AddModal.selectExecutable")}
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

			{/* 游戏列表选择弹窗 */}
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
				dataSource={
					apiSource === "vndb"
						? "vndb"
						: apiSource === "ymgal"
							? "ymgal"
							: "bgm"
				}
				title={t("components.AddModal.selectGame", "选择游戏")}
			/>
		</>
	);
};

export default AddModal;
