/**
 * @file 游戏详情页
 * @description 展示单个游戏的详细信息、统计数据、标签、简介等，包含统计信息卡片和近7天游玩时长折线图，支持国际化。
 * @module src/pages/Detail/index
 * @author ReinaManager
 * @copyright AGPL-3.0
 *
 * 主要导出：
 * - Detail：游戏详情页面主组件
 *
 * 依赖：
 * - @mui/material
 * - @/store
 * - @/store/gamePlayStore
 * - @/types
 * - react-i18next
 * - react-router
 */

import ClearIcon from "@mui/icons-material/Clear";
import CollectionsBookmarkIcon from "@mui/icons-material/CollectionsBookmark";
import SearchIcon from "@mui/icons-material/Search";
import {
	Box,
	Button,
	Chip,
	CircularProgress,
	Stack,
	Tab,
	Tabs,
	Typography,
} from "@mui/material";
import { PageContainer } from "@toolpad/core/PageContainer";
import { useActivePage } from "@toolpad/core/useActivePage";
import { useCallback, useLayoutEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { CollectionPickerDialog } from "@/components/Collection";
import { useVirtualCategories } from "@/hooks/features/collections/useVirtualCollections";
import { useGameById } from "@/hooks/features/games/useGameFacade";
import { useGameIndex } from "@/hooks/features/games/useGameListFacade";
import { useStore } from "@/store/appStore";
import { DefaultGroup } from "@/types/collection";
import { getGameCover, getGameDisplayName } from "@/utils/game";
import { getDeveloperNames } from "@/utils/game/gameIndex";
import { getTagDisplayName } from "@/utils/game/tagTranslation";
import { Edit } from "./Edit";
import { GameStatsOverview } from "./GameStatsOverview";
import { Review } from "./Review";
import { SaveData } from "./SaveData";

// Tab面板组件
interface TabPanelProps {
	children?: React.ReactNode;
	index: number;
	value: number;
}

const TabPanel = (props: TabPanelProps) => {
	const { children, value, index, ...other } = props;

	return (
		<div
			role="tabpanel"
			hidden={value !== index}
			id={`game-tab-${index}`}
			aria-labelledby={`game-tab-${index}`}
			{...other}
		>
			{value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
		</div>
	);
};

function formatScoreValue(value: number | null | undefined) {
	return typeof value === "number" && value > 0 ? value.toFixed(1) : "-";
}

function hasRating(value: number | null | undefined) {
	return typeof value === "number" && value > 0;
}

/**
 * Detail 组件
 * 游戏详情页面主组件，展示游戏图片、基本信息、标签、统计、简介等。
 *
 * @component
 * @returns {JSX.Element} 游戏详情页面
 */
export const Detail: React.FC = () => {
	const location = useLocation();
	const id = Number(location.pathname.split("/").at(-1));
	const { t } = useTranslation();
	const navigate = useNavigate();
	const {
		tagTranslation,
		setTagFilters,
		setSelectedGameId,
		setCurrentGroup,
		setSelectedCategory,
	} = useStore(
		useShallow((s) => ({
			tagTranslation: s.tagTranslation,
			setTagFilters: s.setTagFilters,
			setSelectedGameId: s.setSelectedGameId,
			setCurrentGroup: s.setCurrentGroup,
			setSelectedCategory: s.setSelectedCategory,
		})),
	);
	const { selectedGame, isLoadingSelectedGame } = useGameById(id);
	const { index: gameIndex } = useGameIndex();
	const virtualCategories = useVirtualCategories(gameIndex);
	const [tabIndex, setTabIndex] = useState(0);
	const [collectionDialogOpen, setCollectionDialogOpen] = useState(false);
	const [showAllTags, setShowAllTags] = useState(false); // 控制标签折叠状态
	const [selectedTags, setSelectedTags] = useState<string[]>([]);

	useLayoutEffect(() => {
		const container = document.querySelector<HTMLElement>("main");
		if (container) {
			container.scrollTop = 0;
		}
		setSelectedGameId(id);
		setSelectedTags([]);
	}, [id, setSelectedGameId]);

	const handleTabChange = (_event: React.SyntheticEvent, newValue: number) => {
		setTabIndex(newValue);
	};

	const handleToggleTags = () => {
		setShowAllTags((prev) => !prev);
	};

	const handleTagClick = useCallback((tag: string) => {
		setSelectedTags((current) => {
			if (current.includes(tag)) {
				return current.filter((item) => item !== tag);
			}
			return [...current, tag];
		});
	}, []);

	const handleSearchByTags = useCallback(() => {
		if (selectedTags.length === 0) return;
		setTagFilters(selectedTags);
		navigate("/libraries");
	}, [navigate, selectedTags, setTagFilters]);

	const handleClearSelectedTags = useCallback(() => {
		setSelectedTags([]);
	}, []);

	const handleDeveloperClick = useCallback(
		(developerName: string) => {
			const match = virtualCategories.developerCategories.find(
				(category) => category.name === developerName,
			);
			setCurrentGroup(DefaultGroup.DEVELOPER);
			if (match) {
				setSelectedCategory({
					type: "developer",
					key: match.virtualKey ?? developerName,
				});
			} else {
				setSelectedCategory(null);
			}
			navigate("/collection");
		},
		[
			navigate,
			setCurrentGroup,
			setSelectedCategory,
			virtualCategories.developerCategories,
		],
	);

	const developerChips = useMemo(() => {
		if (!selectedGame) return [];
		const developers = getDeveloperNames(
			selectedGame.developer,
			t("category.unknownDeveloper", "未知开发商"),
		);
		return developers.map((developer) => (
			<Chip
				key={developer}
				label={developer}
				size="small"
				variant="outlined"
				onClick={() => handleDeveloperClick(developer)}
				className="mr-1"
			/>
		));
	}, [selectedGame, t, handleDeveloperClick]);

	const activePage = useActivePage();
	const title = selectedGame
		? getGameDisplayName(selectedGame)
		: t("pages.Detail.loading", "加载中...");
	const breadcrumbs = useMemo(() => {
		const base = activePage?.breadcrumbs ?? [];
		// 使用当前路径，避免手动拼接出重复斜杠或错误段
		const path = location.pathname;
		// 仅在标题存在时追加末级面包屑
		return title ? [...base, { title, path }] : base;
	}, [activePage?.breadcrumbs, location.pathname, title]);

	// 派生状态：基于selectedGame和isDetailLoading计算当前状态
	const isLoading =
		isLoadingSelectedGame || !selectedGame || selectedGame.id !== id;
	const isNotFound = !isLoadingSelectedGame && !selectedGame && id; // 加载完成但仍然没有数据

	// 加载状态UI - 使用骨架屏
	if (isLoading) {
		return (
			<PageContainer key={id} sx={{ maxWidth: "100% !important" }}>
				<Box
					className="p-2"
					display="flex"
					justifyContent="center"
					alignItems="center"
					minHeight="50vh"
				>
					<CircularProgress />
					<Typography sx={{ ml: 2 }}>
						{t("pages.Detail.loading", "加载中...")}
					</Typography>
				</Box>
			</PageContainer>
		);
	}

	// 未找到游戏UI
	if (isNotFound) {
		return (
			<PageContainer key={id} sx={{ maxWidth: "100% !important" }}>
				<Box
					className="p-2"
					display="flex"
					justifyContent="center"
					alignItems="center"
					minHeight="50vh"
				>
					<Typography>
						{t("pages.Detail.notFound", "未找到游戏数据")}
					</Typography>
				</Box>
			</PageContainer>
		);
	}

	return (
		<PageContainer
			key={id}
			title={title}
			breadcrumbs={breadcrumbs}
			sx={{ maxWidth: "100% !important" }}
		>
			<Box className="p-2">
				{/* 顶部区域：图片和基本信息 */}
				<Stack direction={{ xs: "column", md: "row" }} spacing={3}>
					{/* 左侧：游戏图片 */}
					<Box>
						<img
							src={getGameCover(selectedGame)}
							loading="lazy"
							alt={getGameDisplayName(selectedGame)}
							className="max-h-65 max-w-40 lg:max-w-80 rounded-lg shadow-lg select-none"
							onDragStart={(event) => event.preventDefault()}
						/>
					</Box>
					{/* 右侧：游戏信息 */}
					<Box className="flex-1">
						<Stack
							direction={{ xs: "column", sm: "row" }}
							className="flex flex-wrap [&>div]:mr-6 [&>div]:mb-2"
						>
							{selectedGame.id_type === "custom" ? (
								<Box>
									<Typography
										variant="subtitle2"
										fontWeight="bold"
										component="div"
									>
										{t("pages.Detail.gameDatafrom", "数据来源")}
									</Typography>
									<Typography component="div">Custom</Typography>
								</Box>
							) : (
								<Box>
									<Typography
										variant="subtitle2"
										fontWeight="bold"
										component="div"
									>
										{t("pages.Detail.gameDatafrom", "数据来源")}
									</Typography>
									<Typography component="div">
										{selectedGame.id_type}
									</Typography>
								</Box>
							)}
							<Box>
								<Typography
									variant="subtitle2"
									fontWeight="bold"
									component="div"
								>
									{t("pages.Detail.gameDeveloper", "开发")}
								</Typography>
								<Box className="flex flex-wrap items-center">
									{developerChips.length > 0 ? (
										developerChips
									) : (
										<Typography component="div">-</Typography>
									)}
								</Box>
							</Box>
							<Box>
								<Typography
									variant="subtitle2"
									fontWeight="bold"
									component="div"
								>
									{t("pages.Detail.releaseDate", "发布时间")}
								</Typography>
								<Typography component="div">
									{selectedGame.date || "-"}
								</Typography>
							</Box>
							<Box>
								<Typography
									variant="subtitle2"
									fontWeight="bold"
									component="div"
								>
									{t("pages.Detail.addTime", "添加时间")}
								</Typography>
								<Typography component="div">
									{selectedGame.created_at
										? new Date(
												selectedGame.created_at * 1000,
											).toLocaleDateString()
										: "-"}
								</Typography>
							</Box>
							{selectedGame.average_hours !== 0 &&
								selectedGame.average_hours && (
									<Box>
										<Typography
											variant="subtitle2"
											fontWeight="bold"
											component="div"
										>
											{t("pages.Detail.expected_hours", "预计时长")}
										</Typography>
										<Typography component="div">
											{selectedGame.average_hours || "-"}h
										</Typography>
									</Box>
								)}
							{typeof selectedGame.rank === "number" &&
								selectedGame.rank > 0 && (
									<Box>
										<Typography
											variant="subtitle2"
											fontWeight="bold"
											component="div"
										>
											{t("pages.Detail.gameRanking", "游戏排行")}
										</Typography>
										<Typography component="div">{selectedGame.rank}</Typography>
									</Box>
								)}
							{(hasRating(selectedGame.score) ||
								hasRating(selectedGame.custom_data?.user_rating)) && (
								<Box>
									<Typography
										variant="subtitle2"
										fontWeight="bold"
										component="div"
									>
										{t("pages.Detail.score", "评分")}
									</Typography>
									<Stack direction="row" spacing={0.75} className="flex-wrap">
										{hasRating(selectedGame.score) && (
											<Chip
												size="small"
												variant="outlined"
												label={`${t("pages.Detail.siteScore", "站点")} ${formatScoreValue(selectedGame.score)}`}
											/>
										)}
										{hasRating(selectedGame.custom_data?.user_rating) && (
											<Chip
												size="small"
												color="primary"
												variant="outlined"
												label={`${t("pages.Detail.myScore", "我的")} ${formatScoreValue(selectedGame.custom_data?.user_rating)}`}
											/>
										)}
									</Stack>
								</Box>
							)}
						</Stack>
						{/* 标签 */}
						<Box className="mt-2">
							<Box className="flex items-center gap-2 mb-1">
								<Typography
									variant="subtitle2"
									fontWeight="bold"
									component="div"
								>
									{t("pages.Detail.gameTags", "游戏标签")}
								</Typography>
								<Button
									size="small"
									variant="text"
									startIcon={<SearchIcon />}
									disabled={selectedTags.length === 0}
									onClick={handleSearchByTags}
								>
									{t("pages.Detail.searchBySelectedTags", "搜索 ({{count}})", {
										count: selectedTags.length,
									})}
								</Button>
								<Button
									size="small"
									variant="text"
									color="inherit"
									startIcon={<ClearIcon />}
									disabled={selectedTags.length === 0}
									onClick={handleClearSelectedTags}
								>
									{t("pages.Detail.clearSelectedTags", "清空")}
								</Button>
							</Box>
							<Stack direction="row" className="flex-wrap gap-1">
								{(selectedGame.tags || [])
									.slice(0, showAllTags ? undefined : 40) // 根据折叠状态显示标签数量
									.map((tag) => (
										<Chip
											key={tag}
											label={getTagDisplayName(tag, tagTranslation)}
											size="small"
											color={selectedTags.includes(tag) ? "primary" : "default"}
											variant="outlined"
											onClick={() => handleTagClick(tag)}
											sx={
												selectedTags.includes(tag)
													? {
															backgroundColor: "primary.main",
															color: "primary.contrastText",
															"&&:hover": {
																backgroundColor: "primary.dark",
															},
														}
													: {}
											}
										/>
									))}
							</Stack>
							{selectedGame.tags && selectedGame.tags.length > 40 && (
								<Typography
									variant="body2"
									color="primary"
									sx={{ cursor: "pointer", mt: 1 }}
									component={"span"}
									onClick={handleToggleTags}
								>
									{showAllTags
										? t("pages.Detail.collapseTags", "折叠标签")
										: t("pages.Detail.expandTags", "展开标签")}
								</Typography>
							)}
						</Box>
					</Box>
				</Stack>

				{/* 添加Tabs组件 */}
				<Box sx={{ width: "100%" }}>
					<Box
						sx={{ borderBottom: 1, borderColor: "divider" }}
						className="flex items-center gap-2"
					>
						<Tabs
							value={tabIndex}
							onChange={handleTabChange}
							aria-label="game detail tabs"
							className="flex-1 min-w-0"
						>
							<Tab
								label={t("pages.Detail.gameStats", "游戏统计")}
								id="game-tab-0"
								aria-controls="game-tabpanel-0"
							/>
							<Tab
								label={t("pages.Detail.introduction", "简介")}
								id="game-tab-1"
								aria-controls="game-tabpanel-1"
							/>
							<Tab
								label={t("pages.Detail.editPart", "编辑")}
								id="game-tab-2"
								aria-controls="game-tabpanel-2"
							/>
							<Tab
								label={t("pages.Detail.backup", "存档")}
								id="game-tab-3"
								aria-controls="game-tabpanel-3"
							/>
							<Tab
								label={t("pages.Detail.review", "评价")}
								id="game-tab-4"
								aria-controls="game-tabpanel-4"
							/>
						</Tabs>
						<Button
							size="small"
							startIcon={<CollectionsBookmarkIcon />}
							onClick={() => setCollectionDialogOpen(true)}
						>
							{t("pages.Detail.manageCollections", "管理收藏夹")}
						</Button>
					</Box>

					{/* 统计信息Tab */}
					<TabPanel value={tabIndex} index={0}>
						{tabIndex === 0 && <GameStatsOverview gameID={id} />}
					</TabPanel>
					<TabPanel value={tabIndex} index={1}>
						{tabIndex === 1 && (
							/* 游戏简介 */
							<Box>
								<Typography
									className="mt-1 whitespace-pre-line"
									component="div"
								>
									{selectedGame.summary}
								</Typography>
							</Box>
						)}
					</TabPanel>
					<TabPanel value={tabIndex} index={2}>
						{tabIndex === 2 && <Edit />}
					</TabPanel>
					<TabPanel value={tabIndex} index={3}>
						{tabIndex === 3 && <SaveData />}
					</TabPanel>
					<TabPanel value={tabIndex} index={4}>
						{tabIndex === 4 && <Review selectedGame={selectedGame} />}
					</TabPanel>
				</Box>
				<CollectionPickerDialog
					open={collectionDialogOpen}
					mode="manage"
					gameIds={[selectedGame.id]}
					onClose={() => setCollectionDialogOpen(false)}
				/>
			</Box>
		</PageContainer>
	);
};
