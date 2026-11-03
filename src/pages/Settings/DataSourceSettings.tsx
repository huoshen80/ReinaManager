import ArrowDropDownIcon from "@mui/icons-material/ArrowDropDown";
import UpdateIcon from "@mui/icons-material/Update";
import {
	Accordion,
	AccordionDetails,
	AccordionSummary,
	Box,
	Checkbox,
	CircularProgress,
	Divider,
	FormControlLabel,
	MenuItem,
	Select,
	Stack,
	Switch,
	Tooltip,
	Typography,
} from "@mui/material";
import Button from "@mui/material/Button";
import type React from "react";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import {
	getRuntimeSourceAdapter,
	MIXED_SOURCE_KEYS,
	MIXED_SOURCE_MAX_COUNT,
	MIXED_SOURCE_MIN_COUNT,
} from "@/metadata";
import { snackbar } from "@/providers/snackBar";
import { isBgmAuthExpiredError } from "@/services/oauth/bgmAuthSession";
import { useStore } from "@/store/appStore";
import { getUserErrorMessage } from "@/utils/errors";
import {
	SETTINGS_SELECT_CLASS_NAME,
	SettingsGroup,
	SettingsItem,
} from "./SettingsLayout";

const LibraryEnrichmentDialog = lazy(() => import("./LibraryEnrichmentDialog"));

export const MixedSearchSourceSettings = () => {
	const { t } = useTranslation();
	const { mixedEnabledSources, toggleMixedSource } = useStore(
		useShallow((s) => ({
			mixedEnabledSources: s.mixedEnabledSources,
			toggleMixedSource: s.toggleMixedSource,
		})),
	);
	const enabledCount = MIXED_SOURCE_KEYS.filter((source) =>
		mixedEnabledSources.includes(source),
	).length;

	return (
		<SettingsGroup
			title={t("pages.Settings.mixedSearchSources.title", "Mixed 搜索源")}
			description={t(
				"pages.Settings.mixedSearchSources.description",
				"已启用的源用于 Mixed 获取，也用于单源自动增强；可启用 2-4 个源。",
			)}
		>
			<Stack
				direction="row"
				spacing={2}
				useFlexGap
				flexWrap="wrap"
				alignItems="center"
			>
				{MIXED_SOURCE_KEYS.map((source) => {
					const checked = mixedEnabledSources.includes(source);
					return (
						<FormControlLabel
							key={source}
							control={
								<Checkbox
									checked={checked}
									onChange={() => toggleMixedSource(source)}
									color="primary"
									disabled={
										(checked && enabledCount <= MIXED_SOURCE_MIN_COUNT) ||
										(!checked && enabledCount >= MIXED_SOURCE_MAX_COUNT)
									}
								/>
							}
							label={getRuntimeSourceAdapter(source).label}
						/>
					);
				})}
			</Stack>
		</SettingsGroup>
	);
};

export const SourceExpansionSettings = () => {
	const { t } = useTranslation();
	const {
		kunAutoExpand,
		setKunAutoExpand,
		hikarinagiAutoExpand,
		setHikarinagiAutoExpand,
	} = useStore(
		useShallow((state) => ({
			kunAutoExpand: state.kunAutoExpand,
			setKunAutoExpand: state.setKunAutoExpand,
			hikarinagiAutoExpand: state.hikarinagiAutoExpand,
			setHikarinagiAutoExpand: state.setHikarinagiAutoExpand,
		})),
	);

	return (
		<SettingsGroup
			title={t("pages.Settings.sourceExpansion.title", "单源自动增强")}
		>
			<SettingsItem
				title={t(
					"pages.Settings.sourceExpansion.kun",
					"Kungal 自动扩展为 Mixed",
				)}
				description={t(
					"pages.Settings.sourceExpansion.kunDescription",
					"开启后，按关联 ID 获取 Mixed 中启用的其它源元数据，并保留 Kungal 自身元数据。",
				)}
			>
				<Switch
					checked={kunAutoExpand}
					onChange={(event) => setKunAutoExpand(event.target.checked)}
					color="primary"
				/>
			</SettingsItem>
			<SettingsItem
				title={t(
					"pages.Settings.sourceExpansion.hikarinagi",
					"Hikarinagi 自动扩展为 Mixed",
				)}
				description={t(
					"pages.Settings.sourceExpansion.hikarinagiDescription",
					"开启后，按关联 ID 获取 Mixed 中启用的其它源元数据，并保留 Hikarinagi 自身元数据。",
				)}
			>
				<Switch
					checked={hikarinagiAutoExpand}
					onChange={(event) => setHikarinagiAutoExpand(event.target.checked)}
					color="primary"
				/>
			</SettingsItem>
		</SettingsGroup>
	);
};

export const VndbDataSettings = () => {
	const { t } = useTranslation();

	return (
		<SettingsGroup title={t("pages.Settings.vndbData.title", "VNDB 数据设置")}>
			<TagTranslationSettings />
			<SpoilerLevelSettings />
		</SettingsGroup>
	);
};

