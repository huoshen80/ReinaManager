/**
 * @file Collection 页面
 * @description 分组分类管理页面，显示分组下的所有分类及其游戏数量，以及分类详情页面
 * @module src/pages/Collection/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

import FolderIcon from "@mui/icons-material/Folder";
import HomeIcon from "@mui/icons-material/Home";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import Cards from "@/components/Cards";
import { ManageGamesDialog } from "@/components/Collection";
import { EntityCard } from "@/components/Collection/EntityCard";
import { InputDialog } from "@/components/CommonDialog";
import { CollectionRightMenu } from "@/components/RightMenu";
import { snackbar } from "@/components/Snackbar";
import { useScrollRestore } from "@/hooks/common/useScrollRestore";
import { useVirtualCategories } from "@/hooks/common/useVirtualCollections";
import { useAllGameListFacade } from "@/hooks/features/games/useGameListFacade";
import {
	useCategories,
	useCategoryGames,
	useDeleteCategory,
	useDeleteGroup,
	useGroupGameCounts,
	useGroups,
	useRenameCategory,
	useRenameGroup,
} from "@/hooks/queries/useCollections";
import { useStore } from "@/store";
import type { Category as CategoryType } from "@/types/collection";
import { DefaultGroup } from "@/types/collection";

// 原本的 GroupCard/CategoryCard 已被通用 EntityCard 取代

export const Collection: React.FC = () => {
	const { t } = useTranslation();
	useScrollRestore("/collection");
	const {
		currentGroupId,
		setSelectedCategory,
		setCurrentGroup,
		selectedCategoryId,
		selectedCategoryName,
		nsfwFilter,
	} = useStore(
		useShallow((s) => ({
			currentGroupId: s.currentGroupId,
			setSelectedCategory: s.setSelectedCategory,
			setCurrentGroup: s.setCurrentGroup,
			selectedCategoryId: s.selectedCategoryId,
			selectedCategoryName: s.selectedCategoryName,
			nsfwFilter: s.nsfwFilter,
		})),
	);
	const displayAllGames = useAllGameListFacade();
	const groupsQuery = useGroups();
	const groups = groupsQuery.data ?? [];
	const categoriesQuery = useCategories(currentGroupId);
	const currentCategories = categoriesQuery.data ?? [];
	const categoryGamesQuery = useCategoryGames(
		selectedCategoryId,
		selectedCategoryName,
		displayAllGames,
		nsfwFilter,
	);
	const categoryGames = categoryGamesQuery.data;
	const groupIds = groups.map((group) => group.id);
	const groupGameCountsQuery = useGroupGameCounts(groupIds);
	const deleteCategoryMutation = useDeleteCategory();
	const deleteGroupMutation = useDeleteGroup();
	const renameGroupMutation = useRenameGroup();
	const renameCategoryMutation = useRenameCategory();

	// 使用统一的虚拟分类 Hook
	const virtualCategories = useVirtualCategories(displayAllGames);

	// 存储每个分组的游戏数量
	const [groupGameCounts, setGroupGameCounts] = useState<Map<string, number>>(
		new Map(),
	);

	// 统一的右键菜单状态管理
	const [menuPosition, setMenuPosition] = useState<{
		mouseX: number;
		mouseY: number;
		type: "group" | "category";
		id: string | number;
		name: string;
	} | null>(null);

	// 对话框状态（提升到父组件，避免右键菜单重新渲染时丢失）
	const [renameDialogOpen, setRenameDialogOpen] = useState(false);
	const [manageGamesDialogOpen, setManageGamesDialogOpen] = useState(false);
	const [selectedItem, setSelectedItem] = useState<{
		type: "group" | "category";
		id: string | number;
		name: string;
	} | null>(null);

	// 当在分组列表页时，计算所有分组的游戏数量
	useEffect(() => {
		if (!currentGroupId && !selectedCategoryId) {
			const counts = new Map<string, number>();
			counts.set(DefaultGroup.DEVELOPER, displayAllGames.length);
			counts.set(DefaultGroup.PLAY_STATUS, displayAllGames.length);

			for (const [groupId, count] of Object.entries(
				groupGameCountsQuery.data ?? {},
			)) {
				counts.set(groupId, count);
			}

			setGroupGameCounts(counts);
		}
	}, [
		currentGroupId,
		selectedCategoryId,
		displayAllGames.length,
		groupGameCountsQuery.data,
	]);

	/**
	 * 处理分组点击事件 - 设置当前分组
	 */
	const handleGroupClick = (groupIdToNavigate: string) => {
		setCurrentGroup(groupIdToNavigate);
	};

	/**
	 * 处理分类点击事件 - 设置当前分类
	 */
	const handleCategoryClick = (category: CategoryType) => {
		if (!currentGroupId) return;

		// 对于虚拟分类，需要设置分类名称
		if (virtualCategories.isVirtual(category.id)) {
			setSelectedCategory(category.id, category.name);
		} else {
			// 真实分类，直接设置 ID
			setSelectedCategory(category.id);
		}
	};

	/**
	 * 处理删除分类
	 */
	const handleDeleteCategory = async (categoryIdToDelete: number) => {
		try {
			await deleteCategoryMutation.mutateAsync({
				categoryId: categoryIdToDelete,
				groupId: currentGroupId,
			});
			if (selectedCategoryId === categoryIdToDelete) {
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

	/**
	 * 处理删除分组
	 */
	const handleDeleteGroup = async (groupId: string) => {
		try {
			// 默认分组不能删除
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

	/**
	 * 处理分组右键菜单
	 */
	const handleGroupContextMenu = (
		e: React.MouseEvent,
		groupId: string,
		groupName: string,
	) => {
		setMenuPosition({
			mouseX: e.clientX,
			mouseY: e.clientY,
			type: "group",
			id: groupId,
			name: groupName,
		});
		setSelectedItem({
			type: "group",
			id: groupId,
			name: groupName,
		});
	};

	/**
	 * 处理分类右键菜单
	 */
	const handleCategoryContextMenu = (
		e: React.MouseEvent,
		categoryId: number,
		categoryName: string,
	) => {
		setMenuPosition({
			mouseX: e.clientX,
			mouseY: e.clientY,
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

	/**
	 * 处理打开重命名对话框
	 */
	const handleOpenRenameDialog = () => {
		setMenuPosition(null); // 关闭右键菜单
		setRenameDialogOpen(true);
	};

	/**
	 * 处理打开管理游戏对话框
	 */
	const handleOpenManageGamesDialog = async () => {
		if (!selectedItem || selectedItem.type !== "category") return;

		setMenuPosition(null); // 关闭右键菜单

		setManageGamesDialogOpen(true);
	};

	/**
	 * 处理重命名确认
	 */
	const handleRenameConfirm = async (newName: string) => {
		if (!selectedItem || !newName.trim()) return;

		try {
			if (selectedItem.type === "group") {
				const groupId = Number.parseInt(selectedItem.id as string, 10);
				if (Number.isNaN(groupId)) return;
				await renameGroupMutation.mutateAsync({ groupId, newName });
			} else {
				const categoryId = selectedItem.id as number;
				await renameCategoryMutation.mutateAsync({ categoryId, newName });
			}
		} catch (error) {
			console.error("重命名失败:", error);
		}
	};

	/**
	 * 处理面包屑导航点击
	 */
	const handleBreadcrumbClick = (level: "root" | "group") => {
		if (level === "root") {
			// 返回分组选择页面 - 清除所有选择
			setCurrentGroup(null);
			setSelectedCategory(null);
		} else if (level === "group") {
			// 返回分类列表页面 - 清除分类选择
			setSelectedCategory(null);
		}
	};

	/**
	 * 获取当前分组的名称
	 */
	const getCurrentGroupName = (): string => {
		if (!currentGroupId) return "";

		switch (currentGroupId) {
			case DefaultGroup.DEVELOPER:
				return t("pages.Collection.defaultGroups.developer");
			case DefaultGroup.PLAY_STATUS:
				return t("pages.Collection.defaultGroups.playStatus");
			default: {
				// 自定义分组，从 groups 中查找
				const group = groups.find((g) => g.id.toString() === currentGroupId);
				return group?.name || "";
			}
		}
	};

	/**
	 * 获取当前分类的名称
	 * 根据分类ID从不同来源获取名称
	 */
	const getCurrentCategoryName = (): string => {
		if (selectedCategoryId === null) return "";

		// 尝试从虚拟分类获取
		const virtualName = virtualCategories.getVirtualCategoryName(
			selectedCategoryId,
			selectedCategoryName,
		);
		if (virtualName) return virtualName;

		// 真实分类，从 currentCategories 中查找
		const category = currentCategories.find((c) => c.id === selectedCategoryId);
		return category?.name || t("pages.Collection.breadcrumb.unknownCategory");
	};

	/**
	 * 获取当前显示的分类列表
	 */
	const getDisplayCategories = (): CategoryType[] => {
		if (!currentGroupId) return [];
		return virtualCategories.getCategoriesByGroupId(
			currentGroupId,
			currentCategories,
		);
	};

	const categories = getDisplayCategories();
	const currentGroupName = getCurrentGroupName();
	const currentCategoryName = getCurrentCategoryName();

	// 统一返回单一结构，根据状态判断显示的内容
	// showLevel: "groups" | "categories" | "games"
	const showLevel: "groups" | "categories" | "games" =
		currentGroupId && selectedCategoryId !== null
			? "games"
			: currentGroupId
				? "categories"
				: "groups";

	// 准备默认分组和自定义分组
	const defaultGroups = [
		{
			id: DefaultGroup.DEVELOPER,
			name: t("pages.Collection.defaultGroups.developer"),
		},
		{
			id: DefaultGroup.PLAY_STATUS,
			name: t("pages.Collection.defaultGroups.playStatus"),
		},
	];

	const customGroups = groups.map((g) => ({
		id: g.id.toString(),
		name: g.name,
	}));

	const allGroups = [...defaultGroups, ...customGroups];

	return (
		<Box sx={{ p: 3, pt: 0 }}>
			{/* 面包屑导航或标题 */}
			<Box
				className="sticky top-0 z-10 pt-4 mb-2"
				sx={{ backgroundColor: "background.paper", borderColor: "divider" }}
			>
				{showLevel === "groups" ? (
					<Typography variant="h4">
						{t("pages.Collection.breadcrumb.group")}
					</Typography>
				) : showLevel === "categories" ? (
					<Breadcrumbs
						separator={<NavigateNextIcon fontSize="small" />}
						aria-label="breadcrumb"
					>
						<Link
							underline="hover"
							className="flex items-center cursor-pointer"
							sx={{
								color: "inherit",
								"&:hover": { color: "primary.dark" },
							}}
							onClick={() => handleBreadcrumbClick("root")}
						>
							<HomeIcon className="mr-1" sx={{ fontSize: "inherit" }} />
							{t("pages.Collection.breadcrumb.group")}
						</Link>
						<Typography
							className="flex items-center font-600"
							sx={{ color: "text.primary" }}
						>
							<FolderIcon className="mr-1" sx={{ fontSize: "inherit" }} />
							{currentGroupName}
						</Typography>
					</Breadcrumbs>
				) : (
					<Breadcrumbs
						separator={<NavigateNextIcon fontSize="small" />}
						aria-label="breadcrumb"
					>
						<Link
							underline="hover"
							className="flex items-center cursor-pointer"
							sx={{
								color: "inherit",
								"&:hover": { color: "primary.dark" },
							}}
							onClick={() => handleBreadcrumbClick("root")}
						>
							<HomeIcon className="mr-1" sx={{ fontSize: "inherit" }} />
							{t("pages.Collection.breadcrumb.group")}
						</Link>
						<Link
							underline="hover"
							className="flex items-center cursor-pointer"
							sx={{
								color: "inherit",
								"&:hover": { color: "primary.dark" },
							}}
							onClick={() => handleBreadcrumbClick("group")}
						>
							<FolderIcon className="mr-1" sx={{ fontSize: "inherit" }} />
							{currentGroupName}
						</Link>
						<Typography
							className="flex items-center font-600"
							sx={{ color: "text.primary" }}
						>
							{currentCategoryName}
						</Typography>
					</Breadcrumbs>
				)}
			</Box>

			{/* 主内容区域 */}
			{showLevel === "groups" && (
				<Box
					sx={{
						display: "grid",
						gridTemplateColumns: {
							xs: "repeat(1, 1fr)",
							sm: "repeat(2, 1fr)",
							md: "repeat(3, 1fr)",
							lg: "repeat(4, 1fr)",
						},
						gap: 2,
					}}
				>
					{allGroups.map((group) => {
						const isDefault = group.id.startsWith("default_");
						return (
							<EntityCard
								key={group.id}
								entity={{
									id: group.id,
									name: group.name,
									count: groupGameCounts.get(group.id) || 0,
								}}
								onClick={() => handleGroupClick(group.id)}
								onDelete={
									isDefault
										? undefined
										: (id) => handleDeleteGroup(id as string)
								}
								onContextMenu={(e, id, name) => {
									if (!isDefault) handleGroupContextMenu(e, id as string, name);
								}}
								showDelete={!isDefault}
								deleteTitle={t("pages.Collection.deleteGroupTitle")}
								deleteMessage={t("pages.Collection.deleteGroupMessage", {
									name: group.name,
								})}
								countLabel={t("pages.Collection.gamesCount")}
							/>
						);
					})}
				</Box>
			)}

			{showLevel === "categories" &&
				(categories.length === 0 ? (
					<Box
						sx={{
							display: "flex",
							justifyContent: "center",
							alignItems: "center",
							minHeight: "400px",
						}}
					>
						<Typography variant="h6" color="text.secondary">
							{t("pages.Collection.noCategoriesHint")}
						</Typography>
					</Box>
				) : (
					<Box
						sx={{
							display: "grid",
							gridTemplateColumns: {
								xs: "repeat(1, 1fr)",
								sm: "repeat(2, 1fr)",
								md: "repeat(3, 1fr)",
								lg: "repeat(4, 1fr)",
							},
							gap: 2,
						}}
					>
						{categories.map((category) => {
							const isVirtual = virtualCategories.isVirtual(category.id);
							return (
								<EntityCard
									key={category.id}
									entity={{
										id: category.id,
										name: category.name,
										count: category.game_count,
									}}
									onClick={() => handleCategoryClick(category)}
									onDelete={
										isVirtual
											? undefined
											: (id) => handleDeleteCategory(id as number)
									}
									onContextMenu={(e, id, name) => {
										if (!isVirtual)
											handleCategoryContextMenu(e, id as number, name);
									}}
									showDelete={!isVirtual}
									deleteTitle={t("pages.Collection.deleteCategoryTitle")}
									deleteMessage={t("pages.Collection.deleteCategoryMessage", {
										name: category.name,
									})}
									countLabel={t("pages.Collection.gamesCount")}
								/>
							);
						})}
					</Box>
				))}

			{showLevel === "games" && (
				<Cards
					gamesData={categoryGames}
					categoryId={
						selectedCategoryId !== null && selectedCategoryId > 0
							? selectedCategoryId
							: undefined
					}
				/>
			)}

			{/* 统一的右键菜单 */}
			<CollectionRightMenu
				isopen={Boolean(menuPosition)}
				anchorPosition={
					menuPosition
						? { top: menuPosition.mouseY, left: menuPosition.mouseX }
						: undefined
				}
				setAnchorEl={() => setMenuPosition(null)}
				type={menuPosition?.type || "group"}
				id={menuPosition?.id || null}
				onOpenRename={handleOpenRenameDialog}
				onOpenManageGames={handleOpenManageGamesDialog}
			/>

			{/* 重命名对话框 */}
			{selectedItem && (
				<InputDialog
					open={renameDialogOpen}
					onClose={() => setRenameDialogOpen(false)}
					onConfirm={handleRenameConfirm}
					title={
						selectedItem.type === "group"
							? t("components.RightMenu.Collection.renameGroupTitle")
							: t("components.RightMenu.Collection.renameCategoryTitle")
					}
					label={
						selectedItem.type === "group"
							? t("components.RightMenu.Collection.newGroupName")
							: t("components.RightMenu.Collection.newCategoryName")
					}
					placeholder={selectedItem.name}
				/>
			)}

			{/* 管理游戏对话框 */}
			{selectedItem &&
				selectedItem.type === "category" &&
				typeof selectedItem.id === "number" && (
					<ManageGamesDialog
						open={manageGamesDialogOpen}
						onClose={() => setManageGamesDialogOpen(false)}
						categoryId={selectedItem.id}
						categoryName={selectedItem.name}
					/>
				)}
		</Box>
	);
};
