import BookmarkAddIcon from "@mui/icons-material/BookmarkAdd";
import CollectionsBookmarkIcon from "@mui/icons-material/CollectionsBookmark";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
	useAddGamesToCategories,
	useCategories,
	useGameCategoryIds,
	useGroups,
	useSetGameCategories,
} from "@/hooks/queries/useCollections";
import { snackbar } from "@/providers/snackBar";

interface CollectionPickerDialogProps {
	open: boolean;
	mode: "add" | "manage";
	gameIds: number[];
	onClose: () => void;
	onSaved?: () => void;
}

function toggleId(ids: number[], targetId: number): number[] {
	return ids.includes(targetId)
		? ids.filter((id) => id !== targetId)
		: [...ids, targetId];
}

export function CollectionPickerDialog({
	open,
	mode,
	gameIds,
	onClose,
	onSaved,
}: CollectionPickerDialogProps) {
	const { t } = useTranslation();
	const groupsQuery = useGroups();
	const addGamesToCategoriesMutation = useAddGamesToCategories();
	const setGameCategoriesMutation = useSetGameCategories();
	const manageGameId = mode === "manage" ? (gameIds[0] ?? null) : null;
	const gameCategoryIdsQuery = useGameCategoryIds(manageGameId);

	const [selectedGroupId, setSelectedGroupId] = useState("");
	const [selectedCategoryIds, setSelectedCategoryIds] = useState<number[]>([]);

	const categoriesQuery = useCategories(selectedGroupId || null);
	const originalCategoryIds = useMemo(
		() => gameCategoryIdsQuery.data ?? [],
		[gameCategoryIdsQuery.data],
	);
	const selectedCategoryIdSet = useMemo(
		() => new Set(selectedCategoryIds),
		[selectedCategoryIds],
	);
	const isSaving =
		addGamesToCategoriesMutation.isPending ||
		setGameCategoriesMutation.isPending;
	const isManageLoading = mode === "manage" && gameCategoryIdsQuery.isLoading;
	const canSave =
		gameIds.length > 0 &&
		(mode === "manage" || selectedCategoryIds.length > 0) &&
		!isSaving &&
		!isManageLoading;

	useEffect(() => {
		if (!open) return;

		const firstGroup = groupsQuery.data?.[0];
		if (firstGroup && !selectedGroupId) {
			setSelectedGroupId(firstGroup.id.toString());
		}
	}, [groupsQuery.data, open, selectedGroupId]);

	useEffect(() => {
		if (!open) return;

		if (mode === "add") {
			setSelectedCategoryIds([]);
			return;
		}

		if (!gameCategoryIdsQuery.isLoading) {
			setSelectedCategoryIds(originalCategoryIds);
		}
	}, [gameCategoryIdsQuery.isLoading, mode, open, originalCategoryIds]);

	const handleClose = () => {
		if (!isSaving) {
			onClose();
		}
	};

	const handleSubmit = async () => {
		if (!canSave) return;

		try {
			if (mode === "add") {
				await addGamesToCategoriesMutation.mutateAsync({
					gameIds,
					categoryIds: selectedCategoryIds,
				});
				snackbar.success(
					t("components.CollectionPicker.addSuccess", {
						count: gameIds.length,
						defaultValue: `已添加 ${gameIds.length} 个游戏到收藏夹`,
					}),
				);
			} else if (manageGameId) {
				await setGameCategoriesMutation.mutateAsync({
					gameId: manageGameId,
					categoryIds: selectedCategoryIds,
				});
				snackbar.success(
					t("components.CollectionPicker.manageSuccess", {
						defaultValue: "收藏夹已更新",
					}),
				);
			}

			onSaved?.();
			onClose();
		} catch (error) {
			console.error("更新收藏夹失败:", error);
			snackbar.error(
				t("components.CollectionPicker.saveFailed", {
					defaultValue: "更新收藏夹失败",
				}),
			);
		}
	};

	const title =
		mode === "add"
			? t("components.CollectionPicker.addTitle", "添加到收藏夹")
			: t("components.CollectionPicker.manageTitle", "管理收藏夹");
	const confirmText =
		mode === "add"
			? t("components.CollectionPicker.add", "添加")
			: t("components.CollectionPicker.save", "保存");

	return (
		<Dialog
			open={open}
			onClose={handleClose}
			closeAfterTransition={false}
			fullWidth
			maxWidth="xs"
			aria-labelledby="collection-picker-dialog-title"
		>
			<DialogTitle id="collection-picker-dialog-title">
				<Stack direction="row" alignItems="center" spacing={1}>
					{mode === "add" ? <BookmarkAddIcon /> : <CollectionsBookmarkIcon />}
					<Typography variant="h6" component="span">
						{title}
					</Typography>
				</Stack>
			</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
					<FormControl fullWidth>
						<InputLabel id="collection-picker-group-label">
							{t("components.CollectionPicker.group", "分组")}
						</InputLabel>
						<Select
							labelId="collection-picker-group-label"
							value={selectedGroupId}
							label={t("components.CollectionPicker.group", "分组")}
							disabled={groupsQuery.isLoading || isSaving}
							onChange={(event: SelectChangeEvent) =>
								setSelectedGroupId(event.target.value)
							}
						>
							{(groupsQuery.data ?? []).map((group) => (
								<MenuItem key={group.id} value={group.id.toString()}>
									{group.name}
								</MenuItem>
							))}
						</Select>
					</FormControl>

					<Box className="min-h-48">
						{categoriesQuery.isLoading || isManageLoading ? (
							<Box className="h-48 flex items-center justify-center">
								<CircularProgress size={24} />
							</Box>
						) : (categoriesQuery.data ?? []).length > 0 ? (
							<List dense disablePadding>
								{(categoriesQuery.data ?? []).map((category) => {
									const checked = selectedCategoryIdSet.has(category.id);

									return (
										<ListItemButton
											key={category.id}
											disabled={isSaving}
											onClick={() =>
												setSelectedCategoryIds((ids) =>
													toggleId(ids, category.id),
												)
											}
										>
											<ListItemIcon>
												<Checkbox
													edge="start"
													checked={checked}
													tabIndex={-1}
												/>
											</ListItemIcon>
											<ListItemText
												primary={category.name}
												secondary={t("components.CollectionPicker.gameCount", {
													count: category.game_count,
													defaultValue: `${category.game_count} 个游戏`,
												})}
											/>
										</ListItemButton>
									);
								})}
							</List>
						) : (
							<Box className="h-48 flex items-center justify-center">
								<Typography variant="body2" color="text.secondary">
									{t("components.CollectionPicker.noCategories", "暂无分类")}
								</Typography>
							</Box>
						)}
					</Box>
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button onClick={handleClose} disabled={isSaving}>
					{t("common.cancel")}
				</Button>
				<Button onClick={handleSubmit} disabled={!canSave}>
					{isSaving ? t("common.saving") : confirmText}
				</Button>
			</DialogActions>
		</Dialog>
	);
}
