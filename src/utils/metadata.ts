import { gameMetadataService } from "@/api";
import { isYmgalDataComplete } from "@/api/gameMetadataService";
import type {
	CustomData,
	FullGameData,
	GameData,
	InsertGameParams,
	UpdateGameParams,
} from "@/types";
import {
	getArrayDiff,
	getBoolDiff,
	getDiff,
	getGameDisplayName,
	getGameNsfwStatus,
} from "@/utils";
import i18n from "@/utils/i18n";

export interface GameInfoUpdateDraft {
	newLocalPath: string;
	newName: string;
	language: string;
	newImageExt?: string | null;
	newAliases?: string[];
	newSummary?: string;
	newTags?: string[];
	newDeveloper?: string;
	newNsfw?: boolean;
	newDate?: string;
}

export interface BatchImportGameCandidate {
	name: string;
	path: string;
	selectedExe?: string;
	matchedData?: FullGameData;
}

interface SourceUpdateParams {
	selectedGame: GameData | null;
	idType: string;
	bgmId?: string;
	vndbId?: string;
	ymgalId?: string;
	bgmToken?: string;
}

async function fetchYmgalAndMerge(
	ymgalId: string | number,
	existingData: FullGameData,
	bgmToken?: string,
): Promise<FullGameData | null> {
	const results = await gameMetadataService.searchGames({
		query: ymgalId.toString(),
		source: "ymgal",
		bgmToken,
		isIdSearch: true,
	});

	if (results.length === 0) {
		return null;
	}

	const ymgalData = results[0];
	return {
		id_type: "mixed",
		bgm_id: existingData.bgm_id,
		bgm_data: existingData.bgm_data ?? undefined,
		vndb_id: existingData.vndb_id,
		vndb_data: existingData.vndb_data ?? undefined,
		ymgal_id: ymgalData.ymgal_id,
		ymgal_data: ymgalData.ymgal_data,
		date: existingData.date,
		localpath: existingData.localpath,
		custom_data: existingData.custom_data ?? undefined,
	};
}

export async function ensureCompleteMetadata(
	gameData: FullGameData,
	bgmToken?: string,
): Promise<FullGameData> {
	const needsCompleteData =
		gameData.id_type === "ymgal" ||
		(gameData.id_type === "mixed" &&
			gameData.ymgal_id &&
			!isYmgalDataComplete(gameData.ymgal_data));

	if (!needsCompleteData) {
		return gameData;
	}

	if (gameData.id_type === "ymgal") {
		const results = await gameMetadataService.searchGames({
			query: gameData.ymgal_id?.toString() || "",
			source: "ymgal",
			bgmToken,
			isIdSearch: true,
			defaults: {
				localpath: gameData.localpath ?? undefined,
			},
		});

		if (results.length === 0) {
			throw new Error(
				i18n.t(
					"pages.Detail.DataSourceUpdate.incompleteYmgalData",
					"未找到完整的 YMGal 数据。",
				),
			);
		}

		return results[0];
	}

	if (gameData.ymgal_id) {
		const merged = await fetchYmgalAndMerge(
			gameData.ymgal_id,
			gameData,
			bgmToken,
		);
		if (merged) {
			return merged;
		}
	}

	throw new Error(
		i18n.t(
			"pages.Detail.DataSourceUpdate.incompleteYmgalData",
			"未找到完整的 YMGal 数据。",
		),
	);
}

export async function fetchMetadataForUpdate({
	selectedGame,
	idType,
	bgmId,
	vndbId,
	ymgalId,
	bgmToken,
}: SourceUpdateParams): Promise<FullGameData> {
	if (!selectedGame) {
		throw new Error(
			i18n.t("pages.Detail.DataSourceUpdate.noGameSelected", "未选择游戏"),
		);
	}

	if (idType === "custom") {
		throw new Error(
			i18n.t(
				"pages.Detail.DataSourceUpdate.customModeWarning",
				"自定义模式无法从数据源更新。",
			),
		);
	}

	let apiData: FullGameData;

	if (idType === "bgm" && bgmId) {
		apiData = await gameMetadataService.getGameById(bgmId, "bgm", bgmToken);
	} else if (idType === "vndb" && vndbId) {
		apiData = await gameMetadataService.getGameById(vndbId, "vndb");
	} else if (idType === "ymgal" && ymgalId) {
		apiData = await gameMetadataService.getGameById(ymgalId, "ymgal");
	} else if (idType === "mixed") {
		apiData = await gameMetadataService.getGameByIds({
			bgmId,
			vndbId,
			ymgalId,
			bgmToken,
		});
	} else {
		throw new Error(
			i18n.t("pages.Detail.DataSourceUpdate.invalidIdType", "无效的ID类型"),
		);
	}

	if (!apiData) {
		throw new Error(
			i18n.t(
				"pages.Detail.DataSourceUpdate.noDataFetched",
				"未获取到数据或数据源无效。",
			),
		);
	}

	return ensureCompleteMetadata(apiData, bgmToken);
}

