/**
 * @file ManageGamesDialog 管理游戏弹窗组件
 * @description 双栏穿梭框模式的游戏管理对话框，支持添加/移除游戏到分类
 * @module src/components/Collection/ManageGamesDialog
 * @author ReinaManager
 * @copyright AGPL-3.0
 */

import CloseIcon from "@mui/icons-material/Close";
import SearchIcon from "@mui/icons-material/Search";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Pagination from "@mui/material/Pagination";
import Paper from "@mui/material/Paper";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { snackbar } from "@/components/Snackbar";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useStore } from "@/store";
import type { GameData } from "@/types";
import { getGameDisplayName } from "@/utils";
import { enhancedSearch } from "@/utils/enhancedSearch";

interface ManageGamesDialogProps {
	open: boolean;
	onClose: () => void;
	categoryId: number;
	categoryName?: string;
}

const GAMES_PER_PAGE = 10;

/**
 * 管理游戏弹窗组件
 */
export const ManageGamesDialog: React.FC<ManageGamesDialogProps> = ({
	open,
	onClose,
	categoryId,
	categoryName,
}) => {
	const { t, i18n } = useTranslation();
	const { allGames, categoryGamesCache, updateCategoryGames } = useStore();

	// 从缓存获取分类游戏 ID（未经 NSFW 筛选的完整列表）
	const categoryGameIds = useMemo(() => {
		return categoryGamesCache[categoryId] || [];
	}, [categoryGamesCache, categoryId]);

	// 对话框状态
	const [leftSearchInput, setLeftSearchInput] = useState(""); // 左栏搜索输入
	const [rightSearchInput, setRightSearchInput] = useState(""); // 右栏搜索输入

	// 防抖后的搜索值（300ms 延迟）
	const leftSearchText = useDebouncedValue(leftSearchInput, 300);
	const rightSearchText = useDebouncedValue(rightSearchInput, 300);
	const [leftPage, setLeftPage] = useState(1); // 左栏页码
	const [rightPage, setRightPage] = useState(1); // 右栏页码
	const [gamesInCategory, setGamesInCategory] = useState<Set<number>>(
		new Set(),
	); // 当前分类中的游戏ID
	const [isProcessing, setIsProcessing] = useState(false);

	// 初始化：加载分类游戏
	useEffect(() => {
		if (open && categoryId > 0) {
			setLeftSearchInput("");
			setRightSearchInput("");
			setLeftPage(1);
			setRightPage(1);
		}
	}, [open, categoryId]);

	// 同步分类游戏到本地状态（使用未筛选的 ID 列表）
	useEffect(() => {
		if (open) {
			setGamesInCategory(new Set(categoryGameIds));
		}
	}, [open, categoryGameIds]);

	// 左栏：未在分类中的游戏
	const availableGames = useMemo(() => {
		return allGames.filter((game) => !gamesInCategory.has(game.id ?? -1));
	}, [allGames, gamesInCategory]);

	// 右栏：已在分类中的游戏
	const categoryGamesList = useMemo(() => {
		return allGames.filter((game) => gamesInCategory.has(game.id ?? -1));
	}, [allGames, gamesInCategory]);

	// 左栏搜索过滤
	const filteredAvailableGames = useMemo(() => {
		if (!leftSearchText) return availableGames;

		const searchResults = enhancedSearch(availableGames, leftSearchText, {
			limit: 1000,
			threshold: 0.4,
			enablePinyin: true,
		});

		return searchResults.map((result) => result.item);
	}, [availableGames, leftSearchText]);

	// 右栏搜索过滤
	const filteredCategoryGames = useMemo(() => {
		if (!rightSearchText) return categoryGamesList;

		const searchResults = enhancedSearch(categoryGamesList, rightSearchText, {
			limit: 1000,
			threshold: 0.4,
			enablePinyin: true,
		});

		return searchResults.map((result) => result.item);
	}, [categoryGamesList, rightSearchText]);

	// 左栏分页数据
	const paginatedAvailableGames = useMemo(() => {
		const startIndex = (leftPage - 1) * GAMES_PER_PAGE;
		const endIndex = startIndex + GAMES_PER_PAGE;
		return filteredAvailableGames.slice(startIndex, endIndex);
	}, [filteredAvailableGames, leftPage]);

	// 右栏分页数据
	const paginatedCategoryGames = useMemo(() => {
		const startIndex = (rightPage - 1) * GAMES_PER_PAGE;
		const endIndex = startIndex + GAMES_PER_PAGE;
		return filteredCategoryGames.slice(startIndex, endIndex);
	}, [filteredCategoryGames, rightPage]);

	// 计算总页数
	const leftTotalPages = Math.ceil(
		filteredAvailableGames.length / GAMES_PER_PAGE,
	);
	const rightTotalPages = Math.ceil(
		filteredCategoryGames.length / GAMES_PER_PAGE,
	);

	/**
	 * 游戏列表项组件 - 使用 React.memo 优化
	 */
	const GameListItem = React.memo<{
		game: GameData;
		checked: boolean;
		onClick: (gameId: number) => void;
	}>(({ game, checked, onClick }) => {
		const gameId = game.id;
		if (!gameId) return null;

		return (
			<ListItem disablePadding>
				<ListItemButton onClick={() => onClick(gameId)} dense>
					<Checkbox
						checked={checked}
						tabIndex={-1}
						disableRipple
						size="small"
					/>
					<ListItemText
						primary={getGameDisplayName(game, i18n.language)}
						primaryTypographyProps={{ variant: "body2" }}
					/>
				</ListItemButton>
			</ListItem>
		);
	});

	GameListItem.displayName = "GameListItem";

	/**
	 * 添加游戏到分类（左栏点击 → 移到右栏）
	 */
	const handleAddGameToCategory = useCallback((gameId: number) => {
		setGamesInCategory((prev) => {
			const newSet = new Set(prev);
			newSet.add(gameId);
			return newSet;
		});
	}, []);

	/**
	 * 从分类移除游戏（右栏点击 → 移到左栏）
	 */
	const handleRemoveGameFromCategory = useCallback((gameId: number) => {
		setGamesInCategory((prev) => {
			const newSet = new Set(prev);
			newSet.delete(gameId);
			return newSet;
		});
	}, []);

	/**
	 * 保存游戏变更
	 */
	const handleSaveGamesChanges = async () => {
		if (categoryId < 0) {
			console.warn("无法修改虚拟分类");
			snackbar.warning(
				t("components.Collection.errors.cannotModifyVirtualCategory"),
			);
			return;
		}

		setIsProcessing(true);
		// 保存原始状态以便回滚
		const originalGamesInCategory = new Set(gamesInCategory);

		try {
			// 将当前分类中的游戏列表完全替换为 gamesInCategory
			const gameIdsArray = Array.from(gamesInCategory);
			await updateCategoryGames(gameIdsArray, categoryId);

			// 成功提示
			snackbar.success(
				t("components.Collection.success.categoryGamesUpdated", {
					count: gameIdsArray.length,
					defaultValue: `已更新分类游戏：${gameIdsArray.length} 个`,
				}),
			);

			// 关闭对话框
			onClose();
		} catch (error) {
			console.error("修改分类游戏失败:", error);

			// 回滚到原始状态
			setGamesInCategory(originalGamesInCategory);

			// 错误提示
			snackbar.error(
				t("components.Collection.errors.updateCategoryGamesFailed", {
					defaultValue: "更新分类游戏失败，请重试",
				}),
			);
		} finally {
			setIsProcessing(false);
		}
	};

	return (
		<Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
			<DialogTitle>
				<Box display="flex" alignItems="center" justifyContent="space-between">
					<Typography variant="h6">
						{categoryName
							? `${t("components.Toolbar.Category.manageGamesTitle")} - ${categoryName}`
							: t("components.Toolbar.Category.manageGamesTitle")}
					</Typography>
					<IconButton onClick={onClose} size="small">
						<CloseIcon />
					</IconButton>
				</Box>
			</DialogTitle>
			<DialogContent>
				{/* 双栏穿梭框布局 */}
				<Box display="flex" gap={3} alignItems="stretch" minHeight={500}>
					{/* 左栏：可用游戏 */}
					<Paper
						elevation={2}
						sx={{ flex: 1, display: "flex", flexDirection: "column", p: 2 }}
					>
						<Typography variant="subtitle1" gutterBottom fontWeight="bold">
							{t("components.Toolbar.Category.availableGames")} (
							{availableGames.length})
						</Typography>

						{/* 左栏搜索框 */}
						<TextField
							autoFocus
							fullWidth
							size="small"
							placeholder={t("components.Toolbar.Category.searchPlaceholder")}
							value={leftSearchInput}
							onChange={(e) => {
								setLeftSearchInput(e.target.value);
								setLeftPage(1); // 搜索时重置到第一页
							}}
							InputProps={{
								startAdornment: (
									<SearchIcon sx={{ mr: 1, color: "action.active" }} />
								),
							}}
							sx={{ mb: 2 }}
						/>

						{/* 左栏游戏列表 */}
						<Box
							sx={{
								flex: 1,
								overflow: "auto",
								border: "1px solid",
								borderColor: "divider",
								borderRadius: 1,
								minHeight: 0, // 防止 flex 子元素撑开父容器
							}}
						>
							{filteredAvailableGames.length === 0 ? (
								<Typography
									variant="body2"
									color="text.secondary"
									textAlign="center"
									py={3}
								>
									{leftSearchText
										? t("components.Toolbar.Category.noSearchResults")
										: t("components.Toolbar.Category.noGames")}
								</Typography>
							) : (
								<List dense>
									{paginatedAvailableGames.map((game) => (
										<GameListItem
											key={game.id}
											game={game}
											checked={false}
											onClick={handleAddGameToCategory}
										/>
									))}
								</List>
							)}
						</Box>

						{/* 左栏分页 */}
						{leftTotalPages > 1 && (
							<Box display="flex" justifyContent="center" mt={2}>
								<Pagination
									count={leftTotalPages}
									page={leftPage}
									onChange={(_, page) => setLeftPage(page)}
									size="small"
									color="primary"
								/>
							</Box>
						)}

						{/* 左栏统计 */}
						<Typography variant="caption" color="text.secondary" mt={1}>
							共 {filteredAvailableGames.length} 个游戏
						</Typography>
					</Paper>

					{/* 右栏：分类中的游戏 */}
					<Paper
						elevation={2}
						sx={{ flex: 1, display: "flex", flexDirection: "column", p: 2 }}
					>
						<Typography variant="subtitle1" gutterBottom fontWeight="bold">
							{t("components.Toolbar.Category.gamesInCategory")} (
							{categoryGamesList.length})
						</Typography>

						{/* 右栏搜索框 */}
						<TextField
							fullWidth
							size="small"
							placeholder={t("components.Toolbar.Category.searchPlaceholder")}
							value={rightSearchInput}
							onChange={(e) => {
								setRightSearchInput(e.target.value);
								setRightPage(1); // 搜索时重置到第一页
							}}
							InputProps={{
								startAdornment: (
									<SearchIcon sx={{ mr: 1, color: "action.active" }} />
								),
							}}
							sx={{ mb: 2 }}
						/>

						{/* 右栏游戏列表 */}
						<Box
							sx={{
								flex: 1,
								overflow: "auto",
								border: "1px solid",
								borderColor: "divider",
								borderRadius: 1,
								minHeight: 0, // 防止 flex 子元素撑开父容器
							}}
						>
							{filteredCategoryGames.length === 0 ? (
								<Typography
									variant="body2"
									color="text.secondary"
									textAlign="center"
									py={3}
								>
									{rightSearchText
										? t("components.Toolbar.Category.noSearchResults")
										: t("components.Toolbar.Category.noGamesInCategory")}
								</Typography>
							) : (
								<List dense>
									{paginatedCategoryGames.map((game) => (
										<GameListItem
											key={game.id}
											game={game}
											checked={true}
											onClick={handleRemoveGameFromCategory}
										/>
									))}
								</List>
							)}
						</Box>

						{/* 右栏分页 */}
						{rightTotalPages > 1 && (
							<Box display="flex" justifyContent="center" mt={2}>
								<Pagination
									count={rightTotalPages}
									page={rightPage}
									onChange={(_, page) => setRightPage(page)}
									size="small"
									color="primary"
								/>
							</Box>
						)}

						{/* 右栏统计 */}
						<Typography variant="caption" color="text.secondary" mt={1}>
							共 {filteredCategoryGames.length} 个游戏
						</Typography>
					</Paper>
				</Box>
			</DialogContent>

			{/* 底部按钮 */}
			<DialogActions sx={{ px: 3, pb: 2 }}>
				<Button onClick={onClose} disabled={isProcessing}>
					{t("common.cancel")}
				</Button>
				<Button
					variant="contained"
					onClick={handleSaveGamesChanges}
					disabled={isProcessing}
				>
					{isProcessing
						? t("common.saving")
						: t("components.Toolbar.Category.save")}
				</Button>
			</DialogActions>
		</Dialog>
	);
};
