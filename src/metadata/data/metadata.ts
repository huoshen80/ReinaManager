import i18n from "@/providers/i18n";
import {
	type CloudPlayStatusContext,
	resolveCloudPlayStatus,
} from "@/services/cloudPlayStatus";
import type {
	CustomData,
	GameData,
	GameMetadataDraft,
	InsertGameParams,
	SourceType,
	UpdateGameParams,
} from "@/types";
import { isSourceType } from "@/types";
import {
	getArrayDiff,
	getBoolDiff,
	getDiff,
	getNumberDiff,
} from "@/utils/diff";
import { getGameDisplayName, getGameNsfwStatus } from "@/utils/game";
import type { SourceIdMap } from "../sourceAdapter";
import {
	buildGameCandidateFromSourceSelection,
	candidateSourcesToGameSources,
	type SourceCandidate,
} from "../sourceCandidate";
import {
	getAnySourceIdMap,
	getSourceData,
	type SourceIdentityPayload,
} from "../sourceRecord";
import {
	getSourceAdapter,
	MIXED_SOURCE_KEYS,
	REGISTERED_SOURCE_KEYS,
} from "../sourceRegistry";
import { gameMetadataService } from "./gameMetadataService";

export interface GameInfoUpdateDraft {
	newLocalPath: string;
	newExecutable?: string;
	newName: string;
	newImageExt?: string | null;
	newCoverSource?: SourceType | null;
	newAliases?: string[];
	newSummary?: string;
	newTags?: string[];
	newDeveloper?: string;
	newNsfw?: boolean;
	newDate?: string;
	newUserRating?: number | null;
	newUserReview?: string;
}

export interface BatchImportGameCandidate {
	name: string;
	path: string;
	selectedExe?: string;
	matchedData?: GameMetadataDraft;
}

interface SourceUpdateParams {
	selectedGame: GameData | null;
	idType: string;
	sourceIds?: SourceIdMap;
	enabledSources?: readonly SourceType[];
	bgmToken?: string;
}

export type MixedSourceResult = Partial<
	Record<SourceType, SourceCandidate | null>
>;
export type MixedSourceListResult = Partial<
	Record<SourceType, SourceCandidate[]>
>;
export type MixedSourceCandidates = Record<SourceType, SourceCandidate[]>;
export type MixedSourceSelection = Partial<
	Record<SourceType, SourceCandidate | null>
>;
export type MixedSourceEnabled = Partial<Record<SourceType, boolean>>;

export interface MetadataFetchResult {
	data: GameMetadataDraft;
	failedSources: SourceType[];
}

export function mergeMixedResult(
	result: MixedSourceResult,
): GameMetadataDraft | null {
	const selection = Object.fromEntries(
		MIXED_SOURCE_KEYS.map((source) => [source, result[source] ?? null]),
	) as MixedSourceSelection;
	if (!MIXED_SOURCE_KEYS.some((source) => selection[source])) {
		return null;
	}

	return buildGameCandidateFromSourceSelection({ selection });
}

export function pickFirstMixedResult(
	result: MixedSourceListResult,
): MixedSourceResult {
	return Object.fromEntries(
		MIXED_SOURCE_KEYS.map((source) => [source, result[source]?.[0] ?? null]),
	) as MixedSourceResult;
}

export function buildGameFromMixedSelection(params: {
	selection: MixedSourceSelection;
	enabled: MixedSourceEnabled;
}): GameMetadataDraft {
	const { selection, enabled } = params;
	const selectedEntries = MIXED_SOURCE_KEYS.map((source) => ({
		source,
		candidate: enabled[source] ? selection[source] : null,
	})).filter(
		(entry): entry is { source: SourceType; candidate: SourceCandidate } =>
			Boolean(entry.candidate),
	);

	if (selectedEntries.length === 0) {
		throw new Error("At least one mixed source must be selected");
	}

	return buildGameCandidateFromSourceSelection({
		selection: Object.fromEntries(
			MIXED_SOURCE_KEYS.map((source) => [
				source,
				enabled[source] ? selection[source] : null,
			]),
		) as MixedSourceSelection,
	});
}

