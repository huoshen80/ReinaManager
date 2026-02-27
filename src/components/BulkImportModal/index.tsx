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
	Switch,
} from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { gameMetadataService } from "@/api";
import GameSelectDialog from "@/components/AddModal/GameSelectDialog";
import { useSettingsResources } from "@/hooks/queries/useSettings";
import { useStore } from "@/store";
import type { FullGameData } from "@/types";
import { handleGetFolder } from "@/utils/index";

interface ScanResult {
	name: string;
	path: string;
	executables: string[];
}

interface ImportItem extends ScanResult {
	status: "pending" | "matched" | "imported" | "error" | "not found";
	matchedData?: FullGameData;
	selectedExe?: string;
}

const BulkImportModal = () => {
	const { t } = useTranslation();
	const { bgmToken } = useSettingsResources();
	const { bulkImportModalOpen, closeBulkImportModal, addGame } = useStore();

	const [loading, setLoading] = useState(false);
	const [rootPath, setRootPath] = useState("");
	const [items, setItems] = useState<ImportItem[]>([]);

	const [editItemPath, setEditItemPath] = useState<string | null>(null);
	const [editName, setEditName] = useState<string>("");
	const [editApiSource, setEditApiSource] = useState<
		"bgm" | "vndb" | "ymgal" | "mixed"
	>("bgm");
	const [editIsIdSearch, setEditIsIdSearch] = useState(false);

	const [gameSelectOpen, setGameSelectOpen] = useState(false);
	const [gameSelectResults, setGameSelectResults] = useState<FullGameData[]>(
		[],
	);
	const [gameSelectLoading, setGameSelectLoading] = useState(false);

	const handleReset = () => {
		setRootPath("");
		setItems([]);
		closeBulkImportModal();
	};

	const scanFolder = async () => {
		const result = await handleGetFolder();
		if (!result) return;
		setRootPath(result);
		setLoading(true);
		try {
			const subdirs = await invoke<ScanResult[]>("scan_directory_for_games", {
				path: result,
			});
			setItems(
				subdirs.map((dir) => ({
					...dir,
					status: "pending",
					selectedExe:
						dir.executables.length > 0 ? dir.executables[0] : undefined,
				})),
			);
		} catch (error) {
			console.error("Failed to scan directory", error);
		} finally {
			setLoading(false);
		}
	};

	const handleMatchMetadata = async () => {
		setLoading(true);
		const newItems = [...items];
		for (let i = 0; i < newItems.length; i++) {
			if (newItems[i].status !== "pending") continue;
			try {
				const searchResults = await gameMetadataService.searchGames({
					query: newItems[i].name,
					source: "bgm",
					bgmToken,
				});
				if (searchResults && searchResults.length > 0) {
					newItems[i].matchedData = searchResults[0];
					newItems[i].status = "matched";
				} else {
					newItems[i].status = "not found";
				}
			} catch (err) {
				console.error("Match failed for", newItems[i].name, err);
				newItems[i].status = "not found";
			}
			setItems([...newItems]);
			// Add a small delay for API rate limits if necessary
			await new Promise((resolve) => setTimeout(resolve, 300));
		}
		setLoading(false);
	};

	const handleImportAll = async () => {
		setLoading(true);
		const newItems = [...items];

		for (let i = 0; i < newItems.length; i++) {
			if (newItems[i].status === "imported") continue;

			try {
				let id_type = "custom";
				let custom_data: Record<string, unknown> | undefined = {
					name: newItems[i].name,
				};
				let bgm_id: string | undefined;
				let bgm_data: FullGameData["bgm_data"] | undefined;

				if (newItems[i].status === "matched" && newItems[i].matchedData) {
					id_type = "bgm";
					bgm_id = newItems[i].matchedData?.bgm_id;
					bgm_data = newItems[i].matchedData?.bgm_data;
					custom_data = undefined;
				}

				await addGame({
					id_type,
					bgm_id,
					bgm_data: bgm_data === null ? undefined : bgm_data,
					custom_data,
					localpath: newItems[i].selectedExe
						? `${newItems[i].path}\\${newItems[i].selectedExe}`
						: newItems[i].path,
				});
				newItems[i].status = "imported";
			} catch (err) {
				console.error("Failed to import game", err);
				newItems[i].status = "error";
			}
			setItems([...newItems]);
		}
		setLoading(false);
	};

	const handleEditRowSearch = async () => {
		if (!editName) return;
		setGameSelectLoading(true);
		setGameSelectOpen(true);
		try {
			const searchResults = await gameMetadataService.searchGames({
				query: editName,
				source: editApiSource === "mixed" ? undefined : editApiSource,
				bgmToken,
				isIdSearch: editIsIdSearch,
			});
			setGameSelectResults(searchResults);
		} catch (err) {
			console.error("Manual search failed for", editName, err);
			setGameSelectResults([]);
		} finally {
			setGameSelectLoading(false);
		}
	};

	const handleEditRowSelect = (index: number) => {
		const selectedData = gameSelectResults[index];
		if (!selectedData || !editItemPath) return;

		const newItems = [...items];
		const itemIndex = newItems.findIndex((i) => i.path === editItemPath);
		if (itemIndex !== -1) {
			newItems[itemIndex].name = editName;
			newItems[itemIndex].matchedData = selectedData;
			newItems[itemIndex].status = "matched";
			setItems(newItems);
		}

		setGameSelectOpen(false);
		setEditItemPath(null);
	};

	const handleEditRowSaveNameOnly = () => {
		if (!editItemPath) return;
		const newItems = [...items];
		const itemIndex = newItems.findIndex((i) => i.path === editItemPath);
		if (itemIndex !== -1) {
			newItems[itemIndex].name = editName;
			if (newItems[itemIndex].status === "not found") {
				newItems[itemIndex].status = "pending";
			}
			setItems(newItems);
		}
		setEditItemPath(null);
	};

	return (
		<Dialog
			open={bulkImportModalOpen}
			onClose={loading ? undefined : handleReset}
			maxWidth="md"
			fullWidth
		>
			<DialogTitle>
				{t("components.BulkImportModal.title", "批量导入")}
			</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ mt: 1 }}>
					<Stack direction="row" spacing={2} alignItems="center">
						<Button
							variant="contained"
							startIcon={<FolderOpenIcon />}
							onClick={scanFolder}
							disabled={loading}
						>
							{t("components.BulkImportModal.selectRootFolder", "选择根文件夹")}
						</Button>
						<Typography variant="body2" sx={{ flexGrow: 1 }} noWrap>
							{rootPath ||
								t(
									"components.BulkImportModal.noFolderSelected",
									"未选择文件夹",
								)}
						</Typography>
					</Stack>

					<TableContainer sx={{ maxHeight: 400 }}>
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
											{t(
												"components.BulkImportModal.noGamesFound",
												"未找到游戏",
											)}
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
												title={
													item.matchedData
														? item.matchedData.bgm_data?.name_cn ||
															item.matchedData.bgm_data?.name ||
															""
														: ""
												}
											>
												{item.matchedData
													? item.matchedData.bgm_data?.name_cn ||
														item.matchedData.bgm_data?.name
													: "-"}
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
												{item.executables.length > 0 ? (
													<FormControl size="small" fullWidth>
														<Select
															value={item.selectedExe || ""}
															onChange={(e) => {
																const newItems = [...items];
																const index = newItems.findIndex(
																	(i) => i.path === item.path,
																);
																if (index !== -1) {
																	newItems[index].selectedExe = e.target.value;
																	setItems(newItems);
																}
															}}
															displayEmpty
															disabled={item.status === "imported"}
															renderValue={(selected) => {
																if (!selected) {
																	return (
																		<Typography
																			variant="body2"
																			color="text.secondary"
																			noWrap
																		>
																			{t(
																				"components.BulkImportModal.selectExe",
																				"请选择启动程序",
																			)}
																		</Typography>
																	);
																}
																return (
																	<Typography
																		variant="body2"
																		noWrap
																		sx={{ maxWidth: "100%" }}
																	>
																		{selected}
																	</Typography>
																);
															}}
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
												) : (
													<Typography variant="body2" color="text.secondary">
														{t(
															"components.BulkImportModal.noExeFound",
															"未找到",
														)}
													</Typography>
												)}
											</TableCell>
											<TableCell align="center">
												<IconButton
													size="small"
													onClick={() => {
														setEditItemPath(item.path);
														setEditName(item.name);
														setEditApiSource("bgm");
														setEditIsIdSearch(false);
													}}
													disabled={item.status === "imported"}
												>
													<EditIcon fontSize="small" />
												</IconButton>
											</TableCell>
										</TableRow>
									))
								)}
							</TableBody>
						</Table>
					</TableContainer>
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button onClick={handleReset} disabled={loading}>
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
			</DialogActions>

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
									: t("components.AddModal.gameIDTips", "游戏 ID")
							}
							value={editName}
							onChange={(e) => setEditName(e.target.value)}
							fullWidth
							size="small"
							onKeyDown={(e) => {
								if (e.key === "Enter") {
									handleEditRowSearch();
								}
							}}
						/>
						<FormControl component="fieldset">
							<RadioGroup
								row
								value={editApiSource}
								onChange={(e) => setEditApiSource(e.target.value as any)}
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
									label="混合"
								/>
							</RadioGroup>
						</FormControl>
						<FormControlLabel
							control={
								<Switch
									checked={editIsIdSearch}
									onChange={(e) => {
										setEditIsIdSearch(e.target.checked);
										setEditName("");
									}}
									size="small"
								/>
							}
							label={t("components.AddModal.searchById", "通过 ID 搜索")}
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
		</Dialog>
	);
};

export default BulkImportModal;
