export const DEFAULT_LOCALE = "zh-CN";

export const SUPPORTED_LOCALES = ["zh-CN", "zh-TW", "en-US", "ja-JP"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export function getSafeLocale(locale?: string | null): SupportedLocale {
	return SUPPORTED_LOCALES.includes(locale as SupportedLocale)
		? (locale as SupportedLocale)
		: DEFAULT_LOCALE;
}
