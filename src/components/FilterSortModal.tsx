import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import CloseIcon from "@mui/icons-material/Close";
import FilterAlt from "@mui/icons-material/FilterAlt";
import FilterListIcon from "@mui/icons-material/FilterList";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import SortIcon from "@mui/icons-material/Sort";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { useFilteredGamesFacade } from "@/hooks/features/games/useGameListFacade";
import { snackbar } from "@/providers/snackBar";
import type { GameType, SortOption, SortOrder } from "@/services/invoke/types";
import { useStore } from "@/store/appStore";
import {
	ALL_PLAY_STATUSES,
	getPlayStatusLabel,
	type PlayStatus,
	type PlayStatusFilter,
} from "@/types/collection";
import {
	buildNormalizedTagMap,
	filterTagSuggestions,
	findTagByInput,
	normalizeTagFilters,
} from "@/utils/game/tagFilter";

const filterTypeOptions: Array<{ value: GameType; labelKey: string }> = [
	{ value: "all", labelKey: "allGames" },
	{ value: "local", labelKey: "localGames" },
	{ value: "online", labelKey: "onlineGames" },
	{ value: "iscustom", labelKey: "customGames" },
];

const sortOptions: Array<{ value: SortOption; labelKey: string }> = [
	{ value: "addtime", labelKey: "addTime" },
	{ value: "namesort", labelKey: "nameSort" },
	{ value: "datetime", labelKey: "releaseTime" },
	{ value: "lastplayed", labelKey: "lastPlayed" },
	{ value: "bgmrank", labelKey: "bgmRank" },
	{ value: "vndbrank", labelKey: "vndbRank" },
	{ value: "userratingrank", labelKey: "userRatingRank" },
];

const MAX_TAG_SUGGESTIONS = 8;

function getActiveFilterCount(
	gameFilterType: GameType,
	playStatusFilter: PlayStatusFilter,
	tagFilters: string[],
): number {
	let count = 0;
	if (gameFilterType !== "all") count += 1;
	if (playStatusFilter !== "all") count += 1;
	if (tagFilters.length > 0) count += 1;
	return count;
}

