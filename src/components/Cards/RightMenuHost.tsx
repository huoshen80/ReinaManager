import {
	forwardRef,
	memo,
	useCallback,
	useImperativeHandle,
	useState,
} from "react";
import RightMenu from "@/components/RightMenu";
import type { MenuPosition, RightMenuHostHandle } from "./types";

/**
 * RightMenuHost - 隔离右键菜单坐标状态，避免打开菜单时重渲染整片卡片网格
 */
export const RightMenuHost = memo(
	forwardRef<RightMenuHostHandle>((_, ref) => {
		const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);

		const closeMenu = useCallback(() => setMenuPosition(null), []);

		useImperativeHandle(
			ref,
			() => ({
				open: (cardId, mouseX, mouseY) => {
					setMenuPosition({ cardId, mouseX, mouseY });
				},
			}),
			[],
		);

		return menuPosition ? (
			<RightMenu
				id={menuPosition.cardId}
				anchorPosition={{ top: menuPosition.mouseY, left: menuPosition.mouseX }}
				onClose={closeMenu}
			/>
		) : null;
	}),
);

RightMenuHost.displayName = "RightMenuHost";
