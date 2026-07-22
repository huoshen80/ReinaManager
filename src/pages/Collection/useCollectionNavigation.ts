import { useCallback, useEffect, useRef } from "react";
import { setScrollPosition } from "@/hooks/common/useScrollRestore";
import { isVirtualCategory } from "@/hooks/features/collections/useVirtualCollections";
import type { SelectedCategory } from "@/store/appStore";
import { type Category, DefaultGroup } from "@/types/collection";

const SCROLL_CONTAINER_SELECTOR = "main";

type CollectionScrollNavIntent =
	| { type: "forward" }
	| { type: "back"; targetKey: string }
	| null;

interface UseCollectionNavigationOptions {
	currentGroupId: string | null;
	selectedCategory: SelectedCategory;
	setCurrentGroup: (groupId: string | null) => void;
	setSelectedCategory: (category: SelectedCategory) => void;
}

function getScrollContainer() {
	return document.querySelector<HTMLElement>(SCROLL_CONTAINER_SELECTOR);
}

function getCollectionLevelKey(
	groupId: string | null,
	category: SelectedCategory,
): string {
	if (!groupId) return "groups";
	if (!category) return `categories:${groupId}`;
	if (category.type === "real") {
		return `games:${groupId}:real:${category.id}`;
	}
	return `games:${groupId}:developer:${category.key}`;
}

export function useCollectionNavigation({
	currentGroupId,
	selectedCategory,
	setCurrentGroup,
	setSelectedCategory,
}: UseCollectionNavigationOptions) {
	const levelScrollMapRef = useRef<Record<string, number>>({});
	const navIntentRef = useRef<CollectionScrollNavIntent>(null);
	const currentLevelKey = getCollectionLevelKey(
		currentGroupId,
		selectedCategory,
	);

	const saveCurrentLevelScroll = useCallback(() => {
		if (currentGroupId === DefaultGroup.DEVELOPER) return;
		const container = getScrollContainer();
		if (!container) return;
		const currentKey = getCollectionLevelKey(currentGroupId, selectedCategory);
		levelScrollMapRef.current[currentKey] = container.scrollTop;
	}, [currentGroupId, selectedCategory]);

	const handleGroupClick = useCallback(
		(groupId: string) => {
			saveCurrentLevelScroll();
			navIntentRef.current = { type: "forward" };
			if (groupId === DefaultGroup.DEVELOPER) {
				setScrollPosition(getCollectionLevelKey(groupId, null), 0);
			}
			setCurrentGroup(groupId);
		},
		[saveCurrentLevelScroll, setCurrentGroup],
	);

	const handleCategoryClick = useCallback(
		(category: Category) => {
			if (!currentGroupId) return;

			saveCurrentLevelScroll();
			navIntentRef.current = { type: "forward" };

			if (isVirtualCategory(category.id)) {
				const nextCategory: SelectedCategory = {
					type: "developer",
					key: category.virtualKey ?? category.name,
				};
				setScrollPosition(
					getCollectionLevelKey(currentGroupId, nextCategory),
					0,
				);
				setSelectedCategory(nextCategory);
				return;
			}

			setSelectedCategory({ type: "real", id: category.id });
		},
		[currentGroupId, saveCurrentLevelScroll, setSelectedCategory],
	);

	const handleBreadcrumbClick = useCallback(
		(level: "root" | "group") => {
			saveCurrentLevelScroll();

			if (level === "root") {
				navIntentRef.current = { type: "back", targetKey: "groups" };
				setCurrentGroup(null);
				setSelectedCategory(null);
				return;
			}

			if (!currentGroupId) return;
			navIntentRef.current = {
				type: "back",
				targetKey: `categories:${currentGroupId}`,
			};
			setSelectedCategory(null);
		},
		[
			currentGroupId,
			saveCurrentLevelScroll,
			setCurrentGroup,
			setSelectedCategory,
		],
	);

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

		container.scrollTop =
			intent.type === "forward"
				? 0
				: (levelScrollMapRef.current[intent.targetKey] ?? 0);
		navIntentRef.current = null;
	}, [currentGroupId, currentLevelKey]);

	return {
		currentLevelKey,
		handleGroupClick,
		handleCategoryClick,
		handleBreadcrumbClick,
	};
}
