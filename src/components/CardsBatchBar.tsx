import BookmarkAddIcon from "@mui/icons-material/BookmarkAdd";
import ClearIcon from "@mui/icons-material/Clear";
import DeleteIcon from "@mui/icons-material/Delete";
import LibraryAddCheckIcon from "@mui/icons-material/LibraryAddCheck";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertConfirmBox } from "@/components/AlertBox";
import {
	useCategories,
	useCategoryGameIds,
	useGroups,
	useUpdateCategoryGames,
} from "@/hooks/queries/useCollections";
import { useDeleteGames } from "@/hooks/queries/useGames";
import { snackbar } from "@/providers/snackBar";

function handleBatchModeChange(
	enabled: boolean,
	onBatchModeChange: (enabled: boolean) => void,
	onSelectionClear: () => void,
) {
	onBatchModeChange(enabled);
	if (!enabled) {
		onSelectionClear();
	}
}

interface CardsBatchBarProps {
	batchMode: boolean;
	selectedBatchGameIds: number[];
	gameIds: number[];
	categoryId?: number;
	onBatchModeChange: (enabled: boolean) => void;
	onSelectionChange: (gameIds: number[]) => void;
	onSelectionClear: () => void;
	onDeleteSuccess: () => void;
	onRemoveFromCategory: (gameIds: number[]) => Promise<void>;
}

