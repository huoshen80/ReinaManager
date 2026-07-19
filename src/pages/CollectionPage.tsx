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
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { VirtuosoGrid } from "react-virtuoso";
import { useShallow } from "zustand/react/shallow";
import { SortableCardsGrid, VirtualCardsGrid } from "@/components/Cards";
import { ManageGamesDialog } from "@/components/Collection";
import { EntityCard } from "@/components/Collection/EntityCard";
import { GameListStateView } from "@/components/GameListStateView";
import { InputDialog } from "@/components/InputDialog";
import { CollectionRightMenu } from "@/components/RightMenu";
import {
	setScrollPosition,
	useScrollRestore,
	useVirtuosoGridRestore,
} from "@/hooks/common/useScrollRestore";
import { useVirtualCategories } from "@/hooks/common/useVirtualCollections";
import {
	useGameIndex,
	useGameListFacade,
} from "@/hooks/features/games/useGameListFacade";
import {
	useCategories,
	useCategoryGames,
	useDeleteCategory,
	useDeleteGroup,
	useGroupsWithCount,
	useRenameCategory,
	useRenameGroup,
} from "@/hooks/queries/useCollections";
import { snackbar } from "@/providers/snackBar";
import type { SortOrder } from "@/services/invoke";
import { type SelectedCategory, useStore } from "@/store/appStore";
import {
	type Category as CategoryType,
	type CollectionEntitySortField,
	DefaultGroup,
} from "@/types/collection";
import { getUserErrorMessage } from "@/utils/errors";

const SCROLL_CONTAINER_SELECTOR = "main";
const CATEGORY_WIDE_BREAKPOINT = 1200;
const CATEGORY_GRID_TEMPLATE_COLUMNS = {
	md: "repeat(3, 1fr)",
	lg: "repeat(4, 1fr)",
};
interface SortableCollectionEntity {
	id: string | number;
	name: string;
	game_count: number;
	stableKey?: string;
}

function compareCollectionEntityIdentity(
	a: SortableCollectionEntity,
	b: SortableCollectionEntity,
	collator: Intl.Collator,
): number {
	const nameComparison = collator.compare(a.name, b.name);
	if (nameComparison !== 0) return nameComparison;

	return collator.compare(
		a.stableKey ?? String(a.id),
		b.stableKey ?? String(b.id),
	);
}

function sortCollectionEntityNames<T extends SortableCollectionEntity>(
	entities: readonly T[],
	order: SortOrder,
	collator: Intl.Collator,
): T[] {
	return entities.toSorted((a, b) => {
		const comparison = collator.compare(a.name, b.name);
		return comparison === 0
			? collator.compare(
					a.stableKey ?? String(a.id),
					b.stableKey ?? String(b.id),
				)
			: order === "asc"
				? comparison
				: -comparison;
	});
}

function sortDeveloperCategories<T extends SortableCollectionEntity>(
	entities: readonly T[],
	field: CollectionEntitySortField,
	order: SortOrder,
	collator: Intl.Collator,
): T[] {
	if (field !== "game_count") {
		return sortCollectionEntityNames(entities, order, collator);
	}

	return entities.toSorted((a, b) => {
		const comparison = a.game_count - b.game_count;
		return comparison === 0
			? compareCollectionEntityIdentity(a, b, collator)
			: order === "asc"
				? comparison
				: -comparison;
	});
}

function normalizeCollectionSearch(value: string, locale?: string): string {
	return value.trim().toLocaleLowerCase(locale);
}

function matchesCollectionSearch(
	name: string,
	normalizedSearch: string,
	locale?: string,
): boolean {
	return name.toLocaleLowerCase(locale).includes(normalizedSearch);
}

const getScrollContainer = () =>
	document.querySelector<HTMLElement>(SCROLL_CONTAINER_SELECTOR);

function getCategoryColumnCount(): number {
	return window.innerWidth >= CATEGORY_WIDE_BREAKPOINT ? 4 : 3;
}