const TagTranslationSettings = () => {
	const { t } = useTranslation();
	const tagTranslation = useStore((s) => s.tagTranslation);
	const setTagTranslation = useStore((s) => s.setTagTranslation);

	return (
		<SettingsItem
			title={t("pages.Settings.tagTranslation.title", "TAG翻译")}
			description={t(
				"pages.Settings.tagTranslation.description",
				"开启后将使用中文翻译显示游戏标签",
			)}
		>
			<Switch
				checked={tagTranslation}
				onChange={(e) => setTagTranslation(e.target.checked)}
				color="primary"
			/>
		</SettingsItem>
	);
};

const SpoilerLevelSettings = () => {
	const { t } = useTranslation();
	const spoilerLevel = useStore((s) => s.spoilerLevel);
	const setSpoilerLevel = useStore((s) => s.setSpoilerLevel);

	return (
		<SettingsItem
			title={t("pages.Settings.spoilerLevel.title", "TAG剧透等级")}
			description={t(
				"pages.Settings.spoilerLevel.description",
				"选择剧透等级以获取合适的标签内容",
			)}
		>
			<Select
				value={spoilerLevel}
				onChange={(event) => setSpoilerLevel(event.target.value as number)}
				className={SETTINGS_SELECT_CLASS_NAME}
				size="small"
			>
				<MenuItem value={0}>
					{t("pages.Settings.spoilerLevel.level0", "0 - 无剧透")}
				</MenuItem>
				<MenuItem value={1}>
					{t("pages.Settings.spoilerLevel.level1", "1 - 轻微剧透")}
				</MenuItem>
				<MenuItem value={2}>
					{t("pages.Settings.spoilerLevel.level2", "2 - 严重剧透")}
				</MenuItem>
			</Select>
		</SettingsItem>
	);
};

export const DevSettings: React.FC = () => {
	const { t } = useTranslation();
	const [enrichmentOpen, setEnrichmentOpen] = useState(false);

	return (
		<Box>
			<Accordion>
				<AccordionSummary
					expandIcon={<ArrowDropDownIcon />}
					aria-controls="panel2-content"
					id="panel2-header"
				>
					<Tooltip
						title={t(
							"pages.Settings.dev.tooltip",
							"以下功能为实验性功能，请谨慎使用",
						)}
					>
						<Typography component="span">
							{t("pages.Settings.dev.title", "实验性功能")}
						</Typography>
					</Tooltip>
				</AccordionSummary>
				<AccordionDetails>
					<Stack spacing={3} divider={<Divider />}>
						<SettingsGroup
							title={t("libraryEnrichment.title", "补全关联元数据")}
							description={t(
								"libraryEnrichment.description",
								"为已入库的 Kungal / Hikarinagi 游戏补全关联来源的元数据，保留已有内容。冲突项会标注并跳过。",
							)}
						>
							<Button
								variant="contained"
								onClick={() => setEnrichmentOpen(true)}
							>
								{t("libraryEnrichment.open", "检查可补全游戏")}
							</Button>
						</SettingsGroup>
						<BatchUpdateSettings />
					</Stack>
				</AccordionDetails>
			</Accordion>
			{enrichmentOpen && (
				<Suspense fallback={null}>
					<LibraryEnrichmentDialog onClose={() => setEnrichmentOpen(false)} />
				</Suspense>
			)}
		</Box>
	);
};

