import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";
import {
	Box,
	ButtonBase,
	CircularProgress,
	FormControl,
	IconButton,
	MenuItem,
	Select,
	Stack,
	Typography,
} from "@mui/material";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Virtuoso } from "react-virtuoso";
import {
	getCandidateSourceData,
	getRuntimeSourceAdapter,
	SEARCHABLE_SOURCE_KEYS,
} from "@/metadata";
import type { GameLaunchType, GameMetadataDraft } from "@/types";

export interface BulkImportItem {
	key: string;
	name: string;
	path?: string;
	executables: string[];
	status: "pending" | "matched" | "imported" | "error" | "not found";
	matchedData?: GameMetadataDraft;
	selectedExe?: string;
	launch_type?: GameLaunchType;
	steam_launch_id?: string;
}

export type VisibleBulkImportItem = BulkImportItem & {
	status: Exclude<BulkImportItem["status"], "imported">;
};

interface BulkImportResultTableProps {
	items: VisibleBulkImportItem[];
	loading: boolean;
	emptyMessage: string;
	onDeleteItem: (key: string) => void;
	onEditItem: (item: VisibleBulkImportItem) => void;
	onExecutableChange: (key: string, executable: string) => void;
	onOpenDirectory: (path: string) => void;
}

const gridTemplateColumns =
	"minmax(180px, 2fr) minmax(180px, 2fr) 96px minmax(220px, 2.3fr) 88px";

const gridSx = {
	display: "grid",
	gridTemplateColumns,
	columnGap: 2,
	alignItems: "center",
	width: "100%",
	minWidth: 0,
} as const;

const cellSx = {
	minWidth: 0,
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
} as const;

function getMatchedGameName(
	gameData: GameMetadataDraft | undefined,
	language: string,
): string | undefined {
	if (!gameData) {
		return undefined;
	}

	const useChineseName = language === "zh-CN";
	let fallbackName: string | undefined;

	for (const source of SEARCHABLE_SOURCE_KEYS) {
		const adapter = getRuntimeSourceAdapter(source);
		const data = getCandidateSourceData(gameData, source);
		if (!data) continue;

		const display = adapter.toDisplayFields(data);
		if (useChineseName && display.name_cn) {
			return display.name_cn;
		}

		if (display.name) {
			if (!useChineseName) return display.name;
			fallbackName ??= display.name;
		}
	}

	return fallbackName;
}

function getStatusLabel(
	status: VisibleBulkImportItem["status"],
	t: TFunction,
): string {
	switch (status) {
		case "pending":
			return t("components.BulkImportModal.statusPending", "待处理");
		case "matched":
			return t("components.BulkImportModal.statusMatched", "已匹配");
		case "not found":
			return t("components.BulkImportModal.statusNotFound", "未找到");
		case "error":
			return t("components.BulkImportModal.statusError", "错误");
	}
}

