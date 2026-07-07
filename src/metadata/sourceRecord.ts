import type { GameSourceRecord, JsonValue, SourceType } from "@/types";
import { isSourceType } from "@/types";
import { REGISTERED_SOURCE_KEYS } from "./sourceRegistry";

type SourceRecordLike = {
	source: string;
	external_id?: string | null;
	data?: unknown;
};

export type SourceRecordPayload = {
	sources: readonly SourceRecordLike[] | null;
};

export type SourceIdPayload = {
	sourceIds: Partial<Record<SourceType, string>> | null;
};

export type SourceIdentityPayload = SourceRecordPayload | SourceIdPayload;

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

export function getSourceIdFromRecords(
	payload: SourceRecordPayload,
	source: SourceType,
): string | undefined {
	return getSourceRecord(payload, source)?.external_id ?? undefined;
}

export function getSourceIdFromDisplay(
	payload: SourceIdPayload,
	source: SourceType,
): string | undefined {
	return payload.sourceIds?.[source] || undefined;
}

export function getAnySourceId(
	payload: SourceIdentityPayload,
	source: SourceType,
): string | undefined {
	if ("sources" in payload) {
		const sourceId = getSourceIdFromRecords(payload, source);
		if (sourceId) return sourceId;
	}

	if ("sourceIds" in payload) {
		return getSourceIdFromDisplay(payload, source);
	}

	return undefined;
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

export function getSourceIdMap(payload: SourceRecordPayload): SourceIdMap {
	const ids: SourceIdMap = {};
	for (const [source, record] of getSourceRecordMap(payload)) {
		if (record.external_id) {
			ids[source] = record.external_id;
		}
	}
	return ids;
}

export function getAnySourceIdMap(payload: SourceIdentityPayload): SourceIdMap {
	const ids: SourceIdMap = {};
	for (const source of REGISTERED_SOURCE_KEYS) {
		const sourceId = getAnySourceId(payload, source);
		if (sourceId) {
			ids[source] = sourceId;
		}
	}
	return ids;
}
