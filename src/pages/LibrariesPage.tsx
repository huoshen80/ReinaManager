import Cards from "@/components/Cards";
import { useScrollRestore } from "@/hooks/common/useScrollRestore";
import { useGameListFacade } from "@/hooks/features/games/useGameListFacade";

export const Libraries: React.FC = () => {
	useScrollRestore("/libraries", { useKeepAlive: true });
	const { games } = useGameListFacade();
	return <Cards gamesData={games} />;
};
