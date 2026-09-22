import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import SearchIcon from "@mui/icons-material/Search";
import SettingsIcon from "@mui/icons-material/Settings";
import SportsEsportsIcon from "@mui/icons-material/SportsEsports";
import {
	Alert,
	Box,
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControl,
	FormControlLabel,
	IconButton,
	InputLabel,
	MenuItem,
	Popover,
	Select,
	Stack,
	Switch,
	TextField,
	Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { AlertBox } from "@/components/AlertBox";
import { useBulkGameAddActions } from "@/hooks/features/games/useGameMetadataFacade";
import { useMetadataSearchFlow } from "@/hooks/features/games/useMetadataSearchFlow";
import { useAllSettings } from "@/hooks/queries/useSettings";
import { getRuntimeSourceAdapter, SEARCHABLE_SOURCE_KEYS } from "@/metadata";
import { snackbar } from "@/providers/snackBar";
import { handleFolder, normalizeDirectoryPath } from "@/services/fs/fileDialog";
import { fileService } from "@/services/invoke";
import {
	isBgmAuthExpiredError,
	withBgmAuth,
} from "@/services/oauth/bgmAuthSession";
import {
	isHikarinagiAuthExpiredError,
	withHikarinagiAuth,
} from "@/services/oauth/hikarinagiAuthSession";
import { createMetadataSession } from "@/services/requestContext";
import { useStore } from "@/store/appStore";
import type {
	GameDirectoryScanMode,
	GameMetadataDraft,
	GameScanMode,
	SourceType,
} from "@/types";
import { createAbortableRunner, isAbortError } from "@/utils/async";
import { getUserErrorMessage, isApiRateLimitError } from "@/utils/errors";
import BulkImportResultTable, {
	type BulkImportItem,
	type VisibleBulkImportItem,
} from "./BulkImportResultTable";
import GameSelectDialog from "./GameSelectDialog";
import MixedSourceConfirmDialog from "./MixedSourceConfirmDialog";
import {
	type AddGameMode,
	type MetadataMatchMode,
	MetadataMatchModeToggleGroup,
	SingleSourceSelect,
} from "./SourceMatchControls";

export interface BulkDropBatch {
	id: number;
	paths: string[];
}

interface BulkImportTabProps {
	// 控制此 tab 是否隐藏（通过 CSS display:none 而非卸载）
	hidden: boolean;
	onClose: () => void;
	addMode: AddGameMode;
	onAddModeChange: (mode: AddGameMode) => void;
	bulkApiSource: SourceType;
	onBulkApiSourceChange: (source: SourceType) => void;
	scanMode: GameScanMode;
	onScanModeChange: (mode: GameScanMode) => void;
	scanMaxDepth: number;
	onScanMaxDepthChange: (depth: number) => void;
	scanFirstLevelExecutables: boolean;
	onScanFirstLevelExecutablesChange: (checked: boolean) => void;
	dropBatch?: BulkDropBatch;
	onDropBatchHandled: (batchId: number) => void;
}

const SCAN_DEPTH_OPTIONS = [2, 3, 4, 5] as const;
const BULK_API_SOURCE_OPTIONS = SEARCHABLE_SOURCE_KEYS.map((source) => ({
	value: source,
	label: getRuntimeSourceAdapter(source).label,
}));

function isVisibleBulkImportItem(
	item: BulkImportItem,
): item is VisibleBulkImportItem {
	return item.status !== "imported";
}

function getBulkItemIdentities(item: BulkImportItem): string[] {
	const identities: string[] = [];
	if (item.steam_launch_id) {
		identities.push(`steam:${item.steam_launch_id}`);
	}
	const normalizedPath = normalizeDirectoryPath(item.path);
	if (normalizedPath) {
		identities.push(`local:${normalizedPath}`);
	}
	return identities;
}

const BulkImportTab = ({
	hidden,
	onClose,
	addMode,
	onAddModeChange,
	bulkApiSource,
	onBulkApiSourceChange,
	scanMode,
	onScanModeChange,
	scanMaxDepth,
	onScanMaxDepthChange,
	scanFirstLevelExecutables,
	onScanFirstLevelExecutablesChange,
	dropBatch,
	onDropBatchHandled,
}: BulkImportTabProps) => {
	const { t } = useTranslation();
	const { data: settings } = useAllSettings();
	const hasBgmAuth = Boolean(settings?.bgm_auth);
	const hasHikarinagiAuth = Boolean(settings?.hikarinagi_auth?.access_token);
	const { mixedEnabledSources } = useStore(
		useShallow((s) => ({
			mixedEnabledSources: s.mixedEnabledSources,
		})),
	);
	const { addGamesFromBulkImport, isAddingGames } = useBulkGameAddActions();

	const [isScanningGames, setIsScanningGames] = useState(false);
	const [isMatchingMetadata, setIsMatchingMetadata] = useState(false);
	const [rootPath, setRootPath] = useState("");
	const [hasScanned, setHasScanned] = useState(false);
	const [items, setItems] = useState<BulkImportItem[]>([]);
	const [editItemKey, setEditItemKey] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editApiSource, setEditApiSource] = useState<SourceType>(bulkApiSource);
	const [customImportConfirmOpen, setCustomImportConfirmOpen] = useState(false);
	const [settingsAnchorEl, setSettingsAnchorEl] = useState<null | HTMLElement>(
		null,
	);
	const editSearchAbortControllerRef = useRef<AbortController | null>(null);
	const matchAbortControllerRef = useRef<AbortController | null>(null);
	const itemsRef = useRef(items);
	const processingDropBatchIdRef = useRef<number | null>(null);
	const loading = isMatchingMetadata || isScanningGames || isAddingGames;
	const matchedImportCount = items.filter(
		(item) => item.status === "matched",
	).length;
	const customImportCount = items.filter(
		(item) => item.status !== "matched",
	).length;
	const editMatchMode: MetadataMatchMode =
		addMode === "single" ? "single" : "mixed";

	useEffect(() => {
		itemsRef.current = items;
	}, [items]);

	useEffect(() => {
		return () => {
			editSearchAbortControllerRef.current?.abort();
			matchAbortControllerRef.current?.abort();
		};
	}, []);

	const handleResolvedEditMetadata = useCallback(
		async (resolvedData: GameMetadataDraft) => {
			if (!editItemKey) return;

			setItems((prevItems) => {
				const nextItems = [...prevItems];
				const itemIndex = nextItems.findIndex(
					(item) => item.key === editItemKey,
				);
				if (itemIndex !== -1) {
					nextItems[itemIndex].name = editName;
					nextItems[itemIndex].matchedData = resolvedData;
					nextItems[itemIndex].status = "matched";
				}
				return nextItems;
			});
			setEditItemKey(null);
		},
		[editItemKey, editName],
	);

	const metadataSearchFlow = useMetadataSearchFlow({
		mixedEnabledSources,
		t,
		onResolved: handleResolvedEditMetadata,
		onError: (message) => snackbar.error(message),
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
		setHasScanned(false);
		itemsRef.current = [];
		setItems([]);
		setEditItemKey(null);
		setEditName("");
		setCustomImportConfirmOpen(false);
		metadataSearchFlow.reset();
	}, [metadataSearchFlow]);

	const handleCloseEditDialog = useCallback(() => {
		if (editSearchAbortControllerRef.current) {
			editSearchAbortControllerRef.current.abort();
			editSearchAbortControllerRef.current = null;
		}

		metadataSearchFlow.reset();
		setEditItemKey(null);
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

	const scanSelectedFolder = useCallback(
		async (
			selectedRootPath: string,
			maxDepth: number,
			mode: GameDirectoryScanMode,
			scanExecutables: boolean,
		) => {
			setIsScanningGames(true);
			try {
				const subdirs = await fileService.scanDirectoryForGames(
					selectedRootPath,
					maxDepth,
					mode,
					scanExecutables,
				);
				setItems(
					subdirs.map((dir) => ({
						...dir,
						key: `local:${dir.path}`,
						status: "pending",
						selectedExe:
							dir.executables.length > 0 ? dir.executables[0] : undefined,
					})),
				);
				setHasScanned(true);
			} catch (error) {
				snackbar.error(getUserErrorMessage(error, t));
			} finally {
				setIsScanningGames(false);
			}
		},
		[t],
	);

	const processDroppedPaths = useCallback(
		async (paths: string[]) => {
			setIsScanningGames(true);
			try {
				const result = await fileService.resolveBulkImportPaths(paths);
				const currentItems = itemsRef.current;
				const existingIdentities = new Set(
					currentItems.flatMap(getBulkItemIdentities),
				);
				let duplicateCount = 0;
				const addedItems: BulkImportItem[] = [];

				for (const candidate of result.candidates) {
					const item: BulkImportItem = {
						key: candidate.steam_launch_id
							? `steam:${candidate.steam_launch_id}`
							: `local:${candidate.path}`,
						name: candidate.name,
						path: candidate.path,
						executables: candidate.executables,
						selectedExe: candidate.selected_exe,
						launch_type: candidate.launch_type,
						steam_launch_id: candidate.steam_launch_id,
						status: "pending",
					};
					const identities = getBulkItemIdentities(item);
					if (identities.some((identity) => existingIdentities.has(identity))) {
						duplicateCount++;
						continue;
					}
					for (const identity of identities) {
						existingIdentities.add(identity);
					}
					addedItems.push(item);
				}

				if (addedItems.length > 0) {
					const nextItems = [...currentItems, ...addedItems];
					itemsRef.current = nextItems;
					setItems(nextItems);
					setHasScanned(true);
				}

				const skippedCount = result.issues.length + duplicateCount;
				const firstReason =
					result.issues[0]?.message ??
					t(
						"components.BulkImportModal.duplicateInCurrentList",
						"该游戏已在当前批量列表中",
					);
				if (skippedCount > 0) {
					snackbar.warning(
						addedItems.length > 0
							? t(
									"components.BulkImportModal.dropPartialSummary",
									"已添加 {{added}} 个候选，跳过 {{skipped}} 项：{{reason}}",
									{
										added: addedItems.length,
										skipped: skippedCount,
										reason: firstReason,
									},
								)
							: t(
									"components.BulkImportModal.dropSkippedSummary",
									"未添加候选，跳过 {{skipped}} 项：{{reason}}",
									{ skipped: skippedCount, reason: firstReason },
								),
					);
				} else if (addedItems.length > 0) {
					snackbar.success(
						t(
							"components.BulkImportModal.dropAddedSummary",
							"已添加 {{added}} 个批量导入候选",
							{ added: addedItems.length },
						),
					);
				}
			} catch (error) {
				snackbar.error(getUserErrorMessage(error, t));
			} finally {
				setIsScanningGames(false);
			}
		},
		[t],
	);

	useEffect(() => {
		if (!dropBatch || loading || processingDropBatchIdRef.current !== null) {
			return;
		}

		processingDropBatchIdRef.current = dropBatch.id;
		void processDroppedPaths(dropBatch.paths).finally(() => {
			onDropBatchHandled(dropBatch.id);
			processingDropBatchIdRef.current = null;
		});
	}, [dropBatch, loading, onDropBatchHandled, processDroppedPaths]);

	const scanSteamLibrary = useCallback(async () => {
		setIsScanningGames(true);
		try {
			const result = await fileService.scanSteamLaunchTargets({
				excludeExisting: true,
			});
			setItems(
				result.targets.map((target) => ({
					key: `steam:${target.steam_launch_id}`,
					name: target.name,
					path: target.localpath,
					executables: target.executable ? [target.executable] : [],
					selectedExe: target.executable,
					launch_type: "steam",
					steam_launch_id: target.steam_launch_id,
					status: "pending",
				})),
			);
			setHasScanned(true);

			if (result.warnings.length > 0) {
				snackbar.warning(
					t(
						"components.BulkImportModal.steamScanWarnings",
						"Steam 扫描完成，但有 {{count}} 条警告：{{warning}}",
						{
							count: result.warnings.length,
							warning: result.warnings[0],
						},
					),
				);
			}
		} catch (error) {
			snackbar.error(getUserErrorMessage(error, t));
		} finally {
			setIsScanningGames(false);
		}
	}, [t]);

	const scanFolder = async () => {
		if (scanMode === "steam") return;

		const result = await handleFolder();
		if (!result) return;

		setRootPath(result);
		setHasScanned(false);
		await scanSelectedFolder(
			result,
			scanMaxDepth,
			scanMode,
			scanFirstLevelExecutables,
		);
	};

	const handleScanDepthChange = (nextDepth: number) => {
		onScanMaxDepthChange(nextDepth);
		if (rootPath && scanMode === "executable") {
			void scanSelectedFolder(rootPath, nextDepth, scanMode, false);
		}
	};

	const handleScanModeChange = (nextMode: GameScanMode) => {
		onScanModeChange(nextMode);
		setHasScanned(false);
		setItems([]);
		if (nextMode !== "steam" && rootPath) {
			void scanSelectedFolder(
				rootPath,
				scanMaxDepth,
				nextMode,
				scanFirstLevelExecutables,
			);
		}
	};

	const handleScanFirstLevelExecutablesChange = (checked: boolean) => {
		onScanFirstLevelExecutablesChange(checked);
		if (rootPath && scanMode === "first_level_directory") {
			void scanSelectedFolder(rootPath, scanMaxDepth, scanMode, checked);
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
					const runSearch = (tokens: {
						bgmToken?: string;
						hikarinagiToken?: string;
					}) =>
						withAbort(
							createMetadataSession({
								...tokens,
								signal: controller.signal,
							}).searchBestMatch({
								query: nextItems[index].name,
								source: bulkApiSource,
							}),
						);

					const matchedData =
						bulkApiSource === "bgm"
							? await withBgmAuth((token) => runSearch({ bgmToken: token }))
							: bulkApiSource === "hikarinagi"
								? await withHikarinagiAuth((token) =>
										runSearch({ hikarinagiToken: token }),
									)
								: await runSearch({});

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
					if (isHikarinagiAuthExpiredError(error)) {
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
				source: editMatchMode === "single" ? editApiSource : "mixed",
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

	const handleDeleteItem = useCallback((key: string) => {
		setItems((prev) => prev.filter((item) => item.key !== key));
	}, []);

	const handleExecutableChange = useCallback(
		(key: string, selectedExe: string) => {
			setItems((prev) =>
				prev.map((item) =>
					item.key === key ? { ...item, selectedExe } : item,
				),
			);
		},
		[],
	);

	const handleEditItem = useCallback((item: VisibleBulkImportItem) => {
		setEditItemKey(item.key);
		setEditName(item.name);
	}, []);

	const handleOpenDirectory = useCallback(
		(path: string) => {
			void fileService.openDirectory(path).catch((error) => {
				snackbar.error(getUserErrorMessage(error, t));
			});
		},
		[t],
	);

	const handleEditRowSaveNameOnly = () => {
		if (!editItemKey) return;

		const nextItems = [...items];
		const itemIndex = nextItems.findIndex((item) => item.key === editItemKey);
		if (itemIndex !== -1) {
			nextItems[itemIndex].name = editName;
			if (nextItems[itemIndex].status === "not found") {
				nextItems[itemIndex].status = "pending";
			}
			setItems(nextItems);
		}

		setEditItemKey(null);
	};

	const emptyMessage = isScanningGames
		? scanMode === "steam"
			? t(
					"components.BulkImportModal.scanningSteamLibrary",
					"正在扫描 Steam 库...",
				)
			: t("components.BulkImportModal.scanningFolders", "正在扫描游戏目录...")
		: scanMode === "steam"
			? hasScanned
				? t(
						"components.BulkImportModal.noSteamGamesFound",
						"Steam 库中未找到可导入的游戏",
					)
				: t(
						"components.BulkImportModal.scanSteamHint",
						"点击“扫描 Steam 库”查找已安装游戏",
					)
			: rootPath
				? t("components.BulkImportModal.noGamesFound", "未找到可导入的游戏")
				: t(
						"components.BulkImportModal.selectFolderHint",
						"选择根文件夹后开始扫描",
					);

	return (
		<>
			<DialogContent
				className={
					hidden ? "hidden" : "flex flex-1 min-h-0 overflow-hidden pt-4"
				}
			>
				<Stack
					spacing={2}
					className="pt-2 w-full flex-1 self-stretch h-full min-h-0 overflow-hidden"
				>
					<Stack
						direction="row"
						spacing={1.5}
						alignItems="center"
						flexWrap="wrap"
						useFlexGap
					>
						{scanMode === "steam" ? (
							<Box className="flex-[1_1_280px] min-w-0">
								<Button
									variant="contained"
									startIcon={
										isScanningGames ? (
											<CircularProgress size={20} color="inherit" />
										) : (
											<SportsEsportsIcon />
										)
									}
									onClick={() => void scanSteamLibrary()}
									disabled={loading}
								>
									{t(
										"components.BulkImportModal.scanSteamLibrary",
										"扫描 Steam 库",
									)}
								</Button>
							</Box>
						) : (
							<>
								<Button
									variant="contained"
									startIcon={
										isScanningGames ? (
											<CircularProgress size={20} color="inherit" />
										) : (
											<FolderOpenIcon />
										)
									}
									onClick={scanFolder}
									disabled={loading}
									className="shrink-0"
								>
									{t(
										"components.BulkImportModal.selectRootFolder",
										"选择根文件夹",
									)}
								</Button>
								<Typography
									variant="body2"
									className="flex-[1_1_160px] min-w-0"
									color={rootPath ? "text.primary" : "text.secondary"}
									noWrap
								>
									{rootPath ||
										t(
											"components.BulkImportModal.noFolderSelected",
											"未选择文件夹",
										)}
								</Typography>
							</>
						)}

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
									onBulkApiSourceChange(event.target.value as SourceType)
								}
							>
								{BULK_API_SOURCE_OPTIONS.map((option) => (
									<MenuItem
										key={option.value}
										value={option.value}
										disabled={
											(option.value === "bgm" && !hasBgmAuth) ||
											(option.value === "hikarinagi" && !hasHikarinagiAuth)
										}
									>
										{option.label}
									</MenuItem>
								))}
							</Select>
						</FormControl>

						<IconButton
							size="small"
							onClick={(e) => setSettingsAnchorEl(e.currentTarget)}
							title={t(
								"components.BulkImportModal.advancedSettings",
								"高级设置",
							)}
							className="shrink-0"
						>
							<SettingsIcon />
						</IconButton>

						{items.length > 0 && (
							<Typography
								variant="body2"
								color="text.secondary"
								className="whitespace-nowrap shrink-0"
							>
								{t(
									"components.BulkImportModal.gamesCount",
									"共 {{count}} 个游戏",
									{ count: items.length },
								)}
							</Typography>
						)}
					</Stack>

					<Popover
						open={Boolean(settingsAnchorEl)}
						anchorEl={settingsAnchorEl}
						onClose={() => setSettingsAnchorEl(null)}
						anchorOrigin={{
							vertical: "bottom",
							horizontal: "right",
						}}
						transformOrigin={{
							vertical: "top",
							horizontal: "right",
						}}
					>
						<Stack spacing={1.5} sx={{ p: 2.5, minWidth: 260 }}>
							<FormControl size="small" disabled={loading} fullWidth>
								<InputLabel id="bulk-import-scan-mode-label">
									{t("components.BulkImportModal.scanMode", "扫描模式")}
								</InputLabel>
								<Select
									labelId="bulk-import-scan-mode-label"
									value={scanMode}
									label={t("components.BulkImportModal.scanMode", "扫描模式")}
									onChange={(event) =>
										handleScanModeChange(event.target.value as GameScanMode)
									}
								>
									<MenuItem value="executable">
										{t(
											"components.BulkImportModal.scanModeExecutable",
											"可执行文件扫描",
										)}
									</MenuItem>
									<MenuItem value="first_level_directory">
										{t(
											"components.BulkImportModal.scanModeFirstLevel",
											"一级目录导入",
										)}
									</MenuItem>
									<MenuItem value="steam">
										{t(
											"components.BulkImportModal.scanModeSteam",
											"Steam 导入",
										)}
									</MenuItem>
								</Select>
							</FormControl>
							{scanMode === "executable" && (
								<FormControl size="small" disabled={loading} fullWidth>
									<InputLabel id="bulk-import-scan-depth-label">
										{t("components.BulkImportModal.scanDepth", "扫描深度")}
									</InputLabel>
									<Select
										labelId="bulk-import-scan-depth-label"
										value={scanMaxDepth}
										label={t(
											"components.BulkImportModal.scanDepth",
											"扫描深度",
										)}
										onChange={(event) =>
											handleScanDepthChange(Number(event.target.value))
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
							)}
							{scanMode === "first_level_directory" && (
								<FormControlLabel
									labelPlacement="start"
									className="box-border w-full justify-between pl-3"
									control={
										<Switch
											checked={scanFirstLevelExecutables}
											onChange={(event) =>
												handleScanFirstLevelExecutablesChange(
													event.target.checked,
												)
											}
											disabled={loading}
										/>
									}
									label={t(
										"components.BulkImportModal.scanFirstLevelExecutables",
										"扫描启动文件",
									)}
								/>
							)}
						</Stack>
					</Popover>

					<BulkImportResultTable
						items={items.filter(isVisibleBulkImportItem)}
						loading={loading}
						emptyMessage={emptyMessage}
						onDeleteItem={handleDeleteItem}
						onEditItem={handleEditItem}
						onExecutableChange={handleExecutableChange}
						onOpenDirectory={handleOpenDirectory}
					/>
				</Stack>
			</DialogContent>

			<DialogActions
				disableSpacing
				className={
					hidden
						? "hidden"
						: "flex flex-wrap items-stretch justify-end gap-2 md:items-center"
				}
			>
				<Box className="flex w-full grow md:w-auto">
					<Button onClick={resetState} disabled={loading || items.length === 0}>
						{t("components.BulkImportModal.reset", "重置")}
					</Button>
				</Box>
				<Stack
					direction="row"
					spacing={1}
					flexWrap="wrap"
					useFlexGap
					justifyContent="flex-end"
				>
					<Button variant="outlined" onClick={handleCancel}>
						{t("components.BulkImportModal.cancel", "取消")}
					</Button>
					<Button
						startIcon={<SearchIcon />}
						onClick={handleMatchMetadata}
						disabled={
							items.length === 0 ||
							loading ||
							(bulkApiSource === "bgm" && !hasBgmAuth) ||
							(bulkApiSource === "hikarinagi" && !hasHikarinagiAuth)
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
							{
								count: matchedImportCount,
							},
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
			</DialogActions>

			<Dialog
				open={!!editItemKey}
				onClose={handleCloseEditDialog}
				maxWidth="sm"
				fullWidth
			>
				<DialogTitle>
					{t("components.BulkImportModal.editMetadata", "编辑游戏信息")}
				</DialogTitle>
				<DialogContent>
					<Stack spacing={2} className="mt-2">
						<Stack spacing={2}>
							<MetadataMatchModeToggleGroup
								value={editMatchMode}
								onChange={onAddModeChange}
								disabled={searchResultLoading}
								sx={{ width: "100%" }}
							/>
							{editMatchMode === "single" && (
								<SingleSourceSelect
									value={editApiSource}
									onChange={setEditApiSource}
									disabled={searchResultLoading}
								/>
							)}
							{!hasBgmAuth &&
								((editMatchMode === "single" && editApiSource === "bgm") ||
									(editMatchMode === "mixed" &&
										mixedEnabledSources.includes("bgm"))) && (
									<Alert severity="info" sx={{ py: 0, px: 1.5 }}>
										{t(
											"components.AddModal.bgmNotLoggedInHint",
											"未登录 Bangumi 账号，部分隐藏条目（如 R18）可能无法被搜索到。",
										)}
									</Alert>
								)}
						</Stack>
						<TextField
							label={
								editMatchMode === "single"
									? `${t("components.AddModal.gameName", "游戏名称")} / ${t(
											"components.AddModal.gameIDTips",
											"游戏ID",
										)}`
									: t("components.AddModal.gameName", "游戏名称")
							}
							value={editName}
							onChange={(event) => setEditName(event.target.value)}
							fullWidth
							size="small"
							disabled={searchResultLoading}
							onKeyDown={(event) => {
								if (
									event.key === "Enter" &&
									!event.nativeEvent.isComposing &&
									!searchResultLoading
								) {
									handleEditRowSearch();
								}
							}}
						/>
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
				sourceCandidates={metadataSearchFlow.searchResultState.results}
				onSelectCandidate={metadataSearchFlow.selectGame}
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
					"将把已匹配以外的 {{count}} 个项目作为自定义游戏导入，仅保存名称和启动信息，不包含元数据。是否继续？",
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
