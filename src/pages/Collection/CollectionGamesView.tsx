import { useTranslation } from "react-i18next";
import { SortableCardsGrid, VirtualCardsGrid } from "@/components/Cards";
import { GameListStateView } from "@/components/GameListStateView";
import { useGameListFacade } from "@/hooks/features/games/useGameListFacade";
import type { GameIndex } from "@/utils/game/gameIndex";

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

interface CollectionGamesViewProps {
	realCategoryId: number | null;
	gameIds: number[];
	displayById: GameIndex["displayById"];
	loading: boolean;
	error: unknown;
	scrollRestoreKey: string;
}

export function CollectionGamesView({
	realCategoryId,
	gameIds,
	displayById,
	loading,
	error,
	scrollRestoreKey,
}: CollectionGamesViewProps) {
	const { t } = useTranslation();

	if (realCategoryId === null) {
		return (
			<DeveloperGamesView
				sourceGameIds={gameIds}
				scrollRestoreKey={scrollRestoreKey}
			/>
		);
	}

	return (
		<GameListStateView
			loading={loading}
			error={error}
			empty={gameIds.length === 0}
			emptyMessage={t(
				"pages.Collection.noGamesInCategory",
				"当前分类下暂无游戏",
			)}
		>
			<SortableCardsGrid
				gameIds={gameIds}
				displayById={displayById}
				categoryId={realCategoryId}
			/>
		</GameListStateView>
	);
}
