import i18next from "i18next";
import { patchManyGameCaches } from "@/hooks/queries/gameCachePatch";
import { gameKeys } from "@/hooks/queries/useGames";
import { queryClient } from "@/providers/queryClient";
import { withBgmAuth } from "@/services/bgmAuthSession";
import { gameService } from "@/services/invoke";
import type { GameMetadataDraft, UpdateGameParams } from "@/types";
import { toError } from "@/utils/errors";
import { fetchBgmByIds } from "../api/bgm";
import { fetchVNDBByIds } from "../api/vndb";
import {
	candidateSourcesToGameSources,
	getCandidateSourceRecord,
} from "../sourceCandidate";

async function batchUpdateCommon(
	type: "vndb" | "bgm",
	fetchFunction: (ids: string[]) => Promise<GameMetadataDraft[]>,
	getAllIdsFunction: () => Promise<Array<[number, string]>>,
	source: "vndb" | "bgm",
): Promise<{
	total: number;
	success: number;
	failed: number;
}> {
	try {
		const idPairs = await getAllIdsFunction();
		console.log(`Found ${type.toUpperCase()} ID pairs:`, idPairs);

		if (idPairs.length === 0) {
			return {
				total: 0,
				success: 0,
				failed: 0,
			};
		}

		const ids = idPairs.map(([_, id]) => id);
		const resultsTemp = await fetchFunction(ids);
		const resultByApiId = new Map<string, (typeof resultsTemp)[number]>();
		for (const result of resultsTemp) {
			const sourceRecord = getCandidateSourceRecord(result, source);
			if (sourceRecord?.external_id) {
				resultByApiId.set(sourceRecord.external_id, result);
			}
		}

		const updates: Array<[number, UpdateGameParams]> = [];

		for (const [gameId, apiId] of idPairs) {
			const data = resultByApiId.get(apiId);
			const sourceRecord = data
				? getCandidateSourceRecord(data, source)
				: undefined;

			if (sourceRecord) {
				updates.push([
					gameId,
					{
						upsert_sources: candidateSourcesToGameSources([sourceRecord]),
					},
				]);
			}
		}

		if (updates.length > 0) {
			const updatedGames = await gameService.updateBatch(updates);
			patchManyGameCaches(queryClient, gameKeys, updatedGames);
			queryClient.invalidateQueries({ queryKey: gameKeys.idLists() });
		}

		return {
			total: idPairs.length,
			success: updates.length,
			failed: idPairs.length - updates.length,
		};
	} catch (error) {
		console.error(`批量更新 ${type.toUpperCase()} 数据失败:`, error);
		throw toError(error, i18next.t("errors.unknownError", "未知错误"));
	}
}

export async function batchUpdateVndbData(): Promise<{
	total: number;
	success: number;
	failed: number;
}> {
	return batchUpdateCommon(
		"vndb",
		fetchVNDBByIds,
		() => gameService.getAllVndbIds(),
		"vndb",
	);
}

export async function batchUpdateBgmData(): Promise<{
	total: number;
	success: number;
	failed: number;
}> {
	return withBgmAuth((token) =>
		batchUpdateCommon(
			"bgm",
			(ids: string[]) => fetchBgmByIds(ids, token),
			() => gameService.getAllBgmIds(),
			"bgm",
		),
	);
}
