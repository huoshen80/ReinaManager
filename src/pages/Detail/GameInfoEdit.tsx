import ContentPasteIcon from "@mui/icons-material/ContentPaste";
import DeleteIcon from "@mui/icons-material/Delete";
import FileOpenIcon from "@mui/icons-material/FileOpen";
import ImageSearchIcon from "@mui/icons-material/ImageSearch";
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown";
import PhotoCameraIcon from "@mui/icons-material/PhotoCamera";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SaveIcon from "@mui/icons-material/Save";
import {
	Autocomplete,
	Box,
	Button,
	ButtonBase,
	Card,
	CardContent,
	Chip,
	CircularProgress,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControlLabel,
	IconButton,
	InputAdornment,
	ListItemIcon,
	ListItemText,
	Menu,
	MenuItem,
	Stack,
	Switch,
	TextField,
	Typography,
} from "@mui/material";
import { sep } from "@tauri-apps/api/path";
import { basename } from "pathe";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useImagePreview } from "@/hooks/common/useImagePreview";
import { useProxyImageUrlResolver } from "@/hooks/common/useProxyImageUrlResolver";
import { getRuntimeSourceAdapter, REGISTERED_SOURCE_KEYS } from "@/metadata";
import { buildGameInfoUpdatePayload } from "@/metadata/data/metadata";
import {
	getSourceImageMap,
	getSourceImageOptions,
	resolveSourceImage,
	type SourceImageOption,
} from "@/metadata/data/sourceImage";
import { getSourceIdFromDisplay } from "@/metadata/sourceRecord";
import { snackbar } from "@/providers/snackBar";
import { handleExeFile, splitExecutablePath } from "@/services/fs/fileDialog";
import {
	deleteGameCustomCovers,
	selectImageFile,
	uploadSelectedImage,
} from "@/services/game/customCover";
import { fileService } from "@/services/invoke";
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

const PATH_SEPARATOR = sep();

function isInvalidExecutableName(executable: string): boolean {
	const normalized = executable.trim();
	return (
		normalized !== "" &&
		(normalized === "." || normalized === ".." || /[\\/]/.test(normalized))
	);
}

function getSourceLabel(source: SourceType): string {
	return getRuntimeSourceAdapter(source).label;
}

interface CoverPreviewParams {
	selectedGame: GameData;
	shouldDeleteImage: boolean;
	tempCoverUrl: string | null;
	previewUrl: string | null;
	sourceCoverImage?: string;
	sourceCoverChanged: boolean;
}

function getCoverPreviewUrl({
	selectedGame,
	shouldDeleteImage,
	tempCoverUrl,
	previewUrl,
	sourceCoverImage,
	sourceCoverChanged,
}: CoverPreviewParams): string {
	if (shouldDeleteImage) {
		return sourceCoverImage ?? "/images/default.png";
	}

	if (tempCoverUrl) {
		return tempCoverUrl;
	}

	if (previewUrl) {
		return previewUrl;
	}

	if (sourceCoverChanged && sourceCoverImage) {
		return sourceCoverImage;
	}

	return getGameCover({
		...selectedGame,
		image: sourceCoverImage ?? selectedGame.image,
	});
}

interface SourceCoverDialogProps {
	open: boolean;
	options: SourceImageOption[];
	currentSource: SourceType | null;
	hasCustomCover: boolean;
	disabled: boolean;
	onClose: () => void;
	onSelect: (source: SourceType) => void;
	onReset: () => void;
	t: ReturnType<typeof useTranslation>["t"];
}

