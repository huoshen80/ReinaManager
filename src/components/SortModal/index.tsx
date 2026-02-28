/**
 * @file SortModal 组件
 * @description 游戏排序弹窗组件，支持按添加时间、发售时间、排名、最近游玩等方式排序，支持升降序切换，集成国际化。
 * @module src/components/SortModal/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - SortModal：游戏排序弹窗组件
 *
 * 依赖：
 * - @mui/material
 * - @mui/icons-material
 * - @/store
 * - react-i18next
 */

import SwapVertIcon from "@mui/icons-material/SwapVert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import Switch from "@mui/material/Switch";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useModal } from "@/components/Toolbar";
import type { SortOption as SortOptionType, SortOrder } from "@/services/types";
import { useStore } from "@/store";

/**
 * SortOption 组件的 props 接口
 */
interface SortOptionProps {
	value: SortOptionType;
	onChange: (value: SortOptionType) => void;
}

/**
 * UpDownSwitches 组件的 props 接口
 */
interface UpDownSwitchesProps {
	value: SortOrder;
	onChange: (value: SortOrder) => void;
}

/**
 * SortModal 组件
 * 游戏排序弹窗，支持多种排序方式和升降序切换。
 *
 * @component
 * @returns {JSX.Element} 排序弹窗
 */
const SortModal: React.FC = () => {
	const { t } = useTranslation();
	const { isopen, handleOpen, handleClose } = useModal();
	// 从 store 获取排序状态
	const sortOption = useStore((s) => s.sortOption);
	const sortOrder = useStore((s) => s.sortOrder);
	const updateSort = useStore((s) => s.updateSort);

	// 本地状态，用于在对话框内部跟踪更改
	const [localSortOption, setLocalSortOption] = useState(sortOption);
	const [localSortOrder, setLocalSortOrder] = useState(sortOrder);

	/**
	 * 提交排序设置，应用到全局 store
	 * @param {React.FormEvent<HTMLFormElement>} event 表单提交事件
	 */
	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		await updateSort(localSortOption, localSortOrder);

		// 关闭对话框
		handleClose();
	};

	return (
		<>
			<Button onClick={handleOpen} startIcon={<SwapVertIcon />}>
				{t("components.SortModal.sort")}
			</Button>
			<Dialog
				open={isopen}
				onClose={handleClose}
				closeAfterTransition={false}
				aria-labelledby="sort-dialog-title"
				slotProps={{
					transition: { timeout: 0 },
					paper: {
						component: "form",
						onSubmit: handleSubmit,
					},
				}}
			>
				<DialogTitle>{t("components.SortModal.sort")}</DialogTitle>
				<DialogContent className="pt-2 flex flex-col gap-2">
					<div>{t("components.SortModal.sortMethod")}</div>
					<SortOption value={localSortOption} onChange={setLocalSortOption} />
					<UpDownSwitches
						value={localSortOrder}
						onChange={(value: SortOrder) => setLocalSortOrder(value)}
					/>
				</DialogContent>
				<DialogActions>
					<Button onClick={handleClose}>
						{t("components.SortModal.cancel")}
					</Button>
					<Button type="submit">{t("components.SortModal.confirm")}</Button>
				</DialogActions>
			</Dialog>
		</>
	);
};

/**
 * SortOption 组件
 * 排序方式选择下拉框
 *
 * @param {SortOptionProps} props
 * @returns {JSX.Element}
 */
const SortOption: React.FC<SortOptionProps> = ({ value, onChange }) => {
	const { t } = useTranslation();
	const handleChange = (event: SelectChangeEvent) => {
		onChange(event.target.value as SortOptionType);
	};

	return (
		<Select value={value} onChange={handleChange}>
			<MenuItem value="addtime">{t("components.SortModal.addTime")}</MenuItem>
			<MenuItem value="namesort">
				{t("components.SortModal.nameSort", "名称排序")}
			</MenuItem>
			<MenuItem value="datetime">
				{t("components.SortModal.releaseTime")}
			</MenuItem>
			<MenuItem value="lastplayed">
				{t("components.SortModal.lastPlayed")}
			</MenuItem>
			<MenuItem value="bgmrank">{t("components.SortModal.bgmRank")}</MenuItem>
			<MenuItem value="vndbrank">{t("components.SortModal.vndbRank")}</MenuItem>
		</Select>
	);
};

/**
 * UpDownSwitches 组件
 * 升序/降序切换开关
 *
 * @param {UpDownSwitchesProps} props
 * @returns {JSX.Element}
 */
const UpDownSwitches: React.FC<UpDownSwitchesProps> = ({ value, onChange }) => {
	const { t } = useTranslation();
	// 使用 asc/desc 而不是布尔值
	const isDesc = value === "desc";

	const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
		onChange(event.target.checked ? "desc" : "asc");
	};

	return (
		<div className="flex items-center mt-2.5">
			<span className={`mr-2 ${isDesc ? "opacity-50" : "opacity-100"}`}>
				{t("components.SortModal.ascending")}
			</span>
			<Switch
				checked={isDesc}
				onChange={handleChange}
				slotProps={{ input: { "aria-label": "controlled" } }}
			/>
			<span className={`ml-2 ${isDesc ? "opacity-100" : "opacity-50"}`}>
				{t("components.SortModal.descending")}
			</span>
		</div>
	);
};

export default SortModal;
