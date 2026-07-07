import i18n from "@/providers/i18n";
import {
	type CloudPlayStatusContext,
	resolveCloudPlayStatus,
} from "@/services/cloudPlayStatus";
import type {
	CustomData,
	GameCandidateData,
	GameData,
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
	getSourceRecordMap,
	getSourceRecordsFromLegacyPayload,
	type SourceRecordPayload,
} from "../sourceRecord";
import {
	getRuntimeSourceAdapter,
	MIXED_SOURCE_KEYS,
	REGISTERED_SOURCE_KEYS,
} from "../sourceRegistry";
import { gameMetadataService } from "./gameMetadataService";

export interface GameInfoUpdateDraft {
	newLocalPath: string;
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
	matchedData?: GameCandidateData;
}

interface SourceUpdateParams {
	selectedGame: GameData | null;
	idType: string;
	sourceIds?: SourceIdMap;
	enabledSources?: readonly SourceType[];
	bgmToken?: string;
}

export interface MixedSourceResult {
	bgm_data?: GameCandidateData | null;
	vndb_data?: GameCandidateData | null;
	ymgal_data?: GameCandidateData | null;
	kun_data?: GameCandidateData | null;
}

export interface MixedSourceListResult {
	bgm_data?: GameCandidateData[];
	vndb_data?: GameCandidateData[];
	ymgal_data?: GameCandidateData[];
	kun_data?: GameCandidateData[];
}

interface MixedSourceMergeRule {
	source: SourceType;
	resultKey: keyof MixedSourceResult;
}

export type MixedSourceCandidates = Record<SourceType, GameCandidateData[]>;
export type MixedSourceSelection = Partial<
	Record<SourceType, GameCandidateData | null>
>;
export type MixedSourceEnabled = Partial<Record<SourceType, boolean>>;

const mixedSourceMergeRules: readonly MixedSourceMergeRule[] =
	MIXED_SOURCE_KEYS.map((source) => ({
		source,
		resultKey: getRuntimeSourceAdapter(source)
			.dataKey as keyof MixedSourceResult,
	}));

function assignGameField<Key extends keyof GameCandidateData>(
	target: GameCandidateData,
	source: GameCandidateData,
	key: Key,
): void {
	target[key] = source[key];
}

function mergeSourceIntoGame(
	target: GameCandidateData,
	source: GameCandidateData,
	sourceType: SourceType,
): void {
	const { idKey, dataKey } = getRuntimeSourceAdapter(sourceType);
	assignGameField(target, source, idKey);
	assignGameField(target, source, dataKey);
}

export function mergeMixedResult(
	result: MixedSourceResult,
): GameCandidateData | null {
	const mergedGame: GameCandidateData = {
		id_type: "mixed",
	};
	let hasMergedSource = false;

	for (const rule of mixedSourceMergeRules) {
		const sourceGame = result[rule.resultKey];
		if (!sourceGame) {
			continue;
		}
		hasMergedSource = true;
		mergeSourceIntoGame(mergedGame, sourceGame, rule.source);
	}

	if (!hasMergedSource) {
		return null;
	}

	return mergedGame;
}

export function pickFirstMixedResult(
	result: MixedSourceListResult,
): MixedSourceResult {
	return Object.fromEntries(
		mixedSourceMergeRules.map((rule) => [
			rule.resultKey,
			result[rule.resultKey]?.[0] ?? null,
		]),
	) as MixedSourceResult;
}

export function buildGameFromMixedSelection(params: {
	selection: MixedSourceSelection;
	enabled: MixedSourceEnabled;
	defaults?: Partial<GameCandidateData>;
}): GameCandidateData {
	const { selection, enabled, defaults } = params;
	const selectedEntries = mixedSourceMergeRules
		.map(({ source }) => ({
			source,
			game: enabled[source] ? selection[source] : null,
		}))
		.filter((entry): entry is { source: SourceType; game: GameCandidateData } =>
			Boolean(entry.game),
		);

	if (selectedEntries.length === 0) {
		throw new Error("At least one mixed source must be selected");
	}

	if (selectedEntries.length === 1) {
		const [{ source, game }] = selectedEntries;
		const result: GameCandidateData = {
			...defaults,
			id_type: source,
		};
		mergeSourceIntoGame(result, game, source);

		return result;
	}

	const mixedResult = mergeMixedResult(
		Object.fromEntries(
			mixedSourceMergeRules.map((rule) => [
				rule.resultKey,
				enabled[rule.source] ? selection[rule.source] : null,
			]),
		) as MixedSourceResult,
	);

	if (!mixedResult) {
		throw new Error("At least one mixed source must be selected");
	}

	return defaults ? { ...defaults, ...mixedResult } : mixedResult;
}

