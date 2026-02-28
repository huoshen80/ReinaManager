/**
 * @file FilterModal 组件
 * @description 游戏筛选弹窗组件，支持按全部、本地、网络三种类型筛选游戏，集成国际化，适用于游戏库筛选功能。
 * @module src/components/FilterModal/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - FilterModal：游戏筛选弹窗组件
 *
 * 依赖：
 * - @mui/material
 * - @mui/icons-material
 * - @/store
 * - react-i18next
 */

import FilterListIcon from "@mui/icons-material/FilterList";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "@/store";

export type GameFilterType = "all" | "local" | "online" | "noclear" | "clear";

/**
 * FilterModal 组件用于筛选游戏类型。
 * 支持全部、本地、网络三种类型筛选，弹窗形式，集成国际化。
 *
 * @component
 * @returns {JSX.Element} 游戏筛选弹窗
 */
export const FilterModal: React.FC = () => {
	const { t } = useTranslation();
	const gameFilterType = useStore((s) => s.gameFilterType);
	const setGameFilterType = useStore((s) => s.setGameFilterType);

	const [open, setOpen] = useState(false);
	const [filterValue, setFilterValue] = useState<GameFilterType>(
		gameFilterType || "all",
	);

	/**
	 * 打开筛选弹窗
	 */
	const handleOpen = () => setOpen(true);

	/**
	 * 关闭筛选弹窗
	 */
	const handleClose = () => setOpen(false);

	/**
	 * 切换筛选类型
	 * @param event React.ChangeEvent<HTMLInputElement>
	 */
	const handleChange = (event: { target: { value: GameFilterType } }) => {
		setFilterValue(event.target.value);
	};

	/**
	 * 应用筛选条件
	 */
	const handleApply = () => {
		setGameFilterType(filterValue);
		handleClose();
	};

	return (
		<>
			<Button startIcon={<FilterListIcon />} onClick={handleOpen}>
				{t("components.FilterModal.filter")}
			</Button>

			<Dialog open={open} onClose={handleClose}>
				<DialogTitle>{t("components.FilterModal.filterTitle")}</DialogTitle>
				<DialogContent>
					<Select
						value={filterValue}
						onChange={handleChange}
						displayEmpty
						fullWidth
					>
						<MenuItem value="all">
							{t("components.FilterModal.allGames")}
						</MenuItem>
						<MenuItem value="local">
							{t("components.FilterModal.localGames")}
						</MenuItem>
						<MenuItem value="online">
							{t("components.FilterModal.onlineGames")}
						</MenuItem>
						<MenuItem value="noclear">
							{t("components.FilterModal.noclearGames")}
						</MenuItem>
						<MenuItem value="clear">
							{t("components.FilterModal.clearGames")}
						</MenuItem>
					</Select>
				</DialogContent>
				<DialogActions>
					<Button onClick={handleClose}>
						{t("components.FilterModal.cancel")}
					</Button>
					<Button onClick={handleApply} color="primary">
						{t("components.FilterModal.apply")}
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
};
