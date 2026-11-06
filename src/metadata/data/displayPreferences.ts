import type { SourceType } from "@/types";

export const SOURCE_PRIORITY_FIELDS = [
	"title",
	"image",
	"summary",
	"developer",
] as const;
export type SourcePriorityField = (typeof SOURCE_PRIORITY_FIELDS)[number];
export type SourcePriorityOverrides = Partial<
	Record<SourcePriorityField, readonly SourceType[]>
>;
export type SourcePriorities = Record<
	SourcePriorityField,
	readonly SourceType[]
>;

export const DEFAULT_SOURCE_PRIORITIES: SourcePriorities = {
	image: [
		"hikarinagi",
		"bgm",
		"vndb",
		"erogamescape",
		"dlsite",
		"kun",
		"ymgal",
	],
	title: [
		"bgm",
		"vndb",
		"hikarinagi",
		"dlsite",
		"erogamescape",
		"ymgal",
		"kun",
	],
	summary: ["hikarinagi", "ymgal", "bgm", "kun", "vndb", "dlsite"],
	developer: [
		"vndb",
		"erogamescape",
		"kun",
		"dlsite",
		"ymgal",
		"hikarinagi",
		"bgm",
	],
};

export interface DisplayPreferences {
	priorities: SourcePriorities;
	preferOriginalName: boolean;
	key: string;
}

interface DisplayPreferenceState {
	sourcePriorityOverrides: SourcePriorityOverrides;
	preferOriginalName: boolean;
}

export function normalizeSourcePriority(
	field: SourcePriorityField,
	value: unknown,
): readonly SourceType[] {
	const defaults = DEFAULT_SOURCE_PRIORITIES[field];
	if (!Array.isArray(value)) return defaults;
	// 新来源自动补到末尾；移除未知键和重复项，不改变用户已有的相对顺序。
	return [
		...new Set<SourceType>([
			...value.filter((source): source is SourceType =>
				defaults.includes(source),
			),
			...defaults,
		]),
	];
}

export function normalizeSourcePriorityOverrides(
	value: unknown,
): SourcePriorityOverrides {
	if (!value || typeof value !== "object") return {};
	const overrides: SourcePriorityOverrides = {};
	for (const field of SOURCE_PRIORITY_FIELDS) {
		const order = (value as Record<string, unknown>)[field];
		if (Array.isArray(order))
			overrides[field] = normalizeSourcePriority(field, order);
	}
	return overrides;
}

const preferencesCache = new WeakMap<
	SourcePriorityOverrides,
	Map<boolean, DisplayPreferences>
>();

/** 保持派生偏好的引用稳定，供 Store 订阅与游戏索引共同使用。 */
export function getDisplayPreferences(
	state: DisplayPreferenceState,
): DisplayPreferences {
	let cached = preferencesCache.get(state.sourcePriorityOverrides);
	if (!cached) {
		cached = new Map();
		preferencesCache.set(state.sourcePriorityOverrides, cached);
	}
	const existing = cached.get(state.preferOriginalName);
	if (existing) return existing;
	const priorities = Object.fromEntries(
		SOURCE_PRIORITY_FIELDS.map((field) => [
			field,
			normalizeSourcePriority(field, state.sourcePriorityOverrides[field]),
		]),
	) as SourcePriorities;
	const preferences = {
		priorities,
		preferOriginalName: state.preferOriginalName,
		key: JSON.stringify([priorities, state.preferOriginalName]),
	};
	cached.set(state.preferOriginalName, preferences);
	return preferences;
}

export const DEFAULT_DISPLAY_PREFERENCES = getDisplayPreferences({
	sourcePriorityOverrides: {},
	preferOriginalName: false,
});

/** 名称选择与来源合并分离，搜索预览和游戏库共用语言回退规则。 */
export function resolveDisplayName(
	fields: { name?: string | null; name_cn?: string | null },
	language: string,
	preferOriginalName: boolean,
): string {
	const name = fields.name?.trim();
	const chineseName = fields.name_cn?.trim();
	if (preferOriginalName) return name || chineseName || "";
	return (language === "zh-CN" ? chineseName || name : name) || "";
}
