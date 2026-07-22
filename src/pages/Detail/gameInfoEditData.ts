import type { GameData } from "@/types";
import { getGameCover } from "@/utils/game";

interface CoverPreviewParams {
	selectedGame: GameData;
	shouldDeleteImage: boolean;
	tempCoverUrl: string | null;
	previewUrl: string | null;
	sourceCoverImage?: string;
	sourceCoverChanged: boolean;
}

export function getCoverPreviewUrl({
	selectedGame,
	shouldDeleteImage,
	tempCoverUrl,
	previewUrl,
	sourceCoverImage,
	sourceCoverChanged,
}: CoverPreviewParams): string {
	if (shouldDeleteImage) {
		return sourceCoverImage ?? "/images/default.png";
	}
	if (tempCoverUrl) {
		return tempCoverUrl;
	}
	if (previewUrl) {
		return previewUrl;
	}
	if (sourceCoverChanged && sourceCoverImage) {
		return sourceCoverImage;
	}

	return getGameCover({
		...selectedGame,
		image: sourceCoverImage ?? selectedGame.image,
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
