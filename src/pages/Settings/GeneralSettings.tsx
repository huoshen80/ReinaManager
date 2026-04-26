import {
	FormControlLabel,
	Radio,
	RadioGroup,
	Switch,
	Typography,
} from "@mui/material";
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
				{t("pages.Settings.language")}
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
				{t("pages.Settings.nsfw.title")}
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
					label={t("pages.Settings.nsfw.filter")}
				/>

				<FormControlLabel
					control={
						<Switch
							checked={nsfwCoverReplace}
							onChange={(e) => setNsfwCoverReplace(e.target.checked)}
							color="primary"
						/>
					}
					label={t("pages.Settings.nsfw.coverReplace")}
				/>
			</Box>
		</Box>
	);
};

export const CardClickModeSettings = () => {
	const { t } = useTranslation();
	const {
		cardClickMode,
		setCardClickMode,
		doubleClickLaunch,
		setDoubleClickLaunch,
		longPressLaunch,
		setLongPressLaunch,
	} = useStore(
		useShallow((s) => ({
			cardClickMode: s.cardClickMode,
			setCardClickMode: s.setCardClickMode,
			doubleClickLaunch: s.doubleClickLaunch,
			setDoubleClickLaunch: s.setDoubleClickLaunch,
			longPressLaunch: s.longPressLaunch,
			setLongPressLaunch: s.setLongPressLaunch,
		})),
	);

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">
				{t("pages.Settings.cardClickMode.title")}
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
						label={t("pages.Settings.cardClickMode.navigate")}
						className="mb-1"
					/>
					<FormControlLabel
						value="select"
						control={<Radio color="primary" />}
						label={t("pages.Settings.cardClickMode.select")}
						className="mb-1"
					/>
				</RadioGroup>

				{/* 双击启动游戏设置 */}
				<Box className="mt-4 pl-2">
					<FormControlLabel
						control={
							<Switch
								checked={doubleClickLaunch}
								onChange={(e) => setDoubleClickLaunch(e.target.checked)}
								color="primary"
							/>
						}
						label={t("pages.Settings.cardClickMode.doubleClickLaunch")}
						className="mb-1"
					/>
					{doubleClickLaunch && cardClickMode === "navigate" && (
						<Typography
							variant="caption"
							color="text.secondary"
							className="block ml-8"
						>
							{t("pages.Settings.cardClickMode.doubleClickLaunchNote")}
						</Typography>
					)}
				</Box>

				{/* 长按启动游戏设置 */}
				<Box className="mt-4 pl-2">
					<FormControlLabel
						control={
							<Switch
								checked={longPressLaunch}
								onChange={(e) => setLongPressLaunch(e.target.checked)}
								color="primary"
							/>
						}
						label={t("pages.Settings.cardClickMode.longPressLaunch")}
						className="mb-1"
					/>
					{longPressLaunch && (
						<Typography
							variant="caption"
							color="text.secondary"
							className="block ml-8"
						>
							{t("pages.Settings.cardClickMode.longPressLaunchNote")}
						</Typography>
					)}
				</Box>
			</Box>
		</Box>
	);
};
