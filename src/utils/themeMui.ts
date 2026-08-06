/**
 * @file 主题包 MUI 样式配置的合并工具
 * @description 将主题包 manifest 的 mui 段转换为 MUI 主题选项，并注入 CSS 变量。
 *              后端已做结构校验（Mui* 前缀、-- 前缀、类型），这里做二次防御。
 */

import type { ThemeOptions } from "@mui/material/styles";

/** 主题包 manifest 的 mui 段结构。 */
export interface ThemeMuiConfig {
	components?: Record<string, Record<string, unknown>>;
	typography?: Record<string, unknown>;
	shape?: Record<string, unknown>;
	cssVariables?: Record<string, string | number>;
}

const MUI_COMPONENT_PREFIX = "Mui";
const CSS_VARIABLE_PREFIX = "--";

/**
 * 将主题包 mui 配置转换为可合并进 createTheme 的 ThemeOptions 子集。
 * components 仅保留 Mui* 前缀且值为对象的条目；typography/shape 仅保留对象。
 */
export function toMuiThemeOptions(
	mui: ThemeMuiConfig | null | undefined,
): ThemeOptions {
	if (!mui) return {};
	const options: ThemeOptions = {};
	if (mui.components && typeof mui.components === "object") {
		const components: NonNullable<ThemeOptions["components"]> = {};
		const componentsRecord = components as Record<string, unknown>;
		for (const [key, value] of Object.entries(mui.components)) {
			if (
				key.startsWith(MUI_COMPONENT_PREFIX) &&
				value &&
				typeof value === "object"
			) {
				componentsRecord[key] = value;
			}
		}
		options.components = components;
	}
	if (mui.typography && typeof mui.typography === "object") {
		options.typography = mui.typography as never;
	}
	if (mui.shape && typeof mui.shape === "object") {
		options.shape = mui.shape as never;
	}
	return options;
}

/**
 * 将主题包 mui.cssVariables 注入 :root（仅 -- 前缀键，字符串/数字值）。
 */
export function applyMuiCssVariables(
	mui: ThemeMuiConfig | null | undefined,
): void {
	if (!mui?.cssVariables || typeof mui.cssVariables !== "object") return;
	const root = document.documentElement;
	for (const [key, value] of Object.entries(mui.cssVariables)) {
		if (key.startsWith(CSS_VARIABLE_PREFIX)) {
			root.style.setProperty(key, String(value));
		}
	}
}