function SourceCoverDialog({
	open,
	options,
	currentSource,
	hasCustomCover,
	disabled,
	onClose,
	onSelect,
	onReset,
	t,
}: SourceCoverDialogProps) {
	const resolveImageUrl = useProxyImageUrlResolver();
	const sourceCoverAutoRule = options
		.map((option) => getSourceLabel(option.source))
		.join(" > ");
	const statusText = currentSource
		? t(
				"pages.Detail.GameInfoEdit.sourceCoverSelected",
				"数据源封面：{{source}}",
				{
					source: getSourceLabel(currentSource),
				},
			)
		: t("pages.Detail.GameInfoEdit.sourceCoverAuto", "数据源封面：自动");

	return (
		<Dialog
			open={open}
			onClose={onClose}
			PaperProps={{
				className: "w-fit min-w-75 max-w-[calc(100vw-32px)]",
			}}
		>
			<DialogTitle>
				{t(
					"pages.Detail.GameInfoEdit.sourceCoverDialogTitle",
					"选择数据源封面",
				)}
			</DialogTitle>
			<DialogContent>
				<Stack spacing={2}>
					<Typography variant="body2" color="textSecondary">
						{statusText}
					</Typography>

					<Typography variant="caption" color="textSecondary">
						{t(
							"pages.Detail.GameInfoEdit.sourceCoverAutoRule",
							"自动规则：{{rule}}",
							{ rule: sourceCoverAutoRule },
						)}
					</Typography>

					{hasCustomCover && (
						<Typography variant="caption" color="warning.main">
							{t(
								"pages.Detail.GameInfoEdit.sourceCoverCustomCoverNotice",
								"当前本地自定义封面优先显示，移除后才会显示数据源封面。",
							)}
						</Typography>
					)}

					<Box className="flex max-w-[calc(100vw-64px)] justify-center gap-1.5 overflow-x-auto">
						{options.map((option) => {
							const selected = currentSource === option.source;

							return (
								<ButtonBase
									key={option.source}
									onClick={() => onSelect(option.source)}
									disabled={disabled}
									className="block w-30 flex-none overflow-hidden rounded text-left"
									sx={{
										border: 2,
										borderStyle: "solid",
										borderColor: selected ? "primary.main" : "divider",
										backgroundColor: selected
											? "action.selected"
											: "transparent",
									}}
								>
									<Box
										component="img"
										src={resolveImageUrl(option.image)}
										alt={getSourceLabel(option.source)}
										className="block w-full aspect-[3/4] object-cover"
										sx={{ bgcolor: "action.hover" }}
									/>
									<Box className="p-1">
										<Typography variant="caption" component="div">
											{getSourceLabel(option.source)}
										</Typography>
										{selected && (
											<Typography
												variant="caption"
												component="div"
												color="primary"
											>
												{t(
													"pages.Detail.GameInfoEdit.sourceCoverSelectedBadge",
													"已选择",
												)}
											</Typography>
										)}
									</Box>
								</ButtonBase>
							);
						})}
					</Box>
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose} disabled={disabled}>
					{t("pages.Detail.GameInfoEdit.closeSourceCoverDialog", "关闭")}
				</Button>
				<Button
					onClick={onReset}
					disabled={disabled}
					startIcon={<RestartAltIcon />}
				>
					{t("pages.Detail.GameInfoEdit.resetSourceCover", "重置为自动")}
				</Button>
			</DialogActions>
		</Dialog>
	);
}