// ---------------------- 核心业务逻辑区 ----------------------

export async function fetchMetadataForUpdate({
	selectedGame,
	idType,
	sourceIds,
	enabledSources,
	bgmToken,
}: SourceUpdateParams): Promise<GameCandidateData> {
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

	let apiData: GameCandidateData;

	if (idType === "mixed") {
		const enabled = new Set(enabledSources ?? MIXED_SOURCE_KEYS);
		apiData = await gameMetadataService.getGameByIds({
			sourceIds,
			bgmToken: enabled.has("bgm") ? bgmToken : undefined,
			enabledSources,
		});
	} else if (isSourceType(idType)) {
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

	return apiData;
}

function getGameCandidateDate(gameData: GameCandidateData): string | undefined {
	const dateSources =
		gameData.id_type && isSourceType(gameData.id_type)
			? [gameData.id_type]
			: REGISTERED_SOURCE_KEYS;
	return dateSources
		.map((source) => {
			const adapter = getRuntimeSourceAdapter(source);
			const data = gameData[adapter.dataKey];
			return data ? adapter.toDisplayFields(data).date?.trim() : undefined;
		})
		.find(Boolean);
}

export async function buildInsertGameData(
	gameData: GameCandidateData,
	cloudStatusContext?: CloudPlayStatusContext,
): Promise<InsertGameParams> {
	const insertData: InsertGameParams = {
		id_type: gameData.id_type || "mixed",
		sources: getSourceRecordsFromLegacyPayload(gameData),
		date: getGameCandidateDate(gameData),
		localpath: gameData.localpath ?? undefined,
		custom_data: gameData.custom_data ?? undefined,
	};
	const cloudStatus = await resolveCloudPlayStatus(
		insertData,
		cloudStatusContext,
	);

	if (cloudStatus === undefined) {
		return insertData;
	}

	return {
		...insertData,
		clear: cloudStatus,
	};
}

function getBatchImportLocalPath(item: BatchImportGameCandidate): string {
	return item.selectedExe ? `${item.path}\\${item.selectedExe}` : item.path;
}

export function buildMetadataUpdatePayload(
	gameData: GameCandidateData,
): UpdateGameParams {
	const records = getSourceRecordsFromLegacyPayload(gameData);
	const presentSources = new Set(records.map((record) => record.source));
	const updateData: UpdateGameParams = {
		id_type: gameData.id_type,
		date: getGameCandidateDate(gameData) ?? null,
	};

	if (gameData.id_type && isSourceType(gameData.id_type)) {
		updateData.upsert_sources = records.filter(
			(record) => record.source === gameData.id_type,
		);
		updateData.remove_sources = REGISTERED_SOURCE_KEYS.filter(
			(source) => source !== gameData.id_type,
		);
	} else {
		updateData.upsert_sources = records;
		updateData.remove_sources = REGISTERED_SOURCE_KEYS.filter(
			(source) => !presentSources.has(source),
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
		const insertData = await buildInsertGameData(
			item.matchedData,
			cloudStatusContext,
		);
		return {
			...insertData,
			localpath: getBatchImportLocalPath(item),
		};
	}

	return {
		id_type: "custom",
		sources: [],
		custom_data: {
			name: item.name,
		},
		localpath: getBatchImportLocalPath(item),
	};
}

export function getGameIdentityKeys(payload: SourceRecordPayload): string[] {
	const sourceMap = getSourceRecordMap(payload);

	return REGISTERED_SOURCE_KEYS.map((source) => {
		const sourceId = sourceMap.get(source)?.external_id;
		return sourceId ? `${source}:${sourceId}` : null;
	}).filter((value): value is string => Boolean(value));
}
