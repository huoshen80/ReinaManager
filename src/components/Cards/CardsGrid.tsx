import { memo } from "react";
import type { GameData } from "@/types";
import { CardItem } from "./CardItem";
import { useCardsController } from "./useCardsController";

interface CardsGridProps {
	gamesData: GameData[];
	categoryId?: number;
}

/**
 * CardsGrid - 普通卡片布局。
 */
export const CardsGrid = memo(({ gamesData, categoryId }: CardsGridProps) => {
	const { controls, displayedGames, getCardProps, loadAllButton } =
		useCardsController({
			gamesData,
			categoryId,
		});

	return (
		<>
			{controls}
			<div className="flex-1 min-h-0">
				<div
					className={
						"text-center grid lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8 3xl:grid-cols-10 4xl:grid-cols-12 gap-4"
					}
				>
					{displayedGames.map((card) => {
						const props = getCardProps(card);
						return <CardItem key={card.id} {...props} />;
					})}
				</div>
				{loadAllButton}
			</div>
		</>
	);
});

CardsGrid.displayName = "CardsGrid";