function stringArraysEqual(
	current: string[],
	original: readonly string[] | null | undefined,
): boolean {
	const normalizedOriginal = original ?? [];
	if (current.length !== normalizedOriginal.length) {
		return false;
	}

	return current.every((value, index) => value === normalizedOriginal[index]);
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
	const resolveImageUrl = useProxyImageUrlResolver();
	const sourceImageMap = useMemo(
		() => (rawGame ? getSourceImageMap(rawGame) : {}),
		[rawGame],
	);
	const sourceImageOptions = useMemo(
		() => (rawGame ? getSourceImageOptions(rawGame) : []),
		[rawGame],
	);
	const selectedGameSourceIdSignature = (() => {
		return REGISTERED_SOURCE_KEYS.map(
			(source) => getSourceIdFromDisplay(selectedGame, source) ?? "",
		).join("\0");
	})();

	// 游戏信息编辑相关状态
	const [localPath, setLocalPath] = useState<string>("");
	const [executable, setExecutable] = useState<string>("");
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
			setLocalPath(game.localpath ?? "");
			setExecutable(game.executable ?? "");
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
		selectedGame.localpath,
		selectedGame.executable,
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
			localPath !== (selectedGame.localpath ?? "") ||
			executable !== (selectedGame.executable ?? "") ||
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

	// 选择完整启动文件后，拆分为游戏目录和文件名。
	const handleSelectExecutable = async () => {
		try {
			const selectedPath = await handleExeFile(localPath);
			if (selectedPath) {
				const executablePathParts = await splitExecutablePath(selectedPath);
				setLocalPath(executablePathParts.localpath);
				setExecutable(executablePathParts.executable);
			}
		} catch (error) {
			snackbar.error(
				`${t("pages.Detail.GameInfoEdit.selectExecutableFailed", "选择可执行文件失败")}: ${getUserErrorMessage(error, t)}`,
			);
		}
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

		return resolveImageUrl(
			getCoverPreviewUrl({
				selectedGame,
				shouldDeleteImage,
				tempCoverUrl,
				previewUrl,
				sourceCoverImage,
				sourceCoverChanged: hasSourceCoverChanged(),
			}),
		);
	};

	// 处理删除自定义封面（标记删除，不立即提交）
	const handleRemoveCustomCover = async () => {
		await cleanupClipboardTempImage();
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
			setAliases(aliases.toSpliced(-1));
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
			setTags(tags.toSpliced(-1));
		}
	};

	// 统一保存所有更改
	const handleSaveAll = async () => {
		if (!hasChanges()) return;
		if (!localPath.trim() && executable.trim()) {
			snackbar.error(
				t(
					"pages.Detail.GameInfoEdit.localPathRequiredForExecutable",
					"填写可执行文件时，游戏目录不能为空",
				),
			);
			return;
		}
		if (isInvalidExecutableName(executable)) {
			snackbar.error(
				t(
					"pages.Detail.GameInfoEdit.invalidExecutable",
					"可执行文件必须是单个文件名，不能包含路径分隔符",
				),
			);
			return;
		}

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
			const updateData = buildGameInfoUpdatePayload(selectedGame, {
				newLocalPath: localPath,
				newExecutable: executable,
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
			setLocalPath(updatedGame.localpath ?? "");
			setExecutable(updatedGame.executable ?? "");

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
										t={t}
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
										disabled={isLoading || disabled}
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
								disabled={isLoading || disabled}
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
								disabled={isLoading || disabled}
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
											disabled={isLoading || disabled}
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
							maxRows={12}
							value={summary}
							onChange={(e) => setSummary(e.target.value)}
							disabled={isLoading || disabled}
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
									disabled={isLoading || disabled}
									style={CHIP_INPUT_STYLE}
								/>
							</Box>
						</Box>
					</Stack>
				</CardContent>
			</Card>

			{/* 游戏目录与可执行文件区域 */}
			<Card>
				<CardContent>
					<Typography variant="h6" gutterBottom>
						{t("pages.Detail.GameInfoEdit.gamePath", "游戏路径")}
					</Typography>
					<Box
						sx={{
							display: "flex",
							alignItems: "flex-start",
							gap: 1,
						}}
					>
						<TextField
							label={t("pages.Detail.GameInfoEdit.localPath", "游戏目录")}
							variant="outlined"
							value={localPath}
							onChange={(e) => setLocalPath(e.target.value)}
							disabled={isLoading || disabled}
							error={!localPath.trim() && Boolean(executable.trim())}
							helperText={
								!localPath.trim() && executable.trim()
									? t(
											"pages.Detail.GameInfoEdit.localPathRequiredForExecutable",
											"填写可执行文件时，游戏目录不能为空",
										)
									: undefined
							}
							sx={{ flex: 2, minWidth: 0 }}
							InputProps={{
								endAdornment: (
									<InputAdornment position="end">
										<Typography aria-hidden color="text.secondary">
											{PATH_SEPARATOR}
										</Typography>
									</InputAdornment>
								),
							}}
						/>
						<TextField
							label={t("pages.Detail.GameInfoEdit.executable", "可执行文件")}
							variant="outlined"
							value={executable}
							onChange={(e) => setExecutable(e.target.value)}
							disabled={isLoading || disabled}
							error={isInvalidExecutableName(executable)}
							helperText={
								isInvalidExecutableName(executable)
									? t(
											"pages.Detail.GameInfoEdit.invalidExecutable",
											"可执行文件必须是单个文件名，不能包含路径分隔符",
										)
									: undefined
							}
							sx={{ flex: 1, minWidth: "10rem" }}
							InputProps={{
								endAdornment: (
									<InputAdornment position="end">
										<IconButton
											onClick={handleSelectExecutable}
											disabled={isLoading || disabled}
											edge="end"
											size="small"
										>
											<FileOpenIcon />
										</IconButton>
									</InputAdornment>
								),
							}}
						/>
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
				disabled={isLoading || disabled || !hasChanges()}
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
