import {
	FormControlLabel,
	Radio,
	RadioGroup,
	Switch,
	Tooltip,
} from "@mui/material";
import Box from "@mui/material/Box";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import CheckIcon from "@mui/icons-material/Check";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import { useEffect, useState } from "react";
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

const PRESET_COLORS = [
	{ label: "MUI Blue", value: "#1976d2" },
	{ label: "Purple", value: "#9c27b0" },
	{ label: "Green", value: "#5cd08c" },
	{ label: "Red", value: "#d32f2f" },
	{ label: "Orange", value: "#ed6c02" },
	{ label: "Teal", value: "#009688" },
];

export const ThemeColorSettings = () => {
	const { t } = useTranslation();
	const themeColor = useStore((state) => state.themeColor);
	const setThemeColor = useStore((state) => state.setThemeColor);
	const [localColor, setLocalColor] = useState(themeColor);

	useEffect(() => {
		setLocalColor(themeColor);
	}, [themeColor]);

	useEffect(() => {
		const timer = setTimeout(() => {
			if (localColor !== themeColor) {
				setThemeColor(localColor);
			}
		}, 300);
		return () => clearTimeout(timer);
	}, [localColor, themeColor, setThemeColor]);

	const handleColorClick = (color: string) => {
		setLocalColor(color);
		setThemeColor(color);
	};

	return (
		<Box className="mb-6">
			<InputLabel className="font-semibold mb-4">
				{t("pages.Settings.themeColor.title", "主题颜色")}
			</InputLabel>
			<Box className="pl-2 flex flex-wrap gap-4 items-center">
				{PRESET_COLORS.map((color) => {
					const isSelected =
						localColor.toLowerCase() === color.value.toLowerCase();
					return (
						<Tooltip
							key={color.value}
							title={t(
								`pages.Settings.themeColor.${color.label.toLowerCase().replace(" ", "")}`,
								color.label,
							)}
						>
							<Box
								onClick={() => handleColorClick(color.value)}
								sx={{
									width: 36,
									height: 36,
									borderRadius: "50%",
									backgroundColor: color.value,
									cursor: "pointer",
									display: "flex",
									alignItems: "center",
									justifyContent: "center",
									boxShadow: isSelected ? 3 : 1,
									transition: "all 0.2s ease-in-out",
									"&:hover": { transform: "scale(1.1)", boxShadow: 4 },
								}}
							>
								{isSelected && (
									<CheckIcon sx={{ color: "#fff", fontSize: 20 }} />
								)}
							</Box>
						</Tooltip>
					);
				})}

				<Box className="ml-2 flex items-center gap-3">
					<InputLabel className="text-sm m-0">
						{t("pages.Settings.themeColor.custom", "自定义:")}
					</InputLabel>
					<Box
						sx={{
							width: 36,
							height: 36,
							borderRadius: "50%",
							overflow: "hidden",
							cursor: "pointer",
							boxShadow: 1,
							transition: "all 0.2s ease-in-out",
							"&:hover": { transform: "scale(1.1)", boxShadow: 4 },
							position: "relative",
						}}
					>
						<input
							type="color"
							value={localColor}
							onChange={(e) => setLocalColor(e.target.value)}
							style={{
								width: "150%",
								height: "150%",
								position: "absolute",
								top: "-25%",
								left: "-25%",
								cursor: "pointer",
								border: "none",
								padding: 0,
							}}
						/>
					</Box>
				</Box>
			</Box>
		</Box>
	);
};
