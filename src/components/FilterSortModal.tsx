import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import CloseIcon from "@mui/icons-material/Close";
import FilterAlt from "@mui/icons-material/FilterAlt";
import FilterListIcon from "@mui/icons-material/FilterList";
import LocalOfferIcon from "@mui/icons-material/LocalOffer";
import SortIcon from "@mui/icons-material/Sort";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
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
import {
	type GameListScopeOptions,
	useFilteredGamesFacade,
} from "@/hooks/features/games/useGameListFacade";
import { snackbar } from "@/providers/snackBar";
import type { GameType, SortOption, SortOrder } from "@/services/invoke/types";
import { type GameFilterSortConfig, useStore } from "@/store/appStore";
import {
	ALL_PLAY_STATUSES,
	type CollectionEntitySortField,
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

const gameSortOptions: Array<{ value: SortOption; labelKey: string }> = [
	{ value: "addtime", labelKey: "addTime" },
	{ value: "namesort", labelKey: "nameSort" },
	{ value: "datetime", labelKey: "releaseTime" },
	{ value: "lastplayed", labelKey: "lastPlayed" },
	{ value: "bgmrank", labelKey: "bgmRank" },
	{ value: "vndbrank", labelKey: "vndbRank" },
	{ value: "userratingrank", labelKey: "userRatingRank" },
];

const MAX_TAG_SUGGESTIONS = 8;
const selectedStatusClassName =
	"!bg-[var(--mui-palette-primary-main)] !text-[var(--mui-palette-primary-contrastText)] hover:!bg-[var(--mui-palette-primary-dark)]";

interface GameFilterSortModalProps extends GameListScopeOptions {
	mode?: "game";
}

interface CollectionEntityFilterSortModalProps {
	mode: "collection-entity";
	sortFields: readonly CollectionEntitySortField[];
	sortField: CollectionEntitySortField;
	sortOrder: SortOrder;
	onApply: (field: CollectionEntitySortField, order: SortOrder) => void;
}

export type FilterSortModalProps =
	| GameFilterSortModalProps
	| CollectionEntityFilterSortModalProps;

interface FilterSortDialogProps {
	open: boolean;
	onClose: () => void;
	onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
	titleId: string;
	title: string;
	icon: React.ReactNode;
	children: React.ReactNode;
}

interface SortSectionProps<T extends string> {
	options: readonly { value: T; label: string }[];
	sortValue: T;
	sortOrder: SortOrder;
	onSortValueChange: (value: T) => void;
	onSortOrderChange: (order: SortOrder) => void;
	footer?: React.ReactNode;
}

function getCollectionEntitySortFieldLabel(
	t: ReturnType<typeof useTranslation>["t"],
	field: CollectionEntitySortField,
): string {
	switch (field) {
		case "created_at":
			return t("pages.Collection.entitySort.createdAt", "添加时间");
		case "updated_at":
			return t("pages.Collection.entitySort.updatedAt", "更新时间");
		case "name":
			return t("pages.Collection.entitySort.name", "名称");
		case "game_count":
			return t("pages.Collection.entitySort.gameCount", "游戏数量");
	}
}

function FilterSortDialog({
	open,
	onClose,
	onSubmit,
	titleId,
	title,
	icon,
	children,
}: FilterSortDialogProps) {
	const { t } = useTranslation();

	return (
		<Dialog
			open={open}
			onClose={onClose}
			closeAfterTransition={false}
			aria-labelledby={titleId}
			maxWidth={false}
			slotProps={{
				transition: { timeout: 0 },
				paper: {
					component: "form",
					onSubmit,
					className: "w-fit min-w-88 max-w-[calc(100vw-2rem)] overflow-hidden",
				},
			}}
		>
			<DialogTitle id={titleId} className="flex items-center gap-2 px-5 py-4">
				{icon}
				<span className="text-base font-600">{title}</span>
			</DialogTitle>
			<DialogContent className="overflow-x-auto px-5 py-4">
				<div className="w-max min-w-88 flex flex-col gap-4">{children}</div>
			</DialogContent>
			<DialogActions className="px-5 py-3">
				<Button onClick={onClose}>
					{t("components.FilterSortModal.cancel", "取消")}
				</Button>
				<Button type="submit" variant="contained">
					{t("components.FilterSortModal.apply", "应用")}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

function SortSection<T extends string>({
	options,
	sortValue,
	sortOrder,
	onSortValueChange,
	onSortOrderChange,
	footer,
}: SortSectionProps<T>) {
	const { t } = useTranslation();
	const sortMethodLabel = t(
		"components.FilterSortModal.sortMethod",
		"排序方式",
	);

	return (
		<Box component="section" className="rounded-2 p-1">
			<div className="mb-2 flex items-center gap-2">
				<SortIcon fontSize="small" className="text-primary" />
				<Typography variant="body2" className="font-600">
					{sortMethodLabel}
				</Typography>
			</div>
			<div className="flex flex-col gap-3">
				<FormControl fullWidth size="small">
					<Select
						value={sortValue}
						displayEmpty
						inputProps={{ "aria-label": sortMethodLabel }}
						onChange={(event: SelectChangeEvent) =>
							onSortValueChange(event.target.value as T)
						}
					>
						{options.map((option) => (
							<MenuItem key={option.value} value={option.value}>
								{option.label}
							</MenuItem>
						))}
					</Select>
				</FormControl>
				<ToggleButtonGroup
					exclusive
					fullWidth
					size="small"
					value={sortOrder}
					aria-label={t("components.FilterSortModal.sortOrder", "排序方向")}
					onChange={(_, value: SortOrder | null) => {
						if (value) onSortOrderChange(value);
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
				{footer}
			</div>
		</Box>
	);
}

function getActiveFilterCount(
	gameFilterType: GameType,
	playStatusFilter: PlayStatusFilter,
	tagFilters: string[],
): number {
	let count = 0;
	if (gameFilterType !== "all") count += 1;
	if (
		Array.isArray(playStatusFilter)
			? playStatusFilter.length > 0 &&
				playStatusFilter.length < ALL_PLAY_STATUSES.length
			: playStatusFilter !== "all"
	) {
		count += 1;
	}
	if (tagFilters.length > 0) count += 1;
	return count;
}

function GameFilterSortModal({
	scopeGameIds,
	applyNsfwFilter,
}: GameFilterSortModalProps) {
	const { t } = useTranslation();
	const {
		gameFilterType,
		playStatusFilter,
		tagFilters,
		sortOption,
		sortOrder,
		showCardSortFieldOverlay,
		applyGameFilterSort,
	} = useStore(
		useShallow((s) => ({
			gameFilterType: s.gameFilterType,
			playStatusFilter: s.playStatusFilter,
			tagFilters: s.tagFilters,
			sortOption: s.sortOption,
			sortOrder: s.sortOrder,
			showCardSortFieldOverlay: s.showCardSortFieldOverlay,
			applyGameFilterSort: s.applyGameFilterSort,
		})),
	);
	const { baseFilteredGames } = useFilteredGamesFacade({
		scopeGameIds,
		applyNsfwFilter,
	});

	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<GameFilterSortConfig>(() => ({
		gameFilterType,
		playStatusFilter,
		tagFilters,
		sortOption,
		sortOrder,
		showCardSortFieldOverlay,
	}));
	const [tagInput, setTagInput] = useState("");
	const selectedStatuses = Array.isArray(draft.playStatusFilter)
		? draft.playStatusFilter
		: null;
	const isMultiStatus = selectedStatuses !== null;
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
			draft.tagFilters,
			tagInput,
			MAX_TAG_SUGGESTIONS,
		);
	}, [knownTagByNormalized, draft.tagFilters, tagInput]);

	const handleOpen = () => {
		setDraft({
			gameFilterType,
			playStatusFilter,
			tagFilters,
			sortOption,
			sortOrder,
			showCardSortFieldOverlay,
		});
		setTagInput("");
		setOpen(true);
	};

	const handleClose = () => setOpen(false);

	const handleClearFilters = (event: React.MouseEvent<HTMLButtonElement>) => {
		event.stopPropagation();
		applyGameFilterSort({
			gameFilterType: "all",
			playStatusFilter: "all",
			tagFilters: [],
			sortOption,
			sortOrder,
			showCardSortFieldOverlay,
		});
	};

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		applyGameFilterSort(draft);
		handleClose();
	};

	const handleInvertStatuses = () => {
		setDraft((current) => {
			const selected = current.playStatusFilter;
			if (!Array.isArray(selected)) return current;
			return {
				...current,
				playStatusFilter: ALL_PLAY_STATUSES.filter(
					(status) => !selected.includes(status),
				),
			};
		});
	};

	const handleStatusClick = (status: PlayStatus) => {
		setDraft((current) => {
			const selected = current.playStatusFilter;
			if (!Array.isArray(selected)) {
				return { ...current, playStatusFilter: status };
			}
			return {
				...current,
				playStatusFilter: ALL_PLAY_STATUSES.filter((candidate) =>
					candidate === status
						? !selected.includes(candidate)
						: selected.includes(candidate),
				),
			};
		});
	};

	const handleTagFiltersChange = (nextTags: string[]) => {
		const matchedTags = nextTags
			.map((tag) => findTagByInput(knownTagByNormalized, tag))
			.filter((tag): tag is string => Boolean(tag));
		const normalizedTags = normalizeTagFilters(matchedTags);
		setDraft((current) => ({ ...current, tagFilters: normalizedTags }));
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
			handleTagFiltersChange([...draft.tagFilters, matchedTag]);
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
			<FilterSortDialog
				open={open}
				onClose={handleClose}
				onSubmit={handleSubmit}
				titleId="filter-sort-dialog-title"
				title={t("components.FilterSortModal.title", "筛选排序")}
				icon={<FilterAlt fontSize="small" className="text-primary" />}
			>
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
									value={draft.gameFilterType}
									displayEmpty
									onChange={(event: SelectChangeEvent) =>
										setDraft((current) => ({
											...current,
											gameFilterType: event.target.value as GameType,
										}))
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
									{t("components.FilterSortModal.playStatusFilter", "游戏状态")}
								</Typography>
								<button
									type="button"
									role="switch"
									aria-checked={isMultiStatus}
									className="ml-auto h-5 flex items-center gap-1 border-0 bg-transparent p-0 text-12px text-[var(--mui-palette-text-secondary)] cursor-pointer hover:text-[var(--mui-palette-primary-main)]"
									onClick={() =>
										setDraft((current) => ({
											...current,
											playStatusFilter: Array.isArray(current.playStatusFilter)
												? "all"
												: [],
										}))
									}
								>
									{t("components.FilterSortModal.multiSelect", "多选")}
									<span
										aria-hidden="true"
										className={`relative h-4 w-7 rounded-full transition-colors ${isMultiStatus ? "bg-[var(--mui-palette-primary-main)]" : "bg-[var(--mui-palette-action-disabledBackground)]"}`}
									>
										<span
											className={`absolute left-0.5 top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${isMultiStatus ? "translate-x-3" : ""}`}
										/>
									</span>
								</button>
							</div>
							<fieldset className="grid w-max grid-flow-col auto-cols-max gap-1.5 border-0 p-0 m-0">
								<legend className="sr-only">
									{t("components.FilterSortModal.playStatusFilter", "游戏状态")}
								</legend>
								{isMultiStatus ? (
									<ToggleButton
										type="button"
										size="small"
										value="invert"
										onClick={handleInvertStatuses}
										className="min-w-0 whitespace-nowrap px-2"
									>
										<SwapHorizIcon className="mr-0.5 !text-16px" />
										{t("components.FilterSortModal.invertStatuses", "反选")}
									</ToggleButton>
								) : (
									<ToggleButton
										type="button"
										size="small"
										value="all"
										selected={draft.playStatusFilter === "all"}
										onClick={() =>
											setDraft((current) => ({
												...current,
												playStatusFilter: "all",
											}))
										}
										className={`min-w-0 whitespace-nowrap px-2 ${draft.playStatusFilter === "all" ? selectedStatusClassName : ""}`}
									>
										{t("components.FilterSortModal.allStatuses", "全部状态")}
									</ToggleButton>
								)}
								{ALL_PLAY_STATUSES.map((status: PlayStatus) => {
									const selected = selectedStatuses
										? selectedStatuses.includes(status)
										: draft.playStatusFilter === status;
									return (
										<ToggleButton
											type="button"
											key={status}
											size="small"
											value={status}
											selected={selected}
											onClick={() => handleStatusClick(status)}
											className={`min-w-0 whitespace-nowrap px-2 ${selected ? selectedStatusClassName : ""}`}
										>
											{getPlayStatusLabel(t, status)}
										</ToggleButton>
									);
								})}
							</fieldset>
						</div>
						<div className="flex flex-col gap-2">
							<div className="flex items-center gap-2">
								<LocalOfferIcon fontSize="small" className="text-primary" />
								<Typography variant="caption" color="text.secondary">
									{t("components.FilterSortModal.tagFilter", "Tag 筛选")}
								</Typography>
								{draft.tagFilters.length > 0 && (
									<Chip
										size="small"
										label={draft.tagFilters.length}
										color="primary"
									/>
								)}
							</div>
							<Autocomplete
								multiple
								freeSolo
								options={tagOptions}
								value={draft.tagFilters}
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
											draft.tagFilters.length === 0
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

				<SortSection
					options={gameSortOptions.map((option) => ({
						value: option.value,
						label: t(`components.FilterSortModal.${option.labelKey}`),
					}))}
					sortValue={draft.sortOption}
					sortOrder={draft.sortOrder}
					onSortValueChange={(option) =>
						setDraft((current) => ({ ...current, sortOption: option }))
					}
					onSortOrderChange={(order) =>
						setDraft((current) => ({ ...current, sortOrder: order }))
					}
					footer={
						<FormControlLabel
							control={
								<Switch
									size="small"
									checked={draft.showCardSortFieldOverlay}
									onChange={(event) =>
										setDraft((current) => ({
											...current,
											showCardSortFieldOverlay: event.target.checked,
										}))
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
					}
				/>
			</FilterSortDialog>
		</>
	);
}

function CollectionEntityFilterSortModal({
	sortFields,
	sortField,
	sortOrder,
	onApply,
}: CollectionEntityFilterSortModalProps) {
	const { t } = useTranslation();
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState({ sortField, sortOrder });

	const handleClose = () => setOpen(false);
	const handleOpen = () => {
		setDraft({ sortField, sortOrder });
		setOpen(true);
	};
	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		onApply(draft.sortField, draft.sortOrder);
		handleClose();
	};

	const title = t("pages.Collection.entitySort.label", "排序");

	return (
		<>
			<Button onClick={handleOpen} startIcon={<SortIcon />}>
				{title}
			</Button>
			<FilterSortDialog
				open={open}
				onClose={handleClose}
				onSubmit={handleSubmit}
				titleId="collection-entity-sort-dialog-title"
				title={title}
				icon={<SortIcon fontSize="small" className="text-primary" />}
			>
				<SortSection
					options={sortFields.map((field) => ({
						value: field,
						label: getCollectionEntitySortFieldLabel(t, field),
					}))}
					sortValue={draft.sortField}
					sortOrder={draft.sortOrder}
					onSortValueChange={(field) =>
						setDraft((current) => ({ ...current, sortField: field }))
					}
					onSortOrderChange={(order) =>
						setDraft((current) => ({ ...current, sortOrder: order }))
					}
				/>
			</FilterSortDialog>
		</>
	);
}

export function FilterSortModal(props: FilterSortModalProps) {
	if (props.mode === "collection-entity") {
		return <CollectionEntityFilterSortModal {...props} />;
	}

	return <GameFilterSortModal {...props} />;
}
