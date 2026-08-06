import ClearIcon from "@mui/icons-material/Clear";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DownloadIcon from "@mui/icons-material/Download";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import UploadIcon from "@mui/icons-material/Upload";
import {
	Box,
	Button,
	ButtonGroup,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControlLabel,
	IconButton,
	MenuItem,
	Radio,
	RadioGroup,
	Select,
	Slider,
	Stack,
	Switch,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import Alert from "@mui/material/Alert";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAllSettings, useUpdateSettings } from "@/hooks/queries/useSettings";
import { snackbar } from "@/providers/snackBar";
import type { ThemePackageInfo } from "@/services/invoke";
import { themeService } from "@/services/invoke";
import type { ThemePalette } from "@/types";
import { getUserErrorMessage } from "@/utils/errors";
import { buildTauriProtocolUrl } from "@/utils/tauriProtocol";
import { SettingsDivider, SettingsGroup, SettingsItem } from "./SettingsLayout";

const themePackagesKey = ["theme-packages"] as const;

const DEFAULT_ACCENT_COLOR = "#7c4dff";

const PALETTE_FIELDS: { key: keyof ThemePalette; label: string }[] = [
	{ key: "primary", label: "主色" },
	{ key: "secondary", label: "次色" },
	{ key: "backgroundDefault", label: "背景（默认）" },
	{ key: "backgroundPaper", label: "背景（纸张）" },
	{ key: "textPrimary", label: "文字（主要）" },
	{ key: "textSecondary", label: "文字（次要）" },
	{ key: "divider", label: "分隔线" },
];

const PaletteModeEditor = ({
	title,
	value,
	onChange,
}: {
	title: string;
	value?: ThemePalette | null;
	onChange: (palette: ThemePalette | null) => void;
}) => {
	const { t } = useTranslation();
	const enabled = Boolean(value);
	const setField = (key: keyof ThemePalette, color: string | null) => {
		const next: ThemePalette = { ...(value ?? {}) };
		if (color === null) {
			delete next[key];
		} else {
			next[key] = color;
		}
		onChange(next);
	};
	return (
		<Box sx={{ width: "100%" }}>
			<FormControlLabel
				control={
					<Switch
						size="small"
						checked={enabled}
						onChange={(event) => onChange(event.target.checked ? {} : null)}
					/>
				}
				label={<Typography variant="body2">{title}</Typography>}
			/>
			{enabled && (
				<Box
					sx={{
						display: "grid",
						gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
						gap: 1,
						mt: 0.5,
					}}
				>
					{PALETTE_FIELDS.map(({ key, label }) => {
						const color = value?.[key] ?? "";
						return (
							<Stack
								key={key}
								direction="row"
								spacing={0.5}
								alignItems="center"
							>
								<TextField
									type="color"
									size="small"
									label={label}
									value={color || "#000000"}
									onChange={(event) => setField(key, event.target.value)}
									sx={{
										flex: 1,
										"& input": { cursor: "pointer", padding: "6px 8px" },
									}}
								/>
								<Tooltip title={t("pages.Settings.appearance.clear", "清除")}>
									<IconButton
										size="small"
										disabled={!color}
										onClick={() => setField(key, null)}
									>
										<ClearIcon fontSize="small" />
									</IconButton>
								</Tooltip>
							</Stack>
						);
					})}
				</Box>
			)}
		</Box>
	);
};

