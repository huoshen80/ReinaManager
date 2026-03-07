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
	Switch,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	TextField,
	Typography,
} from "@mui/material";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { snackbar } from "@/components/Snackbar";
import {
	buildBulkImportGameData,
	useBatchGameAddActions,
	useGameDirectoryScanActions,
	useGameMetadataSearchActions,
} from "@/hooks/features/games/useGameMetadataFacade";
import { useBgmToken } from "@/hooks/queries/useSettings";
import type { FullGameData, ScanResult } from "@/types";
import { getErrorMessage, handleGetFolder } from "@/utils";
import GameSelectDialog from "./GameSelectDialog";

interface ImportItem extends ScanResult {
	status: "pending" | "matched" | "imported" | "error" | "not found";
	matchedData?: FullGameData;
	selectedExe?: string;
}

interface BulkImportTabProps {
	open: boolean;
	onClose: () => void;
}

function getGameIdentityKeys(
	payload: Pick<FullGameData, "bgm_id" | "vndb_id" | "ymgal_id">,
): string[] {
	return [
		payload.bgm_id ? `bgm:${payload.bgm_id}` : null,
		payload.vndb_id ? `vndb:${payload.vndb_id}` : null,
		payload.ymgal_id ? `ymgal:${payload.ymgal_id}` : null,
	].filter((value): value is string => Boolean(value));
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
				gameData.ymgal_data?.name_cn
			: undefined) ||
		gameData.bgm_data?.name ||
		gameData.vndb_data?.name ||
		gameData.ymgal_data?.name ||
		""
	);
}

