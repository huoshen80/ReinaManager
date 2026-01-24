import DeleteIcon from "@mui/icons-material/Delete";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import SaveIcon from "@mui/icons-material/Save";
import {
	Box,
	Button,
	Card,
	CardContent,
	Chip,
	CircularProgress,
	FormControlLabel,
	Stack,
	Switch,
	TextField,
	Typography,
} from "@mui/material";
import { basename } from "pathe";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { snackbar } from "@/components/Snackbar";
import { useImagePreview } from "@/hooks/useImagePreview";
import type { CustomData, GameData, UpdateGameParams } from "@/types";
import {
	getArrayDiff,
	getBoolDiff,
	getDiff,
	getGameCover,
	getGameDisplayName,
	getGameNsfwStatus,
	handleDirectory,
} from "@/utils";
import { selectImageFile, uploadSelectedImage } from "@/utils/customCover";
import i18n from "@/utils/i18n";

// 公共样式常量
const CHIP_INPUT_BOX_SX = {
	display: "flex",
	flexWrap: "wrap",
	alignItems: "center",
	gap: 0.5,
	p: 1,
	border: "1px solid",
	borderColor: "divider",
	borderRadius: 1,
	minHeight: "42px",
	"&:focus-within": {
		borderWidth: "2px",
	},
} as const;

const CHIP_INPUT_STYLE = {
	border: "none",
	outline: "none",
	background: "transparent",
	flex: 1,
	minWidth: "120px",
	fontSize: "14px",
	padding: "4px",
	color: "inherit",
} as const;

interface GameInfoEditProps {
	selectedGame: GameData | null;
	onSave: (data: UpdateGameParams) => Promise<void>;
	disabled?: boolean;
}

/**
 * 构建游戏更新 Payload（使用 getDiff 系列函数简化脏检查逻辑）
 *
 * 三态逻辑：
 * - undefined: 没变，不传（后端跳过此字段）
 * - null: 被清空，传 null（后端更新为 NULL）
 * - value: 被修改，传新值（后端更新为新值）
 */
const buildGameUpdatePayload = (
	originalGame: GameData,
	newLocalPath: string,
	newNote: string,
	language: string,
	newImageExt?: string | null, // undefined=不变, null=删除, string=新图片
	newAliases?: string[],
	newSummary?: string,
	newTags?: string[],
	newDeveloper?: string,
	newNsfw?: boolean,
	newDate?: string,
): UpdateGameParams => {
	const payload: UpdateGameParams = {};

	// 1. 处理 LocalPath（使用 getDiff）
	const localPathDiff = getDiff(newLocalPath, originalGame.localpath);
	if (localPathDiff !== undefined) {
		payload.localpath = localPathDiff;
	}

	// 2. 处理 CustomData（嵌套对象需要整体更新）
	const currentCustomData = originalGame.custom_data || {};

	// 获取展平后的原始值
	const displayName = getGameDisplayName(originalGame, language);
	const currentCustomName = currentCustomData.name || displayName;
	const originalSummary = originalGame.summary ?? "";
	const originalDeveloper = originalGame.developer ?? "";
	const originalNsfw = getGameNsfwStatus(originalGame) ?? false;
	const originalDate = originalGame.date ?? "";

	// 使用浅拷贝作为基础（必须全量更新以防丢失其他字段）
	const nextCustomData: CustomData = { ...currentCustomData };
	let customDataChanged = false;

	// 2.1 检查名称变化
	const nameDiff = getDiff(newNote, currentCustomName);
	if (nameDiff !== undefined) {
		nextCustomData.name = nameDiff;
		customDataChanged = true;
	}

	// 2.2 检查图片变化
	if (newImageExt !== undefined) {
		nextCustomData.image = newImageExt;
		customDataChanged = true;
	}

	// 2.3 检查别名变化
	if (newAliases !== undefined) {
		const aliasesDiff = getArrayDiff(newAliases, currentCustomData.aliases);
		if (aliasesDiff !== undefined) {
			nextCustomData.aliases = aliasesDiff;
			customDataChanged = true;
		}
	}

	// 2.4 检查简介变化
	if (newSummary !== undefined) {
		const summaryDiff = getDiff(newSummary, originalSummary);
		if (summaryDiff !== undefined) {
			nextCustomData.summary = summaryDiff;
			customDataChanged = true;
		}
	}

	// 2.5 检查标签变化
	if (newTags !== undefined) {
		const tagsDiff = getArrayDiff(newTags, currentCustomData.tags);
		if (tagsDiff !== undefined) {
			nextCustomData.tags = tagsDiff;
			customDataChanged = true;
		}
	}

	// 2.6 检查开发商变化
	if (newDeveloper !== undefined) {
		const developerDiff = getDiff(newDeveloper, originalDeveloper);
		if (developerDiff !== undefined) {
			nextCustomData.developer = developerDiff;
			customDataChanged = true;
		}
	}

	// 2.7 检查 NSFW 变化
	if (newNsfw !== undefined) {
		const nsfwDiff = getBoolDiff(newNsfw, originalNsfw);
		if (nsfwDiff !== undefined) {
			nextCustomData.nsfw = nsfwDiff;
			customDataChanged = true;
		}
	}

	// 2.8 检查日期变化
	if (newDate !== undefined) {
		const dateDiff = getDiff(newDate, originalDate);
		if (dateDiff !== undefined) {
			nextCustomData.date = dateDiff;
			customDataChanged = true;
		}
	}

	// 只有当 CustomData 真的变化时才放入 Payload
	if (customDataChanged) {
		payload.custom_data = nextCustomData;
	}

	return payload;
};

