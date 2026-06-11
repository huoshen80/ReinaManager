import i18next from "i18next";
import { fetchBgmByIds } from "@/api/bgm";
import { fetchVNDBByIds } from "@/api/vndb";
import { patchManyGameCaches } from "@/hooks/queries/gameCachePatch";
import { gameKeys } from "@/hooks/queries/useGames";
import { queryClient } from "@/providers/queryClient";
import { gameService } from "@/services/invoke";
import type { BgmData, VndbData } from "@/types";
import { withBgmAuth } from "@/utils/bgmAuthSession";
import { toError } from "@/utils/errors";

async function batchUpdateCommon(
	type: "vndb" | "bgm",
	fetchFunction: (ids: string[]) => Promise<
		Array<{
			bgm_id?: string | null;
			vndb_id?: string | null;
			bgm_data?: BgmData | null;
			vndb_data?: VndbData | null;
		}>
	>,
	getAllIdsFunction: () => Promise<Array<[number, string]>>,
	updateKeyName: "vndb_data" | "bgm_data",
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
			const apiId = type === "bgm" ? result.bgm_id : result.vndb_id;
			if (apiId) {
				resultByApiId.set(apiId, result);
			}
		}

		const updates: Array<
			[number, Partial<{ bgm_data: BgmData; vndb_data: VndbData }>]
		> = [];

		for (const [gameId, apiId] of idPairs) {
			const data = resultByApiId.get(apiId);

			if (data?.[updateKeyName]) {
				updates.push([gameId, { [updateKeyName]: data[updateKeyName] }]);
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
		"vndb_data",
	);
}

export async function batchUpdateBgmData(): Promise<{
	total: number;
	success: number;
	failed: number;
}> {
	return withBgmAuth(
		(token) =>
			batchUpdateCommon(
				"bgm",
				(ids: string[]) => fetchBgmByIds(ids, token ?? undefined),
				() => gameService.getAllBgmIds(),
				"bgm_data",
			),
		{ required: false },
	);
}
