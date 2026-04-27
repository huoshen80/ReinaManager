import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import SearchIcon from "@mui/icons-material/Search";
import {
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControl,
	FormControlLabel,
	IconButton,
	MenuItem,
	Radio,
	RadioGroup,
	Select,
	Stack,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	TextField,
	Typography,
} from "@mui/material";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { gameMetadataService } from "@/api";
import { useMetadataSearchFlow } from "@/hooks/common/useMetadataSearchFlow";
import { useBulkGameAddActions } from "@/hooks/features/games/useGameMetadataFacade";
import { useAllSettings } from "@/hooks/queries/useSettings";
import { snackbar } from "@/providers/snackBar";
import { fileService } from "@/services/invoke";
import { getEnabledMixedSources, useStore } from "@/store/appStore";
import type { apiSourceType, FullGameData, ScanResult } from "@/types";
import {
	createAbortableRunner,
	handleGetFolder,
	isAbortError,
} from "@/utils/appUtils";
import { getUserErrorMessage } from "@/utils/errors";
import GameSelectDialog from "./GameSelectDialog";
import MixedSourceConfirmDialog from "./MixedSourceConfirmDialog";

interface ImportItem extends ScanResult {
	status: "pending" | "matched" | "imported" | "error" | "not found";
	matchedData?: FullGameData;
	selectedExe?: string;
}

interface BulkImportTabProps {
	// 控制此 tab 是否隐藏（通过 CSS display:none 而非卸载）
	hidden: boolean;
	onClose: () => void;
}

function getMatchedGameName(
	gameData: FullGameData | undefined,
	language: string,
): string {
	if (!gameData) {
		return "";
	}

	const useChineseName = language === "zh-CN";
	return (
		(useChineseName
			? gameData.bgm_data?.name_cn ||
				gameData.vndb_data?.name_cn ||
				gameData.ymgal_data?.name_cn ||
				gameData.kun_data?.name_cn
			: undefined) ||
		gameData.bgm_data?.name ||
		gameData.vndb_data?.name ||
		gameData.ymgal_data?.name ||
		gameData.kun_data?.name ||
		""
	);
}

