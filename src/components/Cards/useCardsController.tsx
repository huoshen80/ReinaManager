import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { useRemoveGamesFromCategory } from "@/hooks/queries/useCollections";
import { snackbar } from "@/providers/snackBar";
import { useStore } from "@/store/appStore";
import { useGamePlayStore } from "@/store/gamePlayStore";
import type { GameData } from "@/types";
import { getGameDisplayName, saveScrollPosition } from "@/utils/appUtils";
import { getUserErrorMessage } from "@/utils/errors";
import { CardsBatchBar } from "./CardsBatchBar";
import { RightMenuHost } from "./RightMenuHost";
import type { RightMenuHostHandle, SortableCardItemProps } from "./types";

const CARD_LIMIT = 168;

interface UseCardsControllerOptions {
	gamesData: GameData[];
	categoryId?: number;
}

export function useCardsController({
	gamesData,
	categoryId,
}: UseCardsControllerOptions) {
	const { i18n, t } = useTranslation();
	const navigate = useNavigate();
	const path = useLocation().pathname;
	const isLibraries = path === "/libraries";
	const isCollectionCategory = typeof categoryId === "number" && categoryId > 0;
	const canUseBatchMode = isLibraries || isCollectionCategory;
	const rightMenuRef = useRef<RightMenuHostHandle>(null);

	const [showAll, setShowAll] = useState(false);
	const {
		setSelectedGameId,
		cardClickMode,
		doubleClickLaunch,
		longPressLaunch,
	} = useStore(
		useShallow((s) => ({
			setSelectedGameId: s.setSelectedGameId,
			cardClickMode: s.cardClickMode,
			doubleClickLaunch: s.doubleClickLaunch,
			longPressLaunch: s.longPressLaunch,
		})),
	);
	const launchGame = useGamePlayStore((s) => s.launchGame);
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

	const displayedGames = useMemo(
		() => (showAll ? gamesData : gamesData.slice(0, CARD_LIMIT)),
		[gamesData, showAll],
	);
	const gameIds = useMemo(
		() =>
			gamesData.map((game) => game.id).filter((id): id is number => id != null),
		[gamesData],
	);

	const toggleBatchGame = useCallback((gameId: number) => {
		setSelectedBatchGameIds((prev) =>
			prev.includes(gameId)
				? prev.filter((id) => id !== gameId)
				: [...prev, gameId],
		);
	}, []);

	const handleCardClick = useCallback(
		(cardId: number, _card: GameData) => {
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
		async (cardId: number, card: GameData) => {
			if (showBatchControls) return;

			if (doubleClickLaunch && card.localpath) {
				setSelectedGameId(cardId);
				try {
					const result = await launchGame(card.localpath, cardId, {
						le_launch: card.le_launch === 1,
						magpie: card.magpie === 1,
					});
					if (!result.success) {
						snackbar.error(result.message);
					}
				} catch (error) {
					snackbar.error(getUserErrorMessage(error, i18n.t.bind(i18n)));
				}
			}
		},
		[doubleClickLaunch, launchGame, setSelectedGameId, showBatchControls, i18n],
	);

	const handleCardLongPress = useCallback(
		async (cardId: number, card: GameData) => {
			if (showBatchControls) return;

			if (longPressLaunch && card.localpath) {
				setSelectedGameId(cardId);
				try {
					const result = await launchGame(card.localpath, cardId, {
						le_launch: card.le_launch === 1,
						magpie: card.magpie === 1,
					});
					if (!result.success) {
						snackbar.error(result.message);
					}
				} catch (error) {
					snackbar.error(getUserErrorMessage(error, i18n.t.bind(i18n)));
				}
			}
		},
		[longPressLaunch, launchGame, setSelectedGameId, showBatchControls, i18n],
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
		(card: GameData): SortableCardItemProps => ({
			card,
			isBatchSelected:
				card.id != null ? selectedBatchGameIdSet.has(card.id) : false,
			showBatchMarker: showBatchControls,
			showRemoveFromCategory: isCollectionCategory && !showBatchControls,
			onRemoveFromCategory: () =>
				card.id != null && handleRemoveSingleFromCategory(card.id),
			removeFromCategoryTitle: t(
				"components.Cards.removeFromCategory",
				"移出当前分类",
			),
			displayName: getGameDisplayName(card),
			useDelayedClick:
				!showBatchControls && cardClickMode === "navigate" && doubleClickLaunch,
			onContextMenu: (e: React.MouseEvent) =>
				card.id != null && handleContextMenu(e, card.id),
			onClick: () => card.id != null && handleCardClick(card.id, card),
			onDoubleClick: () =>
				card.id != null && handleCardDoubleClick(card.id, card),
			onLongPress: () => card.id != null && handleCardLongPress(card.id, card),
		}),
		[
			cardClickMode,
			doubleClickLaunch,
			handleContextMenu,
			handleCardClick,
			handleCardDoubleClick,
			handleCardLongPress,
			handleRemoveSingleFromCategory,
			isCollectionCategory,
			selectedBatchGameIdSet,
			showBatchControls,
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
			<RightMenuHost ref={rightMenuRef} />
		</>
	);

	const loadAllButton =
		!showAll && gamesData.length > CARD_LIMIT ? (
			<Box className="flex justify-center py-6">
				<Button variant="outlined" onClick={() => setShowAll(true)}>
					{t("components.Cards.loadAll", {
						defaultValue: `加载全部（${gamesData.length}）`,
						count: gamesData.length,
					})}
				</Button>
			</Box>
		) : null;

	return {
		controls,
		displayedGames,
		getCardProps,
		loadAllButton,
		longPressLaunch,
		showBatchControls,
	};
}