export const CardsBatchBar: React.FC<CardsBatchBarProps> = ({
	batchMode,
	selectedBatchGameIds,
	gameIds,
	categoryId,
	onBatchModeChange,
	onSelectionChange,
	onSelectionClear,
	onDeleteSuccess,
	onRemoveFromCategory,
}) => {
	const { t } = useTranslation();
	const deleteGamesMutation = useDeleteGames();
	const updateCategoryGamesMutation = useUpdateCategoryGames();
	const groupsQuery = useGroups();

	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
	const [selectedGroupId, setSelectedGroupId] = useState("");
	const [selectedCategoryId, setSelectedCategoryId] = useState("");

	const isCollectionCategory = typeof categoryId === "number" && categoryId > 0;
	const targetCategoryId = selectedCategoryId
		? Number.parseInt(selectedCategoryId, 10)
		: null;
	const targetCategoryGameIdsQuery = useCategoryGameIds(targetCategoryId);
	const categoriesQuery = useCategories(selectedGroupId || null);

	const gameIdSet = useMemo(() => new Set(gameIds), [gameIds]);
	const selectedVisibleGameIds = useMemo(
		() => selectedBatchGameIds.filter((id) => gameIdSet.has(id)),
		[selectedBatchGameIds, gameIdSet],
	);
	const selectedCount = selectedVisibleGameIds.length;
	const isMutating =
		deleteGamesMutation.isPending || updateCategoryGamesMutation.isPending;

	const handleSelectAll = () => {
		onSelectionChange(gameIds);
	};

	const handleDeleteGames = async () => {
		if (selectedCount === 0) return;

		try {
			await deleteGamesMutation.mutateAsync(selectedVisibleGameIds);
			onDeleteSuccess();
			onSelectionClear();
			setDeleteDialogOpen(false);
			snackbar.success(
				t("components.Toolbar.Batch.deleteSuccess", {
					count: selectedCount,
					defaultValue: `已删除 ${selectedCount} 个游戏`,
				}),
			);
		} catch (error) {
			console.error("批量删除游戏失败:", error);
			snackbar.error(
				t("components.Toolbar.Batch.deleteFailed", "批量删除游戏失败"),
			);
		}
	};

	const handleAddToCollection = async () => {
		if (!targetCategoryId || selectedCount === 0) return;

		const categoryGameIds = targetCategoryGameIdsQuery.data ?? [];
		const nextGameIds = Array.from(
			new Set([...categoryGameIds, ...selectedVisibleGameIds]),
		);
		const addedCount = nextGameIds.length - categoryGameIds.length;

		try {
			await updateCategoryGamesMutation.mutateAsync({
				categoryId: targetCategoryId,
				gameIds: nextGameIds,
			});
			setCollectionDialogOpen(false);
			onSelectionClear();
			snackbar.success(
				t("components.Toolbar.Batch.addToCollectionSuccess", {
					count: addedCount,
					defaultValue: `已添加 ${addedCount} 个游戏到收藏夹`,
				}),
			);
		} catch (error) {
			console.error("批量添加到收藏夹失败:", error);
			snackbar.error(
				t("components.Toolbar.Batch.addToCollectionFailed", "添加到收藏夹失败"),
			);
		}
	};

	const handleRemoveFromCategory = async () => {
		if (!isCollectionCategory || selectedCount === 0) return;

		try {
			await onRemoveFromCategory(selectedVisibleGameIds);
			onSelectionClear();
			snackbar.success(
				t("components.Toolbar.Batch.removeFromCategorySuccess", {
					count: selectedCount,
					defaultValue: `已从当前分类移除 ${selectedCount} 个游戏`,
				}),
			);
		} catch (error) {
			console.error("批量移出分类失败:", error);
			snackbar.error(
				t("components.Toolbar.Batch.removeFromCategoryFailed", "移出分类失败"),
			);
		}
	};

	return (
		<>
			<Box className="min-h-12 flex flex-wrap items-center justify-between gap-2">
				<Box className="flex items-center gap-1">
					<Typography variant="body2">
						{t("components.Toolbar.Batch.start", "批量操作")}
					</Typography>
					<Switch
						checked={batchMode}
						onChange={(event) =>
							handleBatchModeChange(
								event.target.checked,
								onBatchModeChange,
								onSelectionClear,
							)
						}
						slotProps={{
							input: {
								"aria-label": t("components.Toolbar.Batch.start", "批量操作"),
							},
						}}
					/>
					{batchMode && (
						<>
							<Button
								startIcon={<LibraryAddCheckIcon />}
								onClick={handleSelectAll}
								disabled={gameIds.length === 0 || isMutating}
							>
								{t("components.Toolbar.Batch.selectAll", "全选")}
							</Button>
							<Button
								startIcon={<ClearIcon />}
								onClick={onSelectionClear}
								disabled={selectedCount === 0 || isMutating}
							>
								{t("components.Toolbar.Batch.clearSelection", "清空")}
							</Button>
							<Typography variant="body2" color="text.secondary">
								{t("components.Toolbar.Batch.selectedCount", {
									count: selectedCount,
									defaultValue: `已选 ${selectedCount}`,
								})}
							</Typography>
						</>
					)}
				</Box>

				{batchMode && (
					<Box className="flex items-center gap-1">
						{isCollectionCategory ? (
							<>
								<Button
									startIcon={<RemoveCircleOutlineIcon />}
									onClick={handleRemoveFromCategory}
									disabled={selectedCount === 0 || isMutating}
								>
									{t(
										"components.Toolbar.Batch.removeFromCategory",
										"移出当前分类",
									)}
								</Button>
								<Button
									startIcon={<DeleteIcon />}
									color="error"
									onClick={() => setDeleteDialogOpen(true)}
									disabled={selectedCount === 0 || isMutating}
								>
									{t("components.Toolbar.Batch.deleteSelected", "删除所选游戏")}
								</Button>
							</>
						) : (
							<>
								<Button
									startIcon={<DeleteIcon />}
									color="error"
									onClick={() => setDeleteDialogOpen(true)}
									disabled={selectedCount === 0 || isMutating}
								>
									{t("components.Toolbar.Batch.deleteSelected", "删除所选游戏")}
								</Button>
								<Button
									startIcon={<BookmarkAddIcon />}
									onClick={() => {
										setSelectedGroupId("");
										setSelectedCategoryId("");
										setCollectionDialogOpen(true);
									}}
									disabled={selectedCount === 0 || isMutating}
								>
									{t(
										"components.Toolbar.Batch.addToCollection",
										"添加到收藏夹",
									)}
								</Button>
							</>
						)}
					</Box>
				)}
			</Box>

			<AlertConfirmBox
				open={deleteDialogOpen}
				setOpen={setDeleteDialogOpen}
				onConfirm={handleDeleteGames}
				isLoading={deleteGamesMutation.isPending}
				title={t("components.Toolbar.Batch.deleteTitle", "批量删除游戏")}
				message={t("components.Toolbar.Batch.deleteMessage", {
					count: selectedCount,
					defaultValue: `确定要删除选中的 ${selectedCount} 个游戏吗？此操作无法撤销。`,
				})}
			/>

			<Dialog
				open={collectionDialogOpen}
				onClose={() => setCollectionDialogOpen(false)}
				closeAfterTransition={false}
				aria-labelledby="batch-collection-dialog-title"
			>
				<DialogTitle id="batch-collection-dialog-title">
					{t("components.Toolbar.Batch.addToCollection", "添加到收藏夹")}
				</DialogTitle>
				<DialogContent>
					<Stack spacing={2} sx={{ pt: 1, minWidth: 280 }}>
						<FormControl fullWidth>
							<InputLabel id="batch-group-label">
								{t("components.Toolbar.Batch.group", "分组")}
							</InputLabel>
							<Select
								labelId="batch-group-label"
								value={selectedGroupId}
								label={t("components.Toolbar.Batch.group", "分组")}
								disabled={groupsQuery.isLoading}
								onChange={(event: SelectChangeEvent) => {
									setSelectedGroupId(event.target.value);
									setSelectedCategoryId("");
								}}
							>
								{(groupsQuery.data ?? []).map((group) => (
									<MenuItem key={group.id} value={group.id.toString()}>
										{group.name}
									</MenuItem>
								))}
							</Select>
						</FormControl>

						<FormControl fullWidth disabled={!selectedGroupId}>
							<InputLabel id="batch-category-label">
								{t("components.Toolbar.Batch.category", "分类")}
							</InputLabel>
							<Select
								labelId="batch-category-label"
								value={selectedCategoryId}
								label={t("components.Toolbar.Batch.category", "分类")}
								disabled={!selectedGroupId || categoriesQuery.isLoading}
								onChange={(event: SelectChangeEvent) =>
									setSelectedCategoryId(event.target.value)
								}
							>
								{(categoriesQuery.data ?? []).map((category) => (
									<MenuItem key={category.id} value={category.id.toString()}>
										{category.name}
									</MenuItem>
								))}
							</Select>
						</FormControl>
					</Stack>
				</DialogContent>
				<DialogActions>
					<Button
						onClick={() => setCollectionDialogOpen(false)}
						disabled={updateCategoryGamesMutation.isPending}
					>
						{t("common.cancel")}
					</Button>
					<Button
						onClick={handleAddToCollection}
						disabled={
							!targetCategoryId ||
							selectedCount === 0 ||
							targetCategoryGameIdsQuery.isLoading ||
							updateCategoryGamesMutation.isPending
						}
					>
						{updateCategoryGamesMutation.isPending
							? t("common.saving")
							: t("common.confirm")}
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
};
