import {
	Box,
	Divider,
	InputLabel,
	MenuItem,
	Select,
	Stack,
	Typography,
} from "@mui/material";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "@/store/appStore";

/**
 * 标签翻译设置
 */
export const TagTranslationSettings = () => {
	const { t } = useTranslation();
	const tagTranslation = useStore((s) => s.tagTranslation);
	const setTagTranslation = useStore((s) => s.setTagTranslation);

	return (
		<Box className="mb-6">
			<Stack direction="row" alignItems="center" className="min-w-60">
				<Box>
					<InputLabel className="font-semibold mb-1">
						{t("pages.Settings.tagTranslation.title")}
					</InputLabel>
					<Typography variant="caption" color="text.secondary">
						{t("pages.Settings.tagTranslation.description")}
					</Typography>
				</Box>
				<Switch checked={tagTranslation} onChange={(e) => setTagTranslation(e.target.checked)} color="primary" />
			</Stack>
		</Box>
	);
};

/**
 * 剧透等级设置
 */
export const SpoilerLevelSettings = () => {
	const { t } = useTranslation();
	const spoilerLevel = useStore((s) => s.spoilerLevel);
	const setSpoilerLevel = useStore((s) => s.setSpoilerLevel);

	return (
		<Box className="mb-6">
			<Stack direction="row" alignItems="center" spacing={1}>
				<Box>
					<InputLabel className="font-semibold mb-1">
						{t("pages.Settings.spoilerLevel.title")}
					</InputLabel>
					<Typography variant="caption" color="text.secondary">
						{t("pages.Settings.spoilerLevel.description")}
					</Typography>
				</Box>
				<Select
					value={spoilerLevel}
					onChange={(event) => setSpoilerLevel(event.target.value as number)}
					className="min-w-40"
					size="small"
				>
					<MenuItem value={0}>{t("pages.Settings.spoilerLevel.level0")}</MenuItem>
					<MenuItem value={1}>{t("pages.Settings.spoilerLevel.level1")}</MenuItem>
					<MenuItem value={2}>{t("pages.Settings.spoilerLevel.level2")}</MenuItem>
				</Select>
			</Stack>
		</Box>
	);
};

/**
 * VNDB 数据设置主组件
 */
export const VndbDataSettings = () => {
	const { t } = useTranslation();
	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">
				{t("pages.Settings.vndbData.title")}
			</InputLabel>
			<Box className="pl-2 space-y-4">
				<TagTranslationSettings />
				<Divider sx={{ my: 2 }} />
				<SpoilerLevelSettings />
			</Box>
		</Box>
	);
};

import { Switch } from "@mui/material";
