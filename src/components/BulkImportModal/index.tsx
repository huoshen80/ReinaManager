import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import SearchIcon from "@mui/icons-material/Search";
import {
	Button,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Stack,
	Table,
	TableBody,
	TableCell,
	TableContainer,
	TableHead,
	TableRow,
	Typography,
} from "@mui/material";
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { gameMetadataService } from "@/api";
import { useSettingsResources } from "@/hooks/queries/useSettings";
import { useStore } from "@/store";
import type { FullGameData } from "@/types";
import { handleGetFolder } from "@/utils/index";

interface ScanResult {
	name: string;
	path: string;
}

interface ImportItem extends ScanResult {
	status: "pending" | "matched" | "imported" | "error";
	matchedData?: FullGameData;
}

const BulkImportModal = () => {
	const { t } = useTranslation();
	const { bgmToken } = useSettingsResources();
	const { bulkImportModalOpen, closeBulkImportModal, addGame } = useStore();

	const [loading, setLoading] = useState(false);
	const [rootPath, setRootPath] = useState("");
	const [items, setItems] = useState<ImportItem[]>([]);

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
				}
			} catch (err) {
				console.error("Match failed for", newItems[i].name, err);
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
					localpath: newItems[i].path,
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
						<Table stickyHeader size="small">
							<TableHead>
								<TableRow>
									<TableCell>
										{t("components.BulkImportModal.folderName", "文件夹名称")}
									</TableCell>
									<TableCell>
										{t("components.BulkImportModal.matchedGame", "匹配的游戏")}
									</TableCell>
									<TableCell>
										{t("components.BulkImportModal.status", "状态")}
									</TableCell>
								</TableRow>
							</TableHead>
							<TableBody>
								{items.length === 0 ? (
									<TableRow>
										<TableCell colSpan={3} align="center">
											{t(
												"components.BulkImportModal.noGamesFound",
												"未找到游戏",
											)}
										</TableCell>
									</TableRow>
								) : (
									items.map((item) => (
										<TableRow key={item.path}>
											<TableCell>{item.name}</TableCell>
											<TableCell>
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
		</Dialog>
	);
};

export default BulkImportModal;
