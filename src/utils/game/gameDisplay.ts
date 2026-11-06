import { convertFileSrc } from "@tauri-apps/api/core";
import i18next from "i18next";
import { join } from "pathe";
import { resolveDisplayName } from "@/metadata/data/displayPreferences";
import { getAppDataDirPath } from "@/services/fs/pathCache";
import { useStore } from "@/store/appStore";
import type { GameData } from "@/types";
import { buildTauriProtocolUrl } from "@/utils/tauriProtocol";

export const getGameDisplayName = (
	game: GameData,
	preferOriginalName = useStore.getState().preferOriginalName,
): string => {
	const customName = game.custom_data?.name?.trim();
	if (customName) return customName;
	return resolveDisplayName(game, i18next.language, preferOriginalName);
};

export const getGameCover = (
	game: Pick<
		GameData,
		"id" | "custom_cover" | "image" | "image_source" | "cloud_covers"
	>,
): string => {
	if (game.custom_cover) {
		try {
			return convertFileSrc(
				join(getAppDataDirPath(), "covers", "custom", game.custom_cover),
			);
		} catch (error) {
			console.error("转换自定义封面路径失败:", error);
			return "/images/unavailable.svg";
		}
	}

	if (game.image) {
		const assetId = game.image_source
			? game.cloud_covers?.[game.image_source]
			: undefined;
		return assetId
			? buildTauriProtocolUrl("reina-cover", assetId, new URLSearchParams())
			: "/images/unavailable.svg";
	}

	return "/images/default.png";
};

export function getVisibleGameCover(
	game: GameData,
	replaceNsfwCover: boolean,
): string {
	return replaceNsfwCover && getGameNsfwStatus(game)
		? "/images/NR18.png"
		: getGameCover(game);
}

export function getVisibleGameCoverKey(
	game: GameData,
	replaceNsfwCover: boolean,
): string {
	if (replaceNsfwCover && getGameNsfwStatus(game)) {
		return "nsfw";
	}
	if (game.custom_cover) {
		return `custom:${game.id}:${game.custom_cover}`;
	}
	if (game.image) {
		return getGameCover(game);
	}
	return "default";
}

export const getGameNsfwStatus = (game: GameData): boolean => {
	return game.nsfw ?? isNsfwGame(game.tags || []);
};

export function applyNsfwFilter(
	data: GameData[],
	nsfwFilter: boolean,
): GameData[] {
	if (!nsfwFilter) {
		return data;
	}
	return data.filter((game) => !getGameNsfwStatus(game));
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: 允许 ASCII 范围检查
const ASCII_ONLY_RE = /^[\x00-\x7F]+$/;

function isNsfwGame(tags: string[]): boolean {
	if (tags.length === 0) return false;

	if (tags.some((tag) => tag.includes("R18") || tag === "拔作")) {
		return true;
	}

	const isAllEnglish = tags.every((tag) => ASCII_ONLY_RE.test(tag));
	return isAllEnglish && !tags.includes("No Sexual Content");
}
