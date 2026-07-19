import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { saveScrollPosition } from "@/hooks/common/useScrollRestore";
import { useGameLaunchFlow } from "@/hooks/features/games/useGameLaunchFlow";
import { useRemoveGamesFromCategory } from "@/hooks/queries/useCollections";
import { useAllGameLastPlayedMap } from "@/hooks/queries/useStats";
import { snackbar } from "@/providers/snackBar";
import { useStore } from "@/store/appStore";
import type { GameData } from "@/types";
import { getGameDisplayName } from "@/utils/game";
import { CardsBatchBar } from "./CardsBatchBar";
import { getCardSortFieldOverlay } from "./cardSortFieldOverlay";
import { RightMenuHost } from "./RightMenuHost";
import type { RightMenuHostHandle, SortableCardItemProps } from "./types";

interface UseCardsControllerOptions {
	gameIds: number[];
	categoryId?: number;
	enableBatchMode?: boolean;
	enableSortFieldOverlay?: boolean;
}

export function useCardsController({
	gameIds,
	categoryId,
	enableBatchMode = false,
	enableSortFieldOverlay = false,
}: UseCardsControllerOptions) {
	const { i18n, t } = useTranslation();
	const navigate = useNavigate();
	const path = useLocation().pathname;
	const isLibraries = path === "/libraries";
	const isCollectionCategory = typeof categoryId === "number" && categoryId > 0;
	const canUseBatchMode =
		enableBatchMode || isLibraries || isCollectionCategory;
	const rightMenuRef = useRef<RightMenuHostHandle>(null);

	const {
		setSelectedGameId,
		cardClickMode,
		sortOption,
		showCardSortFieldOverlay,
	} = useStore(
		useShallow((s) => ({
			setSelectedGameId: s.setSelectedGameId,
			cardClickMode: s.cardClickMode,
			sortOption: s.sortOption,
			showCardSortFieldOverlay: s.showCardSortFieldOverlay,
		})),
	);
	const { launchGame } = useGameLaunchFlow();
	const shouldShowCardSortFieldOverlay =
		(isLibraries || enableSortFieldOverlay) && showCardSortFieldOverlay;
	const shouldLoadLastPlayed =
		shouldShowCardSortFieldOverlay && sortOption === "lastplayed";
	const lastPlayedQuery = useAllGameLastPlayedMap({
		enabled: shouldLoadLastPlayed,
	});
	const [batchMode, setBatchMode] = useState(false);
	const [selectedBatchGameIds, setSelectedBatchGameIds] = useState<number[]>(
		[],
	);
	const selectedBatchGameIdSet = useMemo(
		() => new Set(selectedBatchGameIds),
		[selectedBatchGameIds],
	);
	const showBatchControls = canUseBatchMode && batchMode;
	const removeGamesFromCategoryMutation = useRemoveGamesFromCategory();

	const toggleBatchGame = useCallback((gameId: number) => {
		setSelectedBatchGameIds((prev) =>
			prev.includes(gameId)
				? prev.filter((id) => id !== gameId)
				: [...prev, gameId],
		);
	}, []);

	const handleCardClick = useCallback(
		(cardId: number) => {
			if (showBatchControls) {
				toggleBatchGame(cardId);
				return;
			}

			if (cardClickMode === "navigate") {
				setSelectedGameId(cardId);
				saveScrollPosition(window.location.pathname);
				navigate(`/libraries/${cardId}`);
			} else {
				setSelectedGameId(cardId);
			}
		},
		[
			cardClickMode,
			navigate,
			setSelectedGameId,
			showBatchControls,
			toggleBatchGame,
		],
	);

	const handleCardDoubleClick = useCallback(
		(game: GameData) => {
			if (showBatchControls) return;

			setSelectedGameId(game.id);
			void launchGame(game);
		},
		[launchGame, setSelectedGameId, showBatchControls],
	);

	const handleContextMenu = useCallback(
		(event: React.MouseEvent, cardId: number) => {
			if (showBatchControls) {
				event.preventDefault();
				return;
			}

			rightMenuRef.current?.open(cardId, event.clientX, event.clientY);
			setSelectedGameId(cardId);
		},
		[setSelectedGameId, showBatchControls],
	);

	const handleRemoveFromCategory = useCallback(
		async (targetGameIds: number[]) => {
			if (!isCollectionCategory || !categoryId) return;

			const targetGameIdSet = new Set(targetGameIds);
			await removeGamesFromCategoryMutation.mutateAsync({
				categoryId,
				gameIds: targetGameIds,
			});

			setSelectedBatchGameIds((prev) =>
				prev.filter((selectedId) => !targetGameIdSet.has(selectedId)),
			);
		},
		[categoryId, isCollectionCategory, removeGamesFromCategoryMutation],
	);

	const handleRemoveSingleFromCategory = useCallback(
		async (cardId: number) => {
			try {
				await handleRemoveFromCategory([cardId]);
				snackbar.success(
					t("components.Cards.removeFromCategorySuccess", {
						defaultValue: "已从当前分类移除",
					}),
				);
			} catch (error) {
				console.error("移出分类失败:", error);
				snackbar.error(
					t("components.Cards.removeFromCategoryFailed", {
						defaultValue: "移出分类失败",
					}),
				);
			}
		},
		[handleRemoveFromCategory, t],
	);

	const getCardProps = useCallback(
		(game: GameData): SortableCardItemProps => {
			const gameId = game.id;
			return {
				game,
				displayName: getGameDisplayName(game),
				sortFieldOverlay: shouldShowCardSortFieldOverlay
					? getCardSortFieldOverlay({
							game,
							sortOption,
							lastPlayed: lastPlayedQuery.data?.get(gameId),
							language: i18n.language,
							t,
						})
					: undefined,
				batch: showBatchControls
					? { selected: selectedBatchGameIdSet.has(gameId) }
					: undefined,
				removeAction:
					isCollectionCategory && !showBatchControls
						? {
								title: t("components.Cards.removeFromCategory", "移出当前分类"),
								onRemove: () => handleRemoveSingleFromCategory(gameId),
							}
						: undefined,
				interaction: {
					useDelayedClick: !showBatchControls && cardClickMode === "navigate",
					onContextMenu: (e: React.MouseEvent) => handleContextMenu(e, gameId),
					onClick: () => handleCardClick(gameId),
					onDoubleClick: () => handleCardDoubleClick(game),
				},
			};
		},
		[
			cardClickMode,
			handleContextMenu,
			handleCardClick,
			handleCardDoubleClick,
			handleRemoveSingleFromCategory,
			isCollectionCategory,
			i18n.language,
			lastPlayedQuery.data,
			shouldShowCardSortFieldOverlay,
			selectedBatchGameIdSet,
			showBatchControls,
			sortOption,
			t,
		],
	);

	const controls = (
		<>
			{canUseBatchMode && (
				<CardsBatchBar
					batchMode={batchMode}
					selectedBatchGameIds={selectedBatchGameIds}
					gameIds={gameIds}
					categoryId={categoryId}
					onBatchModeChange={setBatchMode}
					onSelectionChange={setSelectedBatchGameIds}
					onSelectionClear={() => setSelectedBatchGameIds([])}
					onDeleteSuccess={() => setSelectedGameId(null)}
					onRemoveFromCategory={handleRemoveFromCategory}
				/>
			)}
			<RightMenuHost ref={rightMenuRef} onLaunchGame={launchGame} />
		</>
	);

	return {
		controls,
		getCardProps,
		showBatchControls,
	};
}