export default function BulkImportResultTable({
	items,
	loading,
	emptyMessage,
	onDeleteItem,
	onEditItem,
	onExecutableChange,
	onOpenDirectory,
}: BulkImportResultTableProps) {
	const { t, i18n } = useTranslation();

	return (
		<Box
			sx={{
				alignSelf: "stretch",
				display: "flex",
				flex: "1 1 auto",
				flexDirection: "column",
				minHeight: 0,
				width: "100%",
			}}
		>
			<Box
				sx={{
					...gridSx,
					borderBottom: 1,
					borderColor: "divider",
					color: "text.primary",
					flexShrink: 0,
					fontWeight: 600,
				}}
				className="px-4 py-1.5"
			>
				<Typography variant="subtitle2" sx={cellSx}>
					{t("components.BulkImportModal.searchName", "搜索名称")}
				</Typography>
				<Typography variant="subtitle2" sx={cellSx}>
					{t("components.BulkImportModal.matchedGame", "匹配的游戏")}
				</Typography>
				<Typography variant="subtitle2" sx={cellSx}>
					{t("components.BulkImportModal.status", "状态")}
				</Typography>
				<Typography variant="subtitle2" sx={cellSx}>
					{t("components.BulkImportModal.executable", "启动程序")}
				</Typography>
				<Typography variant="subtitle2" align="center" sx={cellSx}>
					{t("components.BulkImportModal.actions", "操作")}
				</Typography>
			</Box>

			{items.length === 0 ? (
				<Box
					sx={{
						alignItems: "center",
						display: "flex",
						flex: "1 1 auto",
						justifyContent: "center",
						minHeight: 120,
					}}
				>
					{loading ? (
						<Stack spacing={1.5} alignItems="center">
							<CircularProgress size={28} />
							<Typography color="text.secondary">{emptyMessage}</Typography>
						</Stack>
					) : (
						<Typography color="text.secondary">{emptyMessage}</Typography>
					)}
				</Box>
			) : (
				<Box sx={{ flex: "1 1 auto", minHeight: 0, width: "100%" }}>
					<Virtuoso
						style={{ height: "100%", width: "100%" }}
						data={items}
						computeItemKey={(_, item) => item.key}
						overscan={300}
						itemContent={(_, item) => {
							const matchedName = getMatchedGameName(
								item.matchedData,
								i18n.language,
							);
							const directoryPath = item.path;
							return (
								<Box
									sx={{
										...gridSx,
										borderBottom: 1,
										borderColor: "divider",
									}}
									className="min-h-11 px-4 py-0.5"
								>
									{directoryPath ? (
										<ButtonBase
											type="button"
											disableRipple
											onClick={() => onOpenDirectory(directoryPath)}
											aria-label={`${t(
												"components.Toolbar.openGameFolder",
												"打开游戏目录",
											)}: ${item.name}`}
											className="inline-flex w-fit max-w-full min-w-0 justify-self-start items-center justify-start text-left transition-colors duration-200"
											sx={{
												color: "text.primary",
												"&:hover, &.Mui-focusVisible": {
													color: "primary.dark",
												},
												"&:hover .bulk-import-folder-icon, &.Mui-focusVisible .bulk-import-folder-icon":
													{
														opacity: 1,
													},
											}}
										>
											<Typography
												component="span"
												variant="body2"
												className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap"
												title={item.name}
											>
												{item.name}
											</Typography>
											<FolderOpenRoundedIcon
												className="bulk-import-folder-icon ml-1 shrink-0 opacity-0 transition-opacity duration-200"
												fontSize="small"
											/>
										</ButtonBase>
									) : (
										<Typography variant="body2" sx={cellSx} title={item.name}>
											{item.name}
										</Typography>
									)}
									<Typography variant="body2" sx={cellSx} title={matchedName}>
										{matchedName ?? "-"}
									</Typography>
									<Typography variant="body2" sx={cellSx}>
										{getStatusLabel(item.status, t)}
									</Typography>
									<Box sx={{ minWidth: 0 }}>
										{item.launch_type === "steam" ? (
											<Typography variant="body2" noWrap title={item.path}>
												Steam · {item.steam_launch_id}
												{item.selectedExe ? ` · ${item.selectedExe}` : ""}
											</Typography>
										) : item.executables.length === 0 ? (
											<Typography variant="body2" color="text.secondary">
												{t(
													"components.BulkImportModal.gameDirectory",
													"游戏目录",
												)}
											</Typography>
										) : item.executables.length === 1 ? (
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
													size="small"
													onChange={(event) =>
														onExecutableChange(item.key, event.target.value)
													}
													displayEmpty
													disabled={loading}
													sx={{
														"& .MuiSelect-select": {
															py: 0.75,
														},
													}}
													renderValue={(selected) => (
														<Typography
															variant="body2"
															noWrap
															color={selected ? undefined : "text.secondary"}
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
									</Box>
									<Stack direction="row" justifyContent="center">
										<IconButton
											size="small"
											onClick={() => onEditItem(item)}
											disabled={loading}
										>
											<EditIcon fontSize="small" />
										</IconButton>
										<IconButton
											size="small"
											onClick={() => onDeleteItem(item.key)}
											disabled={loading}
										>
											<DeleteIcon fontSize="small" />
										</IconButton>
									</Stack>
								</Box>
							);
						}}
					/>
				</Box>
			)}
		</Box>
	);
}
