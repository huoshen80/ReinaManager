/**
 * @file SearchBox 组件
 * @description 游戏库顶部搜索框组件，支持输入关键字实时搜索，集成防抖、清空、国际化等功能。
 * @module src/components/SearchBox/index
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - SearchBox：游戏搜索输入框组件
 *
 * 依赖：
 * - @mui/material
 * - @mui/icons-material
 * - @/store
 * - react-i18next
 */

import SearchIcon from "@mui/icons-material/Search";
import { Autocomplete, Box, TextField } from "@mui/material";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDebouncedValue } from "@/hooks/common/useDebouncedValue";
import { useFilteredGamesFacade } from "@/hooks/features/games/useGameListFacade";
import { useStore } from "@/store/appStore";
import {
	getSearchSuggestionsFromData,
	preprocessSuggestionData,
} from "@/utils/game/enhancedSearch";

// 配置常量
const DEBOUNCE_SEARCH = 250;
const DEBOUNCE_SUGGESTIONS = 150;
const MAX_SUGGESTIONS = 8;
const MIN_SEARCH_LENGTH = 2;

// 语言对应的搜索框宽度配置
const SEARCH_BOX_WIDTH_CONFIG: Record<string, string> = {
	zh: "clamp(220px, 28vw, 400px)",
	ja: "clamp(175px, 17vw, 400px)",
	default: "clamp(200px, 20vw, 400px)",
};

/**
 * SearchBox 组件
 * 用于输入关键字实时搜索游戏，支持防抖、清空、国际化。
 *
 * @component
 * @returns {JSX.Element} 搜索输入框
 */
export const SearchBox = () => {
	const { t, i18n } = useTranslation();
	const searchInput = useStore((state) => state.searchInput);
	const setSearchInput = useStore((state) => state.setSearchInput);
	const setSearchKeyword = useStore((state) => state.setSearchKeyword);
	const { filteredGames } = useFilteredGamesFacade();

	const [isOpen, setIsOpen] = useState(false);

	// 根据语言动态调整搜索框宽度（使用 useMemo 缓存）
	const searchBoxWidth = useMemo(() => {
		const language = i18n.language;
		if (language.startsWith("zh")) return SEARCH_BOX_WIDTH_CONFIG.zh;
		if (language === "ja-JP") return SEARCH_BOX_WIDTH_CONFIG.ja;
		return SEARCH_BOX_WIDTH_CONFIG.default;
	}, [i18n.language]);

	const debouncedSuggestions = useDebouncedValue(
		searchInput,
		DEBOUNCE_SUGGESTIONS,
	);
	const debouncedKeyword = useDebouncedValue(searchInput, DEBOUNCE_SEARCH);

	useEffect(() => {
		setSearchKeyword(debouncedKeyword.trim());
	}, [debouncedKeyword, setSearchKeyword]);

	const suggestionEntries = useMemo(() => {
		if (!isOpen) return [];
		return preprocessSuggestionData(filteredGames);
	}, [filteredGames, isOpen]);

	const commitSearch = useCallback(
		(value: string) => {
			setSearchKeyword(value.trim());
		},
		[setSearchKeyword],
	);

	const commitSuggestion = useCallback(
		(value: string) => {
			setSearchInput(value);
			commitSearch(value);
			setIsOpen(false);
		},
		[commitSearch, setSearchInput],
	);

	// 生成搜索建议（只做字符串匹配）
	const suggestions = useMemo(() => {
		if (
			!isOpen ||
			!debouncedSuggestions?.trim() ||
			debouncedSuggestions.length < MIN_SEARCH_LENGTH
		) {
			return [];
		}

		try {
			return getSearchSuggestionsFromData(
				suggestionEntries,
				debouncedSuggestions,
				MAX_SUGGESTIONS,
			);
		} catch (error) {
			console.error("生成搜索建议失败:", error);
			return [];
		}
	}, [debouncedSuggestions, isOpen, suggestionEntries]);

	// 处理选择
	const handleSelect = useCallback(
		(_: React.SyntheticEvent, value: string | null) => {
			if (value) {
				commitSuggestion(value);
			}
		},
		[commitSuggestion],
	);

	// 处理输入变化——即时更新 searchInput，防抖后才同步到 searchKeyword
	const handleInputChange = useCallback(
		(_event: React.SyntheticEvent, newInputValue: string, reason: string) => {
			if (reason === "input") {
				setSearchInput(newInputValue);
				setIsOpen(true);
			} else if (reason === "clear") {
				setSearchInput("");
				commitSearch("");
				setIsOpen(false);
			}
		},
		[commitSearch, setSearchInput],
	);

	// 处理键盘事件
	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (event.ctrlKey) return; // 允许 Ctrl 组合键

			if (event.key === "Escape") {
				setIsOpen(false);
				event.stopPropagation();
			} else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
				commitSearch(searchInput);
				setIsOpen(false);
				event.stopPropagation();
			}
		},
		[commitSearch, searchInput],
	);

	return (
		<Box sx={{ width: searchBoxWidth }}>
			<Autocomplete
				freeSolo
				value={null}
				onOpen={() => setIsOpen(true)}
				onClose={() => setIsOpen(false)}
				options={suggestions}
				filterOptions={(options) => options}
				inputValue={searchInput}
				selectOnFocus={false}
				clearOnBlur={false}
				blurOnSelect={false}
				onInputChange={handleInputChange}
				onChange={handleSelect}
				sx={{
					"& .MuiOutlinedInput-root": {
						transition: "all 0.3s",
						"&:hover .MuiOutlinedInput-notchedOutline": {
							borderColor: "primary.main",
						},
						"&.Mui-focused": {
							"& .MuiOutlinedInput-notchedOutline": {
								borderColor: "primary.main",
								borderWidth: 2,
							},
						},
					},
				}}
				renderInput={(params) => (
					<TextField
						{...params}
						variant="outlined"
						size="small"
						placeholder={t("components.SearchBox.search", "搜索")}
						onKeyDown={handleKeyDown}
						slotProps={{
							input: {
								...params.InputProps,
								startAdornment: (
									<SearchIcon fontSize="small" className="mr-1" />
								),
							},
						}}
					/>
				)}
				renderOption={(props, option) => {
					const { key, ...optionProps } = props;

					return (
						<Box
							component="li"
							key={key}
							{...optionProps}
							onMouseDown={(event) => {
								event.preventDefault();
								event.stopPropagation();
								commitSuggestion(option);
							}}
							className="flex items-center gap-2 px-3 py-2 cursor-pointer"
							sx={{ "&:hover": { bgcolor: "action.hover" } }}
						>
							<SearchIcon fontSize="small" />
							<span className="flex-1 truncate text-sm">{option}</span>
						</Box>
					);
				}}
				slotProps={{
					paper: {
						className: "mt-1 rounded-lg shadow-lg",
						sx: { bgcolor: "background.paper" },
					},
					listbox: {
						className: "py-1",
						sx: { maxHeight: "60vh" },
					},
				}}
			/>
		</Box>
	);
};
