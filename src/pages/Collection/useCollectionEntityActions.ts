import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
	useDeleteCategory,
	useDeleteGroup,
	useRenameCategory,
	useRenameGroup,
} from "@/hooks/queries/useCollections";
import { snackbar } from "@/providers/snackBar";
import type { SelectedCategory } from "@/store/appStore";
import { getUserErrorMessage } from "@/utils/errors";

export type CollectionMenuPosition =
	| {
			mouseX: number;
			mouseY: number;
			type: "group";
			id: string;
			name: string;
	  }
	| {
			mouseX: number;
			mouseY: number;
			type: "category";
			id: number;
			name: string;
	  };

export type CollectionMenuTarget =
	| { type: "group"; id: string; name: string }
	| { type: "category"; id: number; name: string };

interface UseCollectionEntityActionsOptions {
	currentGroupId: string | null;
	selectedRealCategoryId: number | null;
	setCurrentGroup: (groupId: string | null) => void;
	setSelectedCategory: (category: SelectedCategory) => void;
}

export function useCollectionEntityActions({
	currentGroupId,
	selectedRealCategoryId,
	setCurrentGroup,
	setSelectedCategory,
}: UseCollectionEntityActionsOptions) {
	const { t } = useTranslation();
	const deleteCategoryMutation = useDeleteCategory();
	const deleteGroupMutation = useDeleteGroup();
	const renameGroupMutation = useRenameGroup();
	const renameCategoryMutation = useRenameCategory();
	const [menuPosition, setMenuPosition] =
		useState<CollectionMenuPosition | null>(null);
	const [selectedItem, setSelectedItem] = useState<CollectionMenuTarget | null>(
		null,
	);
	const [renameDialogOpen, setRenameDialogOpen] = useState(false);
	const [manageGamesDialogOpen, setManageGamesDialogOpen] = useState(false);

	const handleDeleteCategory = async (categoryId: number) => {
		try {
			await deleteCategoryMutation.mutateAsync({
				categoryId,
				groupId: currentGroupId,
			});
			if (selectedRealCategoryId === categoryId) {
				setSelectedCategory(null);
			}
			snackbar.success(
				t("pages.Collection.success.categoryDeleted", {
					defaultValue: "已删除分类",
				}),
			);
		} catch (error) {
			console.error("删除分类失败:", error);
			snackbar.error(
				t("pages.Collection.errors.deleteCategoryFailed", {
					defaultValue: "删除分类失败，请重试",
				}),
			);
		}
	};

	const handleDeleteGroup = async (groupId: string) => {
		try {
			if (groupId.startsWith("default_")) {
				snackbar.warning(
					t("pages.Collection.errors.cannotDeleteDefaultGroup", {
						defaultValue: "默认分组不能删除",
					}),
				);
				return;
			}
			await deleteGroupMutation.mutateAsync(Number.parseInt(groupId, 10));
			if (currentGroupId === groupId) {
				setCurrentGroup(null);
				setSelectedCategory(null);
			}
			snackbar.success(
				t("pages.Collection.success.groupDeleted", {
					defaultValue: "已删除分组",
				}),
			);
		} catch (error) {
			console.error("删除分组失败:", error);
			snackbar.error(
				t("pages.Collection.errors.deleteGroupFailed", {
					defaultValue: "删除分组失败，请重试",
				}),
			);
		}
	};

	const handleGroupContextMenu = (
		event: React.MouseEvent,
		groupId: string,
		groupName: string,
	) => {
		setMenuPosition({
			mouseX: event.clientX,
			mouseY: event.clientY,
			type: "group",
			id: groupId,
			name: groupName,
		});
		setSelectedItem({ type: "group", id: groupId, name: groupName });
	};

	const handleCategoryContextMenu = (
		event: React.MouseEvent,
		categoryId: number,
		categoryName: string,
	) => {
		setMenuPosition({
			mouseX: event.clientX,
			mouseY: event.clientY,
			type: "category",
			id: categoryId,
			name: categoryName,
		});
		setSelectedItem({
			type: "category",
			id: categoryId,
			name: categoryName,
		});
	};

	const handleOpenRenameDialog = () => {
		setMenuPosition(null);
		setRenameDialogOpen(true);
	};

	const handleOpenManageGamesDialog = () => {
		if (selectedItem?.type !== "category") return;
		setMenuPosition(null);
		setManageGamesDialogOpen(true);
	};

	const handleRenameConfirm = async (newName: string) => {
		if (!selectedItem || !newName.trim()) return;

		try {
			if (selectedItem.type === "group") {
				const groupId = Number.parseInt(selectedItem.id, 10);
				if (Number.isNaN(groupId)) return;
				await renameGroupMutation.mutateAsync({ groupId, newName });
			} else {
				await renameCategoryMutation.mutateAsync({
					categoryId: selectedItem.id,
					newName,
				});
			}
		} catch (error) {
			snackbar.error(
				t("pages.Collection.errors.renameFailed", {
					defaultValue: "重命名失败：{{error}}",
					error: getUserErrorMessage(error, t),
				}),
			);
		}
	};

	return {
		menuPosition,
		setMenuPosition,
		selectedItem,
		renameDialogOpen,
		setRenameDialogOpen,
		manageGamesDialogOpen,
		setManageGamesDialogOpen,
		handleDeleteCategory,
		handleDeleteGroup,
		handleGroupContextMenu,
		handleCategoryContextMenu,
		handleOpenRenameDialog,
		handleOpenManageGamesDialog,
		handleRenameConfirm,
	};
}
