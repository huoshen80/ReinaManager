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

import { useState, useEffect, useCallback } from 'react';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import Autocomplete from '@mui/material/Autocomplete';
import ClearIcon from '@mui/icons-material/Clear';
import SearchIcon from '@mui/icons-material/Search';
import { useStore } from '@/store';
import { useTranslation } from 'react-i18next';
import { getSearchSuggestions } from '@/utils/enhancedSearch';

/**
 * 防抖 Hook，用于延迟返回输入值，减少频繁触发搜索。
 * @template T
 * @param {T} value 输入值
 * @param {number} delay 延迟时间（毫秒）
 * @returns {T} 防抖后的值
 */
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(timer);
        };
    }, [value, delay]);

    return debouncedValue;
}

/**
 * SearchBox 组件
 * 用于输入关键字实时搜索游戏，支持防抖、清空、国际化。
 *
 * @component
 * @returns {JSX.Element} 搜索输入框
 */
export const SearchBox = () => {
    const { t } = useTranslation();
    const { searchKeyword, searchGames, games, allGames } = useStore();
    const [keyword, setKeyword] = useState(searchKeyword);
    const [suggestions, setSuggestions] = useState<string[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isFocused, setIsFocused] = useState(false);
    const [hasInput, setHasInput] = useState(false);

    // 对输入值应用防抖
    const debouncedKeyword = useDebounce(keyword, 300);
    const debouncedSuggestions = useDebounce(keyword, 150); // 建议的防抖时间更短

    /**
     * 执行搜索
     * @param {string} term 搜索关键字
     */
    const performSearch = useCallback((term: string) => {
        searchGames(term);
    }, [searchGames]);

    // 同步全局状态
    useEffect(() => {
        setKeyword(searchKeyword);
        setHasInput(Boolean(searchKeyword && searchKeyword.trim()));
    }, [searchKeyword]);

    // 当防抖后的关键字变化时，执行搜索
    useEffect(() => {
        performSearch(debouncedKeyword);
    }, [debouncedKeyword, performSearch]);

    // 生成搜索建议
    useEffect(() => {
        if (debouncedSuggestions && debouncedSuggestions.trim() !== '' && debouncedSuggestions.length > 1) {
            try {
                // 使用所有游戏数据来生成建议，而不仅仅是当前显示的游戏
                const searchSuggestions = getSearchSuggestions(allGames.length > 0 ? allGames : games, debouncedSuggestions, 8);
                setSuggestions(searchSuggestions);
            } catch (error) {
                console.error('生成搜索建议失败:', error);
                setSuggestions([]);
            }
        } else {
            setSuggestions([]);
        }
    }, [debouncedSuggestions, allGames, games]);

    /**
     * 处理焦点事件
     */
    const handleFocus = useCallback(() => {
        setIsFocused(true);
    }, []);

    const handleBlur = useCallback(() => {
        setIsFocused(false);
        // 如果没有输入内容，延迟收缩
        if (!keyword.trim()) {
            setTimeout(() => {
                setHasInput(false);
            }, 200);
        }
    }, [keyword]);

    /**
     * 处理自动完成选择
     * @param {React.SyntheticEvent} _event 事件对象
     * @param {string | null} value 选择的值
     */
    const handleAutocompleteChange = useCallback((_event: React.SyntheticEvent, value: string | null) => {
        if (value) {
            setKeyword(value);
            setHasInput(true);
            performSearch(value);
            setIsOpen(false);
        }
    }, [performSearch]);

    /**
     * 处理键盘事件 - 确保不干扰正常的快捷键
     */
    const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
        // 对于所有 Ctrl 组合键，都不阻止默认行为
        if (event.ctrlKey) {
            return; // 允许 Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X 等
        }
        
        // ESC 键关闭建议
        if (event.key === 'Escape') {
            setIsOpen(false);
            event.stopPropagation();
            return;
        }
        
        // Enter 键执行搜索并关闭建议
        if (event.key === 'Enter') {
            if (isOpen) {
                // 如果下拉框打开，让 Autocomplete 处理选择
                return;
            } else {
                // 如果下拉框关闭，执行搜索
                performSearch(keyword);
                setIsOpen(false);
                event.stopPropagation();
            }
        }
    }, [isOpen, keyword, performSearch]);

    /**
     * 清除搜索内容
     */
    const handleClear = () => {
        setKeyword('');
        setSuggestions([]);
        setIsOpen(false);
        setHasInput(false);
        // 清除后立即搜索，不用等待防抖
        performSearch('');
    };

    return (
        <div style={{ 
            // 固定容器宽度，防止影响其他元素
            width: isFocused || hasInput ? '400px' : '280px',
            maxWidth: 'min(40vw, 400px)', // 最大不超过40%视窗宽度
            transition: 'width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            overflow: 'visible', // 允许下拉框溢出
        }}>
            <Autocomplete
            freeSolo
            open={isOpen && suggestions.length > 0}
            onOpen={() => setIsOpen(true)}
            onClose={() => setIsOpen(false)}
            options={suggestions}
            inputValue={keyword}
            selectOnFocus={false}  // 不要在焦点时自动选择
            clearOnBlur={false}    // 失去焦点时不清除  
            handleHomeEndKeys={false}  // 禁用 Home/End 键处理
            disableClearable={true}  // 禁用内置清除按钮
            blurOnSelect={false}    // 选择后不失去焦点
            onInputChange={(_event, newInputValue, reason) => {
                if (reason === 'input') {
                    setKeyword(newInputValue);
                    setHasInput(Boolean(newInputValue.trim()));
                    setIsOpen(true);
                } else if (reason === 'clear') {
                    handleClear();
                }
            }}
            onChange={handleAutocompleteChange}
            sx={{
                // 在容器内占满宽度
                width: '100%',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', // 平滑过渡动画
                '& .MuiOutlinedInput-root': {
                    borderRadius: 3,
                    backgroundColor: 'background.paper',
                    transition: 'all 0.3s ease',
                    '&:hover': {
                        boxShadow: 1,
                        '& .MuiOutlinedInput-notchedOutline': {
                            borderColor: 'primary.main',
                        },
                    },
                    '&.Mui-focused': {
                        boxShadow: 2,
                        '& .MuiOutlinedInput-notchedOutline': {
                            borderColor: 'primary.main',
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
                    aria-label={t('components.SearchBox.searchGame')}
                    placeholder={isFocused || hasInput ? t('components.SearchBox.inputGameName') : t('components.SearchBox.search')}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    slotProps={{
                        input: {
                            ...params.InputProps,
                            endAdornment: null, // 完全移除Autocomplete的默认endAdornment
                            startAdornment: (
                                <InputAdornment position="start">
                                    <SearchIcon 
                                        fontSize="small" 
                                        sx={{ 
                                            color: isFocused || keyword ? 'primary.main' : 'text.secondary',
                                            transition: 'color 0.3s ease',
                                        }} 
                                    />
                                </InputAdornment>
                            ),
                            // 确保原生输入行为正常工作
                            onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
                                // 让原生快捷键正常工作
                                if (event.ctrlKey || event.metaKey) {
                                    event.stopPropagation();
                                }
                                // 调用我们的处理器
                                handleKeyDown(event);
                            },
                        },
                    }}
                    InputProps={{
                        ...params.InputProps,
                        endAdornment: (
                            <InputAdornment position="end">
                                {keyword && (
                                    <IconButton
                                        onClick={handleClear}
                                        size="small"
                                        aria-label={t('components.SearchBox.clearSearch')}
                                        sx={{
                                            p: 0.5,
                                            '&:hover': {
                                                backgroundColor: 'action.hover',
                                            },
                                        }}
                                    >
                                        <ClearIcon fontSize="small" />
                                    </IconButton>
                                )}
                            </InputAdornment>
                        ),
                    }}
                />
            )}
            renderOption={(props, option) => {
                const { key, ...otherProps } = props;
                return (
                    <li 
                        key={option}
                        {...otherProps}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '12px 16px',
                            borderRadius: '8px',
                            margin: '4px 8px',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            backgroundColor: 'transparent',
                        }}
                    >
                        <SearchIcon 
                            fontSize="small" 
                            style={{ 
                                marginRight: 12,
                                color: '#1976d2',
                                flexShrink: 0,
                            }} 
                        />
                        <span style={{ 
                            flex: 1,
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontSize: '14px',
                            color: 'inherit',
                        }}>
                            {option}
                        </span>
                    </li>
                );
            }}
            ListboxProps={{
                style: {
                    maxHeight: '60vh',
                    padding: '8px 0',
                },
                sx: {
                    '& .MuiAutocomplete-option': {
                        '&:hover': {
                            backgroundColor: 'rgba(25, 118, 210, 0.08) !important',
                        },
                        '&[aria-selected="true"]': {
                            backgroundColor: 'rgba(25, 118, 210, 0.12) !important',
                            fontWeight: 500,
                        },
                        '&.Mui-focused': {
                            backgroundColor: 'rgba(25, 118, 210, 0.08) !important',
                        },
                    },
                },
            }}
            PaperComponent={(props) => (
                <div 
                    {...props}
                    style={{
                        ...props.style,
                        marginTop: 8,
                        borderRadius: 12,
                        boxShadow: '0 4px 20px rgba(0,0,0,0.1), 0 8px 40px rgba(0,0,0,0.05)',
                        border: '1px solid rgba(0,0,0,0.06)',
                        backgroundColor: '#ffffff',
                        minWidth: props.style?.width || 'auto',
                        overflow: 'hidden',
                    }}
                />
            )}
        />
        </div>
    );
}
