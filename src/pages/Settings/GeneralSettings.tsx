import { FormControlLabel, Radio, RadioGroup, Switch } from "@mui/material";
import Box from "@mui/material/Box";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { useStore } from "@/store/appStore";

export const LanguageSelect = () => {
	const { t, i18n } = useTranslation(); // 使用i18n实例和翻译函数

	// 语言名称映射
	const languageNames = {
		"zh-CN": "简体中文(zh-CN)",
		"zh-TW": "繁体中文(zh-TW)",
		"en-US": "English(en-US)",
		"ja-JP": "日本語(ja-JP)",
	};

	/**
	 * 处理语言切换
	 * @param {SelectChangeEvent} event
	 */
	const handleChange = (event: SelectChangeEvent) => {
		const newLang = event.target.value;
		i18n.changeLanguage(newLang); // 切换语言
	};

	return (
		<Box className="min-w-30 mb-6">
			<InputLabel id="language-select-label" className="mb-2 font-semibold">
				{t("pages.Settings.language", "语言")}
			</InputLabel>
			<Select
				labelId="language-select-label"
				id="language-select"
				value={i18n.language}
				onChange={handleChange}
				className="w-60"
				renderValue={(value) =>
					languageNames[value as keyof typeof languageNames]
				}
			>
				<MenuItem value="zh-CN">简体中文(zh-CN)</MenuItem>
				<MenuItem value="zh-TW">繁体中文(zh-TW)</MenuItem>
				<MenuItem value="en-US">English(en-US)</MenuItem>
				<MenuItem value="ja-JP">日本語(ja-JP)</MenuItem>
			</Select>
		</Box>
	);
};

export const NsfwSettings = () => {
	const { t } = useTranslation();
	const { nsfwFilter, setNsfwFilter, nsfwCoverReplace, setNsfwCoverReplace } =
		useStore(
			useShallow((s) => ({
				nsfwFilter: s.nsfwFilter,
				setNsfwFilter: s.setNsfwFilter,
				nsfwCoverReplace: s.nsfwCoverReplace,
				setNsfwCoverReplace: s.setNsfwCoverReplace,
			})),
		);

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">
				{t("pages.Settings.nsfw.title", "NSFW 设置")}
			</InputLabel>

			<Box className="pl-2">
				<FormControlLabel
					control={
						<Switch
							checked={nsfwFilter}
							onChange={(e) => setNsfwFilter(e.target.checked)}
							color="primary"
						/>
					}
					label={t("pages.Settings.nsfw.filter", "过滤 NSFW 内容")}
				/>

				<FormControlLabel
					control={
						<Switch
							checked={nsfwCoverReplace}
							onChange={(e) => setNsfwCoverReplace(e.target.checked)}
							color="primary"
						/>
					}
					label={t("pages.Settings.nsfw.coverReplace", "NSFW 封面替换")}
				/>
			</Box>
		</Box>
	);
};

export const CardClickModeSettings = () => {
	const { t } = useTranslation();
	const { cardClickMode, setCardClickMode } = useStore(
		useShallow((s) => ({
			cardClickMode: s.cardClickMode,
			setCardClickMode: s.setCardClickMode,
		})),
	);

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">
				{t("pages.Settings.cardClickMode.title", "卡片点击模式")}
			</InputLabel>
			<Box className="pl-2">
				<RadioGroup
					value={cardClickMode}
					onChange={(e) =>
						setCardClickMode(e.target.value as "navigate" | "select")
					}
					className="pl-2"
				>
					<FormControlLabel
						value="navigate"
						control={<Radio color="primary" />}
						label={t(
							"pages.Settings.cardClickMode.navigate",
							"导航模式（单击跳转详情页）",
						)}
						className="mb-1"
					/>
					<FormControlLabel
						value="select"
						control={<Radio color="primary" />}
						label={t(
							"pages.Settings.cardClickMode.select",
							"选择模式（单击选择游戏）",
						)}
						className="mb-1"
					/>
				</RadioGroup>
			</Box>
		</Box>
	);
};
