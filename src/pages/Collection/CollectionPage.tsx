/**
 * @file Collection 页面
 * @description 分组分类管理页面，显示分组下的所有分类及其游戏数量，以及分类详情页面
 * @module src/pages/Collection/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

import Box from "@mui/material/Box";
import { useDeferredValue, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { ManageGamesDialog } from "@/components/Collection";
import { InputDialog } from "@/components/InputDialog";
import { CollectionRightMenu } from "@/components/RightMenu";
import { useScrollRestore } from "@/hooks/common/useScrollRestore";
import { useVirtualCategories } from "@/hooks/features/collections/useVirtualCollections";
import { useGameIndex } from "@/hooks/features/games/useGameListFacade";
import {
	useCategories,
	useCategoryGames,
	useGroupsWithCount,
} from "@/hooks/queries/useCollections";
import { useStore } from "@/store/appStore";
import {
	type Category as CategoryType,
	DefaultGroup,
} from "@/types/collection";
import {
	CollectionBreadcrumbs,
	type CollectionLevel,
} from "./CollectionBreadcrumbs";
import {
	CollectionCategoryView,
	CollectionGroupView,
} from "./CollectionEntityViews";
import { CollectionGamesView } from "./CollectionGamesView";
import {
	matchesCollectionSearch,
	normalizeCollectionSearch,
	sortCollectionEntityNames,
	sortDeveloperCategories,
} from "./collectionEntity";
import { useCollectionEntityActions } from "./useCollectionEntityActions";
import { useCollectionNavigation } from "./useCollectionNavigation";

export const Collection: React.FC = () => {
	const { i18n, t } = useTranslation();
	useScrollRestore("/collection");
	const {
		currentGroupId,
		setSelectedCategory,
		setCurrentGroup,
		selectedCategory,
		entitySortField,
		entitySortOrder,
		developerSortField,
		developerSortOrder,
		groupSearch,
		categorySearch,
		developerSearch,
	} = useStore(
		useShallow((s) => ({
			currentGroupId: s.currentGroupId,
			setSelectedCategory: s.setSelectedCategory,
			setCurrentGroup: s.setCurrentGroup,
			selectedCategory: s.selectedCategory,
			entitySortField: s.collectionEntitySortField,
			entitySortOrder: s.collectionEntitySortOrder,
			developerSortField: s.developerCategorySortField,
			developerSortOrder: s.developerCategorySortOrder,
			groupSearch: s.collectionGroupSearch,
			categorySearch: s.collectionCategorySearch,
			developerSearch: s.developerCategorySearch,
		})),
	);
	const backendEntitySortField =
		entitySortField === "name" ? undefined : entitySortField;
	const backendEntitySortOrder = backendEntitySortField
		? entitySortOrder
		: undefined;
	const gameIndexQuery = useGameIndex();
	const { index: gameIndex } = gameIndexQuery;
	const displayAllGames = gameIndex.displayList;
	const groupsQuery = useGroupsWithCount(
		backendEntitySortField,
		backendEntitySortOrder,
	);
	const groups = groupsQuery.data ?? [];
	const categoriesQuery = useCategories(
		currentGroupId,
		backendEntitySortField,
		backendEntitySortOrder,
	);
	const currentCategories = categoriesQuery.data ?? [];
	const selectedRealCategoryId =
		selectedCategory?.type === "real" ? selectedCategory.id : null;
	const categoryGamesQuery = useCategoryGames(selectedCategory, gameIndex);
	const categoryGames = categoryGamesQuery.data;
	const virtualCategories = useVirtualCategories(gameIndex);
	const deferredGroupSearch = useDeferredValue(groupSearch);
	const deferredCategorySearch = useDeferredValue(categorySearch);
	const deferredDeveloperSearch = useDeferredValue(developerSearch);
	const {
		currentLevelKey,
		handleGroupClick,
		handleCategoryClick,
		handleBreadcrumbClick,
	} = useCollectionNavigation({
		currentGroupId,
		selectedCategory,
		setCurrentGroup,
		setSelectedCategory,
	});
	const {
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
	} = useCollectionEntityActions({
		currentGroupId,
		selectedRealCategoryId,
		setCurrentGroup,
		setSelectedCategory,
	});

	/**
	 * 获取当前分组的名称
	 */
	const getCurrentGroupName = (): string => {
		if (!currentGroupId) return "";

		switch (currentGroupId) {
			case DefaultGroup.DEVELOPER:
				return t("pages.Collection.defaultGroups.developer", "开发商");
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
		if (!selectedCategory) return "";

		if (selectedCategory.type === "developer") {
			return (
				virtualCategories.getVirtualCategoryName(selectedCategory.key) ||
				t("pages.Collection.breadcrumb.unknownCategory", "未知分类")
			);
		}

		// 真实分类，从 currentCategories 中查找
		const category = currentCategories.find(
			(c) => c.id === selectedCategory.id,
		);
		return (
			category?.name ||
			t("pages.Collection.breadcrumb.unknownCategory", "未知分类")
		);
	};

	const currentGroupName = getCurrentGroupName();
	const currentCategoryName = getCurrentCategoryName();

	const showLevel: CollectionLevel =
		currentGroupId && selectedCategory !== null
			? "games"
			: currentGroupId
				? "categories"
				: "groups";
	const isDeveloperCategoryList =
		showLevel === "categories" && currentGroupId === DefaultGroup.DEVELOPER;
	const collator = useMemo(
		() =>
			new Intl.Collator(i18n.resolvedLanguage, {
				numeric: true,
				sensitivity: "base",
			}),
		[i18n.resolvedLanguage],
	);
	const normalizedGroupSearch = normalizeCollectionSearch(
		deferredGroupSearch,
		i18n.resolvedLanguage,
	);
	const normalizedCategorySearch = normalizeCollectionSearch(
		deferredCategorySearch,
		i18n.resolvedLanguage,
	);
	const normalizedDeveloperSearch = normalizeCollectionSearch(
		deferredDeveloperSearch,
		i18n.resolvedLanguage,
	);
	const filteredDeveloperCategories = useMemo(
		() =>
			virtualCategories.developerCategories
				.filter((category) =>
					matchesCollectionSearch(
						category.name,
						normalizedDeveloperSearch,
						i18n.resolvedLanguage,
					),
				)
				.map((category) => ({
					...category,
					stableKey: category.virtualKey ?? category.name,
				})),
		[
			i18n.resolvedLanguage,
			normalizedDeveloperSearch,
			virtualCategories.developerCategories,
		],
	);
	const filteredRealCategories = useMemo(
		() =>
			currentCategories.filter((category) =>
				matchesCollectionSearch(
					category.name,
					normalizedCategorySearch,
					i18n.resolvedLanguage,
				),
			),
		[currentCategories, i18n.resolvedLanguage, normalizedCategorySearch],
	);
	const categories = useMemo((): CategoryType[] => {
		if (currentGroupId === DefaultGroup.DEVELOPER) {
			return sortDeveloperCategories(
				filteredDeveloperCategories,
				developerSortField,
				developerSortOrder,
				collator,
			);
		}

		return entitySortField === "name"
			? sortCollectionEntityNames(
					filteredRealCategories,
					entitySortOrder,
					collator,
				)
			: filteredRealCategories;
	}, [
		collator,
		currentGroupId,
		developerSortField,
		developerSortOrder,
		entitySortField,
		entitySortOrder,
		filteredDeveloperCategories,
		filteredRealCategories,
	]);

	const filteredCustomGroups = useMemo(
		() =>
			groups
				.filter((group) =>
					matchesCollectionSearch(
						group.name,
						normalizedGroupSearch,
						i18n.resolvedLanguage,
					),
				)
				.map((group) => ({
					id: group.id.toString(),
					name: group.name,
					game_count: group.game_count,
				})),
		[groups, i18n.resolvedLanguage, normalizedGroupSearch],
	);
	const customGroups = useMemo(
		() =>
			entitySortField === "name"
				? sortCollectionEntityNames(
						filteredCustomGroups,
						entitySortOrder,
						collator,
					)
				: filteredCustomGroups,
		[collator, entitySortField, entitySortOrder, filteredCustomGroups],
	);
	const developerGroupName = t(
		"pages.Collection.defaultGroups.developer",
		"开发商",
	);
	const showDeveloperGroup = matchesCollectionSearch(
		developerGroupName,
		normalizedGroupSearch,
		i18n.resolvedLanguage,
	);
	const allGroups = [
		...(showDeveloperGroup
			? [
					{
						id: DefaultGroup.DEVELOPER,
						name: developerGroupName,
						game_count: displayAllGames.length,
					},
				]
			: []),
		...customGroups,
	];

	return (
		<Box sx={{ p: 3, pt: 0 }}>
			<CollectionBreadcrumbs
				level={showLevel}
				groupName={currentGroupName}
				categoryName={currentCategoryName}
				onNavigate={handleBreadcrumbClick}
			/>

			{showLevel === "groups" ? (
				<CollectionGroupView
					groups={allGroups}
					onGroupClick={handleGroupClick}
					onDeleteGroup={handleDeleteGroup}
					onContextMenu={handleGroupContextMenu}
				/>
			) : null}

			{showLevel === "categories" ? (
				isDeveloperCategoryList ? (
					<CollectionCategoryView
						mode="developer"
						categories={categories}
						sourceCount={virtualCategories.developerCategories.length}
						loading={gameIndexQuery.isLoading}
						error={gameIndexQuery.isError ? gameIndexQuery.error : null}
						scrollKey={currentLevelKey}
						onCategoryClick={handleCategoryClick}
						onDeleteCategory={handleDeleteCategory}
						onContextMenu={handleCategoryContextMenu}
					/>
				) : (
					<CollectionCategoryView
						mode="real"
						categories={categories}
						sourceCount={currentCategories.length}
						onCategoryClick={handleCategoryClick}
						onDeleteCategory={handleDeleteCategory}
						onContextMenu={handleCategoryContextMenu}
					/>
				)
			) : null}

			{showLevel === "games" ? (
				<CollectionGamesView
					realCategoryId={selectedRealCategoryId}
					gameIds={categoryGames}
					displayById={gameIndex.displayById}
					loading={categoryGamesQuery.isLoading}
					error={categoryGamesQuery.isError ? categoryGamesQuery.error : null}
					scrollRestoreKey={currentLevelKey}
				/>
			) : null}

			{/* 统一的右键菜单 */}
			{menuPosition && (
				<CollectionRightMenu
					anchorPosition={{
						top: menuPosition.mouseY,
						left: menuPosition.mouseX,
					}}
					onClose={() => setMenuPosition(null)}
					target={
						menuPosition.type === "group"
							? { type: "group", id: menuPosition.id }
							: { type: "category", id: menuPosition.id }
					}
					onOpenRename={handleOpenRenameDialog}
					onOpenManageGames={handleOpenManageGamesDialog}
				/>
			)}

			{/* 重命名对话框 */}
			{selectedItem && (
				<InputDialog
					open={renameDialogOpen}
					onClose={() => setRenameDialogOpen(false)}
					onConfirm={handleRenameConfirm}
					title={
						selectedItem.type === "group"
							? t(
									"components.RightMenu.Collection.renameGroupTitle",
									"重命名分组",
								)
							: t(
									"components.RightMenu.Collection.renameCategoryTitle",
									"重命名分类",
								)
					}
					label={
						selectedItem.type === "group"
							? t("components.RightMenu.Collection.newGroupName", "新分组名称")
							: t(
									"components.RightMenu.Collection.newCategoryName",
									"新分类名称",
								)
					}
					placeholder={selectedItem.name}
				/>
			)}

			{/* 管理游戏对话框 */}
			{selectedItem && selectedItem.type === "category" && (
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
