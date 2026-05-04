import BookmarkAddIcon from "@mui/icons-material/BookmarkAdd";
import ClearIcon from "@mui/icons-material/Clear";
import DeleteIcon from "@mui/icons-material/Delete";
import LibraryAddCheckIcon from "@mui/icons-material/LibraryAddCheck";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertConfirmBox } from "@/components/AlertBox";
import { CollectionPickerDialog } from "@/components/Collection";
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

	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);

	const isCollectionCategory = typeof categoryId === "number" && categoryId > 0;

	const gameIdSet = useMemo(() => new Set(gameIds), [gameIds]);
	const selectedVisibleGameIds = useMemo(
		() => selectedBatchGameIds.filter((id) => gameIdSet.has(id)),
		[selectedBatchGameIds, gameIdSet],
	);
	const selectedCount = selectedVisibleGameIds.length;
	const isMutating = deleteGamesMutation.isPending;

	const handleSelectAll = () => {
		onSelectionChange(gameIds);
	};

	const handleDeleteGames = async () => {
		if (selectedCount === 0) return;

		try {
			await deleteGamesMutation.mutateAsync(selectedVisibleGameIds);
			onDeleteSuccess();
			handleBatchModeChange(false, onBatchModeChange, onSelectionClear);
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

	const handleRemoveFromCategory = async () => {
		if (!isCollectionCategory || selectedCount === 0) return;

		try {
			await onRemoveFromCategory(selectedVisibleGameIds);
			handleBatchModeChange(false, onBatchModeChange, onSelectionClear);
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
									onClick={() => setCollectionDialogOpen(true)}
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

			<CollectionPickerDialog
				open={collectionDialogOpen}
				mode="add"
				gameIds={selectedVisibleGameIds}
				onClose={() => setCollectionDialogOpen(false)}
				onSaved={() =>
					handleBatchModeChange(false, onBatchModeChange, onSelectionClear)
				}
			/>
		</>
	);
};
