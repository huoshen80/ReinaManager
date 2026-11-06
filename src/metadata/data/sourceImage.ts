import type { FullGameData, SourceType } from "@/types";
import { getSourceRecordMap, type SourceRecordPayload } from "../sourceRecord";
import {
	getRuntimeSourceAdapter,
	REGISTERED_SOURCE_KEYS,
} from "../sourceRegistry";
import { DEFAULT_SOURCE_PRIORITIES } from "./displayPreferences";

type SourceImageData = Partial<
	Record<SourceType, { image?: string | null } | null | undefined>
>;

export interface SourceImageOption {
	source: SourceType;
	image: string;
}

export function getSourceImageMap(game: SourceRecordPayload): SourceImageData {
	const sourceMap = getSourceRecordMap(game);

	return Object.fromEntries(
		REGISTERED_SOURCE_KEYS.map((source) => {
			const data = sourceMap.get(source)?.data;
			return [
				source,
				data ? getRuntimeSourceAdapter(source).toDisplayFields(data) : null,
			];
		}),
	) as SourceImageData;
}

export function resolveSourceCover(
	sources: SourceImageData,
	coverSource?: SourceType | null,
	priority = DEFAULT_SOURCE_PRIORITIES.image,
): SourceImageOption | undefined {
	if (coverSource) {
		const selectedImage = sources[coverSource]?.image;
		if (selectedImage?.trim())
			return { source: coverSource, image: selectedImage };
	}

	for (const source of priority) {
		const image = sources[source]?.image;
		if (image?.trim()) return { source, image };
	}

	return undefined;
}

export function getSourceImageOptions(
	game: FullGameData,
	priority = DEFAULT_SOURCE_PRIORITIES.image,
): SourceImageOption[] {
	const sources = getSourceImageMap(game);

	return priority
		.map((source) => ({
			source,
			image: sources[source]?.image,
		}))
		.filter((option): option is SourceImageOption =>
			Boolean(option.image?.trim()),
		);
}