// ---------------------- 核心业务逻辑区 ----------------------

export async function fetchMetadataForUpdate({
	selectedGame,
	idType,
	sourceIds,
	enabledSources,
	bgmToken,
}: SourceUpdateParams): Promise<MetadataFetchResult> {
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

	if (idType === "mixed") {
		const enabled = new Set(enabledSources ?? MIXED_SOURCE_KEYS);
		return gameMetadataService.getGameByIds({
			sourceIds,
			bgmToken: enabled.has("bgm") ? bgmToken : undefined,
			enabledSources,
		});
	}

	let apiData: GameMetadataDraft;
	if (isSourceType(idType)) {
		const sourceId = sourceIds?.[idType];
		if (!sourceId) {
			throw new Error(
				i18n.t("pages.Detail.DataSourceUpdate.invalidIdType", "无效的ID类型"),
			);
		}

		apiData = await gameMetadataService.getGameById(sourceId, idType, bgmToken);
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

	return {
		data: apiData,
		failedSources: [],
	};
}

function getGameCandidateDate(gameData: GameMetadataDraft): string | undefined {
	const dateSources =
		gameData.id_type && isSourceType(gameData.id_type)
			? [gameData.id_type]
			: REGISTERED_SOURCE_KEYS;
	return dateSources
		.map((source) => {
			const adapter = getSourceAdapter(source);
			const data = getSourceData(gameData, source);
			return data ? adapter.toDisplayFields(data).date?.trim() : undefined;
		})
		.find(Boolean);
}

export async function buildInsertGameData(
	gameData: GameMetadataDraft,
	options: {
		localpath?: string;
		executable?: string;
		cloudStatusContext?: CloudPlayStatusContext;
	} = {},
): Promise<InsertGameParams> {
	const insertData: InsertGameParams = {
		id_type: gameData.id_type || "mixed",
		sources: candidateSourcesToGameSources(gameData.sources),
		date: getGameCandidateDate(gameData),
		localpath: options.localpath,
		executable: options.executable,
		custom_data: gameData.custom_data ?? undefined,
	};
	const cloudStatus = await resolveCloudPlayStatus(
		insertData,
		options.cloudStatusContext,
	);

	if (cloudStatus === undefined) {
		return insertData;
	}

	return {
		...insertData,
		clear: cloudStatus,
	};
}

export function buildMetadataUpdatePayload(
	gameData: GameMetadataDraft,
	failedSources: readonly SourceType[] = [],
): UpdateGameParams {
	const records = candidateSourcesToGameSources(gameData.sources);
	const presentSources = new Set(records.map((record) => record.source));
	const failedSourceSet = new Set(failedSources);
	const sourceDate = getGameCandidateDate(gameData);
	const updateData: UpdateGameParams = {
		id_type: gameData.id_type,
	};
	if (sourceDate) {
		updateData.date = sourceDate;
	}

	if (gameData.id_type && isSourceType(gameData.id_type)) {
		updateData.upsert_sources = records.filter(
			(record) => record.source === gameData.id_type,
		);
		updateData.remove_sources = REGISTERED_SOURCE_KEYS.filter(
			(source) => source !== gameData.id_type && !failedSourceSet.has(source),
		);
	} else {
		updateData.upsert_sources = records;
		updateData.remove_sources = REGISTERED_SOURCE_KEYS.filter(
			(source) => !presentSources.has(source) && !failedSourceSet.has(source),
		);
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
	if (draft.newExecutable !== undefined) {
		const executableDiff = getDiff(
			draft.newExecutable,
			originalGame.executable,
		);
		if (executableDiff !== undefined) {
			payload.executable = executableDiff;
		}
	}

	const currentCustomData = originalGame.custom_data || {};
	const displayName = getGameDisplayName(originalGame);
	const currentCustomName = currentCustomData.name || displayName;
	const originalSummary = originalGame.summary ?? "";
	const originalDeveloper = originalGame.developer ?? "";
	const originalNsfw = getGameNsfwStatus(originalGame) ?? false;
	const originalDate = originalGame.date ?? "";
	let nextCustomData: CustomData | undefined;
	const customData = () => (nextCustomData ??= { ...currentCustomData });

	const nameDiff = getDiff(draft.newName, currentCustomName);
	if (nameDiff !== undefined) {
		customData().name = nameDiff;
	}

	if (draft.newImageExt !== undefined) {
		customData().image = draft.newImageExt;
	}

	if (draft.newCoverSource !== undefined) {
		if (draft.newCoverSource !== (currentCustomData.cover_source ?? null)) {
			customData().cover_source = draft.newCoverSource;
		}
	}

	if (draft.newAliases !== undefined) {
		const aliasesDiff = getArrayDiff(
			draft.newAliases,
			currentCustomData.aliases,
		);
		if (aliasesDiff !== undefined) {
			customData().aliases = aliasesDiff;
		}
	}

	if (draft.newSummary !== undefined) {
		const summaryDiff = getDiff(draft.newSummary, originalSummary);
		if (summaryDiff !== undefined) {
			customData().summary = summaryDiff;
		}
	}

	if (draft.newTags !== undefined) {
		const tagsDiff = getArrayDiff(draft.newTags, currentCustomData.tags);
		if (tagsDiff !== undefined) {
			customData().tags = tagsDiff;
		}
	}

	if (draft.newDeveloper !== undefined) {
		const developerDiff = getDiff(draft.newDeveloper, originalDeveloper);
		if (developerDiff !== undefined) {
			customData().developer = developerDiff;
		}
	}

	if (draft.newNsfw !== undefined) {
		const nsfwDiff = getBoolDiff(draft.newNsfw, originalNsfw);
		if (nsfwDiff !== undefined) {
			customData().nsfw = nsfwDiff;
		}
	}

	if (draft.newDate !== undefined) {
		const dateDiff = getDiff(draft.newDate, originalDate);
		if (dateDiff !== undefined) {
			payload.date = dateDiff;
		}
	}

	if (draft.newUserRating !== undefined) {
		const userRatingDiff = getNumberDiff(
			draft.newUserRating,
			currentCustomData.user_rating,
			{ clearValue: 0, precision: 1 },
		);
		if (userRatingDiff !== undefined) {
			customData().user_rating = userRatingDiff;
		}
	}

	if (draft.newUserReview !== undefined) {
		const userReviewDiff = getDiff(
			draft.newUserReview,
			currentCustomData.user_review ?? undefined,
		);
		if (userReviewDiff !== undefined) {
			customData().user_review = userReviewDiff;
		}
	}

	if (nextCustomData) {
		payload.custom_data = nextCustomData;
	}

	return payload;
}

export async function buildBulkImportGameData(
	item: BatchImportGameCandidate,
	cloudStatusContext?: CloudPlayStatusContext,
): Promise<InsertGameParams> {
	if (item.matchedData) {
		return buildInsertGameData(item.matchedData, {
			localpath: item.path,
			executable: item.selectedExe,
			cloudStatusContext,
		});
	}

	return {
		id_type: "custom",
		sources: [],
		custom_data: {
			name: item.name,
		},
		localpath: item.path,
		executable: item.selectedExe,
	};
}

export function getGameIdentityKeys(payload: SourceIdentityPayload): string[] {
	const sourceIds = getAnySourceIdMap(payload);
	return REGISTERED_SOURCE_KEYS.map((source) => {
		const sourceId = sourceIds[source];
		return sourceId ? `${source}:${sourceId}` : null;
	}).filter((value): value is string => Boolean(value));
}
