import type { SourceImageOption } from "@/metadata/data/sourceImage";
import type { GameData } from "@/types";
import { getGameCover } from "@/utils/game";

interface CoverPreviewParams {
	selectedGame: GameData;
	shouldDeleteImage: boolean;
	tempCoverUrl: string | null;
	previewUrl: string | null;
	sourceCover?: SourceImageOption;
}

export function getCoverPreviewUrl({
	selectedGame,
	shouldDeleteImage,
	tempCoverUrl,
	previewUrl,
	sourceCover,
}: CoverPreviewParams): string {
	if (!shouldDeleteImage && tempCoverUrl) {
		return tempCoverUrl;
	}
	if (!shouldDeleteImage && previewUrl) {
		return previewUrl;
	}

	return getGameCover({
		...selectedGame,
		image: sourceCover?.image ?? selectedGame.image,
		image_source: sourceCover?.source ?? selectedGame.image_source,
		custom_cover: shouldDeleteImage ? undefined : selectedGame.custom_cover,
	});
}

export function isInvalidExecutableName(executable: string): boolean {
	const normalized = executable.trim();
	return (
		normalized !== "" &&
		(normalized === "." || normalized === ".." || /[\\/]/.test(normalized))
	);
}

export function stringArraysEqual(
	current: string[],
	original: readonly string[] | null | undefined,
): boolean {
	const normalizedOriginal = original ?? [];
	if (current.length !== normalizedOriginal.length) {
		return false;
	}

	return current.every((value, index) => value === normalizedOriginal[index]);
}
