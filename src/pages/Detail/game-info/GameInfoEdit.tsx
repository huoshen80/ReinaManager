import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import DeleteIcon from "@mui/icons-material/Delete";
import ImageSearchIcon from "@mui/icons-material/ImageSearch";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import SaveIcon from "@mui/icons-material/Save";
import {
	Autocomplete,
	Box,
	Button,
	Card,
	CardContent,
	CardHeader,
	Chip,
	CircularProgress,
	FormControlLabel,
	ListItemIcon,
	ListItemText,
	Menu,
	MenuItem,
	Stack,
	Switch,
	TextField,
	Typography,
} from "@mui/material";
import { basename } from "pathe";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";
import { useTranslation } from "react-i18next";
import { SmartImage } from "@/components/SmartImage";
import { REGISTERED_SOURCE_KEYS } from "@/metadata";
import { getDisplayGameData } from "@/metadata/data/dataTransform";
import {
	getSourceDeveloperOptions,
	getSourceSummaryOptions,
} from "@/metadata/data/displayMergeRules";
import { getDisplayPreferences } from "@/metadata/data/displayPreferences";
import { buildGameProfileUpdatePayload } from "@/metadata/data/metadata";
import {
	getSourceImageMap,
	getSourceImageOptions,
	resolveSourceImage,
} from "@/metadata/data/sourceImage";
import { getSourceIdFromDisplay } from "@/metadata/sourceRecord";
import { snackbar } from "@/providers/snackBar";
import {
	deleteGameCustomCovers,
	selectImageFile,
	uploadSelectedImage,
} from "@/services/game/customCover";
import { fileService } from "@/services/invoke";
import { useStore } from "@/store/appStore";
import type {
	FullGameData,
	GameData,
	SourceType,
	UpdateGameParams,
} from "@/types";
import { getUserErrorMessage, toError } from "@/utils/errors";
import {
	getGameCover,
	getGameDisplayName,
	getGameNsfwStatus,
} from "@/utils/game";
import { getCoverPreviewUrl, stringArraysEqual } from "./gameInfoEditData";
import { SourceCoverDialog } from "./SourceCoverDialog";
import { SourceSummarySelector } from "./SourceSummarySelector";
import { useImagePreview } from "./useImagePreview";