export function buildInsertGameData(
	gameData: FullGameData,
	fallbackIdType?: string,
	fallbackDate?: string,
): InsertGameParams {
	return {
		bgm_id: gameData.bgm_id,
		vndb_id: gameData.vndb_id,
		ymgal_id: gameData.ymgal_id,
		id_type: gameData.id_type || fallbackIdType || "mixed",
		date: fallbackDate,
		localpath: gameData.localpath ?? undefined,
		bgm_data: gameData.bgm_data ?? undefined,
		vndb_data: gameData.vndb_data ?? undefined,
		ymgal_data: gameData.ymgal_data ?? undefined,
		custom_data: gameData.custom_data ?? undefined,
	};
}

export function buildMetadataUpdatePayload(
	gameData: FullGameData,
): UpdateGameParams {
	const updateData: UpdateGameParams = { ...gameData };

	switch (gameData.id_type) {
		case "bgm":
			updateData.vndb_data = null;
			updateData.ymgal_data = null;
			break;
		case "vndb":
			updateData.bgm_data = null;
			updateData.ymgal_data = null;
			break;
		case "ymgal":
			updateData.bgm_data = null;
			updateData.vndb_data = null;
			break;
		case "mixed":
			if (!gameData.bgm_id) {
				updateData.bgm_data = null;
				updateData.bgm_id = null;
			}
			if (!gameData.vndb_id) {
				updateData.vndb_data = null;
				updateData.vndb_id = null;
			}
			if (!gameData.ymgal_id) {
				updateData.ymgal_data = null;
				updateData.ymgal_id = null;
			}
			break;
	}

	return updateData;
}

export function buildGameInfoUpdatePayload(
	originalGame: GameData,
	draft: GameInfoUpdateDraft,
): UpdateGameParams {
	const payload: UpdateGameParams = {};
	const localPathDiff = getDiff(draft.newLocalPath, originalGame.localpath);
	if (localPathDiff !== undefined) {
		payload.localpath = localPathDiff;
	}

	const currentCustomData = originalGame.custom_data || {};
	const displayName = getGameDisplayName(originalGame, draft.language);
	const currentCustomName = currentCustomData.name || displayName;
	const originalSummary = originalGame.summary ?? "";
	const originalDeveloper = originalGame.developer ?? "";
	const originalNsfw = getGameNsfwStatus(originalGame) ?? false;
	const originalDate = originalGame.date ?? "";
	const nextCustomData: CustomData = { ...currentCustomData };
	let customDataChanged = false;

	const nameDiff = getDiff(draft.newName, currentCustomName);
	if (nameDiff !== undefined) {
		nextCustomData.name = nameDiff;
		customDataChanged = true;
	}

	if (draft.newImageExt !== undefined) {
		nextCustomData.image = draft.newImageExt;
		customDataChanged = true;
	}

	if (draft.newAliases !== undefined) {
		const aliasesDiff = getArrayDiff(
			draft.newAliases,
			currentCustomData.aliases,
		);
		if (aliasesDiff !== undefined) {
			nextCustomData.aliases = aliasesDiff;
			customDataChanged = true;
		}
	}

	if (draft.newSummary !== undefined) {
		const summaryDiff = getDiff(draft.newSummary, originalSummary);
		if (summaryDiff !== undefined) {
			nextCustomData.summary = summaryDiff;
			customDataChanged = true;
		}
	}

	if (draft.newTags !== undefined) {
		const tagsDiff = getArrayDiff(draft.newTags, currentCustomData.tags);
		if (tagsDiff !== undefined) {
			nextCustomData.tags = tagsDiff;
			customDataChanged = true;
		}
	}

	if (draft.newDeveloper !== undefined) {
		const developerDiff = getDiff(draft.newDeveloper, originalDeveloper);
		if (developerDiff !== undefined) {
			nextCustomData.developer = developerDiff;
			customDataChanged = true;
		}
	}

	if (draft.newNsfw !== undefined) {
		const nsfwDiff = getBoolDiff(draft.newNsfw, originalNsfw);
		if (nsfwDiff !== undefined) {
			nextCustomData.nsfw = nsfwDiff;
			customDataChanged = true;
		}
	}

	if (draft.newDate !== undefined) {
		const dateDiff = getDiff(draft.newDate, originalDate);
		if (dateDiff !== undefined) {
			nextCustomData.date = dateDiff;
			customDataChanged = true;
		}
	}

	if (customDataChanged) {
		payload.custom_data = nextCustomData;
	}

	return payload;
}

export function buildBulkImportGameData(
	item: BatchImportGameCandidate,
): InsertGameParams {
	if (item.matchedData) {
		return {
			...buildInsertGameData(
				item.matchedData,
				item.matchedData.id_type,
				item.matchedData.date,
			),
			localpath: item.selectedExe
				? `${item.path}\\${item.selectedExe}`
				: item.path,
		};
	}

	return {
		id_type: "custom",
		custom_data: {
			name: item.name,
		},
		localpath: item.selectedExe
			? `${item.path}\\${item.selectedExe}`
			: item.path,
	};
}

export function getGameIdentityKeys(
	payload: Pick<InsertGameParams, "bgm_id" | "vndb_id" | "ymgal_id">,
): string[] {
	return [
		payload.bgm_id ? `bgm:${payload.bgm_id}` : null,
		payload.vndb_id ? `vndb:${payload.vndb_id}` : null,
		payload.ymgal_id ? `ymgal:${payload.ymgal_id}` : null,
	].filter((value): value is string => Boolean(value));
}
