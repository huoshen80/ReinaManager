import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import SearchIcon from "@mui/icons-material/Search";
import {
	Alert,
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControl,
	InputLabel,
	MenuItem,
	Select,
	Stack,
	TextField,
	Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { gameMetadataService } from "@/api";
import { AlertBox } from "@/components/AlertBox";
import { useMetadataSearchFlow } from "@/hooks/common/useMetadataSearchFlow";
import { useBulkGameAddActions } from "@/hooks/features/games/useGameMetadataFacade";
import { useAllSettings } from "@/hooks/queries/useSettings";
import { getRuntimeSourceAdapter, REGISTERED_SOURCE_KEYS } from "@/metadata";
import { snackbar } from "@/providers/snackBar";
import { fileService } from "@/services/invoke";
import { useStore } from "@/store/appStore";
import type { apiSourceType, GameCandidateData, SourceType } from "@/types";
import { createAbortableRunner, isAbortError } from "@/utils/async";
import { isBgmAuthExpiredError, withBgmAuth } from "@/utils/bgmAuthSession";
import { getUserErrorMessage, isApiRateLimitError } from "@/utils/errors";
import { handleFolder } from "@/utils/fs/fileDialog";
import { ApiSourceRadioGroup } from "./ApiSourceRadioGroup";
import BulkImportResultTable, {
	type BulkImportItem,
	type VisibleBulkImportItem,
} from "./BulkImportResultTable";
import GameSelectDialog from "./GameSelectDialog";
import MixedSourceConfirmDialog from "./MixedSourceConfirmDialog";

interface BulkImportTabProps {
	// 控制此 tab 是否隐藏（通过 CSS display:none 而非卸载）
	hidden: boolean;
	onClose: () => void;
}

const DEFAULT_SCAN_DEPTH = 2;
const SCAN_DEPTH_OPTIONS = [2, 3, 4, 5] as const;
const BULK_API_SOURCE_OPTIONS = REGISTERED_SOURCE_KEYS.map((source) => ({
	value: source,
	label: getRuntimeSourceAdapter(source).label,
}));

function isVisibleBulkImportItem(
	item: BulkImportItem,
): item is VisibleBulkImportItem {
	return item.status !== "imported";
}

const BulkImportTab = ({ hidden, onClose }: BulkImportTabProps) => {
	const { t } = useTranslation();
	const { data: settings } = useAllSettings();
	const hasBgmAuth = Boolean(settings?.bgm_auth);
	const { mixedEnabledSources } = useStore(
		useShallow((s) => ({
			mixedEnabledSources: s.mixedEnabledSources,
		})),
	);
	const { addGamesFromBulkImport, isAddingGames } = useBulkGameAddActions();
	const defaultBulkApiSource: SourceType = hasBgmAuth ? "bgm" : "vndb";

	const [isScanningDirectories, setIsScanningDirectories] = useState(false);
	const [isMatchingMetadata, setIsMatchingMetadata] = useState(false);
	const [rootPath, setRootPath] = useState("");
	const [items, setItems] = useState<BulkImportItem[]>([]);
	const [bulkApiSource, setBulkApiSource] =
		useState<SourceType>(defaultBulkApiSource);
	const [scanMaxDepth, setScanMaxDepth] = useState(DEFAULT_SCAN_DEPTH);
	const [editItemPath, setEditItemPath] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editApiSource, setEditApiSource] =
		useState<apiSourceType>(defaultBulkApiSource);
	const [customImportConfirmOpen, setCustomImportConfirmOpen] = useState(false);
	const editSearchAbortControllerRef = useRef<AbortController | null>(null);
	const matchAbortControllerRef = useRef<AbortController | null>(null);
	const loading = isMatchingMetadata || isScanningDirectories || isAddingGames;
	const matchedImportCount = items.filter(
		(item) => item.status === "matched",
	).length;
	const customImportCount = items.filter(
		(item) => item.status !== "matched",
	).length;

	useEffect(() => {
		return () => {
			editSearchAbortControllerRef.current?.abort();
			matchAbortControllerRef.current?.abort();
		};
	}, []);

	const handleResolvedEditMetadata = useCallback(
		async (resolvedData: GameCandidateData) => {
			if (!editItemPath) return;

			setItems((prevItems) => {
				const nextItems = [...prevItems];
				const itemIndex = nextItems.findIndex(
					(item) => item.path === editItemPath,
				);
				if (itemIndex !== -1) {
					nextItems[itemIndex].name = editName;
					nextItems[itemIndex].matchedData = resolvedData;
					nextItems[itemIndex].status = "matched";
				}
				return nextItems;
			});
			setEditItemPath(null);
		},
		[editItemPath, editName],
	);

	const metadataSearchFlow = useMetadataSearchFlow({
		mixedEnabledSources,
		t,
		onResolved: handleResolvedEditMetadata,
		onError: (message) => snackbar.error(message),
		getNoResultsMessage: (source) => {
			if (source === "bgm") {
				return t(
					"components.AddModal.noResultsBgm",
					"未在 Bangumi 找到该游戏，请尝试其他名称或检查 ID",
				);
			}
			return t("components.AddModal.noResults", "没有找到结果");
		},
	});
	const searchResultLoading = metadataSearchFlow.isSearching;

	const resetState = useCallback(() => {
		if (editSearchAbortControllerRef.current) {
			editSearchAbortControllerRef.current.abort();
			editSearchAbortControllerRef.current = null;
		}
		if (matchAbortControllerRef.current) {
			matchAbortControllerRef.current.abort();
			matchAbortControllerRef.current = null;
		}
		setIsMatchingMetadata(false);
		setRootPath("");
		setItems([]);
		setBulkApiSource(defaultBulkApiSource);
		setScanMaxDepth(DEFAULT_SCAN_DEPTH);
		setEditItemPath(null);
		setEditName("");
		setEditApiSource(defaultBulkApiSource);
		setCustomImportConfirmOpen(false);
		metadataSearchFlow.reset();
	}, [defaultBulkApiSource, metadataSearchFlow]);

	const handleCloseEditDialog = useCallback(() => {
		if (editSearchAbortControllerRef.current) {
			editSearchAbortControllerRef.current.abort();
			editSearchAbortControllerRef.current = null;
		}

		metadataSearchFlow.reset();
		setEditItemPath(null);
	}, [metadataSearchFlow]);

	const handleCancel = useCallback(() => {
		if (isMatchingMetadata && matchAbortControllerRef.current) {
			matchAbortControllerRef.current.abort();
			snackbar.info(
				t("components.BulkImportModal.matchCancelled", "已取消匹配任务"),
			);
			return;
		}

		onClose();
	}, [isMatchingMetadata, onClose, t]);

	const scanFolder = async () => {
		const result = await handleFolder();
		if (!result) return;

		setRootPath(result);
		setIsScanningDirectories(true);
		try {
			const subdirs = await fileService.scanDirectoryForGames(
				result,
				scanMaxDepth,
			);
			setItems(
				subdirs.map((dir) => ({
					...dir,
					status: "pending",
					selectedExe:
						dir.executables.length > 0 ? dir.executables[0] : undefined,
				})),
			);
		} catch (error) {
			snackbar.error(getUserErrorMessage(error, t));
		} finally {
			setIsScanningDirectories(false);
		}
	};

	const handleMatchMetadata = async () => {
		if (matchAbortControllerRef.current) {
			matchAbortControllerRef.current.abort();
		}

		const { controller, withAbort } = createAbortableRunner();
		matchAbortControllerRef.current = controller;

		setIsMatchingMetadata(true);
		const nextItems = [...items];

		try {
			for (let index = 0; index < nextItems.length; index++) {
				if (controller.signal.aborted) {
					break;
				}

				if (
					nextItems[index].status !== "pending" &&
					nextItems[index].status !== "not found" &&
					nextItems[index].status !== "error"
				) {
					continue;
				}

				try {
					const matchedData =
						bulkApiSource === "bgm"
							? await withBgmAuth((token) =>
									withAbort(
										gameMetadataService.searchBestMatch({
											query: nextItems[index].name,
											source: bulkApiSource,
											bgmToken: token,
											signal: controller.signal,
										}),
									),
								)
							: await withAbort(
									gameMetadataService.searchBestMatch({
										query: nextItems[index].name,
										source: bulkApiSource,
										signal: controller.signal,
									}),
								);

					if (matchedData) {
						nextItems[index].matchedData = matchedData;
						nextItems[index].status = "matched";
					} else {
						nextItems[index].status = "not found";
					}
				} catch (error) {
					if (isAbortError(error)) {
						break;
					}
					if (isBgmAuthExpiredError(error)) {
						break;
					}
					if (isApiRateLimitError(error)) {
						snackbar.warning(getUserErrorMessage(error, t));
						break;
					}

					snackbar.warning(
						`${nextItems[index].name}: ${getUserErrorMessage(error, t)}`,
					);
					nextItems[index].status = "not found";
				}

				setItems([...nextItems]);
			}
		} finally {
			if (matchAbortControllerRef.current === controller) {
				matchAbortControllerRef.current = null;
			}
			setIsMatchingMetadata(false);
		}
	};

	const importBulkItems = async (
		importItems: { item: BulkImportItem; originalIndex: number }[],
	) => {
		const nextItems = [...items];

		const result = await addGamesFromBulkImport(
			importItems.map(({ item }) => item),
		);

		for (const index of result.duplicateItemIndices) {
			const originalIndex = importItems[index]?.originalIndex;
			if (originalIndex !== undefined) {
				nextItems[originalIndex].status = "error";
			}
		}

		for (const preparationError of result.preparationErrors) {
			const originalIndex =
				importItems[preparationError.itemIndex]?.originalIndex;
			if (originalIndex === undefined) continue;
			nextItems[originalIndex].status = "error";
			snackbar.warning(
				`${nextItems[originalIndex].name}: ${preparationError.message}`,
			);
		}

		if (!result.batchResult && !result.mutationError) {
			setItems([...nextItems]);
			snackbar.info(
				t("components.BulkImportModal.noGamesFound", "未找到可导入的游戏"),
			);
			return;
		}

		if (result.batchResult) {
			const failedIndices = new Set(
				result.batchResult.errors.map((error) => error.index),
			);

			for (const { itemIndex, payloadIndex } of result.pendingPayloads) {
				const originalIndex = importItems[itemIndex]?.originalIndex;
				if (originalIndex !== undefined) {
					nextItems[originalIndex].status = failedIndices.has(payloadIndex)
						? "error"
						: "imported";
				}
			}

			if (result.batchResult.success > 0) {
				snackbar.success(
					t(
						"components.BulkImportModal.importSummary",
						"成功导入 {{success}}/{{total}} 个游戏",
						{
							success: result.batchResult.success,
							total: importItems.length, // 去重逻辑在前端执行
						},
					),
				);
			}

			if (result.batchResult.failed > 0) {
				snackbar.warning(
					t(
						"components.BulkImportModal.importPartialFailed",
						"{{failed}} 个游戏导入失败",
						{
							failed: result.batchResult.failed,
						},
					),
				);
			}
		}

		if (result.mutationError) {
			snackbar.error(result.mutationError);
			for (const { itemIndex } of result.pendingPayloads) {
				const originalIndex = importItems[itemIndex]?.originalIndex;
				if (originalIndex !== undefined) {
					nextItems[originalIndex].status = "error";
				}
			}
		}

		setItems(nextItems.filter((item) => item.status !== "imported"));
	};

	const handleImportMatched = () =>
		importBulkItems(
			items
				.map((item, originalIndex) => ({ item, originalIndex }))
				.filter(({ item }) => item.status === "matched"),
		);

	const handleImportCustom = () => {
		setCustomImportConfirmOpen(false);
		return importBulkItems(
			items
				.map((item, originalIndex) => ({
					item: { ...item, matchedData: undefined },
					originalIndex,
				}))
				.filter(({ item }) => item.status !== "matched"),
		);
	};

	const handleEditRowSearch = async () => {
		if (!editName) return;

		if (editSearchAbortControllerRef.current) {
			editSearchAbortControllerRef.current.abort();
		}

		const { controller, withAbort } = createAbortableRunner();
		editSearchAbortControllerRef.current = controller;

		try {
			await metadataSearchFlow.searchMetadata({
				query: editName,
				source: editApiSource,
				withAbort,
				signal: controller.signal,
			});
		} catch (error) {
			if (isAbortError(error)) {
				return;
			}

			snackbar.error(getUserErrorMessage(error, t));
			metadataSearchFlow.closeSearchResult();
		} finally {
			if (editSearchAbortControllerRef.current === controller) {
				editSearchAbortControllerRef.current = null;
			}
		}
	};

	const handleDeleteItem = useCallback((path: string) => {
		setItems((prev) => prev.filter((item) => item.path !== path));
	}, []);

	const handleExecutableChange = useCallback(
		(path: string, selectedExe: string) => {
			setItems((prev) =>
				prev.map((item) =>
					item.path === path ? { ...item, selectedExe } : item,
				),
			);
		},
		[],
	);

	const handleEditItem = useCallback(
		(item: VisibleBulkImportItem) => {
			setEditItemPath(item.path);
			setEditName(item.name);
			setEditApiSource(bulkApiSource);
		},
		[bulkApiSource],
	);

	const handleEditRowSaveNameOnly = () => {
		if (!editItemPath) return;

		const nextItems = [...items];
		const itemIndex = nextItems.findIndex((item) => item.path === editItemPath);
		if (itemIndex !== -1) {
			nextItems[itemIndex].name = editName;
			if (nextItems[itemIndex].status === "not found") {
				nextItems[itemIndex].status = "pending";
			}
			setItems(nextItems);
		}

		setEditItemPath(null);
	};

	return (
		<>
			<Stack
				spacing={2}
				className="pt-2 w-full flex-1 self-stretch h-full min-h-0 overflow-hidden"
				sx={{ display: hidden ? "none" : undefined }}
			>
				<Stack direction="row" spacing={1.5} alignItems="flex-start">
					<Stack
						direction="row"
						spacing={1.5}
						alignItems="center"
						flexWrap="wrap"
						useFlexGap
						className="flex-[1_1_auto] min-w-0"
					>
						<Button
							variant="contained"
							startIcon={<FolderOpenIcon />}
							onClick={scanFolder}
							disabled={loading}
							className="shrink-0"
						>
							{t("components.BulkImportModal.selectRootFolder", "选择根文件夹")}
						</Button>
						<Typography
							variant="body2"
							className="flex-[1_1_220px] min-w-40"
							noWrap
						>
							{rootPath ||
								t(
									"components.BulkImportModal.noFolderSelected",
									"未选择文件夹",
								)}
						</Typography>
						<FormControl
							size="small"
							disabled={loading}
							className="flex-[0_0_160px]"
						>
							<InputLabel id="bulk-import-api-source-label">
								{t("components.BulkImportModal.apiSource", "匹配数据源")}
							</InputLabel>
							<Select
								labelId="bulk-import-api-source-label"
								value={bulkApiSource}
								label={t("components.BulkImportModal.apiSource", "匹配数据源")}
								onChange={(event) =>
									setBulkApiSource(event.target.value as SourceType)
								}
							>
								{BULK_API_SOURCE_OPTIONS.map((option) => (
									<MenuItem
										key={option.value}
										value={option.value}
										disabled={option.value === "bgm" && !hasBgmAuth}
									>
										{option.label}
									</MenuItem>
								))}
							</Select>
						</FormControl>
						<FormControl
							size="small"
							disabled={loading}
							className="flex-[0_0_140px]"
						>
							<InputLabel id="bulk-import-scan-depth-label">
								{t("components.BulkImportModal.scanDepth", "扫描深度")}
							</InputLabel>
							<Select
								labelId="bulk-import-scan-depth-label"
								value={scanMaxDepth}
								label={t("components.BulkImportModal.scanDepth", "扫描深度")}
								onChange={(event) =>
									setScanMaxDepth(Number(event.target.value))
								}
							>
								{SCAN_DEPTH_OPTIONS.map((depth) => (
									<MenuItem key={depth} value={depth}>
										{t(
											"components.BulkImportModal.scanDepthValue",
											"{{depth}} 层",
											{ depth },
										)}
									</MenuItem>
								))}
							</Select>
						</FormControl>
					</Stack>
					{items.length > 0 && (
						<Typography
							variant="body2"
							color="text.secondary"
							className="whitespace-nowrap shrink-0 pt-2"
						>
							{t(
								"components.BulkImportModal.gamesCount",
								"共 {{count}} 个游戏",
								{
									count: items.length,
								},
							)}
						</Typography>
					)}
				</Stack>

				<BulkImportResultTable
					items={items.filter(isVisibleBulkImportItem)}
					loading={loading}
					onDeleteItem={handleDeleteItem}
					onEditItem={handleEditItem}
					onExecutableChange={handleExecutableChange}
				/>

				<Stack
					direction={{ xs: "column", md: "row" }}
					justifyContent="space-between"
					alignItems={{ xs: "stretch", md: "center" }}
					spacing={1.5}
				>
					<Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
						<Button
							onClick={resetState}
							disabled={loading || items.length === 0}
						>
							{t("components.BulkImportModal.reset", "重置")}
						</Button>
					</Stack>
					<Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
						<Button variant="outlined" onClick={handleCancel}>
							{t("components.BulkImportModal.cancel", "取消")}
						</Button>
						<Button
							startIcon={<SearchIcon />}
							onClick={handleMatchMetadata}
							disabled={
								items.length === 0 ||
								loading ||
								(bulkApiSource === "bgm" && !hasBgmAuth)
							}
						>
							{t("components.BulkImportModal.matchMetadata", "匹配元数据")}
						</Button>
						<Button
							variant="contained"
							onClick={handleImportMatched}
							disabled={matchedImportCount === 0 || loading}
							startIcon={loading ? <CircularProgress size={20} /> : undefined}
						>
							{t(
								"components.BulkImportModal.importMatched",
								"导入已匹配（{{count}}）",
								{ count: matchedImportCount },
							)}
						</Button>
						<Button
							variant="outlined"
							onClick={() => setCustomImportConfirmOpen(true)}
							disabled={customImportCount === 0 || loading}
						>
							{t(
								"components.BulkImportModal.importAsCustom",
								"导入为自定义（{{count}}）",
								{ count: customImportCount },
							)}
						</Button>
					</Stack>
				</Stack>
			</Stack>

			<Dialog
				open={!!editItemPath}
				onClose={handleCloseEditDialog}
				maxWidth="sm"
				fullWidth
			>
				<DialogTitle>
					{t("components.BulkImportModal.editMetadata", "编辑游戏信息")}
				</DialogTitle>
				<DialogContent>
					<Stack spacing={2} className="mt-2">
						<TextField
							label={
								editApiSource === "mixed"
									? t("components.AddModal.gameName", "游戏名称")
									: `${t("components.AddModal.gameName", "游戏名称")} / ${t(
											"components.AddModal.gameIDTips",
											"游戏ID",
										)}`
							}
							value={editName}
							onChange={(event) => setEditName(event.target.value)}
							fullWidth
							size="small"
							disabled={searchResultLoading}
							onKeyDown={(event) => {
								if (event.key === "Enter" && !searchResultLoading) {
									handleEditRowSearch();
								}
							}}
						/>
						<FormControl component="fieldset" className="gap-2">
							<ApiSourceRadioGroup
								value={editApiSource}
								onChange={setEditApiSource}
								disabled={searchResultLoading}
							/>
							{!hasBgmAuth &&
								(editApiSource === "bgm" ||
									(editApiSource === "mixed" &&
										mixedEnabledSources.includes("bgm"))) && (
									<Alert severity="info" sx={{ py: 0, px: 1.5 }}>
										{t(
											"components.AddModal.bgmNotLoggedInHint",
											"未登录 Bangumi 账号，部分隐藏条目（如 R18）可能无法被搜索到。",
										)}
									</Alert>
								)}
						</FormControl>
					</Stack>
				</DialogContent>
				<DialogActions>
					<Button onClick={handleCloseEditDialog}>
						{t("components.BulkImportModal.cancel", "取消")}
					</Button>
					<Button
						onClick={handleEditRowSaveNameOnly}
						disabled={searchResultLoading}
					>
						{t("components.BulkImportModal.saveNameOnly", "仅保存名称")}
					</Button>
					<Button
						variant="contained"
						startIcon={
							searchResultLoading ? (
								<CircularProgress size={20} color="inherit" />
							) : (
								<SearchIcon />
							)
						}
						onClick={handleEditRowSearch}
						disabled={!editName || searchResultLoading}
					>
						{searchResultLoading
							? t("components.AddModal.processing", "处理中...")
							: t("components.BulkImportModal.search", "搜索")}
					</Button>
				</DialogActions>
			</Dialog>

			<GameSelectDialog
				open={metadataSearchFlow.searchResultState.open}
				onClose={metadataSearchFlow.closeSearchResult}
				results={metadataSearchFlow.searchResultState.results}
				onSelect={metadataSearchFlow.selectGame}
				loading={searchResultLoading}
				title={t("components.AddModal.selectGame", "选择游戏")}
				apiSource={metadataSearchFlow.searchResultState.apiSource}
			/>
			{metadataSearchFlow.mixedCandidateState.open && (
				<MixedSourceConfirmDialog
					open
					onClose={metadataSearchFlow.closeMixedCandidates}
					candidates={metadataSearchFlow.mixedCandidateState.candidates}
					onConfirm={metadataSearchFlow.confirmMixedSelection}
					loading={searchResultLoading}
					title={t("components.BulkImportModal.editMetadata", "编辑游戏信息")}
				/>
			)}
			<AlertBox
				open={customImportConfirmOpen}
				setOpen={setCustomImportConfirmOpen}
				title={t(
					"components.BulkImportModal.importAsCustomConfirmTitle",
					"导入为自定义",
				)}
				message={t(
					"components.BulkImportModal.importAsCustomConfirmMessage",
					"将把已匹配以外的 {{count}} 个项目作为自定义游戏导入，仅保存名称和本地路径，不包含元数据。是否继续？",
					{ count: customImportCount },
				)}
				onConfirm={handleImportCustom}
				confirmText={t("common.confirm", "确认")}
				confirmVariant="contained"
				isLoading={isAddingGames}
			/>
		</>
	);
};

export default BulkImportTab;
