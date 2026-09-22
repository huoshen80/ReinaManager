import { FormControlLabel, Radio, RadioGroup, Switch } from "@mui/material";
import Box from "@mui/material/Box";
import MenuItem from "@mui/material/MenuItem";
import Select, { type SelectChangeEvent } from "@mui/material/Select";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { type StartupPage, useStore } from "@/store/appStore";
import { SettingsGroup, SettingsItem } from "./SettingsLayout";

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
		<SettingsItem title={t("pages.Settings.language", "语言")}>
			<Select
				id="language-select"
				value={i18n.language}
				onChange={handleChange}
				className="w-60 max-w-full"
				size="small"
				renderValue={(value) =>
					languageNames[value as keyof typeof languageNames]
				}
			>
				<MenuItem value="zh-CN">简体中文(zh-CN)</MenuItem>
				<MenuItem value="zh-TW">繁体中文(zh-TW)</MenuItem>
				<MenuItem value="en-US">English(en-US)</MenuItem>
				<MenuItem value="ja-JP">日本語(ja-JP)</MenuItem>
			</Select>
		</SettingsItem>
	);
};

export const StartupPageSettings = () => {
	const { t } = useTranslation();
	const { startupPage, setStartupPage } = useStore(
		useShallow((s) => ({
			startupPage: s.startupPage,
			setStartupPage: s.setStartupPage,
		})),
	);

	const handleChange = (event: SelectChangeEvent<StartupPage>) => {
		setStartupPage(event.target.value as StartupPage);
	};

	return (
		<SettingsItem
			title={t("pages.Settings.startupPage.title", "启动默认页面")}
			description={t(
				"pages.Settings.startupPage.description",
				"下次启动应用时打开的初始页面。",
			)}
		>
			<Select
				id="startup-page-select"
				value={startupPage}
				onChange={handleChange}
				className="w-60 max-w-full"
				size="small"
			>
				<MenuItem value="home">{t("app.NAVIGATION.home", "主页")}</MenuItem>
				<MenuItem value="libraries">
					{t("app.NAVIGATION.gameLibrary", "游戏仓库")}
				</MenuItem>
				<MenuItem value="collection">
					{t("app.NAVIGATION.collection", "收藏夹")}
				</MenuItem>
			</Select>
		</SettingsItem>
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
		<SettingsGroup title={t("pages.Settings.nsfw.title", "NSFW 设置")}>
			<SettingsItem title={t("pages.Settings.nsfw.filter", "过滤 NSFW 内容")}>
				<Switch
					checked={nsfwFilter}
					onChange={(e) => setNsfwFilter(e.target.checked)}
					color="primary"
				/>
			</SettingsItem>
			<SettingsItem
				title={t("pages.Settings.nsfw.coverReplace", "NSFW 封面替换")}
			>
				<Switch
					checked={nsfwCoverReplace}
					onChange={(e) => setNsfwCoverReplace(e.target.checked)}
					color="primary"
				/>
			</SettingsItem>
		</SettingsGroup>
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
		<SettingsGroup
			title={t("pages.Settings.cardClickMode.title", "卡片点击模式")}
			description={t(
				"pages.Settings.cardClickMode.description",
				"仓库与收藏夹游戏卡片单击的行为（两种模式下均可双击游戏卡片启动游戏）。",
			)}
		>
			<Box>
				<RadioGroup
					value={cardClickMode}
					onChange={(e) =>
						setCardClickMode(e.target.value as "navigate" | "select")
					}
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
		</SettingsGroup>
	);
};
