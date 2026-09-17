import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import en_US from "@/locales/en-US.json";
import ja_JP from "@/locales/ja-JP.json";
import zh_CN from "@/locales/zh-CN.json";
import zh_TW from "@/locales/zh-TW.json";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "@/utils/locale";

const resources = {
	"zh-CN": {
		translation: zh_CN,
	},
	"zh-TW": {
		translation: zh_TW,
	},
	"en-US": {
		translation: en_US,
	},
	"ja-JP": {
		translation: ja_JP,
	},
};

if (typeof window !== "undefined") {
	try {
		const cachedLocale = window.localStorage.getItem("i18nextLng");
		if (
			cachedLocale &&
			!SUPPORTED_LOCALES.includes(
				cachedLocale as (typeof SUPPORTED_LOCALES)[number],
			)
		) {
			window.localStorage.removeItem("i18nextLng");
		}
	} catch {
		// localStorage 不可用时交由语言检测器和 fallbackLng 处理。
	}
}

i18n
	// 检测用户语言
	.use(LanguageDetector)
	// 将i18n实例传递给react-i18next
	.use(initReactI18next)
	// 初始化i18next
	.init({
		resources,
		supportedLngs: [...SUPPORTED_LOCALES],
		fallbackLng: DEFAULT_LOCALE, // 默认语言
		interpolation: {
			escapeValue: false, // 不转义特殊字符
		},
		detection: {
			order: ["localStorage", "navigator"],
			caches: ["localStorage"],
		},
	});

export default i18n;