const BatchUpdateSettings: React.FC = () => {
	const { t } = useTranslation();
	const [isUpdatingVndb, setIsUpdatingVndb] = useState(false);
	const [isUpdatingBgm, setIsUpdatingBgm] = useState(false);
	const [updateStatus, setUpdateStatus] = useState<string>("");

	const handleBatchUpdateVndb = async () => {
		setIsUpdatingVndb(true);
		setUpdateStatus("");

		try {
			// 动态导入批量更新函数
			const { batchUpdateVndbData } = await import(
				"@/metadata/data/metadataBatchUpdate"
			);

			snackbar.info(
				t(
					"pages.Settings.batchUpdate.updatingVndb",
					"正在批量更新 VNDB 数据...",
				),
			);

			const result = await batchUpdateVndbData();

			if (result.success > 0) {
				const message = t(
					"pages.Settings.batchUpdate.success",
					"成功更新 {{success}}/{{total}} 个游戏",
					{ success: result.success, total: result.total },
				);
				setUpdateStatus(message);
				snackbar.success(message);
			}

			if (result.failed > 0) {
				const failedMessage = t(
					"pages.Settings.batchUpdate.partialFailed",
					"{{failed}} 个游戏更新失败",
					{ failed: result.failed },
				);
				setUpdateStatus((prev) =>
					prev ? `${prev}\n${failedMessage}` : failedMessage,
				);
				snackbar.warning(failedMessage);
			}

			if (result.total === 0) {
				const noGamesMessage = t(
					"pages.Settings.batchUpdate.noGames",
					"没有找到包含 VNDB ID 的游戏",
				);
				setUpdateStatus(noGamesMessage);
				snackbar.info(noGamesMessage);
			}
		} catch (error) {
			const errorMessage = getUserErrorMessage(
				error,
				t,
				t("pages.Settings.batchUpdate.failed", "批量更新失败"),
			);
			setUpdateStatus(errorMessage);
			snackbar.error(
				t(
					"pages.Settings.batchUpdate.error",
					"批量更新 VNDB 数据失败: {{message}}",
					{ message: errorMessage },
				),
			);
		} finally {
			setIsUpdatingVndb(false);
		}
	};

	const handleBatchUpdateBgm = async () => {
		setIsUpdatingBgm(true);
		setUpdateStatus("");

		try {
			// 动态导入批量更新函数
			const { batchUpdateBgmData } = await import(
				"@/metadata/data/metadataBatchUpdate"
			);

			snackbar.info(
				t("pages.Settings.batchUpdate.updatingBgm", "正在批量更新 BGM 数据..."),
			);

			const result = await batchUpdateBgmData();

			if (result.success > 0) {
				const message = t(
					"pages.Settings.batchUpdate.success",
					"成功更新 {{success}}/{{total}} 个游戏",
					{ success: result.success, total: result.total },
				);
				setUpdateStatus(message);
				snackbar.success(message);
			}

			if (result.failed > 0) {
				const failedMessage = t(
					"pages.Settings.batchUpdate.partialFailed",
					"{{failed}} 个游戏更新失败",
					{ failed: result.failed },
				);
				setUpdateStatus((prev) =>
					prev ? `${prev}\n${failedMessage}` : failedMessage,
				);
				snackbar.warning(failedMessage);
			}

			if (result.total === 0) {
				const noGamesMessage = t(
					"pages.Settings.batchUpdate.noBgmGames",
					"没有找到包含 BGM ID 的游戏",
				);
				setUpdateStatus(noGamesMessage);
				snackbar.info(noGamesMessage);
			}
		} catch (error) {
			if (isBgmAuthExpiredError(error)) {
				return;
			}
			const errorMessage = getUserErrorMessage(
				error,
				t,
				t("pages.Settings.batchUpdate.failed", "批量更新失败"),
			);
			setUpdateStatus(errorMessage);
			snackbar.error(
				t(
					"pages.Settings.batchUpdate.errorBgm",
					"批量更新 BGM 数据失败: {{message}}",
					{ message: errorMessage },
				),
			);
		} finally {
			setIsUpdatingBgm(false);
		}
	};

	const isUpdating = isUpdatingVndb || isUpdatingBgm;

	return (
		<SettingsGroup
			title={t("pages.Settings.batchUpdate.title", "批量更新数据")}
			description={t(
				"pages.Settings.batchUpdate.description",
				"批量更新功能可用于更新已存在游戏的 BGM/VNDB 数据。当游戏的元数据发生变化时，您可以使用此功能来同步最新的信息。一旦点击更新按钮请耐心等待，更新过程可能需要一些时间。推荐软件更新数据源获取字段时使用。",
			)}
		>
			<Stack
				direction="row"
				spacing={1.5}
				useFlexGap
				alignItems="center"
				flexWrap="wrap"
			>
				<Button
					variant="contained"
					color="info"
					onClick={handleBatchUpdateBgm}
					disabled={isUpdating}
					startIcon={
						isUpdatingBgm ? (
							<CircularProgress size={16} color="inherit" />
						) : (
							<UpdateIcon />
						)
					}
				>
					{isUpdatingBgm
						? t(
								"pages.Settings.batchUpdate.updatingBgm",
								"正在批量更新 BGM 数据...",
							)
						: t("pages.Settings.batchUpdate.updateBgm", "批量更新 BGM 数据")}
				</Button>

				<Button
					variant="contained"
					color="primary"
					onClick={handleBatchUpdateVndb}
					disabled={isUpdating}
					startIcon={
						isUpdatingVndb ? (
							<CircularProgress size={16} color="inherit" />
						) : (
							<UpdateIcon />
						)
					}
				>
					{isUpdatingVndb
						? t(
								"pages.Settings.batchUpdate.updatingVndb",
								"正在批量更新 VNDB 数据...",
							)
						: t("pages.Settings.batchUpdate.updateVndb", "批量更新 VNDB 数据")}
				</Button>
			</Stack>
			{/* 更新状态显示 */}
			{updateStatus && (
				<Typography
					variant="body2"
					color={
						updateStatus.includes("失败") ||
						updateStatus.includes("fail") ||
						updateStatus.includes("错误") ||
						updateStatus.includes("error")
							? "error"
							: "primary"
					}
					className="whitespace-pre-line"
				>
					{updateStatus}
				</Typography>
			)}
		</SettingsGroup>
	);
};
