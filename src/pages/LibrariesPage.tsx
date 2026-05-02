import Cards from "@/components/Cards";
import { useScrollRestore } from "@/hooks/common/useScrollRestore";
import { useGameListFacade } from "@/hooks/features/games/useGameListFacade";

export const Libraries: React.FC = () => {
	const { games, isLoading } = useGameListFacade();
	useScrollRestore("/libraries", { isLoading });
	return <Cards gamesData={games} />;
};
