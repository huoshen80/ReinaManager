import { gameMetadataService } from "@/api";
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
} from "@/utils/appUtils";
import { resolveCloudPlayStatus } from "@/utils/cloudCollectionSync";
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
	kunId?: string;
	bgmToken?: string;
}

// ---------------------- 策略配置区 ----------------------

type SecondarySource = "ymgal" | "kun";

interface isCompleteData {
	summary?: string;
	aliases?: string[];
}

interface FetchStrategy {
	source: SecondarySource;
	idKey: keyof FullGameData;
	dataKey: keyof FullGameData;
	isComplete: (data: isCompleteData) => boolean;
	errorKey: string;
	defaultErrorMsg: string;
}

function isDataComplete(galData?: isCompleteData): boolean {
	return !!(galData?.summary && galData?.aliases);
}

// 定义二次获取数据的策略
const SECONDARY_FETCH_STRATEGIES: FetchStrategy[] = [
	{
		source: "ymgal",
		idKey: "ymgal_id",
		dataKey: "ymgal_data",
		isComplete: isDataComplete,
		errorKey: "pages.Detail.DataSourceUpdate.incompleteYmgalData",
		defaultErrorMsg: "未找到完整的 YMGal 数据。",
	},
	{
		source: "kun",
		idKey: "kun_id",
		dataKey: "kun_data",
		isComplete: isDataComplete,
		errorKey: "pages.Detail.DataSourceUpdate.incompleteKungalData",
		defaultErrorMsg: "未找到完整的 Kungal 数据。",
	},
];

// 所有可能包含源数据的字段
const ALL_DATA_SOURCES = [
	"bgm_data",
	"vndb_data",
	"ymgal_data",
	"kun_data",
] as const;

// ---------------------- 核心业务逻辑区 ----------------------

export async function ensureCompleteMetadata(
	gameData: FullGameData,
): Promise<FullGameData> {
	// 1. 过滤出当前上下文中需要执行的二次拉取任务
	const tasks = SECONDARY_FETCH_STRATEGIES.filter((strategy) => {
		const isTargetIdType =
			strategy.source === "kun"
				? gameData.id_type === "kun"
				: gameData.id_type === strategy.source || gameData.id_type === "mixed";
		const hasId = !!gameData[strategy.idKey];
		const isDataIncomplete = !strategy.isComplete(
			gameData[strategy.dataKey] as isCompleteData,
		);

		return isTargetIdType && hasId && isDataIncomplete;
	});

	if (tasks.length === 0) {
		return gameData;
	}

	// 2. 并行执行所有缺失数据的拉取请求
	const fetchPromises = tasks.map(async (strategy) => {
		const sourceId = gameData[strategy.idKey] as string;

		const results = await gameMetadataService.searchGames({
			query: sourceId.toString(),
			source: strategy.source,
			isIdSearch: true,
			defaults: {
				localpath: gameData.localpath ?? undefined,
			},
		});

		if (results.length === 0) {
			throw new Error(i18n.t(strategy.errorKey, strategy.defaultErrorMsg));
		}

		// 返回需要合并的增量对象
		return {
			[strategy.idKey]: results[0][strategy.idKey],
			[strategy.dataKey]: results[0][strategy.dataKey],
		};
	});

	const partialUpdates = await Promise.all(fetchPromises);

	return partialUpdates.reduce(
		(mergedObj, currentUpdate) => {
			return Object.assign(mergedObj, currentUpdate, {
				id_type: gameData.id_type === "mixed" ? "mixed" : gameData.id_type,
			});
		},
		{ ...gameData },
	) as FullGameData;
}

export async function fetchMetadataForUpdate({
	selectedGame,
	idType,
	bgmId,
	vndbId,
	ymgalId,
	kunId,
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
	} else if (idType === "kun" && kunId) {
		apiData = await gameMetadataService.getGameById(kunId, "kun");
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

	return ensureCompleteMetadata(apiData);
}

export async function buildInsertGameData(
	gameData: FullGameData,
	fallbackIdType?: string,
	fallbackDate?: string,
): Promise<InsertGameParams> {
	const insertData: InsertGameParams = {
		bgm_id: gameData.bgm_id,
		vndb_id: gameData.vndb_id,
		ymgal_id: gameData.ymgal_id,
		kun_id: gameData.kun_id,
		id_type: gameData.id_type || fallbackIdType || "mixed",
		date: fallbackDate,
		localpath: gameData.localpath ?? undefined,
		bgm_data: gameData.bgm_data ?? undefined,
		vndb_data: gameData.vndb_data ?? undefined,
		ymgal_data: gameData.ymgal_data ?? undefined,
		kun_data: gameData.kun_data ?? undefined,
		custom_data: gameData.custom_data ?? undefined,
	};
	const cloudStatus = await resolveCloudPlayStatus(insertData);

	if (cloudStatus === undefined) {
		return insertData;
	}

	return {
		...insertData,
		clear: cloudStatus,
	};
}

export interface PrepareInsertGameDataOptions {
	localpath?: string;
	fallbackIdType?: string;
	fallbackDate?: string;
}

function getBatchImportLocalPath(item: BatchImportGameCandidate): string {
	return item.selectedExe ? `${item.path}\\${item.selectedExe}` : item.path;
}

export async function prepareInsertGameDataFromMetadata(
	gameData: FullGameData,
	options?: PrepareInsertGameDataOptions,
): Promise<InsertGameParams> {
	const completeData = await ensureCompleteMetadata(gameData);
	const insertData = await buildInsertGameData(
		completeData,
		options?.fallbackIdType,
		options?.fallbackDate,
	);

	if (options?.localpath !== undefined) {
		insertData.localpath = options.localpath;
	}

	return insertData;
}

export function buildMetadataUpdatePayload(
	gameData: FullGameData,
): UpdateGameParams {
	const updateData: UpdateGameParams = { ...gameData };

	if (gameData.id_type !== "mixed") {
		// 单一数据源模式：保留对应的 _data，将其余源的数据清空
		const activeSource = `${gameData.id_type}_data`;
		for (const source of ALL_DATA_SOURCES) {
			if (source !== activeSource) {
				updateData[source] = null;
			}
		}
	} else {
		// 混合模式：根据对应的 ID 决定是否清空该数据源
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
		// Kungal 已从 mixed 逻辑剔除
		updateData.kun_data = null;
		updateData.kun_id = null;
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

export async function buildBulkImportGameData(
	item: BatchImportGameCandidate,
): Promise<InsertGameParams> {
	if (item.matchedData) {
		return {
			...(await buildInsertGameData(
				item.matchedData,
				item.matchedData.id_type,
				item.matchedData.date,
			)),
			localpath: getBatchImportLocalPath(item),
		};
	}

	return {
		id_type: "custom",
		custom_data: {
			name: item.name,
		},
		localpath: getBatchImportLocalPath(item),
	};
}

export function getGameIdentityKeys(
	payload: Pick<InsertGameParams, "bgm_id" | "vndb_id" | "ymgal_id" | "kun_id">,
): string[] {
	return [
		payload.bgm_id ? `bgm:${payload.bgm_id}` : null,
		payload.vndb_id ? `vndb:${payload.vndb_id}` : null,
		payload.ymgal_id ? `ymgal:${payload.ymgal_id}` : null,
		payload.kun_id ? `kun:${payload.kun_id}` : null,
	].filter((value): value is string => Boolean(value));
}
