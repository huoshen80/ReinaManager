import type { CustomData, GameData, SourceType } from "@/types";
import type { SourceDisplayFields } from "../sourceCandidate";
import type { SourceDataMap } from "../sourceRecord";
import {
	getRuntimeSourceAdapter,
	REGISTERED_SOURCE_KEYS,
} from "../sourceRegistry";

export const SOURCE_COVER_PRIORITY: readonly SourceType[] = [
	"bgm",
	"vndb",
	"kun",
	"ymgal",
];

const BASIC_FIELD_PRIORITY: readonly SourceType[] = [
	"bgm",
	"vndb",
	"ymgal",
	"kun",
];
const SUMMARY_PRIORITY: readonly SourceType[] = ["ymgal", "bgm", "kun", "vndb"];
const DEVELOPER_PRIORITY: readonly SourceType[] = [
	"vndb",
	"kun",
	"ymgal",
	"bgm",
];
const MIXED_TAG_SOURCES: readonly SourceType[] = ["bgm", "vndb", "kun"];
const MIXED_ALIAS_SOURCES: readonly SourceType[] = [
	"bgm",
	"vndb",
	"kun",
	"ymgal",
];
const MIXED_TITLE_SOURCES: readonly SourceType[] = ["vndb", "kun"];

type SourceDisplayMap = Partial<Record<SourceType, SourceDisplayFields>>;

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

export function applySingleSourceDisplay(
	target: GameData,
	source: SourceType,
	data: unknown,
): void {
	const fields = getSourceDisplayFields(source, data);
	assignBasicFields(target, fields);

	target.image = fields.image;
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
		if (value != null) return value;
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

function resolveDisplayImage(
	displays: SourceDisplayMap,
	coverSource?: SourceType | null,
): string | undefined {
	if (coverSource) {
		const selectedImage = displays[coverSource]?.image;
		if (selectedImage) return selectedImage;
	}

	return firstField(displays, SOURCE_COVER_PRIORITY, "image");
}

export function applyMixedSourceDisplay(
	target: GameData,
	sources: SourceDataMap,
	coverSource?: SourceType | null,
): void {
	const displays = buildDisplayMap(sources);
	const primarySource = BASIC_FIELD_PRIORITY.find((source) => displays[source]);
	if (primarySource) {
		assignBasicFields(target, displays[primarySource] as SourceDisplayFields);
	}

	target.image = resolveDisplayImage(displays, coverSource);
	target.summary = firstField(displays, SUMMARY_PRIORITY, "summary");
	target.developer = firstField(displays, DEVELOPER_PRIORITY, "developer");
	target.tags = mergeArrays(displays, MIXED_TAG_SOURCES, "tags");
	target.aliases = mergeArrays(displays, MIXED_ALIAS_SOURCES, "aliases");
	target.score = displays.bgm?.score ?? displays.vndb?.score;
	target.rank = displays.bgm?.rank;
	target.all_titles = mergeArrays(displays, MIXED_TITLE_SOURCES, "all_titles");
	target.average_hours = displays.vndb?.average_hours;
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
