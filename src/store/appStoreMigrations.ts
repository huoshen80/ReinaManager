import { DEFAULT_MIXED_SOURCE_KEYS, MIXED_SOURCE_KEYS } from "@/metadata";
import type { SourceType } from "@/types";
import { DefaultGroup } from "@/types/collection";

export const APP_STORE_VERSION = 2;
export const DEFAULT_MIXED_ENABLED_SOURCES: readonly SourceType[] =
	DEFAULT_MIXED_SOURCE_KEYS;

type AppStorePersistedState = {
	mixedEnabledSources?: SourceType[];
	mixedEnableYmgal?: boolean;
	mixedEnableKun?: boolean;
	currentGroupId?: string | null;
	selectedCategory?: SelectedCategoryState;
	selectedCategoryId?: number | null;
	selectedCategoryName?: string | null;
	doubleClickLaunch?: boolean;
	longPressLaunch?: boolean;
	themeColor?: string;
};

type SelectedCategoryState =
	| { type: "real"; id: number }
	| { type: "developer"; key: string }
	| null;

function normalizeMixedEnabledSources(
	sources?: readonly SourceType[] | null,
): SourceType[] {
	if (!sources) return [...DEFAULT_MIXED_ENABLED_SOURCES];

	const enabled = new Set(
		sources.filter((source) => MIXED_SOURCE_KEYS.includes(source)),
	);
	const filtered = MIXED_SOURCE_KEYS.filter((source) => enabled.has(source));
	return filtered.length >= DEFAULT_MIXED_ENABLED_SOURCES.length
		? filtered
		: [...DEFAULT_MIXED_ENABLED_SOURCES];
}

export function migrateAppStorePersistedState(
	persistedState: unknown,
	version: number,
) {
	if (!persistedState || typeof persistedState !== "object") {
		return persistedState;
	}

	const state = persistedState as AppStorePersistedState;
	if (version < 1) {
		migrateMixedSourceFlagsToEnabledSources(state);
		migrateSelectedCategoryState(state);
	}

	if (version < 2) {
		migrateCardLaunchSettings(state);
	}

	return state;
}

function migrateMixedSourceFlagsToEnabledSources(
	state: AppStorePersistedState,
) {
	state.mixedEnabledSources = normalizeMixedEnabledSources([
		...DEFAULT_MIXED_ENABLED_SOURCES,
		...(state.mixedEnableYmgal ? (["ymgal"] as const) : []),
		...(state.mixedEnableKun ? (["kun"] as const) : []),
	]);
	delete state.mixedEnableYmgal;
	delete state.mixedEnableKun;
}

function migrateSelectedCategoryState(state: AppStorePersistedState) {
	if (state.selectedCategory === undefined) {
		if (
			typeof state.selectedCategoryId === "number" &&
			state.selectedCategoryId > 0
		) {
			state.selectedCategory = {
				type: "real",
				id: state.selectedCategoryId,
			};
		} else if (
			state.currentGroupId === DefaultGroup.DEVELOPER &&
			typeof state.selectedCategoryName === "string" &&
			state.selectedCategoryName
		) {
			state.selectedCategory = {
				type: "developer",
				key: state.selectedCategoryName,
			};
		} else {
			state.selectedCategory = null;
		}
	}

	delete state.selectedCategoryId;
	delete state.selectedCategoryName;
}

function migrateCardLaunchSettings(state: AppStorePersistedState) {
	delete state.doubleClickLaunch;
	delete state.longPressLaunch;
}