const BulkImportTab = ({ hidden, onClose }: BulkImportTabProps) => {
	const { t, i18n } = useTranslation();
	const { data: settings } = useAllSettings();
	const bgmToken = settings?.bgm_token ?? "";
	const { mixedEnableYmgal, mixedEnableKun } = useStore(
		useShallow((s) => ({
			mixedEnableYmgal: s.mixedEnableYmgal,
			mixedEnableKun: s.mixedEnableKun,
		})),
	);
	const { addGamesFromBulkImport, isAddingGames } = useBulkGameAddActions();
	const preferredApiSource = bgmToken ? "bgm" : "vndb";
	const enabledMixedSources = getEnabledMixedSources({
		mixedEnableYmgal,
		mixedEnableKun,
	});

	const [isScanningDirectories, setIsScanningDirectories] = useState(false);
	const [isMatchingMetadata, setIsMatchingMetadata] = useState(false);
	const [rootPath, setRootPath] = useState("");
	const [items, setItems] = useState<ImportItem[]>([]);
	const [editItemPath, setEditItemPath] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editApiSource, setEditApiSource] = useState<apiSourceType>("bgm");
	const editSearchAbortControllerRef = useRef<AbortController | null>(null);
	const matchAbortControllerRef = useRef<AbortController | null>(null);
	const loading = isMatchingMetadata || isScanningDirectories || isAddingGames;

	const handleResolvedEditMetadata = useCallback(
		async (resolvedData: FullGameData) => {
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
		bgmToken,
		mixedEnabledSources: enabledMixedSources,
		t,
		onResolved: handleResolvedEditMetadata,
		onError: (message) => snackbar.error(message),
		getNoResultsMessage: () =>
			t("components.AddModal.noResults", "没有找到结果"),
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
		setEditItemPath(null);
		setEditName("");
		setEditApiSource(preferredApiSource);
		metadataSearchFlow.reset();
	}, [metadataSearchFlow, preferredApiSource]);

	useEffect(() => {
		if (!open) {
			resetState();
		}
	}, [resetState]);

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
		const result = await handleGetFolder();
		if (!result) return;

		setRootPath(result);
		setIsScanningDirectories(true);
		try {
			const subdirs = await fileService.scanDirectoryForGames(result);
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

				if (nextItems[index].status !== "pending") continue;

				try {
					const searchResults = await withAbort(
						gameMetadataService.searchGames({
							query: nextItems[index].name,
							source: preferredApiSource,
							bgmToken,
						}),
					);

					if (searchResults.length > 0) {
						nextItems[index].matchedData = searchResults[0];
						nextItems[index].status = "matched";
					} else {
						nextItems[index].status = "not found";
					}
				} catch (error) {
					if (isAbortError(error)) {
						break;
					}

					snackbar.warning(
						`${nextItems[index].name}: ${getUserErrorMessage(error, t)}`,
					);
					nextItems[index].status = "not found";
				}

				setItems([...nextItems]);
				await new Promise((resolve) => setTimeout(resolve, 300));
			}
		} finally {
			if (matchAbortControllerRef.current === controller) {
				matchAbortControllerRef.current = null;
			}
			setIsMatchingMetadata(false);
		}
	};

	const handleImportAll = async () => {
		const nextItems = [...items];

		const result = await addGamesFromBulkImport(nextItems);

		for (const index of result.duplicateItemIndices) {
			nextItems[index].status = "error";
		}

		for (const preparationError of result.preparationErrors) {
			nextItems[preparationError.itemIndex].status = "error";
			snackbar.warning(
				`${nextItems[preparationError.itemIndex].name}: ${preparationError.message}`,
			);
		}

		if (!result.batchResult && !result.mutationError) {
			setItems([...nextItems]);
			snackbar.info(
				t("components.BulkImportModal.noGamesFound", "未找到可导入项目"),
			);
			return;
		}

		if (result.batchResult) {
			const failedIndices = new Set(
				result.batchResult.errors.map((error) => error.index),
			);

			for (const { itemIndex, payloadIndex } of result.pendingPayloads) {
				nextItems[itemIndex].status = failedIndices.has(payloadIndex)
					? "error"
					: "imported";
			}

			if (result.batchResult.success > 0) {
				snackbar.success(
					t(
						"components.BulkImportModal.importSummary",
						"成功导入 {{success}}/{{total}} 个游戏",
						{
							success: result.batchResult.success,
							total: nextItems.length, // 去重逻辑在前端执行
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
				nextItems[itemIndex].status = "error";
			}
		}

		setItems([...nextItems]);
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

	const handleDeleteItem = (path: string) => {
		setItems((prev) => prev.filter((item) => item.path !== path));
	};

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
				sx={{
					pt: 1,
					height: "100%",
					minHeight: 0,
					overflow: "hidden",
					// 通过 CSS 控制显隐而非卸载，保持状态在 tab 切换时不丢失
					display: hidden ? "none" : undefined,
				}}
			>
				<Stack
					direction={{ xs: "column", sm: "row" }}
					spacing={2}
					alignItems={{ xs: "stretch", sm: "center" }}
				>
					<Button
						variant="contained"
						startIcon={<FolderOpenIcon />}
						onClick={scanFolder}
						disabled={loading}
						sx={{ flexShrink: 0 }}
					>
						{t("components.BulkImportModal.selectRootFolder", "选择根文件夹")}
					</Button>
					<Typography variant="body2" sx={{ flexGrow: 1 }} noWrap>
						{rootPath ||
							t("components.BulkImportModal.noFolderSelected", "未选择文件夹")}
					</Typography>
					{items.length > 0 && (
						<Typography
							variant="body2"
							color="text.secondary"
							sx={{
								whiteSpace: "nowrap",
								alignSelf: { xs: "flex-start", sm: "auto" },
							}}
						>
							{t("components.BulkImportModal.gamesCount", {
								count: items.length,
							})}
						</Typography>
					)}
				</Stack>

				<TableContainer
					sx={{
						flex: "1 1 auto",
						minHeight: 0,
						overflowY: "auto",
						overflowX: "hidden",
					}}
				>
					<Table stickyHeader size="small" sx={{ tableLayout: "fixed" }}>
						<TableHead>
							<TableRow>
								<TableCell sx={{ width: "25%" }}>
									{t("components.BulkImportModal.searchName", "搜索名称")}
								</TableCell>
								<TableCell sx={{ width: "25%" }}>
									{t("components.BulkImportModal.matchedGame", "匹配的游戏")}
								</TableCell>
								<TableCell sx={{ width: "10%" }}>
									{t("components.BulkImportModal.status", "状态")}
								</TableCell>
								<TableCell sx={{ width: "30%" }}>
									{t("components.BulkImportModal.executable", "启动程序")}
								</TableCell>
								<TableCell align="center" sx={{ width: "10%" }}>
									{t("components.BulkImportModal.actions", "操作")}
								</TableCell>
							</TableRow>
						</TableHead>
						<TableBody>
							{items.length === 0 ? (
								<TableRow>
									<TableCell colSpan={5} align="center">
										{t("components.BulkImportModal.noGamesFound", "未找到游戏")}
									</TableCell>
								</TableRow>
							) : (
								items.map((item) => (
									<TableRow key={item.path}>
										<TableCell
											sx={{
												whiteSpace: "nowrap",
												overflow: "hidden",
												textOverflow: "ellipsis",
											}}
											title={item.name}
										>
											{item.name}
										</TableCell>
										<TableCell
											sx={{
												whiteSpace: "nowrap",
												overflow: "hidden",
												textOverflow: "ellipsis",
											}}
											title={getMatchedGameName(
												item.matchedData,
												i18n.language,
											)}
										>
											{getMatchedGameName(item.matchedData, i18n.language) ||
												"-"}
										</TableCell>
										<TableCell>
											{item.status === "pending"
												? t(
														"components.BulkImportModal.statusPending",
														"待处理",
													)
												: item.status === "matched"
													? t(
															"components.BulkImportModal.statusMatched",
															"已匹配",
														)
													: item.status === "not found"
														? t(
																"components.BulkImportModal.statusNotFound",
																"未找到",
															)
														: item.status === "imported"
															? t(
																	"components.BulkImportModal.statusImported",
																	"已导入",
																)
															: t(
																	"components.BulkImportModal.statusError",
																	"错误",
																)}
										</TableCell>
										<TableCell>
											{item.executables.length === 1 ? (
												<Typography
													variant="body2"
													noWrap
													title={item.executables[0]}
												>
													{item.executables[0]}
												</Typography>
											) : (
												<FormControl size="small" fullWidth>
													<Select
														value={item.selectedExe || ""}
														onChange={(event) => {
															const nextItems = [...items];
															const itemIndex = nextItems.findIndex(
																(currentItem) => currentItem.path === item.path,
															);
															if (itemIndex !== -1) {
																nextItems[itemIndex].selectedExe =
																	event.target.value;
																setItems(nextItems);
															}
														}}
														displayEmpty
														disabled={item.status === "imported" || loading}
														renderValue={(selected) => (
															<Typography
																variant="body2"
																noWrap
																color={selected ? undefined : "text.secondary"}
																sx={{ maxWidth: "100%" }}
															>
																{selected ||
																	t(
																		"components.BulkImportModal.selectExe",
																		"请选择启动程序",
																	)}
															</Typography>
														)}
													>
														<MenuItem value="" disabled>
															{t(
																"components.BulkImportModal.selectExe",
																"请选择启动程序",
															)}
														</MenuItem>
														{item.executables.map((exe) => (
															<MenuItem key={exe} value={exe}>
																{exe}
															</MenuItem>
														))}
													</Select>
												</FormControl>
											)}
										</TableCell>
										<TableCell align="center">
											<Stack direction="row" justifyContent="center">
												<IconButton
													size="small"
													onClick={() => {
														setEditItemPath(item.path);
														setEditName(item.name);
														setEditApiSource(preferredApiSource);
													}}
													disabled={item.status === "imported" || loading}
												>
													<EditIcon fontSize="small" />
												</IconButton>
												<IconButton
													size="small"
													onClick={() => handleDeleteItem(item.path)}
													disabled={item.status === "imported" || loading}
												>
													<DeleteIcon fontSize="small" />
												</IconButton>
											</Stack>
										</TableCell>
									</TableRow>
								))
							)}
						</TableBody>
					</Table>
				</TableContainer>

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
							disabled={items.length === 0 || loading}
						>
							{t("components.BulkImportModal.matchMetadata", "匹配元数据")}
						</Button>
						<Button
							variant="contained"
							onClick={handleImportAll}
							disabled={items.length === 0 || loading}
							startIcon={loading ? <CircularProgress size={20} /> : undefined}
						>
							{t("components.BulkImportModal.importAll", "全部导入")}
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
					<Stack spacing={2} sx={{ mt: 1 }}>
						<TextField
							label={
								editApiSource === "mixed"
									? t("components.AddModal.gameName", "游戏名称")
									: `${t("components.AddModal.gameName")} / ${t(
											"components.AddModal.gameIDTips",
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
						<FormControl component="fieldset">
							<RadioGroup
								row
								value={editApiSource}
								onChange={(event) =>
									setEditApiSource(event.target.value as apiSourceType)
								}
							>
								<FormControlLabel
									value="bgm"
									control={<Radio />}
									label="Bangumi"
									disabled={searchResultLoading}
								/>
								<FormControlLabel
									value="vndb"
									control={<Radio />}
									label="VNDB"
									disabled={searchResultLoading}
								/>
								<FormControlLabel
									value="ymgal"
									control={<Radio />}
									label="YMGal"
									disabled={searchResultLoading}
								/>
								<FormControlLabel
									value="kun"
									control={<Radio />}
									label="Kun"
									disabled={searchResultLoading}
								/>
								<FormControlLabel
									value="mixed"
									control={<Radio />}
									label="Mixed"
									disabled={searchResultLoading}
								/>
							</RadioGroup>
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
							? t("components.AddModal.processing", "处理中")
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
			<MixedSourceConfirmDialog
				open={metadataSearchFlow.mixedCandidateState.open}
				onClose={metadataSearchFlow.closeMixedCandidates}
				candidates={metadataSearchFlow.mixedCandidateState.candidates}
				onConfirm={metadataSearchFlow.confirmMixedSelection}
				loading={searchResultLoading}
				title={t("components.BulkImportModal.editMetadata", "编辑游戏信息")}
			/>
		</>
	);
};

export default BulkImportTab;
