/**
 * @file CollectionRightMenu 组件
 * @description 分组和分类的右键菜单组件
 * @module src/components/RightMenu/CollectionRightMenu
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import EditIcon from "@mui/icons-material/Edit";
import { ListItemIcon, ListItemText, MenuItem, MenuList } from "@mui/material";
import { useTranslation } from "react-i18next";
import { BaseRightMenu } from "./BaseRightMenu";

/**
 * CollectionRightMenu 组件属性类型
 */
type CollectionRightMenuTarget =
	| { type: "group"; id: string }
	| { type: "category"; id: number };

interface CollectionRightMenuProps {
	anchorPosition: { top: number; left: number };
	onClose: () => void;
	target: CollectionRightMenuTarget;
	onOpenRename: () => void; // 打开重命名对话框的回调
	onOpenManageGames?: () => void; // 打开管理游戏对话框的回调（仅分类）
}

/**
 * 分组和分类的右键菜单组件
 * - 分类：编辑分类（管理游戏）+ 重命名
 * - 分组：只有重命名
 *
 * @param {CollectionRightMenuProps} props 组件属性
 * @returns {JSX.Element | null} 右键菜单
 */
export const CollectionRightMenu: React.FC<CollectionRightMenuProps> = ({
	anchorPosition,
	onClose,
	target,
	onOpenRename,
	onOpenManageGames,
}) => {
	const { t } = useTranslation();

	return (
		<BaseRightMenu
			isopen
			anchorPosition={anchorPosition}
			onClose={onClose}
			ariaLabel={
				target.type === "group"
					? t("components.RightMenu.Collection.groupMenu")
					: t("components.RightMenu.Collection.categoryMenu")
			}
		>
			<MenuList sx={{ py: 1 }}>
				{/* 编辑分类（管理游戏） - 仅分类显示 */}
				{target.type === "category" && (
					<MenuItem onClick={onOpenManageGames}>
						<ListItemIcon>
							<EditIcon />
						</ListItemIcon>
						<ListItemText
							primary={t("components.RightMenu.Collection.manageGames")}
						/>
					</MenuItem>
				)}

				{/* 重命名 */}
				<MenuItem onClick={onOpenRename}>
					<ListItemIcon>
						<DriveFileRenameOutlineIcon />
					</ListItemIcon>
					<ListItemText
						primary={
							target.type === "group"
								? t("components.RightMenu.Collection.renameGroup")
								: t("components.RightMenu.Collection.renameCategory")
						}
					/>
				</MenuItem>
			</MenuList>
		</BaseRightMenu>
	);
};