function useCategoryColumnCount(): number {
	const [columns, setColumns] = useState(() => getCategoryColumnCount());

	useEffect(() => {
		const onResize = () => setColumns(getCategoryColumnCount());
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);

	return columns;
}

type CollectionScrollNavIntent =
	| { type: "forward" }
	| { type: "back"; targetKey: string }
	| null;

type CollectionMenuPosition =
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

type CollectionMenuTarget =
	| { type: "group"; id: string; name: string }
	| { type: "category"; id: number; name: string };

function CollectionEmptyState({ message }: { message: string }) {
	return (
		<Box
			sx={{
				display: "flex",
				justifyContent: "center",
				alignItems: "center",
				minHeight: "400px",
			}}
		>
			<Typography variant="h6" color="text.secondary">
				{message}
			</Typography>
		</Box>
	);
}

interface DeveloperCategoryGridProps {
	categories: CategoryType[];
	columns: number;
	renderCategory: (category: CategoryType) => React.ReactNode;
	scrollKey: string | null;
}

const DEVELOPER_CATEGORY_GRID_ROW_HEIGHT = 112;
const DEVELOPER_CATEGORY_GRID_CLASS =
	"grid gap-4 pb-4 [grid-template-columns:repeat(var(--collection-category-columns),minmax(0,1fr))]";

function DeveloperCategoryGrid({
	categories,
	columns,
	renderCategory,
	scrollKey,
}: DeveloperCategoryGridProps) {
	const { restoreProps, scrollParent, stateChanged, wrapperRef } =
		useVirtuosoGridRestore({
			columns,
			itemCount: categories.length,
			rowHeight: DEVELOPER_CATEGORY_GRID_ROW_HEIGHT,
			scrollKey,
		});

	return (
		<div ref={wrapperRef} className="flex-1 min-h-0">
			{scrollParent && (
				<VirtuosoGrid
					key={scrollKey ?? "developer-categories"}
					customScrollParent={scrollParent}
					data={categories}
					computeItemKey={(index, category) =>
						category
							? `category-${category.virtualKey ?? category.id}`
							: `missing-category-${index}`
					}
					listClassName={DEVELOPER_CATEGORY_GRID_CLASS}
					itemClassName="min-w-0 h-112px"
					increaseViewportBy={{ top: 400, bottom: 800 }}
					stateChanged={stateChanged}
					{...restoreProps}
					style={
						{
							"--collection-category-columns": columns,
						} as React.CSSProperties
					}
					itemContent={(_, category) =>
						category ? renderCategory(category) : null
					}
				/>
			)}
		</div>
	);
}

interface DeveloperGamesViewProps {
	sourceGameIds: number[];
	scrollRestoreKey: string;
}

function DeveloperGamesView({
	sourceGameIds,
	scrollRestoreKey,
}: DeveloperGamesViewProps) {
	const { t } = useTranslation();
	const gameList = useGameListFacade({
		scopeGameIds: sourceGameIds,
		applyNsfwFilter: false,
	});
	const emptyMessage =
		sourceGameIds.length === 0
			? t("pages.Collection.noGamesInCategory", "当前分类下暂无游戏")
			: t("pages.Collection.noMatchingGames", "没有找到符合条件的游戏");

	return (
		<GameListStateView
			loading={gameList.isLoading}
			error={gameList.isError ? gameList.error : null}
			empty={gameList.gameIds.length === 0}
			emptyMessage={emptyMessage}
		>
			<VirtualCardsGrid
				gameIds={gameList.gameIds}
				displayById={gameList.displayById}
				scrollRestoreKey={scrollRestoreKey}
				enableBatchMode
				enableSortFieldOverlay
			/>
		</GameListStateView>
	);
}

// 原本的 GroupCard/CategoryCard 已被通用 EntityCard 取代

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
	const deleteCategoryMutation = useDeleteCategory();
	const deleteGroupMutation = useDeleteGroup();
	const renameGroupMutation = useRenameGroup();
	const renameCategoryMutation = useRenameCategory();

	// 使用统一的虚拟分类 Hook
	const virtualCategories = useVirtualCategories(gameIndex);

	// 统一的右键菜单状态管理
	const [menuPosition, setMenuPosition] =
		useState<CollectionMenuPosition | null>(null);

	// 对话框状态（提升到父组件，避免右键菜单重新渲染时丢失）
	const [renameDialogOpen, setRenameDialogOpen] = useState(false);
	const [manageGamesDialogOpen, setManageGamesDialogOpen] = useState(false);
	const deferredGroupSearch = useDeferredValue(groupSearch);
	const deferredCategorySearch = useDeferredValue(categorySearch);
	const deferredDeveloperSearch = useDeferredValue(developerSearch);
	const [selectedItem, setSelectedItem] = useState<CollectionMenuTarget | null>(
		null,
	);
	const levelScrollMapRef = useRef<Record<string, number>>({});
	const navIntentRef = useRef<CollectionScrollNavIntent>(null);

	const getLevelKey = (
		groupId: string | null,
		category: SelectedCategory,
	): string => {
		if (!groupId) return "groups";
		if (!category) return `categories:${groupId}`;
		if (category.type === "real") return `games:${groupId}:real:${category.id}`;
		return `games:${groupId}:developer:${category.key}`;
	};

	const saveCurrentLevelScroll = () => {
		if (currentGroupId === DefaultGroup.DEVELOPER) return;
		const container = getScrollContainer();
		if (!container) return;
		const currentKey = getLevelKey(currentGroupId, selectedCategory);
		levelScrollMapRef.current[currentKey] = container.scrollTop;
	};

	/**
	 * 处理分组点击事件 - 设置当前分组
	 */
	const handleGroupClick = (groupIdToNavigate: string) => {
		saveCurrentLevelScroll();
		navIntentRef.current = { type: "forward" };
		if (groupIdToNavigate === DefaultGroup.DEVELOPER) {
			const nextLevelKey = getLevelKey(groupIdToNavigate, null);
			setScrollPosition(nextLevelKey, 0);
		}
		setCurrentGroup(groupIdToNavigate);
	};

	/**
	 * 处理分类点击事件 - 设置当前分类
	 */
	const handleCategoryClick = (category: CategoryType) => {
		if (!currentGroupId) return;

		saveCurrentLevelScroll();
		navIntentRef.current = { type: "forward" };

		if (virtualCategories.isVirtual(category.id)) {
			const nextCategory: SelectedCategory = {
				type: "developer",
				key: category.virtualKey ?? category.name,
			};
			setScrollPosition(getLevelKey(currentGroupId, nextCategory), 0);
			setSelectedCategory(nextCategory);
		} else {
			setSelectedCategory({ type: "real", id: category.id });
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
			if (selectedRealCategoryId === categoryIdToDelete) {
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
		if (selectedItem?.type !== "category") return;

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

	/**
	 * 处理面包屑导航点击
	 */
	const handleBreadcrumbClick = (level: "root" | "group") => {
		saveCurrentLevelScroll();

		if (level === "root") {
			navIntentRef.current = { type: "back", targetKey: "groups" };
			// 返回分组选择页面 - 清除所有选择
			setCurrentGroup(null);
			setSelectedCategory(null);
		} else if (level === "group") {
			if (!currentGroupId) return;
			navIntentRef.current = {
				type: "back",
				targetKey: `categories:${currentGroupId}`,
			};
			// 返回分类列表页面 - 清除分类选择
			setSelectedCategory(null);
		}
	};

	const currentLevelKey = getLevelKey(currentGroupId, selectedCategory);

	useEffect(() => {
		const intent = navIntentRef.current;
		if (!intent || !currentLevelKey) return;

		if (currentGroupId === DefaultGroup.DEVELOPER) {
			navIntentRef.current = null;
			return;
		}

		const container = getScrollContainer();
		if (!container) {
			navIntentRef.current = null;
			return;
		}

		if (intent.type === "forward") {
			container.scrollTop = 0;
		} else {
			container.scrollTop = levelScrollMapRef.current[intent.targetKey] ?? 0;
		}

		navIntentRef.current = null;
	}, [currentLevelKey, currentGroupId]);

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

	// 统一返回单一结构，根据状态判断显示的内容
	// showLevel: "groups" | "categories" | "games"
	const showLevel: "groups" | "categories" | "games" =
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
	const categoryColumns = useCategoryColumnCount();
	const categoryScrollRestoreKey = isDeveloperCategoryList
		? currentLevelKey
		: null;

	const renderCategoryCard = (category: CategoryType) => {
		const isVirtual = virtualCategories.isVirtual(category.id);
		return (
			<EntityCard
				key={category.virtualKey ?? category.id}
				entity={{
					id: category.id,
					name: category.name,
					count: category.game_count,
				}}
				title={category.name}
				fillHeight={isVirtual}
				titleNoWrap={isVirtual}
				onClick={() => handleCategoryClick(category)}
				onDelete={
					isVirtual ? undefined : (id) => handleDeleteCategory(id as number)
				}
				onContextMenu={(e, id, name) => {
					if (!isVirtual) handleCategoryContextMenu(e, id as number, name);
				}}
				showDelete={!isVirtual}
				deleteTitle={t("pages.Collection.deleteCategoryTitle", "删除分类")}
				deleteMessage={t(
					"pages.Collection.deleteCategoryMessage",
					'确定要删除分类 "{{name}}" 吗？此操作将移除该分类与所有游戏的关联，但不会删除游戏本身。',
					{
						name: category.name,
					},
				)}
				countLabel={t("pages.Collection.gamesCount", "个游戏")}
			/>
		);
	};

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
			{/* 面包屑导航或标题 */}
			<Box
				className="sticky top-0 z-10 pt-4 mb-2"
				sx={{ backgroundColor: "background.default", borderColor: "divider" }}
			>
				{showLevel === "groups" ? (
					<Typography variant="h4">
						{t("pages.Collection.breadcrumb.group", "分组")}
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
							{t("pages.Collection.breadcrumb.group", "分组")}
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
							{t("pages.Collection.breadcrumb.group", "分组")}
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
			{showLevel === "groups" &&
				(allGroups.length === 0 ? (
					<CollectionEmptyState
						message={t(
							"pages.Collection.entitySearch.noGroups",
							"没有找到匹配的分组",
						)}
					/>
				) : (
					<Box
						sx={{
							display: "grid",
							gridTemplateColumns: CATEGORY_GRID_TEMPLATE_COLUMNS,
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
										count: group.game_count,
									}}
									onClick={() => handleGroupClick(group.id)}
									onDelete={
										isDefault
											? undefined
											: (id) => handleDeleteGroup(id as string)
									}
									onContextMenu={(e, id, name) => {
										if (!isDefault)
											handleGroupContextMenu(e, id as string, name);
									}}
									showDelete={!isDefault}
									deleteTitle={t(
										"pages.Collection.deleteGroupTitle",
										"删除分组",
									)}
									deleteMessage={t(
										"pages.Collection.deleteGroupMessage",
										'确定要删除分组 "{{name}}" 吗？此操作将同时删除该分组下的所有分类，且无法恢复。',
										{
											name: group.name,
										},
									)}
									countLabel={t("pages.Collection.gamesCount", "个游戏")}
								/>
							);
						})}
					</Box>
				))}

			{showLevel === "categories" &&
				(isDeveloperCategoryList ? (
					<GameListStateView
						loading={gameIndexQuery.isLoading}
						error={gameIndexQuery.isError ? gameIndexQuery.error : null}
						empty={categories.length === 0}
						emptyMessage={
							virtualCategories.developerCategories.length === 0
								? t("pages.Collection.noCategoriesHint", "当前分组下没有分类")
								: t(
										"pages.Collection.developerSearch.noResults",
										"没有找到匹配的开发商",
									)
						}
					>
						<DeveloperCategoryGrid
							categories={categories}
							columns={categoryColumns}
							renderCategory={renderCategoryCard}
							scrollKey={categoryScrollRestoreKey}
						/>
					</GameListStateView>
				) : categories.length === 0 ? (
					<CollectionEmptyState
						message={
							currentCategories.length === 0
								? t("pages.Collection.noCategoriesHint", "当前分组下没有分类")
								: t(
										"pages.Collection.entitySearch.noCategories",
										"没有找到匹配的分类",
									)
						}
					/>
				) : (
					<Box
						sx={{
							display: "grid",
							gridTemplateColumns: CATEGORY_GRID_TEMPLATE_COLUMNS,
							gap: 2,
						}}
					>
						{categories.map(renderCategoryCard)}
					</Box>
				))}

			{showLevel === "games" &&
				(selectedRealCategoryId !== null ? (
					<GameListStateView
						loading={categoryGamesQuery.isLoading}
						error={categoryGamesQuery.isError ? categoryGamesQuery.error : null}
						empty={categoryGames.length === 0}
						emptyMessage={t(
							"pages.Collection.noGamesInCategory",
							"当前分类下暂无游戏",
						)}
					>
						<SortableCardsGrid
							gameIds={categoryGames}
							displayById={gameIndex.displayById}
							categoryId={selectedRealCategoryId}
						/>
					</GameListStateView>
				) : (
					<DeveloperGamesView
						sourceGameIds={categoryGames}
						scrollRestoreKey={currentLevelKey}
					/>
				))}

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