function normalizeChipValues(values: readonly string[]): string[] {
	return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

interface GameInfoEditProps {
	selectedGame: GameData;
	rawGame?: FullGameData;
	onSave: (data: UpdateGameParams) => Promise<FullGameData>;
	disabled?: boolean;
}

export const GameInfoEdit: React.FC<GameInfoEditProps> = ({
	selectedGame,
	rawGame,
	onSave,
	disabled = false,
}) => {
	const { t } = useTranslation();
	const displayPreferences = useStore(getDisplayPreferences);
	const { priorities } = displayPreferences;
	const sourceImageMap = useMemo(
		() => (rawGame ? getSourceImageMap(rawGame) : {}),
		[rawGame],
	);
	const sourceImageOptions = useMemo(
		() => (rawGame ? getSourceImageOptions(rawGame) : []),
		[rawGame],
	);
	const developerOptions = useMemo(
		() =>
			rawGame ? getSourceDeveloperOptions(rawGame, priorities.developer) : [],
		[rawGame, priorities.developer],
	);
	const sourceSummaryOptions = useMemo(
		() => (rawGame ? getSourceSummaryOptions(rawGame, priorities.summary) : []),
		[rawGame, priorities.summary],
	);
	const summaryLabelId = useId();
	const selectedGameSourceIdSignature = (() => {
		return REGISTERED_SOURCE_KEYS.map(
			(source) => getSourceIdFromDisplay(selectedGame, source) ?? "",
		).join("\0");
	})();

	// 游戏信息编辑相关状态
	const [gameNote, setGameNote] = useState<string>("");
	const [aliases, setAliases] = useState<string[]>([]);
	const [summary, setSummary] = useState<string>("");
	const [tags, setTags] = useState<string[]>([]);
	const [developer, setDeveloper] = useState<string>("");
	const [nsfw, setNsfw] = useState<boolean>(false);
	const [releaseDate, setReleaseDate] = useState<string>("");
	const [isLoading, setIsLoading] = useState(false);
	const [imageMenuAnchorEl, setImageMenuAnchorEl] =
		useState<HTMLElement | null>(null);
	const [sourceCoverDialogOpen, setSourceCoverDialogOpen] = useState(false);
	const [coverSource, setCoverSource] = useState<SourceType | null>(null);

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

	// 只记录由剪贴板导入创建的临时文件，避免误删用户本地图片
	const [clipboardTempImagePath, setClipboardTempImagePathState] = useState<
		string | null
	>(null);
	const clipboardTempImagePathRef = useRef<string | null>(null);

	// 图片删除标记（不立即提交）
	const [shouldDeleteImage, setShouldDeleteImage] = useState(false);

	// 添加临时封面状态，用于平滑过渡
	const [tempCoverUrl, setTempCoverUrl] = useState<string | null>(null);
	// 保存后等待父级数据刷新期间，锁定新封面，避免闪回旧封面
	const [pendingCoverImage, setPendingCoverImage] = useState<string | null>(
		null,
	);

	const setClipboardTempImagePath = useCallback((path: string | null) => {
		clipboardTempImagePathRef.current = path;
		setClipboardTempImagePathState(path);
	}, []);

	const cleanupClipboardTempImage = useCallback(async () => {
		const tempPath = clipboardTempImagePathRef.current;
		if (!tempPath) return;

		setClipboardTempImagePath(null);

		try {
			await fileService.deleteFile(tempPath);
		} catch (error) {
			console.warn("删除剪贴板临时封面失败:", error);
		}
	}, [setClipboardTempImagePath]);

	// 1. 提取初始化函数
	const initForm = useCallback(
		(game: GameData) => {
			setGameNote(getGameDisplayName(game));
			setAliases(game.custom_data?.aliases ?? []);
			setSummary(game.summary ?? "");
			setTags(game.custom_data?.tags ?? []);
			setDeveloper(game.developer ?? "");
			setNsfw(getGameNsfwStatus(game) ?? false);
			setReleaseDate(game.date ?? "");
			setCoverSource(game.custom_data?.cover_source ?? null);
			setShouldDeleteImage(false);
			cleanupPreview();
		},
		[cleanupPreview],
	); // cleanupPreview 来自 hook，通常是稳定的

	// 同步 selectedGame prop 到内部状态
	// biome-ignore lint/correctness/useExhaustiveDependencies: <防止不必要的同步>
	useEffect(() => {
		initForm(selectedGame);
	}, [
		// 1. 切换游戏必重置
		selectedGame.id,
		// 2. 只有当这些"静态属性"被保存更新后，才触发重置
		selectedGameSourceIdSignature,
		selectedGame.id_type,
		// 3. 对于对象类型，使用 JSON 字符串化进行"值比较"
		//    否则每次父组件刷新，custom_data 对象引用都会变，导致无限重置
		JSON.stringify(selectedGame.custom_data),
		initForm,
	]);

	// 当父级数据（selectedGame）已经更新到最新封面时，解除临时封面锁定
	useEffect(() => {
		if (!pendingCoverImage) return;
		if (selectedGame.custom_data?.image === pendingCoverImage) {
			setPendingCoverImage(null);
			setTempCoverUrl(null);
		}
	}, [pendingCoverImage, selectedGame.custom_data?.image]);

	// 切换游戏或离开组件时，清理由本组件创建的剪贴板临时图片
	useEffect(() => {
		return () => {
			void cleanupClipboardTempImage();
		};
	}, [cleanupClipboardTempImage]);

	// 检查是否有任何更改
	// 重要：比较时必须使用"展平后的原始值"作为基准，与初始化时一致
	const hasChanges = () => {
		// 获取展平后的原始值（与 useEffect 初始化时一致）
		const currentDisplayName = getGameDisplayName(selectedGame);
		const currentCustomName =
			selectedGame.custom_data?.name || currentDisplayName;
		const originalSummary = selectedGame.summary ?? "";
		const originalDeveloper = selectedGame.developer ?? "";
		const originalNsfw = getGameNsfwStatus(selectedGame) ?? false;
		const originalDate = selectedGame.date ?? "";

		return (
			gameNote !== currentCustomName ||
			selectedImagePath !== null || // 有选择的图片但未保存
			shouldDeleteImage ||
			hasSourceCoverChanged() ||
			!stringArraysEqual(aliases, selectedGame.custom_data?.aliases) ||
			summary !== originalSummary ||
			!stringArraysEqual(tags, selectedGame.custom_data?.tags) ||
			developer !== originalDeveloper ||
			nsfw !== originalNsfw ||
			releaseDate !== originalDate
		);
	};

	const handleImageMenuOpen = (event: React.MouseEvent<HTMLButtonElement>) => {
		setImageMenuAnchorEl(event.currentTarget);
	};

	const handleImageMenuClose = () => {
		setImageMenuAnchorEl(null);
	};

	const getOriginalCoverSource = () =>
		selectedGame.custom_data?.cover_source ?? null;

	const hasSourceCoverChanged = () => coverSource !== getOriginalCoverSource();

	const canSelectSourceCover =
		selectedGame.id_type === "mixed" &&
		(sourceImageOptions.length >= 2 || coverSource !== null);

	const handleSourceCoverDialogOpen = () => {
		handleImageMenuClose();
		if (!canSelectSourceCover) return;
		setSourceCoverDialogOpen(true);
	};

	const handleSourceCoverDialogClose = () => {
		setSourceCoverDialogOpen(false);
	};

	const handleSourceCoverSelect = async (source: SourceType) => {
		await cleanupClipboardTempImage();
		cleanupPreview();
		setCoverSource(source);
		setSourceCoverDialogOpen(false);
	};

	const handleSourceCoverReset = async () => {
		await cleanupClipboardTempImage();
		cleanupPreview();
		setCoverSource(null);
		setSourceCoverDialogOpen(false);
	};

	// 处理自定义封面文件选择 - 只选择，不立即上传
	const handleCustomCoverSelect = async () => {
		handleImageMenuClose();

		try {
			// 选择图片文件
			const imagePath = await selectImageFile();
			if (!imagePath) return;

			await cleanupClipboardTempImage();

			// 重置删除标记，因为用户选择了新图片
			setShouldDeleteImage(false);

			// 使用 Hook 提供的方法加载预览（现在是同步的）
			selectImage(imagePath);
		} catch (error) {
			snackbar.error(
				`${t("pages.Detail.GameInfoEdit.selectImageFailed", "选择图片失败")}: ${getUserErrorMessage(error, t)}`,
			);
		}
	};

	const getClipboardImageImportErrorMessage = (error: unknown) => {
		const rawErrorMessage = toError(error).message;

		if (rawErrorMessage.includes("CLIPBOARD_IMAGE_NOT_FOUND")) {
			return t(
				"pages.Detail.GameInfoEdit.clipboardImageNotFound",
				"剪贴板中没有可用图片",
			);
		}

		if (rawErrorMessage.includes("CLIPBOARD_IMAGE_WRITE_FAILED")) {
			return t(
				"pages.Detail.GameInfoEdit.clipboardImageProcessFailed",
				"处理剪贴板图片失败",
			);
		}

		return `${t(
			"pages.Detail.GameInfoEdit.clipboardImageReadFailed",
			"读取剪贴板图片失败",
		)}: ${getUserErrorMessage(error, t)}`;
	};

	const handleClipboardImageImport = async () => {
		handleImageMenuClose();

		try {
			const tempPath = await fileService.importClipboardImageToTemp(
				selectedGame.id,
			);

			await cleanupClipboardTempImage();
			setClipboardTempImagePath(tempPath);
			setShouldDeleteImage(false);
			selectImage(tempPath);
		} catch (error) {
			snackbar.error(getClipboardImageImportErrorMessage(error));
		}
	};

	// 获取当前要显示的封面URL
	const getCurrentCoverUrl = () => {
		const sourceCoverImage =
			selectedGame.id_type === "mixed"
				? (resolveSourceImage(sourceImageMap, coverSource) ??
					selectedGame.image)
				: selectedGame.image;

		return getCoverPreviewUrl({
			selectedGame,
			shouldDeleteImage,
			tempCoverUrl,
			previewUrl,
			sourceCoverImage,
			sourceCoverChanged: hasSourceCoverChanged(),
		});
	};

	// 处理删除自定义封面（标记删除，不立即提交）
	const handleRemoveCustomCover = async () => {
		await cleanupClipboardTempImage();
		setShouldDeleteImage(true);
		cleanupPreview();
	};

	// 保存游戏资料
	const handleSaveAll = async () => {
		if (!hasChanges()) return;

		const coverSourceChanged = hasSourceCoverChanged();
		const originalSourceCoverImage = resolveSourceImage(
			sourceImageMap,
			getOriginalCoverSource(),
		);
		const nextSourceCoverImage = resolveSourceImage(
			sourceImageMap,
			coverSource,
		);
		setIsLoading(true);

		try {
			let uploadedImageExt: string | null | undefined;

			// 1. 先处理副作用：上传图片或删除图片
			if (shouldDeleteImage) {
				await deleteGameCustomCovers(selectedGame.id);
				uploadedImageExt = null; // 标记删除
			} else if (selectedImagePath) {
				// 上传本地选择的图片
				uploadedImageExt = await uploadSelectedImage(
					selectedGame.id,
					selectedImagePath,
				);
			}

			// 2. 纯逻辑：使用纯函数构建 Payload
			const updateData = buildGameProfileUpdatePayload(selectedGame, {
				newName: gameNote,
				newImageExt: uploadedImageExt,
				newCoverSource: coverSource,
				newAliases: aliases,
				newSummary: summary,
				newTags: tags,
				newDeveloper: developer,
				newNsfw: nsfw,
				newDate: releaseDate,
			});
			// 防御：没有任何字段需要更新时，不发请求
			if (Object.keys(updateData).length === 0) {
				return;
			}

			if (
				coverSourceChanged &&
				originalSourceCoverImage !== nextSourceCoverImage
			) {
				await fileService.deleteCloudCoverCache(selectedGame.id);
			}

			// 3. 执行保存
			const updatedGame = await onSave(updateData);
			initForm(
				getDisplayGameData(
					updatedGame,
					getDisplayPreferences(useStore.getState()),
				),
			);

			if (clipboardTempImagePath) {
				await cleanupClipboardTempImage();
			}

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
				`${t("pages.Detail.GameInfoEdit.saveGameInfoFailed", "保存游戏信息失败")}: ${getUserErrorMessage(error, t)}`,
			);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Card className="overflow-visible">
			<CardHeader
				className="sticky top-0 z-10 bg-[var(--mui-palette-background-paper)]"
				title={
					<Stack
						direction="row"
						spacing={1}
						alignItems="center"
						useFlexGap
						flexWrap="wrap"
					>
						<Typography variant="h6">
							{t("pages.Detail.Edit.gameInfoEdit", "游戏资料编辑")}
						</Typography>
						{hasChanges() ? (
							<Chip
								label={t("pages.Detail.GameInfoEdit.unsavedChanges", "未保存")}
								color="warning"
								size="small"
								variant="outlined"
							/>
						) : null}
					</Stack>
				}
				action={
					<Button
						variant="contained"
						className="whitespace-nowrap"
						onClick={handleSaveAll}
						disabled={isLoading || disabled || !hasChanges()}
						startIcon={
							isLoading ? (
								<CircularProgress size={20} color="inherit" />
							) : (
								<SaveIcon />
							)
						}
					>
						{isLoading
							? t("pages.Detail.GameInfoEdit.saving", "保存中...")
							: t("pages.Detail.GameInfoEdit.saveGameInfo", "保存游戏资料")}
					</Button>
				}
			/>
			<CardContent>
				{/* 封面和基本信息区域 - 放在最上面 */}
				<Stack direction={{ xs: "column", md: "row" }} spacing={3}>
					{/* 左侧：封面预览和操作 */}
					<Box className="flex-shrink-0">
						<SmartImage
							src={getCurrentCoverUrl()}
							alt="Game Cover"
							className="w-70 h-100 object-cover rounded-2 border border-gray-300"
						/>

						{/* 封面操作按钮 */}
						<Stack spacing={1} className="mt-2">
							<Stack direction="row" spacing={1} flexWrap="wrap">
								<Button
									variant="outlined"
									onClick={handleImageMenuOpen}
									startIcon={<PhotoCameraIcon />}
									endIcon={<KeyboardArrowDownIcon />}
									disabled={isLoading || disabled}
									size="small"
								>
									{t("pages.Detail.GameInfoEdit.selectImage", "选择图片")}
								</Button>
								<Menu
									anchorEl={imageMenuAnchorEl}
									open={Boolean(imageMenuAnchorEl)}
									onClose={handleImageMenuClose}
								>
									<MenuItem
										onClick={handleCustomCoverSelect}
										disabled={isLoading || disabled}
									>
										<ListItemIcon>
											<PhotoCameraIcon fontSize="small" />
										</ListItemIcon>
										<ListItemText>
											{t(
												"pages.Detail.GameInfoEdit.selectLocalImage",
												"本地图片",
											)}
										</ListItemText>
									</MenuItem>
									<MenuItem
										onClick={handleClipboardImageImport}
										disabled={isLoading || disabled}
									>
										<ListItemIcon>
											<ContentPasteIcon fontSize="small" />
										</ListItemIcon>
										<ListItemText>
											{t(
												"pages.Detail.GameInfoEdit.importFromClipboard",
												"从剪贴板导入",
											)}
										</ListItemText>
									</MenuItem>
									<MenuItem
										onClick={handleSourceCoverDialogOpen}
										disabled={isLoading || disabled || !canSelectSourceCover}
									>
										<ListItemIcon>
											<ImageSearchIcon fontSize="small" />
										</ListItemIcon>
										<ListItemText>
											{t(
												"pages.Detail.GameInfoEdit.selectSourceCover",
												"数据源封面",
											)}
										</ListItemText>
									</MenuItem>
								</Menu>
								<SourceCoverDialog
									open={sourceCoverDialogOpen}
									options={sourceImageOptions}
									currentSource={coverSource}
									hasCustomCover={Boolean(
										selectedGame.custom_data?.image && !shouldDeleteImage,
									)}
									disabled={isLoading || disabled}
									onClose={handleSourceCoverDialogClose}
									onSelect={(source) => void handleSourceCoverSelect(source)}
									onReset={() => void handleSourceCoverReset()}
								/>

								{selectedGame.custom_data?.image && !shouldDeleteImage && (
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
											"移除自定义封面",
										)}
									</Button>
								)}
							</Stack>
							{selectedGame.custom_data?.image &&
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
									{selectedImagePath === clipboardTempImagePath
										? t(
												"pages.Detail.GameInfoEdit.clipboardPreviewSelected",
												"已从剪贴板导入图片，保存后生效",
											)
										: `${t(
												"pages.Detail.GameInfoEdit.previewSelected",
												"已选择新图片，保存后生效",
											)}: ${basename(selectedImagePath)}`}
								</Typography>
							)}
						</Stack>
					</Box>

					{/* 右侧：基本信息 */}
					<Stack spacing={3} sx={{ flex: 1 }}>
						{/* 自定义游戏名称 */}
						<Autocomplete
							freeSolo
							openOnFocus
							clearOnBlur={false}
							options={[
								...new Set(
									[selectedGame.aliases, selectedGame.all_titles]
										.flat()
										.filter(Boolean),
								),
							]}
							inputValue={gameNote}
							onInputChange={(_, value) => setGameNote(value)}
							onChange={(_, value) => {
								if (typeof value === "string") {
									setGameNote(value);
								}
							}}
							filterOptions={(options) => options}
							disabled={isLoading || disabled}
							fullWidth
							renderInput={(params) => (
								<TextField
									{...params}
									label={t(
										"pages.Detail.GameInfoEdit.customGameName",
										"自定义游戏名称",
									)}
									variant="outlined"
									placeholder={getGameDisplayName(selectedGame)}
								/>
							)}
						/>

						{/* 别名 */}
						<Autocomplete
							multiple
							freeSolo
							options={[]}
							value={aliases}
							inputValue={aliasInput}
							slotProps={{
								chip: {
									color: "primary",
									variant: "outlined",
								},
							}}
							onChange={(_, values) => setAliases(normalizeChipValues(values))}
							onInputChange={(_, value) => setAliasInput(value)}
							disabled={isLoading || disabled}
							fullWidth
							renderInput={(params) => (
								<TextField
									{...params}
									label={t("pages.Detail.GameInfoEdit.aliases", "别名")}
									placeholder={
										aliases.length === 0
											? t(
													"pages.Detail.GameInfoEdit.addAliasPlaceholder",
													"输入别名后按回车添加，退格键删除",
												)
											: ""
									}
								/>
							)}
						/>

						{/* 开发商 */}
						<Autocomplete
							freeSolo
							openOnFocus
							clearOnBlur={false}
							options={developerOptions}
							inputValue={developer}
							onInputChange={(_, value) => setDeveloper(value)}
							onChange={(_, value) => {
								if (typeof value === "string") {
									setDeveloper(value);
								}
							}}
							filterOptions={(options) => options}
							disabled={isLoading || disabled}
							fullWidth
							renderInput={(params) => (
								<TextField
									{...params}
									label={t("pages.Detail.GameInfoEdit.developer", "开发商")}
									variant="outlined"
									placeholder={t(
										"pages.Detail.GameInfoEdit.developerPlaceholder",
										"多个开发商请使用 / 分隔",
									)}
									helperText={t(
										"pages.Detail.GameInfoEdit.developerHelperText",
										"例如：开发商A / 开发商B",
									)}
								/>
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
							disabled={isLoading || disabled}
							slotProps={{ inputLabel: { shrink: true } }}
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
										disabled={isLoading || disabled}
										color="warning"
									/>
								}
								label={t("pages.Detail.GameInfoEdit.nsfw", "NSFW (18+)")}
							/>
						</Box>
					</Stack>
				</Stack>

				{/* 简介和标签区域 */}
				<Stack spacing={3} className="mt-6">
					{/* 简介 - 可从数据源选择并继续编辑 */}
					<Stack spacing={1}>
						<Stack
							direction="row"
							alignItems="center"
							justifyContent="space-between"
							spacing={2}
						>
							<Typography id={summaryLabelId} variant="subtitle1">
								{t("pages.Detail.GameInfoEdit.summary", "游戏简介")}
							</Typography>
							<SourceSummarySelector
								options={sourceSummaryOptions}
								currentSummary={summary}
								disabled={isLoading || disabled}
								onSelect={setSummary}
							/>
						</Stack>
						<Typography variant="caption" color="textSecondary">
							{t(
								"pages.Detail.GameInfoEdit.summaryHelperText",
								"游戏的详细介绍（可拖动右下角调整大小）",
							)}
						</Typography>
						<TextField
							variant="outlined"
							fullWidth
							multiline
							minRows={4}
							maxRows={12}
							value={summary}
							onChange={(e) => setSummary(e.target.value)}
							disabled={isLoading || disabled}
							placeholder={t(
								"pages.Detail.GameInfoEdit.summaryPlaceholder",
								"请输入游戏简介",
							)}
							slotProps={{
								htmlInput: {
									"aria-labelledby": summaryLabelId,
								},
								input: {
									sx: {
										"& textarea": {
											resize: "vertical",
											overflow: "auto !important",
										},
									},
								},
							}}
						/>
					</Stack>

					{/* 标签 */}
					<Autocomplete
						multiple
						freeSolo
						options={[]}
						value={tags}
						inputValue={tagInput}
						slotProps={{
							chip: {
								color: "primary",
								size: "small",
								variant: "outlined",
							},
						}}
						onChange={(_, values) => setTags(normalizeChipValues(values))}
						onInputChange={(_, value) => setTagInput(value)}
						disabled={isLoading || disabled}
						fullWidth
						renderInput={(params) => (
							<TextField
								{...params}
								label={t("pages.Detail.GameInfoEdit.tags", "标签")}
								placeholder={
									tags.length === 0
										? t(
												"pages.Detail.GameInfoEdit.addTagPlaceholder",
												"输入标签后按回车添加，退格键删除",
											)
										: ""
								}
							/>
						)}
					/>
				</Stack>
			</CardContent>
		</Card>
	);
};