export const AppearanceSettings = () => {
	const { t } = useTranslation();
	const queryClient = useQueryClient();
	const { data: settings } = useAllSettings();
	const updateSettings = useUpdateSettings();
	const { data: packages = [] } = useQuery({
		queryKey: themePackagesKey,
		queryFn: () => themeService.listPackages(),
	});
	const { data: assetsStatus } = useQuery({
		queryKey: ["theme-assets-status"],
		queryFn: () => themeService.getAssetsStatus(),
	});

	const refresh = async () => {
		await Promise.all([
			queryClient.invalidateQueries({ queryKey: themePackagesKey }),
			queryClient.invalidateQueries({ queryKey: ["settings"] }),
			queryClient.invalidateQueries({ queryKey: ["theme-assets-status"] }),
		]);
	};

	const update = async (
		value: Parameters<typeof updateSettings.mutateAsync>[0],
	) => {
		try {
			await updateSettings.mutateAsync(value);
		} catch (error) {
			snackbar.error(getUserErrorMessage(error, t));
		}
	};

	const uploadBackground = async () => {
		const selected = await open({
			multiple: false,
			directory: false,
			filters: [
				{
					name: t("pages.Settings.appearance.images", "图片文件"),
					extensions: ["png", "jpg", "jpeg", "webp"],
				},
			],
		});
		if (!selected || Array.isArray(selected)) return;
		try {
			await themeService.uploadBackground(selected);
			await refresh();
			snackbar.success(
				t("pages.Settings.appearance.backgroundUploaded", "背景图片已更新"),
			);
		} catch (error) {
			snackbar.error(getUserErrorMessage(error, t));
		}
	};

	const removeBackground = async () => {
		try {
			await themeService.removeBackground();
			await refresh();
		} catch (error) {
			snackbar.error(getUserErrorMessage(error, t));
		}
	};

	const importPackage = async () => {
		const selected = await open({
			multiple: false,
			directory: false,
			filters: [
				{ name: "Reina Theme", extensions: ["zip", "reina-theme.zip"] },
			],
		});
		if (!selected || Array.isArray(selected)) return;
		try {
			await themeService.importPackage(selected, false);
		} catch (error) {
			const message = getUserErrorMessage(error, t);
			if (
				!message.includes("已存在") ||
				!window.confirm(
					t(
						"pages.Settings.appearance.confirmOverwrite",
						"同 ID 主题包已存在，是否覆盖？",
					),
				)
			) {
				snackbar.error(message);
				return;
			}
			await themeService.importPackage(selected, true);
		}
		await refresh();
		snackbar.success(
			t("pages.Settings.appearance.packageImported", "主题包导入成功"),
		);
	};

	const exportPackage = async (themePackage: ThemePackageInfo) => {
		const destination = await save({
			defaultPath: `${themePackage.name}.reina-theme.zip`,
			filters: [{ name: "Reina Theme", extensions: ["zip"] }],
		});
		if (!destination) return;
		try {
			await themeService.exportPackage(themePackage.id, destination);
			snackbar.success(
				t("pages.Settings.appearance.packageExported", "主题包导出成功"),
			);
		} catch (error) {
			snackbar.error(getUserErrorMessage(error, t));
		}
	};

	const deletePackage = async (themePackage: ThemePackageInfo) => {
		if (
			!window.confirm(
				t(
					"pages.Settings.appearance.confirmDelete",
					"确定删除主题包“{{name}}”吗？",
					{ name: themePackage.name },
				),
			)
		)
			return;
		try {
			await themeService.deletePackage(themePackage.id);
			if (settings?.active_theme_package_id === themePackage.id) {
				await themeService.setActivePackage(null);
			}
			await refresh();
		} catch (error) {
			snackbar.error(getUserErrorMessage(error, t));
		}
	};

	type EditDialogState =
		| { mode: "create" }
		| { mode: "edit"; themePackage: ThemePackageInfo }
		| null;
	const [editDialog, setEditDialog] = useState<EditDialogState>(null);
	const [editName, setEditName] = useState("");
	const [editAuthor, setEditAuthor] = useState("");
	const [editDescription, setEditDescription] = useState("");
	const [editVersion, setEditVersion] = useState("");

	const openEditDialog = (themePackage: ThemePackageInfo) => {
		setEditDialog({ mode: "edit", themePackage });
		setEditName(themePackage.name);
		setEditAuthor(themePackage.author ?? "");
		setEditDescription(themePackage.description ?? "");
		setEditVersion(themePackage.version);
	};

	const openCreateDialog = () => {
		const customPackage = packages.find((item) => item.id === "custom");
		setEditDialog({ mode: "create" });
		setEditName(
			customPackage?.name ??
				t("pages.Settings.appearance.customName", "自定义主题"),
		);
		setEditAuthor(customPackage?.author ?? "");
		setEditDescription(
			customPackage?.description ??
				t(
					"pages.Settings.appearance.customDescription",
					"ReinaManager 自定义外观",
				),
		);
		setEditVersion(customPackage?.version ?? "1.0.0");
	};

	const savePackageInfo = async () => {
		if (!editDialog) return;
		const updates = {
			name: editName.trim(),
			author: editAuthor.trim() || null,
			description: editDescription.trim() || null,
			version: editVersion.trim(),
		};
		try {
			if (editDialog.mode === "create") {
				await themeService.saveCustomTheme(updates);
			} else {
				await themeService.updatePackageInfo(
					editDialog.themePackage.id,
					updates,
				);
			}
			setEditDialog(null);
			await refresh();
			snackbar.success(
				editDialog.mode === "create"
					? t("pages.Settings.appearance.customThemeSaved", "自定义主题已保存")
					: t("pages.Settings.appearance.packageInfoSaved", "主题包信息已更新"),
			);
		} catch (error) {
			snackbar.error(getUserErrorMessage(error, t));
		}
	};

	const hasCustomColor =
		Boolean(settings?.custom_theme_light_palette) ||
		Boolean(settings?.custom_theme_dark_palette) ||
		(settings?.theme_accent_color ?? DEFAULT_ACCENT_COLOR) !==
			DEFAULT_ACCENT_COLOR;

	const resetCustomPalette = async () => {
		if (
			!window.confirm(
				t(
					"pages.Settings.appearance.confirmResetPalette",
					"确定恢复默认配色吗？自定义的浅色/深色配色与强调色将被重置为默认值。",
				),
			)
		)
			return;
		await update({
			customThemeLightPalette: null,
			customThemeDarkPalette: null,
			themeAccentColor: DEFAULT_ACCENT_COLOR,
		});
	};

	const backgroundUrl = settings?.theme_background_path
		? buildTauriProtocolUrl(
				"reina-theme",
				"/asset",
				new URLSearchParams({
					path: settings.theme_background_path,
				}),
			)
		: null;

	return (
		<>
			<SettingsGroup
				title={t("pages.Settings.appearance.colorMode", "配色模式")}
			>
				<RadioGroup
					row
					value={settings?.theme_mode ?? "system"}
					onChange={(event) =>
						void update({
							themeMode: event.target.value as "light" | "dark" | "system",
						})
					}
				>
					{(["light", "dark", "system"] as const).map((mode) => (
						<FormControlLabel
							key={mode}
							value={mode}
							control={<Radio />}
							label={t(`pages.Settings.appearance.mode.${mode}`, mode)}
						/>
					))}
				</RadioGroup>
				<SettingsItem
					stacked
					title={t("pages.Settings.appearance.customPalette", "自定义配色")}
					description={t(
						"pages.Settings.appearance.customPaletteHint",
						"分别调整浅色/深色配色，或一键将当前配置保存为自定义主题包。",
					)}
				>
					<PaletteModeEditor
						title={t("pages.Settings.appearance.paletteLight", "浅色配色")}
						value={settings?.custom_theme_light_palette}
						onChange={(palette) =>
							void update({ customThemeLightPalette: palette })
						}
					/>
					<PaletteModeEditor
						title={t("pages.Settings.appearance.paletteDark", "深色配色")}
						value={settings?.custom_theme_dark_palette}
						onChange={(palette) =>
							void update({ customThemeDarkPalette: palette })
						}
					/>
					<Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
						<Button
							size="small"
							variant="contained"
							startIcon={<SaveIcon />}
							onClick={openCreateDialog}
						>
							{t("pages.Settings.appearance.saveAsCustom", "保存为自定义主题")}
						</Button>
						<Button
							size="small"
							variant="outlined"
							disabled={!hasCustomColor}
							onClick={() => void resetCustomPalette()}
						>
							{t("pages.Settings.appearance.resetPalette", "恢复默认配色")}
						</Button>
					</Stack>
				</SettingsItem>
			</SettingsGroup>
			<SettingsDivider />
			<SettingsGroup
				title={t("pages.Settings.appearance.background", "全局背景")}
			>
				<Box
					sx={{
						width: "100%",
						maxWidth: 720,
						aspectRatio: "16 / 9",
						border: "1px solid",
						borderColor: "divider",
						borderRadius: 2,
						overflow: "hidden",
						backgroundColor: "background.default",
						backgroundImage: backgroundUrl
							? `linear-gradient(rgba(0,0,0,${settings?.theme_overlay_opacity ?? 0.35}), rgba(0,0,0,${settings?.theme_overlay_opacity ?? 0.35})), url('${backgroundUrl}')`
							: undefined,
						backgroundSize: settings?.theme_background_size ?? "cover",
						backgroundPosition: "center",
						backgroundRepeat: "no-repeat",
					}}
				>
					{!backgroundUrl && (
						<Typography
							color="text.secondary"
							sx={{ display: "grid", height: "100%", placeItems: "center" }}
						>
							{t("pages.Settings.appearance.noBackground", "未设置背景图片")}
						</Typography>
					)}
				</Box>
				<Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
					<Button
						variant="outlined"
						startIcon={<UploadIcon />}
						onClick={() => void uploadBackground()}
					>
						{t("pages.Settings.appearance.upload", "上传图片")}
					</Button>
					<Button
						variant="outlined"
						color="error"
						startIcon={<DeleteOutlineIcon />}
						disabled={!backgroundUrl}
						onClick={() => void removeBackground()}
					>
						{t("pages.Settings.appearance.remove", "移除图片")}
					</Button>
				</Stack>
				<SettingsItem
					title={t("pages.Settings.appearance.backgroundSize", "填充方式")}
				>
					<Select
						size="small"
						value={settings?.theme_background_size ?? "cover"}
						onChange={(event) =>
							void update({
								themeBackgroundSize: event.target.value as
									| "cover"
									| "contain"
									| "fill",
							})
						}
						sx={{ minWidth: 160 }}
					>
						<MenuItem value="cover">Cover</MenuItem>
						<MenuItem value="contain">Contain</MenuItem>
						<MenuItem value="fill">Fill</MenuItem>
					</Select>
				</SettingsItem>
				<SettingsItem
					title={t("pages.Settings.appearance.applyScope", "应用范围")}
				>
					<ButtonGroup size="small">
						{(["light", "dark", "all"] as const).map((scope) => (
							<Button
								key={scope}
								variant={
									(settings?.theme_apply_scope ?? "all") === scope
										? "contained"
										: "outlined"
								}
								onClick={() => void update({ themeApplyScope: scope })}
							>
								{t(`pages.Settings.appearance.scope.${scope}`, scope)}
							</Button>
						))}
					</ButtonGroup>
				</SettingsItem>
				<SettingsItem
					stacked
					title={t("pages.Settings.appearance.overlay", "遮罩强度")}
				>
					<Slider
						value={Math.round((settings?.theme_overlay_opacity ?? 0.35) * 100)}
						valueLabelDisplay="auto"
						onChangeCommitted={(_, value) =>
							void update({ themeOverlayOpacity: Number(value) / 100 })
						}
					/>
				</SettingsItem>
				<SettingsItem
					stacked
					title={t("pages.Settings.appearance.blur", "模糊强度")}
				>
					<Slider
						min={0}
						max={40}
						value={settings?.theme_blur ?? 0}
						valueLabelDisplay="auto"
						onChangeCommitted={(_, value) =>
							void update({ themeBlur: Number(value) })
						}
					/>
				</SettingsItem>
				<SettingsItem title={t("pages.Settings.appearance.accent", "强调色")}>
					<TextField
						type="color"
						size="small"
						value={settings?.theme_accent_color ?? "#7c4dff"}
						onChange={(event) =>
							void update({ themeAccentColor: event.target.value })
						}
						sx={{ width: 96 }}
					/>
				</SettingsItem>
			</SettingsGroup>
			<SettingsDivider />
			<SettingsGroup
				title={t("pages.Settings.appearance.packages", "主题包")}
				description={t(
					"pages.Settings.appearance.packagesDescription",
					"导入、切换、导出和清理本地主题包。",
				)}
			>
				{(assetsStatus?.missing.length ?? 0) > 0 ||
				(assetsStatus?.orphans.length ?? 0) > 0 ? (
					<Alert severity="warning" sx={{ mb: 2 }}>
						{t(
							"pages.Settings.appearance.assetsStatusWarning",
							"主题资源不一致：缺失 {{missing}} 个，孤儿 {{orphans}} 个。可点击「清理资源」移除孤儿文件，缺失资源请重新导入对应主题包。",
							{
								missing: assetsStatus?.missing.length ?? 0,
								orphans: assetsStatus?.orphans.length ?? 0,
							},
						)}
					</Alert>
				) : null}
				<Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
					<Button
						variant="outlined"
						startIcon={<UploadIcon />}
						onClick={() => void importPackage()}
					>
						{t("pages.Settings.appearance.import", "导入主题包")}
					</Button>
					<Button
						variant="outlined"
						onClick={async () => {
							const result = await themeService.cleanupAssets();
							await refresh();
							snackbar.success(
								t(
									"pages.Settings.appearance.cleanupResult",
									"已清理 {{count}} 个资源",
									{ count: result.removedFiles },
								),
							);
						}}
					>
						{t("pages.Settings.appearance.cleanup", "清理资源")}
					</Button>
				</Stack>
				{packages.map((themePackage) => (
					<Stack
						key={themePackage.id}
						direction={{ xs: "column", sm: "row" }}
						spacing={2}
						alignItems={{ sm: "center" }}
						justifyContent="space-between"
						sx={{ py: 1.5, borderBottom: "1px solid", borderColor: "divider" }}
					>
						<Box>
							<Typography variant="body2" fontWeight={600}>
								{themePackage.name}
								{themePackage.hasMuiConfig && (
									<Chip
										size="small"
										label="MUI"
										color="secondary"
										variant="outlined"
										sx={{ ml: 1, height: 18, fontSize: 10 }}
									/>
								)}
							</Typography>
							<Typography variant="caption" color="text.secondary">
								{themePackage.version}
								{themePackage.author ? ` · ${themePackage.author}` : ""}
							</Typography>
						</Box>
						<Stack direction="row" spacing={1} alignItems="center">
							<Tooltip
								title={t("pages.Settings.appearance.editInfo", "编辑信息")}
							>
								<IconButton
									size="small"
									onClick={() => openEditDialog(themePackage)}
								>
									<EditIcon />
								</IconButton>
							</Tooltip>
							<Button
								size="small"
								variant={
									settings?.active_theme_package_id === themePackage.id
										? "contained"
										: "outlined"
								}
								onClick={async () => {
									await themeService.setActivePackage(themePackage.id);
									await refresh();
								}}
							>
								{settings?.active_theme_package_id === themePackage.id
									? t("pages.Settings.appearance.active", "当前")
									: t("pages.Settings.appearance.apply", "应用")}
							</Button>
							<Tooltip title={t("pages.Settings.appearance.export", "导出")}>
								<IconButton
									size="small"
									onClick={() => void exportPackage(themePackage)}
								>
									<DownloadIcon />
								</IconButton>
							</Tooltip>
							{themePackage.id !== "custom" && (
								<Tooltip title={t("pages.Settings.appearance.delete", "删除")}>
									<IconButton
										size="small"
										color="error"
										onClick={() => void deletePackage(themePackage)}
									>
										<DeleteOutlineIcon />
									</IconButton>
								</Tooltip>
							)}
						</Stack>
					</Stack>
				))}
			</SettingsGroup>
			<Dialog
				open={editDialog !== null}
				onClose={() => setEditDialog(null)}
				fullWidth
				maxWidth="sm"
			>
				<DialogTitle>
					{editDialog?.mode === "create"
						? t("pages.Settings.appearance.saveAsCustom", "保存为自定义主题")
						: t("pages.Settings.appearance.editInfo", "编辑信息")}
				</DialogTitle>
				<DialogContent>
					<Stack spacing={2} sx={{ mt: 1 }}>
						<TextField
							label={t("pages.Settings.appearance.packageName", "名称")}
							value={editName}
							onChange={(event) => setEditName(event.target.value)}
							fullWidth
							size="small"
						/>
						<TextField
							label={t("pages.Settings.appearance.packageVersion", "版本")}
							value={editVersion}
							onChange={(event) => setEditVersion(event.target.value)}
							fullWidth
							size="small"
						/>
						<TextField
							label={t("pages.Settings.appearance.packageAuthor", "作者")}
							value={editAuthor}
							onChange={(event) => setEditAuthor(event.target.value)}
							fullWidth
							size="small"
						/>
						<TextField
							label={t("pages.Settings.appearance.packageDescription", "描述")}
							value={editDescription}
							onChange={(event) => setEditDescription(event.target.value)}
							fullWidth
							size="small"
							multiline
							minRows={2}
						/>
					</Stack>
				</DialogContent>
				<DialogActions>
					<Button onClick={() => setEditDialog(null)}>
						{t("pages.Settings.appearance.cancel", "取消")}
					</Button>
					<Button
						variant="contained"
						disabled={!editName.trim() || !editVersion.trim()}
						onClick={() => void savePackageInfo()}
					>
						{t("pages.Settings.appearance.save", "保存")}
					</Button>
				</DialogActions>
			</Dialog>
		</>
	);
};