export const FilterSortModal: React.FC = () => {
	const { t } = useTranslation();
	const {
		gameFilterType,
		playStatusFilter,
		tagFilters,
		sortOption,
		sortOrder,
		showCardSortFieldOverlay,
		setGameFilterType,
		setPlayStatusFilter,
		setTagFilters,
		updateSort,
		setShowCardSortFieldOverlay,
	} = useStore(
		useShallow((s) => ({
			gameFilterType: s.gameFilterType,
			playStatusFilter: s.playStatusFilter,
			tagFilters: s.tagFilters,
			sortOption: s.sortOption,
			sortOrder: s.sortOrder,
			showCardSortFieldOverlay: s.showCardSortFieldOverlay,
			setGameFilterType: s.setGameFilterType,
			setPlayStatusFilter: s.setPlayStatusFilter,
			setTagFilters: s.setTagFilters,
			updateSort: s.updateSort,
			setShowCardSortFieldOverlay: s.setShowCardSortFieldOverlay,
		})),
	);
	const { baseFilteredGames } = useFilteredGamesFacade();

	const [open, setOpen] = useState(false);
	const [localFilterType, setLocalFilterType] =
		useState<GameType>(gameFilterType);
	const [localPlayStatusFilter, setLocalPlayStatusFilter] =
		useState<PlayStatusFilter>(playStatusFilter);
	const [localTagFilters, setLocalTagFilters] = useState<string[]>(tagFilters);
	const [tagInput, setTagInput] = useState("");
	const [localSortOption, setLocalSortOption] =
		useState<SortOption>(sortOption);
	const [localSortOrder, setLocalSortOrder] = useState<SortOrder>(sortOrder);
	const [localShowCardSortFieldOverlay, setLocalShowCardSortFieldOverlay] =
		useState(showCardSortFieldOverlay);
	const activeFilterCount = getActiveFilterCount(
		gameFilterType,
		playStatusFilter,
		tagFilters,
	);

	const knownTags = useMemo(() => {
		if (!open) {
			return [];
		}

		const tags = new Set<string>();
		for (const game of baseFilteredGames) {
			for (const tag of game.tags ?? []) {
				const trimmed = tag.trim();
				if (!trimmed) continue;
				tags.add(trimmed);
			}
		}

		return Array.from(tags).toSorted((a, b) => a.localeCompare(b));
	}, [baseFilteredGames, open]);

	const knownTagByNormalized = useMemo(() => {
		return buildNormalizedTagMap(knownTags);
	}, [knownTags]);

	const tagOptions = useMemo(() => {
		return filterTagSuggestions(
			knownTagByNormalized,
			localTagFilters,
			tagInput,
			MAX_TAG_SUGGESTIONS,
		);
	}, [knownTagByNormalized, localTagFilters, tagInput]);

	const handleOpen = () => {
		setLocalFilterType(gameFilterType);
		setLocalPlayStatusFilter(playStatusFilter);
		setLocalTagFilters(tagFilters);
		setTagInput("");
		setLocalSortOption(sortOption);
		setLocalSortOrder(sortOrder);
		setLocalShowCardSortFieldOverlay(showCardSortFieldOverlay);
		setOpen(true);
	};

	const handleClose = () => setOpen(false);

	const handleClearFilters = (event: React.MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		setGameFilterType("all");
		setPlayStatusFilter("all");
		setTagFilters([]);
	};

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setGameFilterType(localFilterType);
		setPlayStatusFilter(localPlayStatusFilter);
		setTagFilters(localTagFilters);
		updateSort(localSortOption, localSortOrder);
		setShowCardSortFieldOverlay(localShowCardSortFieldOverlay);
		handleClose();
	};

	const handleTagFiltersChange = (nextTags: string[]) => {
		const matchedTags = nextTags
			.map((tag) => findTagByInput(knownTagByNormalized, tag))
			.filter((tag): tag is string => Boolean(tag));
		const normalizedTags = normalizeTagFilters(matchedTags);
		setLocalTagFilters(normalizedTags);
	};

	const handleTagInputKeyDown = (
		event: React.KeyboardEvent<HTMLInputElement>,
	) => {
		if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
		const trimmed = tagInput.trim();
		if (!trimmed) return;

		event.preventDefault();
		event.stopPropagation();
		const matchedTag = findTagByInput(knownTagByNormalized, trimmed);
		if (matchedTag) {
			handleTagFiltersChange([...localTagFilters, matchedTag]);
		} else {
			snackbar.warning(
				t("components.FilterSortModal.tagNotMatched", {
					tag: trimmed,
					defaultValue: "未匹配到 {{tag}} tag",
				}),
			);
		}
		setTagInput("");
	};

	return (
		<>
			<Box className="group relative inline-flex">
				<Button onClick={handleOpen} startIcon={<FilterAlt />}>
					{t("components.FilterSortModal.title", "筛选排序")}
				</Button>
				{activeFilterCount > 0 && (
					<Box
						component="span"
						className="pointer-events-none absolute -right-1.5 -top-1.5 h-5 min-w-5 rounded-full bg-[var(--mui-palette-primary-main)] px-1 text-center text-12px text-[var(--mui-palette-primary-contrastText)] font-600 leading-5 transition-opacity duration-150 group-hover:opacity-0"
					>
						{activeFilterCount}
					</Box>
				)}
				{activeFilterCount > 0 && (
					<Tooltip
						title={t("components.FilterSortModal.clearFilters", "清除筛选")}
					>
						<IconButton
							size="small"
							className="!absolute -right-1.5 -top-1.5 !h-5 !w-5 border border-solid border-[var(--mui-palette-divider)] !bg-[var(--mui-palette-background-paper)] !text-[var(--mui-palette-error-main)] opacity-0 transition-[opacity,background-color] duration-150 group-hover:opacity-100 hover:!bg-[var(--mui-palette-action-hover)]"
							aria-label={t(
								"components.FilterSortModal.clearFilters",
								"清除筛选",
							)}
							onClick={handleClearFilters}
						>
							<CloseIcon fontSize="inherit" />
						</IconButton>
					</Tooltip>
				)}
			</Box>
			<Dialog
				open={open}
				onClose={handleClose}
				closeAfterTransition={false}
				aria-labelledby="filter-sort-dialog-title"
				maxWidth={false}
				slotProps={{
					transition: { timeout: 0 },
					paper: {
						component: "form",
						onSubmit: handleSubmit,
						className:
							"w-fit min-w-88 max-w-[calc(100vw-2rem)] overflow-hidden",
					},
				}}
			>
				<DialogTitle
					id="filter-sort-dialog-title"
					className="flex items-center gap-2 px-5 py-4"
				>
					<FilterAlt fontSize="small" className="text-primary" />
					<span className="text-base font-600">
						{t("components.FilterSortModal.title", "筛选排序")}
					</span>
				</DialogTitle>
				<DialogContent className="overflow-x-auto px-5 py-4">
					<div className="w-max min-w-88 flex flex-col gap-4">
						<Box component="section" className="rounded-2 p-1">
							<div className="mb-2 flex items-center gap-2">
								<FilterListIcon fontSize="small" className="text-primary" />
								<Typography variant="body2" className="font-600">
									{t("components.FilterSortModal.filter", "筛选")}
								</Typography>
							</div>
							<div className="flex flex-col gap-3">
								<div className="flex flex-col gap-2">
									<div className="flex items-center gap-2">
										<Typography variant="caption" color="text.secondary">
											{t("components.FilterSortModal.sourceFilter", "游戏来源")}
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
								</div>
								<div className="flex flex-col gap-2">
									<div className="flex items-center gap-2">
										<Typography variant="caption" color="text.secondary">
											{t(
												"components.FilterSortModal.playStatusFilter",
												"游戏状态",
											)}
										</Typography>
									</div>
									<fieldset className="grid w-max grid-flow-col auto-cols-max gap-1.5 border-0 p-0 m-0">
										<legend className="sr-only">
											{t(
												"components.FilterSortModal.playStatusFilter",
												"游戏状态",
											)}
										</legend>
										<ToggleButton
											size="small"
											value="all"
											selected={localPlayStatusFilter === "all"}
											onClick={() => setLocalPlayStatusFilter("all")}
											className="min-w-0 whitespace-nowrap px-2"
										>
											{t("components.FilterSortModal.allStatuses", "全部状态")}
										</ToggleButton>
										{ALL_PLAY_STATUSES.map((status: PlayStatus) => (
											<ToggleButton
												key={status}
												size="small"
												value={status}
												selected={localPlayStatusFilter === status}
												onClick={() => setLocalPlayStatusFilter(status)}
												className="min-w-0 whitespace-nowrap px-2"
											>
												{getPlayStatusLabel(t, status)}
											</ToggleButton>
										))}
									</fieldset>
								</div>
								<div className="flex flex-col gap-2">
									<div className="flex items-center gap-2">
										<LocalOfferIcon fontSize="small" className="text-primary" />
										<Typography variant="caption" color="text.secondary">
											{t("components.FilterSortModal.tagFilter", "Tag 筛选")}
										</Typography>
										{localTagFilters.length > 0 && (
											<Chip
												size="small"
												label={localTagFilters.length}
												color="primary"
											/>
										)}
									</div>
									<Autocomplete
										multiple
										freeSolo
										options={tagOptions}
										value={localTagFilters}
										inputValue={tagInput}
										filterOptions={(options) => options}
										onInputChange={(_, value, reason) => {
											if (reason === "input" || reason === "clear") {
												setTagInput(value);
											}
										}}
										onChange={(_, value) => {
											handleTagFiltersChange(value);
											setTagInput("");
										}}
										noOptionsText={t(
											"components.FilterSortModal.noTagSuggestions",
											"没有标签建议",
										)}
										renderTags={(value, getTagProps) =>
											value.map((option, index) => {
												const { key, ...tagProps } = getTagProps({ index });
												return (
													<Chip
														key={key}
														label={option}
														size="small"
														color="primary"
														variant="outlined"
														{...tagProps}
													/>
												);
											})
										}
										renderInput={(params) => (
											<TextField
												{...params}
												size="small"
												placeholder={
													localTagFilters.length === 0
														? t(
																"components.FilterSortModal.tagFilterPlaceholder",
																"输入原始 tag 后按回车添加",
															)
														: ""
												}
												onKeyDown={handleTagInputKeyDown}
											/>
										)}
										renderOption={(props, option) => {
											const { key, ...optionProps } = props;
											return (
												<li key={key} {...optionProps}>
													<span className="flex-1 truncate">{option}</span>
												</li>
											);
										}}
									/>
								</div>
							</div>
						</Box>

						<Box component="section" className="rounded-2 p-1">
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
								<FormControlLabel
									control={
										<Switch
											size="small"
											checked={localShowCardSortFieldOverlay}
											onChange={(event) =>
												setLocalShowCardSortFieldOverlay(event.target.checked)
											}
										/>
									}
									label={t(
										"components.FilterSortModal.showCardSortFieldOverlay",
										"封面展示排序字段",
									)}
									labelPlacement="start"
									className="ml-0 justify-between"
								/>
							</div>
						</Box>
					</div>
				</DialogContent>
				<DialogActions className="px-5 py-3">
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