export const GameInfoEdit: React.FC<GameInfoEditProps> = ({
	selectedGame,
	onSave,
	disabled = false,
}) => {
	const { t } = useTranslation();

	// 游戏信息编辑相关状态
	const [localPath, setLocalPath] = useState<string>("");
	const [gameNote, setGameNote] = useState<string>("");
	const [aliases, setAliases] = useState<string[]>([]);
	const [summary, setSummary] = useState<string>("");
	const [tags, setTags] = useState<string[]>([]);
	const [developer, setDeveloper] = useState<string>("");
	const [nsfw, setNsfw] = useState<boolean>(false);
	const [releaseDate, setReleaseDate] = useState<string>("");
	const [isLoading, setIsLoading] = useState(false);

	// 标签输入的临时状态
	const [aliasInput, setAliasInput] = useState<string>("");
	const [tagInput, setTagInput] = useState<string>("");

	// 使用自定义 Hook 管理图片预览
	const {
		selectedPath: selectedImagePath,
		previewUrl,
		selectImage,
		cleanup: cleanupPreview,
	} = useImagePreview();

	// 图片删除标记（不立即提交）
	const [shouldDeleteImage, setShouldDeleteImage] = useState(false);

	// 添加临时封面状态，用于平滑过渡
	const [tempCoverUrl, setTempCoverUrl] = useState<string | null>(null);
	// 保存后等待父级数据刷新期间，锁定新封面，避免闪回旧封面
	const [pendingCoverImage, setPendingCoverImage] = useState<string | null>(
		null,
	);

	// 1. 提取初始化函数
	const initForm = useCallback(
		(game: GameData) => {
			setLocalPath(game.localpath ?? "");
			setGameNote(getGameDisplayName(game, i18n.language));
			setAliases(game.custom_data?.aliases ?? []);
			setSummary(game.summary ?? "");
			setTags(game.custom_data?.tags ?? []);
			setDeveloper(game.developer ?? "");
			setNsfw(getGameNsfwStatus(game) ?? false);
			setReleaseDate(game.date ?? "");
			setShouldDeleteImage(false);
			cleanupPreview();
		},
		[cleanupPreview],
	); // cleanupPreview 来自 hook，通常是稳定的

	// 同步 selectedGame prop 到内部状态
	// biome-ignore lint/correctness/useExhaustiveDependencies: <防止不必要的同步>
	useEffect(() => {
		if (selectedGame) {
			initForm(selectedGame);
		} else {
			// 处理 selectedGame 为 null 的情况
			setLocalPath("");
			setGameNote("");
			setAliases([]);
			setSummary("");
			setTags([]);
			setDeveloper("");
			setNsfw(false);
			setReleaseDate("");
			setShouldDeleteImage(false);
		}
	}, [
		// 1. 切换游戏必重置
		selectedGame?.id,
		// 2. 只有当这些"静态属性"被保存更新后，才触发重置
		selectedGame?.bgm_id,
		selectedGame?.vndb_id,
		selectedGame?.ymgal_id,
		selectedGame?.id_type,
		selectedGame?.localpath,
		// 3. 对于对象类型，使用 JSON 字符串化进行"值比较"
		//    否则每次父组件刷新，custom_data 对象引用都会变，导致无限重置
		JSON.stringify(selectedGame?.custom_data),
		initForm,
	]);

	// 当父级数据（selectedGame）已经更新到最新封面时，解除临时封面锁定
	useEffect(() => {
		if (!pendingCoverImage) return;
		if (selectedGame?.custom_data?.image === pendingCoverImage) {
			setPendingCoverImage(null);
			setTempCoverUrl(null);
		}
	}, [pendingCoverImage, selectedGame?.custom_data?.image]);

	// 检查是否有任何更改
	// 重要：比较时必须使用"展平后的原始值"作为基准，与初始化时一致
	const hasChanges = () => {
		if (!selectedGame) return false;

		// 获取展平后的原始值（与 useEffect 初始化时一致）
		const currentDisplayName = getGameDisplayName(selectedGame, i18n.language);
		const currentCustomName =
			selectedGame.custom_data?.name || currentDisplayName;
		const originalSummary = selectedGame.summary ?? "";
		const originalDeveloper = selectedGame.developer ?? "";
		const originalNsfw = getGameNsfwStatus(selectedGame) ?? false;
		const originalDate = selectedGame.date ?? "";

		return (
			localPath !== (selectedGame.localpath ?? "") ||
			gameNote !== currentCustomName ||
			selectedImagePath !== null || // 有选择的图片但未保存
			shouldDeleteImage ||
			JSON.stringify(aliases) !==
				JSON.stringify(selectedGame.custom_data?.aliases ?? []) ||
			summary !== originalSummary ||
			JSON.stringify(tags) !==
				JSON.stringify(selectedGame.custom_data?.tags ?? []) ||
			developer !== originalDeveloper ||
			nsfw !== originalNsfw ||
			releaseDate !== originalDate
		);
	};

	// 处理选择可执行文件路径
	const handleSelectLocalPath = async () => {
		try {
			const selectedPath = await handleDirectory();
			if (selectedPath) {
				setLocalPath(selectedPath);
			}
		} catch (error) {
			snackbar.error(
				`${t("pages.Detail.GameInfoEdit.selectPathFailed", "选择路径失败")}: ${error instanceof Error ? error.message : t("pages.Detail.GameInfoEdit.unknownError", "未知错误")}`,
			);
		}
	};

	// 处理自定义封面文件选择 - 只选择，不立即上传
	const handleCustomCoverSelect = async () => {
		if (!selectedGame || typeof selectedGame.id !== "number") {
			snackbar.error(
				t("pages.Detail.GameInfoEdit.invalidGameId", "无效的游戏ID"),
			);
			return;
		}

		try {
			// 选择图片文件
			const imagePath = await selectImageFile();
			if (!imagePath) return;

			// 重置删除标记，因为用户选择了新图片
			setShouldDeleteImage(false);

			// 使用 Hook 提供的方法加载预览（现在是同步的）
			selectImage(imagePath);
		} catch (error) {
			snackbar.error(
				`${t("pages.Detail.GameInfoEdit.selectImageFailed", "选择图片失败")}: ${error instanceof Error ? error.message : error}`,
			);
		}
	};

	// 获取当前要显示的封面URL
	const getCurrentCoverUrl = () => {
		// 如果标记为删除，显示原始默认封面（无自定义）
		if (shouldDeleteImage && selectedGame) {
			// 返回不含 custom_data.image 的封面
			return getGameCover({
				...selectedGame,
				custom_data: { ...selectedGame.custom_data, image: undefined },
			});
		}

		// 如果有临时封面，优先使用（用于平滑过渡）
		if (tempCoverUrl) {
			return tempCoverUrl;
		}

		// 如果有预览URL（选择了本地文件）
		if (previewUrl) return previewUrl;

		// 最后使用实际封面
		if (!selectedGame) return "";
		return getGameCover(selectedGame);
	};

	// 处理删除自定义封面（标记删除，不立即提交）
	const handleRemoveCustomCover = () => {
		setShouldDeleteImage(true);
		cleanupPreview();
	};

	// 添加别名
	const handleAddAlias = () => {
		const trimmed = aliasInput.trim();
		if (trimmed && !aliases.includes(trimmed)) {
			setAliases([...aliases, trimmed]);
			setAliasInput("");
		}
	};

	// 删除别名
	const handleDeleteAlias = (alias: string) => {
		setAliases(aliases.filter((a) => a !== alias));
	};

	// 别名输入键盘事件
	const handleAliasKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleAddAlias();
		} else if (
			e.key === "Backspace" &&
			aliasInput === "" &&
			aliases.length > 0
		) {
			// 退格键删除最后一个标签
			e.preventDefault();
			setAliases(aliases.slice(0, -1));
		}
	};

	// 添加标签
	const handleAddTag = () => {
		const trimmed = tagInput.trim();
		if (trimmed && !tags.includes(trimmed)) {
			setTags([...tags, trimmed]);
			setTagInput("");
		}
	};

	// 删除标签
	const handleDeleteTag = (tag: string) => {
		setTags(tags.filter((t) => t !== tag));
	};

	// 标签输入键盘事件
	const handleTagKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === "Enter") {
			e.preventDefault();
			handleAddTag();
		} else if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
			// 退格键删除最后一个标签
			e.preventDefault();
			setTags(tags.slice(0, -1));
		}
	};

	// 统一保存所有更改
	const handleSaveAll = async () => {
		if (!selectedGame || !hasChanges()) return;

		setIsLoading(true);

		try {
			let uploadedImageExt: string | null | undefined;

			// 1. 先处理副作用：上传图片或删除图片
			if (shouldDeleteImage) {
				uploadedImageExt = null; // 标记删除
			} else if (selectedImagePath && selectedGame.id) {
				// 上传本地选择的图片
				uploadedImageExt = await uploadSelectedImage(
					selectedGame.id,
					selectedImagePath,
				);
			}

			// 2. 纯逻辑：使用纯函数构建 Payload
			const updateData = buildGameUpdatePayload(
				selectedGame,
				localPath,
				gameNote,
				i18n.language,
				uploadedImageExt,
				aliases,
				summary,
				tags,
				developer,
				nsfw,
				releaseDate,
			);
			// 防御：没有任何字段需要更新时，不发请求
			if (Object.keys(updateData).length === 0) {
				return;
			}

			// 3. 执行保存
			await onSave(updateData);

			// 4. 处理 UI 状态（乐观更新）
			if (uploadedImageExt && typeof uploadedImageExt === "string") {
				// 锁定新封面直到父级数据刷新，避免出现"旧图 -> 新图"的闪回
				setPendingCoverImage(uploadedImageExt);
				const newCoverUrl = getGameCover({
					...selectedGame,
					custom_data: {
						...selectedGame.custom_data,
						image: uploadedImageExt,
					},
				});
				setTempCoverUrl(newCoverUrl);
			} else if (uploadedImageExt === null) {
				// 删除了封面
				setPendingCoverImage(null);
				setTempCoverUrl(null);
			}

			// 延迟清理预览状态，给新封面时间加载
			setTimeout(() => {
				cleanupPreview();
			}, 100);
		} catch (error) {
			snackbar.error(
				`${t("pages.Detail.GameInfoEdit.saveGameInfoFailed", "保存游戏信息失败")}: ${error instanceof Error ? error.message : t("pages.Detail.GameInfoEdit.unknownError", "未知错误")}`,
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Box className="flex flex-col gap-3">
			{/* 封面和基本信息区域 - 放在最上面 */}
			<Card>
				<CardContent>
					<Typography variant="h6" gutterBottom>
						{t("pages.Detail.GameInfoEdit.coverAndBasicInfo", "封面与基本信息")}
					</Typography>

					<Stack direction={{ xs: "column", md: "row" }} spacing={3}>
						{/* 左侧：封面预览和操作 */}
						<Box className="flex-shrink-0">
							<img
								src={getCurrentCoverUrl()}
								alt="Game Cover"
								className="w-70 h-100 object-cover rounded-2 border border-gray-300"
							/>

							{/* 封面操作按钮 */}
							<Stack spacing={1} className="mt-2">
								<Stack direction="row" spacing={1} flexWrap="wrap">
									<Button
										variant="outlined"
										onClick={handleCustomCoverSelect}
										startIcon={<PhotoCameraIcon />}
										disabled={isLoading || disabled || !selectedGame}
										size="small"
									>
										{t("pages.Detail.GameInfoEdit.selectImage", "选择图片")}
									</Button>

									{selectedGame?.custom_data?.image && !shouldDeleteImage && (
										<Button
											variant="outlined"
											onClick={handleRemoveCustomCover}
											startIcon={<DeleteIcon />}
											disabled={isLoading || disabled}
											color="error"
											size="small"
										>
											{t(
												"pages.Detail.GameInfoEdit.removeCustomCover",
												"移除封面",
											)}
										</Button>
									)}
								</Stack>
								{selectedGame?.custom_data?.image &&
									!shouldDeleteImage &&
									!selectedImagePath && (
										<Typography variant="caption" color="textSecondary">
											{t(
												"pages.Detail.GameInfoEdit.hasCustomCover",
												"已设置自定义封面",
											)}
											: {selectedGame.custom_data.image}
										</Typography>
									)}

								{selectedImagePath && (
									<Typography variant="caption" color="primary">
										{t(
											"pages.Detail.GameInfoEdit.previewSelected",
											"已选择新图片，保存后生效",
										)}
										: {basename(selectedImagePath)}
									</Typography>
								)}
							</Stack>
						</Box>

						{/* 右侧：基本信息 */}
						<Stack spacing={3} sx={{ flex: 1 }}>
							{/* 自定义游戏名称 */}
							<TextField
								label={t(
									"pages.Detail.GameInfoEdit.customGameName",
									"自定义游戏名称",
								)}
								variant="outlined"
								fullWidth
								value={gameNote}
								onChange={(e) => setGameNote(e.target.value)}
								disabled={isLoading || disabled || !selectedGame}
								placeholder={
									selectedGame
										? getGameDisplayName(selectedGame, i18n.language)
										: t(
												"pages.Detail.GameInfoEdit.enterGameNote",
												"请输入游戏备注",
											)
								}
								helperText={t(
									"pages.Detail.GameInfoEdit.noteHelperText",
									"您可以为游戏设置一个自定义的显示名称，留空则使用默认名称",
								)}
							/>

							{/* 别名标签 - 在输入框内显示 */}
							<Box>
								<Typography variant="subtitle2" gutterBottom>
									{t("pages.Detail.GameInfoEdit.aliases", "别名")}
								</Typography>
								<Box
									sx={{
										...CHIP_INPUT_BOX_SX,
										"&:focus-within": {
											...CHIP_INPUT_BOX_SX["&:focus-within"],
											borderColor: "primary.main",
										},
									}}
								>
									{aliases.map((alias) => (
										<Chip
											key={alias}
											label={alias}
											onDelete={() => handleDeleteAlias(alias)}
											disabled={isLoading || disabled}
											color="primary"
											variant="outlined"
											size="small"
										/>
									))}
									<input
										type="text"
										value={aliasInput}
										onChange={(e) => setAliasInput(e.target.value)}
										onKeyDown={handleAliasKeyDown}
										placeholder={
											aliases.length === 0
												? t(
														"pages.Detail.GameInfoEdit.addAliasPlaceholder",
														"输入别名后按回车添加，退格键删除",
													)
												: ""
										}
										disabled={isLoading || disabled || !selectedGame}
										style={CHIP_INPUT_STYLE}
									/>
								</Box>
							</Box>

							{/* 开发商 */}
							<TextField
								label={t("pages.Detail.GameInfoEdit.developer", "开发商")}
								variant="outlined"
								fullWidth
								value={developer}
								onChange={(e) => setDeveloper(e.target.value)}
								disabled={isLoading || disabled || !selectedGame}
								placeholder={t(
									"pages.Detail.GameInfoEdit.developerPlaceholder",
									"多个开发商请使用 / 分隔",
								)}
								helperText={t(
									"pages.Detail.GameInfoEdit.developerHelperText",
									"例如：开发商A / 开发商B",
								)}
							/>

							{/* 发行日期 */}
							<TextField
								label={t("pages.Detail.GameInfoEdit.releaseDate", "发行日期")}
								variant="outlined"
								fullWidth
								type="date"
								value={releaseDate}
								onChange={(e) => setReleaseDate(e.target.value)}
								disabled={isLoading || disabled || !selectedGame}
								InputLabelProps={{ shrink: true }}
								helperText={t(
									"pages.Detail.GameInfoEdit.releaseDateHelperText",
									"游戏的发行日期",
								)}
							/>

							{/* NSFW 开关 */}
							<Box>
								<FormControlLabel
									control={
										<Switch
											checked={nsfw}
											onChange={(e) => setNsfw(e.target.checked)}
											disabled={isLoading || disabled || !selectedGame}
											color="warning"
										/>
									}
									label={t("pages.Detail.GameInfoEdit.nsfw", "NSFW (18+)")}
								/>
							</Box>
						</Stack>
					</Stack>
				</CardContent>
			</Card>

			{/* 简介和标签区域 */}
			<Card>
				<CardContent>
					<Typography variant="h6" gutterBottom>
						{t("pages.Detail.GameInfoEdit.descriptionAndTags", "简介与标签")}
					</Typography>

					<Stack spacing={3}>
						{/* 简介 - 可调整大小 */}
						<TextField
							label={t("pages.Detail.GameInfoEdit.summary", "游戏简介")}
							variant="outlined"
							fullWidth
							multiline
							minRows={4}
							value={summary}
							onChange={(e) => setSummary(e.target.value)}
							disabled={isLoading || disabled || !selectedGame}
							placeholder={t(
								"pages.Detail.GameInfoEdit.summaryPlaceholder",
								"请输入游戏简介",
							)}
							helperText={t(
								"pages.Detail.GameInfoEdit.summaryHelperText",
								"游戏的详细介绍（可拖动右下角调整大小）",
							)}
							InputProps={{
								sx: {
									"& textarea": {
										resize: "vertical",
										overflow: "auto !important",
									},
								},
							}}
						/>

						{/* 标签 - 在输入框内显示 */}
						<Box>
							<Typography variant="subtitle2" gutterBottom>
								{t("pages.Detail.GameInfoEdit.tags", "标签")}
							</Typography>
							<Box
								sx={{
									...CHIP_INPUT_BOX_SX,
									"&:focus-within": {
										...CHIP_INPUT_BOX_SX["&:focus-within"],
										borderColor: "primary.main",
									},
								}}
							>
								{tags.map((tag) => (
									<Chip
										key={tag}
										label={tag}
										onDelete={() => handleDeleteTag(tag)}
										disabled={isLoading || disabled}
										color="primary"
										variant="outlined"
										size="small"
									/>
								))}
								<input
									type="text"
									value={tagInput}
									onChange={(e) => setTagInput(e.target.value)}
									onKeyDown={handleTagKeyDown}
									placeholder={
										tags.length === 0
											? t(
													"pages.Detail.GameInfoEdit.addTagPlaceholder",
													"输入标签后按回车添加，退格键删除",
												)
											: ""
									}
									disabled={isLoading || disabled || !selectedGame}
									style={CHIP_INPUT_STYLE}
								/>
							</Box>
						</Box>
					</Stack>
				</CardContent>
			</Card>

			{/* 可执行文件路径区域 */}
			<Card>
				<CardContent>
					<Typography variant="h6" gutterBottom>
						{t("pages.Detail.GameInfoEdit.gamePath", "游戏路径")}
					</Typography>
					<Box className="flex gap-1">
						<TextField
							label={t("pages.Detail.GameInfoEdit.localPath", "可执行文件路径")}
							variant="outlined"
							fullWidth
							value={localPath}
							onChange={(e) => setLocalPath(e.target.value)}
							disabled={isLoading || disabled || !selectedGame}
						/>
						<Button
							variant="outlined"
							onClick={handleSelectLocalPath}
							disabled={isLoading || disabled || !selectedGame}
							className="min-w-10 px-1"
						>
							<FolderOpenIcon />
						</Button>
					</Box>
				</CardContent>
			</Card>

			{/* 统一保存按钮 */}
			<Button
				variant="contained"
				color="primary"
				size="large"
				fullWidth
				onClick={handleSaveAll}
				disabled={isLoading || disabled || !selectedGame || !hasChanges()}
				startIcon={
					isLoading ? (
						<CircularProgress size={20} color="inherit" />
					) : (
						<SaveIcon />
					)
				}
				className="mt-2"
			>
				{isLoading
					? t("pages.Detail.GameInfoEdit.saving", "保存中...")
					: t("pages.Detail.GameInfoEdit.saveAllChanges", "保存所有更改")}
			</Button>
		</Box>
	);
};
