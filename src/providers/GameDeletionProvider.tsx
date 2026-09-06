import {
	createContext,
	type ReactNode,
	useLayoutEffect,
	useState,
} from "react";
import { useLocation } from "react-router-dom";
import { useStore } from "@/store/appStore";
import type { GameData } from "@/types";

export const GameDeletionContext = createContext<{
	game: GameData | null;
	setGame: (game: GameData | null) => void;
} | null>(null);

export function GameDeletionProvider({ children }: { children: ReactNode }) {
	const { key } = useLocation();
	const [deletion, setDeletion] = useState<{
		key: string;
		game: GameData;
	} | null>(null);

	useLayoutEffect(() => {
		if (!deletion || deletion.key === key) return;
		setDeletion(null);
		const store = useStore.getState();
		if (store.selectedGameId === deletion.game.id) {
			store.setSelectedGameId(null);
		}
	}, [deletion, key]);

	return (
		<GameDeletionContext.Provider
			value={{
				// 过渡数据只属于发起删除的页面，返回页直接读取更新后的缓存。
				game: deletion?.key === key ? deletion.game : null,
				setGame: (game) => setDeletion(game ? { key, game } : null),
			}}
		>
			{children}
		</GameDeletionContext.Provider>
	);
}
