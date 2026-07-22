import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import {
	type CSSProperties,
	type MouseEvent,
	useEffect,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { VirtuosoGrid } from "react-virtuoso";
import { GameListStateView } from "@/components/GameListStateView";
import { useVirtuosoGridRestore } from "@/hooks/common/useScrollRestore";
import { isVirtualCategory } from "@/hooks/features/collections/useVirtualCollections";
import type { Category } from "@/types/collection";
import { EntityCard } from "./EntityCard";

const CATEGORY_WIDE_BREAKPOINT = 1200;
const CATEGORY_GRID_TEMPLATE_COLUMNS = {
	md: "repeat(3, 1fr)",
	lg: "repeat(4, 1fr)",
};
const DEVELOPER_CATEGORY_GRID_ROW_HEIGHT = 112;
const DEVELOPER_CATEGORY_GRID_CLASS =
	"grid gap-4 pb-4 [grid-template-columns:repeat(var(--collection-category-columns),minmax(0,1fr))]";

export interface CollectionGroupListItem {
	id: string;
	name: string;
	game_count: number;
}

interface CollectionGroupViewProps {
	groups: CollectionGroupListItem[];
	onGroupClick: (groupId: string) => void;
	onDeleteGroup: (groupId: string) => void;
	onContextMenu: (
		event: MouseEvent,
		groupId: string,
		groupName: string,
	) => void;
}

interface BaseCategoryViewProps {
	categories: Category[];
	sourceCount: number;
	onCategoryClick: (category: Category) => void;
	onDeleteCategory: (categoryId: number) => void;
	onContextMenu: (
		event: MouseEvent,
		categoryId: number,
		categoryName: string,
	) => void;
}

type CollectionCategoryViewProps = BaseCategoryViewProps &
	(
		| {
				mode: "developer";
				loading: boolean;
				error: unknown;
				scrollKey: string;
		  }
		| { mode: "real" }
	);

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

interface DeveloperCategoryGridProps {
	categories: Category[];
	columns: number;
	renderCategory: (category: Category) => React.ReactNode;
	scrollKey: string;
}

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
			{scrollParent ? (
				<VirtuosoGrid
					key={scrollKey}
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
						} as CSSProperties
					}
					itemContent={(_, category) =>
						category ? renderCategory(category) : null
					}
				/>
			) : null}
		</div>
	);
}

export function CollectionGroupView({
	groups,
	onGroupClick,
	onDeleteGroup,
	onContextMenu,
}: CollectionGroupViewProps) {
	const { t } = useTranslation();

	if (groups.length === 0) {
		return (
			<CollectionEmptyState
				message={t(
					"pages.Collection.entitySearch.noGroups",
					"没有找到匹配的分组",
				)}
			/>
		);
	}

	return (
		<Box
			sx={{
				display: "grid",
				gridTemplateColumns: CATEGORY_GRID_TEMPLATE_COLUMNS,
				gap: 2,
			}}
		>
			{groups.map((group) => {
				const isDefault = group.id.startsWith("default_");
				return (
					<EntityCard
						key={group.id}
						entity={{
							id: group.id,
							name: group.name,
							count: group.game_count,
						}}
						onClick={() => onGroupClick(group.id)}
						onDelete={
							isDefault ? undefined : (id) => onDeleteGroup(id as string)
						}
						onContextMenu={(event, id, name) => {
							if (!isDefault) onContextMenu(event, id as string, name);
						}}
						showDelete={!isDefault}
						deleteTitle={t("pages.Collection.deleteGroupTitle", "删除分组")}
						deleteMessage={t(
							"pages.Collection.deleteGroupMessage",
							'确定要删除分组 "{{name}}" 吗？此操作将同时删除该分组下的所有分类，且无法恢复。',
							{ name: group.name },
						)}
						countLabel={t("pages.Collection.gamesCount", "个游戏")}
					/>
				);
			})}
		</Box>
	);
}

function CategoryCard({
	category,
	onCategoryClick,
	onDeleteCategory,
	onContextMenu,
}: Pick<
	BaseCategoryViewProps,
	"onCategoryClick" | "onDeleteCategory" | "onContextMenu"
> & { category: Category }) {
	const { t } = useTranslation();
	const isVirtual = isVirtualCategory(category.id);

	return (
		<EntityCard
			entity={{
				id: category.id,
				name: category.name,
				count: category.game_count,
			}}
			title={category.name}
			fillHeight={isVirtual}
			titleNoWrap={isVirtual}
			onClick={() => onCategoryClick(category)}
			onDelete={isVirtual ? undefined : (id) => onDeleteCategory(id as number)}
			onContextMenu={(event, id, name) => {
				if (!isVirtual) onContextMenu(event, id as number, name);
			}}
			showDelete={!isVirtual}
			deleteTitle={t("pages.Collection.deleteCategoryTitle", "删除分类")}
			deleteMessage={t(
				"pages.Collection.deleteCategoryMessage",
				'确定要删除分类 "{{name}}" 吗？此操作将移除该分类与所有游戏的关联，但不会删除游戏本身。',
				{ name: category.name },
			)}
			countLabel={t("pages.Collection.gamesCount", "个游戏")}
		/>
	);
}

function DeveloperCategoryView(
	props: Extract<CollectionCategoryViewProps, { mode: "developer" }>,
) {
	const { t } = useTranslation();
	const columns = useCategoryColumnCount();
	const renderCategory = (category: Category) => (
		<CategoryCard
			category={category}
			onCategoryClick={props.onCategoryClick}
			onDeleteCategory={props.onDeleteCategory}
			onContextMenu={props.onContextMenu}
		/>
	);

	return (
		<GameListStateView
			loading={props.loading}
			error={props.error}
			empty={props.categories.length === 0}
			emptyMessage={
				props.sourceCount === 0
					? t("pages.Collection.noCategoriesHint", "当前分组下没有分类")
					: t(
							"pages.Collection.developerSearch.noResults",
							"没有找到匹配的开发商",
						)
			}
		>
			<DeveloperCategoryGrid
				categories={props.categories}
				columns={columns}
				renderCategory={renderCategory}
				scrollKey={props.scrollKey}
			/>
		</GameListStateView>
	);
}

export function CollectionCategoryView(props: CollectionCategoryViewProps) {
	const { t } = useTranslation();

	if (props.mode === "developer") {
		return <DeveloperCategoryView {...props} />;
	}

	if (props.categories.length === 0) {
		return (
			<CollectionEmptyState
				message={
					props.sourceCount === 0
						? t("pages.Collection.noCategoriesHint", "当前分组下没有分类")
						: t(
								"pages.Collection.entitySearch.noCategories",
								"没有找到匹配的分类",
							)
				}
			/>
		);
	}

	return (
		<Box
			sx={{
				display: "grid",
				gridTemplateColumns: CATEGORY_GRID_TEMPLATE_COLUMNS,
				gap: 2,
			}}
		>
			{props.categories.map((category) => (
				<CategoryCard
					key={category.id}
					category={category}
					onCategoryClick={props.onCategoryClick}
					onDeleteCategory={props.onDeleteCategory}
					onContextMenu={props.onContextMenu}
				/>
			))}
		</Box>
	);
}
