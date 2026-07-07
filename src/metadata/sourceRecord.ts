import type { GameSourceRecord, JsonValue, SourceType } from "@/types";
import { isSourceType } from "@/types";
import { REGISTERED_SOURCE_KEYS } from "./sourceRegistry";

type SourceRecordLike = {
	source: string;
	external_id?: string | null;
	data?: unknown;
};

export type SourceRecordPayload = {
	sources?: readonly SourceRecordLike[] | null;
};

export type SourceRecordMap = Map<SourceType, GameSourceRecord>;
export type SourceDataMap = Partial<Record<SourceType, unknown>>;
export type SourceIdMap = Partial<Record<SourceType, string>>;

export function getSourceRecordMap(
	payload: SourceRecordPayload,
): SourceRecordMap {
	const map: SourceRecordMap = new Map();

	for (const record of payload.sources ?? []) {
		if (!isSourceType(record.source)) continue;
		if (record.external_id == null && record.data == null) continue;
		map.set(record.source, {
			source: record.source,
			external_id: record.external_id ?? null,
			data: (record.data ?? null) as JsonValue | null,
		});
	}

	return map;
}

export function getSourceRecord(
	payload: SourceRecordPayload,
	source: SourceType,
): GameSourceRecord | undefined {
	return getSourceRecordMap(payload).get(source);
}

export function getSourceId(
	payload: SourceRecordPayload,
	source: SourceType,
): string | undefined {
	return getSourceRecord(payload, source)?.external_id ?? undefined;
}

export function getSourceData<TData = unknown>(
	payload: SourceRecordPayload,
	source: SourceType,
): TData | undefined {
	return getSourceRecord(payload, source)?.data as TData | undefined;
}

export function hasSourceRecord(
	payload: SourceRecordPayload,
	source: SourceType,
): boolean {
	return getSourceRecord(payload, source) !== undefined;
}

export function getSourceDataMap(payload: SourceRecordPayload): SourceDataMap {
	const sources: SourceDataMap = {};
	for (const [source, record] of getSourceRecordMap(payload)) {
		if (record.data != null) {
			sources[source] = record.data;
		}
	}
	return sources;
}

export function getSourceIdMap(payload: SourceRecordPayload): SourceIdMap {
	const ids: SourceIdMap = {};
	for (const [source, record] of getSourceRecordMap(payload)) {
		if (record.external_id) {
			ids[source] = record.external_id;
		}
	}
	return ids;
}

export function getSourceRecordsFromPayload(
	payload: SourceRecordPayload,
): GameSourceRecord[] {
	const sourceMap = getSourceRecordMap(payload);
	return REGISTERED_SOURCE_KEYS.map((source) => sourceMap.get(source)).filter(
		(record): record is GameSourceRecord => Boolean(record),
	);
}