const BulkImportTab = ({ open, onClose }: BulkImportTabProps) => {
	const { t, i18n } = useTranslation();
	const { data: bgmToken = "" } = useBgmToken();
	const { searchGames } = useGameMetadataSearchActions();
	const { isScanningDirectories, scanDirectoryForGames } =
		useGameDirectoryScanActions();
	const { addGamesBatch, checkGameExists, isBatchAddingGames } =
		useBatchGameAddActions();
	const preferredApiSource = bgmToken ? "bgm" : "vndb";

	const [isMatchingMetadata, setIsMatchingMetadata] = useState(false);
	const [rootPath, setRootPath] = useState("");
	const [items, setItems] = useState<ImportItem[]>([]);
	const [editItemPath, setEditItemPath] = useState<string | null>(null);
	const [editName, setEditName] = useState("");
	const [editApiSource, setEditApiSource] = useState<
		"bgm" | "vndb" | "ymgal" | "mixed"
	>("bgm");
	const [editIsIdSearch, setEditIsIdSearch] = useState(false);
	const [gameSelectOpen, setGameSelectOpen] = useState(false);
	const [gameSelectResults, setGameSelectResults] = useState<FullGameData[]>(
		[],
	);
	const [gameSelectLoading, setGameSelectLoading] = useState(false);
	const loading =
		isMatchingMetadata || isScanningDirectories || isBatchAddingGames;

	const resetState = useCallback(() => {
		setIsMatchingMetadata(false);
		setRootPath("");
		setItems([]);
		setEditItemPath(null);
		setEditName("");
		setEditApiSource(preferredApiSource);
		setEditIsIdSearch(false);
		setGameSelectOpen(false);
		setGameSelectResults([]);
		setGameSelectLoading(false);
	}, [preferredApiSource]);

	useEffect(() => {
		if (!open) {
			resetState();
		}
	}, [open, resetState]);

	const scanFolder = async () => {
		const result = await handleGetFolder();
		if (!result) return;

		setRootPath(result);
		try {
			const subdirs = await scanDirectoryForGames(result);
			setItems(
				subdirs.map((dir) => ({
					...dir,
					status: "pending",
					selectedExe:
						dir.executables.length > 0 ? dir.executables[0] : undefined,
				})),
			);
		} catch (error) {
			snackbar.error(getErrorMessage(error));
		}
	};

	const handleMatchMetadata = async () => {
		setIsMatchingMetadata(true);
		const nextItems = [...items];

		for (let index = 0; index < nextItems.length; index++) {
			if (nextItems[index].status !== "pending") continue;

			try {
				const searchResults = await searchGames({
					query: nextItems[index].name,
					source: preferredApiSource,
				});

				if (searchResults.length > 0) {
					nextItems[index].matchedData = searchResults[0];
					nextItems[index].status = "matched";
				} else {
					nextItems[index].status = "not found";
				}
			} catch (error) {
				snackbar.warning(`${nextItems[index].name}: ${getErrorMessage(error)}`);
				nextItems[index].status = "not found";
			}

			setItems([...nextItems]);
			await new Promise((resolve) => setTimeout(resolve, 300));
		}

		setIsMatchingMetadata(false);
	};

	const handleImportAll = async () => {
		const nextItems = [...items];
		const pendingPayloads: Array<{ itemIndex: number; payloadIndex: number }> =
			[];
		const payloads = [];
		const queuedIds = new Set<string>();

		for (let index = 0; index < nextItems.length; index++) {
			if (nextItems[index].status === "imported") continue;

			const payload = buildBulkImportGameData(nextItems[index]);
			const identityKeys = getGameIdentityKeys(payload);
			const existsInLibrary = checkGameExists(payload);
			const duplicatedInCurrentBatch = identityKeys.some((key) =>
				queuedIds.has(key),
			);

			if (existsInLibrary || duplicatedInCurrentBatch) {
				nextItems[index].status = "error";
				continue;
			}

			for (const key of identityKeys) {
				queuedIds.add(key);
			}

			pendingPayloads.push({ itemIndex: index, payloadIndex: payloads.length });
			payloads.push(payload);
		}

		if (payloads.length === 0) {
			setItems([...nextItems]);
			snackbar.info(
				t("components.BulkImportModal.noGamesFound", "未找到可导入项目"),
			);
			return;
		}

		try {
			const result = await addGamesBatch(payloads);
			const failedIndices = new Set(result.errors.map((error) => error.index));

			for (const { itemIndex, payloadIndex } of pendingPayloads) {
				nextItems[itemIndex].status = failedIndices.has(payloadIndex)
					? "error"
					: "imported";
			}

			if (result.success > 0) {
				snackbar.success(
					t(
						"components.BulkImportModal.importSummary",
						"成功导入 {{success}}/{{total}} 个游戏",
						{
							success: result.success,
							total: nextItems.length, // 去重逻辑在前端执行
						},
					),
				);
			}

			if (result.failed > 0) {
				snackbar.warning(
					t(
						"components.BulkImportModal.importPartialFailed",
						"{{failed}} 个游戏导入失败",
						{
							failed: result.failed,
						},
					),
				);
			}
		} catch (error) {
			snackbar.error(getErrorMessage(error));
			for (const { itemIndex } of pendingPayloads) {
				nextItems[itemIndex].status = "error";
			}
		}

		setItems([...nextItems]);
	};

	const handleEditRowSearch = async () => {
		if (!editName) return;

		setGameSelectLoading(true);
		setGameSelectOpen(true);
		try {
			const searchResults = await searchGames({
				query: editName,
				source: editApiSource,
				isIdSearch: editIsIdSearch,
			});
			setGameSelectResults(searchResults);
		} catch (error) {
			snackbar.error(getErrorMessage(error));
			setGameSelectResults([]);
		} finally {
			setGameSelectLoading(false);
		}
	};

	const handleEditRowSelect = (index: number) => {
		const selectedData = gameSelectResults[index];
		if (!selectedData || !editItemPath) return;

		const nextItems = [...items];
		const itemIndex = nextItems.findIndex((item) => item.path === editItemPath);
		if (itemIndex !== -1) {
			nextItems[itemIndex].name = editName;
			nextItems[itemIndex].matchedData = selectedData;
			nextItems[itemIndex].status = "matched";
			setItems(nextItems);
		}

		setGameSelectOpen(false);
		setEditItemPath(null);
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
									{t("components.BulkImportModal.folderName", "文件夹名称")}
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
														disabled={item.status === "imported"}
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
														setEditIsIdSearch(false);
													}}
													disabled={item.status === "imported"}
												>
													<EditIcon fontSize="small" />
												</IconButton>
												<IconButton
													size="small"
													onClick={() => handleDeleteItem(item.path)}
													disabled={item.status === "imported"}
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
						<Button variant="outlined" onClick={onClose} disabled={loading}>
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
				onClose={() => setEditItemPath(null)}
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
								!editIsIdSearch
									? t("components.AddModal.gameName", "游戏名称")
									: t(
											"components.AddModal.gameIDTips",
											"游戏ID(输入BGM、VNDB 或 YMGal ID)",
										)
							}
							value={editName}
							onChange={(event) => setEditName(event.target.value)}
							fullWidth
							size="small"
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									handleEditRowSearch();
								}
							}}
						/>
						<FormControl component="fieldset">
							<RadioGroup
								row
								value={editApiSource}
								onChange={(event) =>
									setEditApiSource(
										event.target.value as "bgm" | "vndb" | "ymgal" | "mixed",
									)
								}
							>
								<FormControlLabel
									value="bgm"
									control={<Radio />}
									label="Bangumi"
								/>
								<FormControlLabel
									value="vndb"
									control={<Radio />}
									label="VNDB"
								/>
								<FormControlLabel
									value="ymgal"
									control={<Radio />}
									label="YMGal"
								/>
								<FormControlLabel
									value="mixed"
									control={<Radio />}
									label="Mixed"
								/>
							</RadioGroup>
						</FormControl>
						<FormControlLabel
							control={
								<Switch
									checked={editIsIdSearch}
									onChange={(event) => {
										setEditIsIdSearch(event.target.checked);
										setEditName("");
									}}
									size="small"
								/>
							}
							label={t("components.AddModal.idSearch", "启用ID搜索模式")}
						/>
					</Stack>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setEditItemPath(null)}>
						{t("components.BulkImportModal.cancel", "取消")}
					</Button>
					<Button onClick={handleEditRowSaveNameOnly}>
						{t("components.BulkImportModal.saveNameOnly", "仅保存名称")}
					</Button>
					<Button
						variant="contained"
						startIcon={<SearchIcon />}
						onClick={handleEditRowSearch}
						disabled={!editName}
					>
						{t("components.BulkImportModal.search", "搜索")}
					</Button>
				</DialogActions>
			</Dialog>

			<GameSelectDialog
				open={gameSelectOpen}
				onClose={() => setGameSelectOpen(false)}
				results={gameSelectResults}
				onSelect={handleEditRowSelect}
				loading={gameSelectLoading}
				apiSource={editApiSource === "mixed" ? "bgm" : editApiSource}
			/>
		</>
	);
};

export default BulkImportTab;
