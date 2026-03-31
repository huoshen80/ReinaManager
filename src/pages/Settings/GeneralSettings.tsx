import {
	Box,
	InputLabel,
	MenuItem,
	Select,
	Stack,
	Switch,
	type SelectChangeEvent,
} from "@mui/material";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { isEnabled } from "@tauri-apps/plugin-autostart";
import { toggleAutostart } from "@/services/plugins/autoStartService";

/**
 * 语言选择组件
 */
export const LanguageSelect = () => {
	const { t, i18n } = useTranslation();
	const languageNames = {
		"zh-CN": "简体中文(zh-CN)",
		"zh-TW": "繁体中文(zh-TW)",
		"en-US": "English(en-US)",
		"ja-JP": "日本語(ja-JP)",
	};

	const handleChange = (event: SelectChangeEvent) => {
		i18n.changeLanguage(event.target.value);
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
				renderValue={(value) => languageNames[value as keyof typeof languageNames]}
			>
				<MenuItem value="zh-CN">简体中文(zh-CN)</MenuItem>
				<MenuItem value="zh-TW">繁体中文(zh-TW)</MenuItem>
				<MenuItem value="en-US">English(en-US)</MenuItem>
				<MenuItem value="ja-JP">日本語(ja-JP)</MenuItem>
			</Select>
		</Box>
	);
};

/**
 * 自启动设置
 */
export const AutoStartSettings = () => {
	const { t } = useTranslation();
	const [autoStart, setAutoStart] = useState(false);

	useEffect(() => {
		isEnabled().then(setAutoStart);
	}, []);

	return (
		<Box className="mb-6">
			<Stack direction="row" alignItems="center" className="min-w-60">
				<Box>
					<InputLabel className="font-semibold mb-1">
						{t("pages.Settings.autoStart")}
					</InputLabel>
				</Box>
				<Switch
					checked={autoStart}
					onChange={() => {
						setAutoStart(!autoStart);
						toggleAutostart();
					}}
					color="primary"
				/>
			</Stack>
		</Box>
	);
};
