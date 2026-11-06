import type { CustomData, GameData, SourceType } from "@/types";
import type { SourceDisplayFields } from "../sourceCandidate";
import {
	getSourceRecordMap,
	type SourceDataMap,
	type SourceRecordPayload,
} from "../sourceRecord";
import {
	getRuntimeSourceAdapter,
	REGISTERED_SOURCE_KEYS,
} from "../sourceRegistry";

import {
	DEFAULT_SOURCE_PRIORITIES,
	type SourcePriorities,
} from "./displayPreferences";
import { resolveSourceCover } from "./sourceImage";

export const MIXED_BASIC_SOURCE_PRIORITY = DEFAULT_SOURCE_PRIORITIES.title;
const MIXED_TAG_SOURCES: readonly SourceType[] = [
	"bgm",
	"hikarinagi",
	"dlsite",
	"erogamescape",
	"vndb",
	"kun",
];
const MIXED_ALIAS_SOURCES: readonly SourceType[] = [
	"bgm",
	"vndb",
	"hikarinagi",
	"kun",
	"ymgal",
];
const MIXED_TITLE_SOURCES: readonly SourceType[] = ["vndb", "kun"];

type SourceDisplayMap = Partial<Record<SourceType, SourceDisplayFields>>;

export interface SourceSummaryOption {
	source: SourceType;
	summary: string;
}

const nullToUndefined = <T>(value: T | null | undefined): T | undefined =>
	value ?? undefined;

function assignBasicFields(
	target: GameData,
	fields: SourceDisplayFields,
): void {
	if (fields.name != null) target.name = fields.name;
	if (fields.name_cn != null) target.name_cn = fields.name_cn;
	if (fields.summary != null) target.summary = fields.summary;
	if (fields.developer != null) target.developer = fields.developer;
	if (fields.nsfw != null) target.nsfw = fields.nsfw;
}

export function getSourceDisplayFields(
	source: SourceType,
	data: unknown,
): SourceDisplayFields {
	return getRuntimeSourceAdapter(source).toDisplayFields(data);
}

export function getSourceDeveloperOptions(
	game: SourceRecordPayload,
	priority = DEFAULT_SOURCE_PRIORITIES.developer,
): string[] {
	const sourceMap = getSourceRecordMap(game);

	return Array.from(
		new Set(
			priority.flatMap((source) => {
				const data = sourceMap.get(source)?.data;
				if (data == null) return [];

				const developer = getSourceDisplayFields(
					source,
					data,
				).developer?.trim();
				return developer ? [developer] : [];
			}),
		),
	);
}

export function getSourceSummaryOptions(
	game: SourceRecordPayload,
	priority = DEFAULT_SOURCE_PRIORITIES.summary,
): SourceSummaryOption[] {
	const sourceMap = getSourceRecordMap(game);

	return priority.flatMap((source) => {
		const data = sourceMap.get(source)?.data;
		if (data == null) return [];

		const summary = getSourceDisplayFields(source, data).summary;
		if (!summary?.trim()) return [];

		return [{ source, summary }];
	});
}

export function applySingleSourceDisplay(
	target: GameData,
	source: SourceType,
	data: unknown,
): void {
	const fields = getSourceDisplayFields(source, data);
	assignBasicFields(target, fields);

	target.image = fields.image;
	target.image_source = fields.image ? source : undefined;
	target.tags = fields.tags ?? target.tags;
	target.rank = fields.rank;
	target.score = fields.score;
	target.all_titles = fields.all_titles;
	target.aliases = fields.aliases ?? target.aliases;
	target.average_hours = fields.average_hours;
}

export function applyCustomSourceDisplay(
	target: GameData,
	customData: CustomData,
): void {
	assignBasicFields(target, {
		name: nullToUndefined(customData.name),
		summary: nullToUndefined(customData.summary),
		developer: nullToUndefined(customData.developer),
		nsfw: nullToUndefined(customData.nsfw),
	});
	target.aliases = nullToUndefined(customData.aliases) ?? [];
	target.tags = nullToUndefined(customData.tags) ?? [];
}

function buildDisplayMap(sources: SourceDataMap): SourceDisplayMap {
	return Object.fromEntries(
		REGISTERED_SOURCE_KEYS.map((source) => {
			const data = sources[source];
			return data ? [source, getSourceDisplayFields(source, data)] : null;
		}).filter((entry): entry is [SourceType, SourceDisplayFields] =>
			Boolean(entry),
		),
	);
}

function firstField<Key extends keyof SourceDisplayFields>(
	displays: SourceDisplayMap,
	sources: readonly SourceType[],
	key: Key,
): SourceDisplayFields[Key] | undefined {
	for (const source of sources) {
		const value = displays[source]?.[key];
		if (value != null && (typeof value !== "string" || value.trim()))
			return value;
	}
	return undefined;
}

function mergeArrays(
	displays: SourceDisplayMap,
	sources: readonly SourceType[],
	key: "tags" | "aliases" | "all_titles",
): string[] {
	return Array.from(
		new Set(sources.flatMap((source) => displays[source]?.[key] ?? [])),
	);
}

export function applyMixedSourceDisplay(
	target: GameData,
	sources: SourceDataMap,
	coverSource?: SourceType | null,
	priorities: SourcePriorities = DEFAULT_SOURCE_PRIORITIES,
): void {
	const displays = buildDisplayMap(sources);
	const primarySource = MIXED_BASIC_SOURCE_PRIORITY.find(
		(source) => displays[source],
	);
	if (primarySource) {
		assignBasicFields(target, displays[primarySource] as SourceDisplayFields);
	}

	// 原名和中文名独立回退，避免高优先级来源缺少译名时截断查找。
	target.name = firstField(displays, priorities.title, "name");
	target.name_cn = firstField(displays, priorities.title, "name_cn");
	const cover = resolveSourceCover(displays, coverSource, priorities.image);
	target.image = cover?.image;
	target.image_source = cover?.source;
	target.summary = firstField(displays, priorities.summary, "summary");
	target.developer = firstField(displays, priorities.developer, "developer");
	target.tags = mergeArrays(displays, MIXED_TAG_SOURCES, "tags");
	target.aliases = mergeArrays(displays, MIXED_ALIAS_SOURCES, "aliases");
	target.score =
		displays.bgm?.score ??
		displays.erogamescape?.score ??
		displays.vndb?.score ??
		displays.hikarinagi?.score ??
		displays.kun?.score;
	target.rank = displays.bgm?.rank;
	target.all_titles = mergeArrays(displays, MIXED_TITLE_SOURCES, "all_titles");
	target.average_hours =
		displays.vndb?.average_hours ?? displays.kun?.average_hours;
}

export function applyCustomDataOverride(
	target: GameData,
	customData: CustomData,
): void {
	if (customData.summary) {
		target.summary = customData.summary;
	}
	if (customData.developer) {
		target.developer = customData.developer;
	}
	if (customData.nsfw != null) {
		target.nsfw = customData.nsfw;
	}

	if (customData.aliases) {
		target.aliases = Array.from(
			new Set([...(target.aliases || []), ...customData.aliases]),
		);
	}
	if (customData.tags) {
		target.tags = Array.from(
			new Set([...(target.tags || []), ...customData.tags]),
		);
	}
}
