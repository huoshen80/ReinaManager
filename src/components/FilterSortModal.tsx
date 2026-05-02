import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import FilterAlt from "@mui/icons-material/FilterAlt";
import FilterListIcon from "@mui/icons-material/FilterList";
import SortIcon from "@mui/icons-material/Sort";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import type { GameType, SortOption, SortOrder } from "@/services/invoke/types";
import { useStore } from "@/store/appStore";

const filterTypeOptions: Array<{ value: GameType; labelKey: string }> = [
	{ value: "all", labelKey: "allGames" },
	{ value: "local", labelKey: "localGames" },
	{ value: "online", labelKey: "onlineGames" },
	{ value: "iscustom", labelKey: "customGames" },
	{ value: "noclear", labelKey: "noclearGames" },
	{ value: "clear", labelKey: "clearGames" },
];

const sortOptions: Array<{ value: SortOption; labelKey: string }> = [
	{ value: "addtime", labelKey: "addTime" },
	{ value: "namesort", labelKey: "nameSort" },
	{ value: "datetime", labelKey: "releaseTime" },
	{ value: "lastplayed", labelKey: "lastPlayed" },
	{ value: "bgmrank", labelKey: "bgmRank" },
	{ value: "vndbrank", labelKey: "vndbRank" },
];

export const FilterSortModal: React.FC = () => {
	const { t } = useTranslation();
	const {
		gameFilterType,
		sortOption,
		sortOrder,
		setGameFilterType,
		updateSort,
	} = useStore(
		useShallow((s) => ({
			gameFilterType: s.gameFilterType,
			sortOption: s.sortOption,
			sortOrder: s.sortOrder,
			setGameFilterType: s.setGameFilterType,
			updateSort: s.updateSort,
		})),
	);

	const [open, setOpen] = useState(false);
	const [localFilterType, setLocalFilterType] =
		useState<GameType>(gameFilterType);
	const [localSortOption, setLocalSortOption] =
		useState<SortOption>(sortOption);
	const [localSortOrder, setLocalSortOrder] = useState<SortOrder>(sortOrder);

	const handleOpen = () => {
		setLocalFilterType(gameFilterType);
		setLocalSortOption(sortOption);
		setLocalSortOrder(sortOrder);
		setOpen(true);
	};

	const handleClose = () => setOpen(false);

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setGameFilterType(localFilterType);
		updateSort(localSortOption, localSortOrder);
		handleClose();
	};

	return (
		<>
			<Button onClick={handleOpen} startIcon={<FilterAlt />}>
				{t("components.FilterSortModal.title", "筛选排序")}
			</Button>
			<Dialog
				open={open}
				onClose={handleClose}
				closeAfterTransition={false}
				aria-labelledby="filter-sort-dialog-title"
				fullWidth
				maxWidth="xs"
				slotProps={{
					transition: { timeout: 0 },
					paper: {
						component: "form",
						onSubmit: handleSubmit,
						sx: {
							overflow: "hidden",
						},
					},
				}}
			>
				<DialogTitle
					id="filter-sort-dialog-title"
					className="flex items-center gap-2 border-b border-black/8 px-5 py-4 dark:border-white/10"
				>
					<FilterAlt fontSize="small" className="text-primary" />
					<span className="text-base font-600">
						{t("components.FilterSortModal.title", "筛选排序")}
					</span>
				</DialogTitle>
				<DialogContent className="px-5 py-4">
					<div className="flex flex-col gap-4">
						<section className="rounded-2 border border-black/8 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.04]">
							<div className="mb-2 flex items-center gap-2">
								<FilterListIcon fontSize="small" className="text-primary" />
								<Typography variant="body2" className="font-600">
									{t("components.FilterSortModal.filter", "筛选")}
								</Typography>
							</div>
							<FormControl fullWidth size="small">
								<Select
									labelId="library-filter-label"
									value={localFilterType}
									displayEmpty
									onChange={(event: SelectChangeEvent) =>
										setLocalFilterType(event.target.value as GameType)
									}
								>
									{filterTypeOptions.map((option) => (
										<MenuItem key={option.value} value={option.value}>
											{t(`components.FilterSortModal.${option.labelKey}`)}
										</MenuItem>
									))}
								</Select>
							</FormControl>
						</section>

						<section className="rounded-2 border border-black/8 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.04]">
							<div className="mb-2 flex items-center gap-2">
								<SortIcon fontSize="small" className="text-primary" />
								<Typography variant="body2" className="font-600">
									{t("components.FilterSortModal.sortMethod", "排序方式")}
								</Typography>
							</div>
							<div className="flex flex-col gap-3">
								<FormControl fullWidth size="small">
									<Select
										labelId="library-sort-label"
										value={localSortOption}
										displayEmpty
										onChange={(event: SelectChangeEvent) =>
											setLocalSortOption(event.target.value as SortOption)
										}
									>
										{sortOptions.map((option) => (
											<MenuItem key={option.value} value={option.value}>
												{t(`components.FilterSortModal.${option.labelKey}`)}
											</MenuItem>
										))}
									</Select>
								</FormControl>
								<ToggleButtonGroup
									exclusive
									fullWidth
									size="small"
									value={localSortOrder}
									aria-label={t(
										"components.FilterSortModal.sortOrder",
										"排序方向",
									)}
									onChange={(_, value: SortOrder | null) => {
										if (value) setLocalSortOrder(value);
									}}
								>
									<ToggleButton value="asc" className="gap-1">
										<ArrowUpwardIcon fontSize="small" />
										{t("components.FilterSortModal.ascending", "升序")}
									</ToggleButton>
									<ToggleButton value="desc" className="gap-1">
										<ArrowDownwardIcon fontSize="small" />
										{t("components.FilterSortModal.descending", "降序")}
									</ToggleButton>
								</ToggleButtonGroup>
							</div>
						</section>
					</div>
				</DialogContent>
				<DialogActions className="border-t border-black/8 px-5 py-3 dark:border-white/10">
					<Button onClick={handleClose}>
						{t("components.FilterSortModal.cancel", "取消")}
					</Button>
					<Button type="submit" variant="contained">
						{t("components.FilterSortModal.confirm", "确认")}
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
};
