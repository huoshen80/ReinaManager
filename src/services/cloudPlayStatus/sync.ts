import { fetchVndbCurrentUserProfileCached } from "@/hooks/queries/useSettings";
import { fetchUserCollection, updateUserCollection } from "@/metadata/api/bgm";
import {
	fetchHikarinagiGameRate,
	updateHikarinagiGameRate,
} from "@/metadata/api/hikarinagi";
import {
	fetchNextmoeWorkState,
	updateNextmoeWorkState,
} from "@/metadata/api/nextmoe";
import {
	fetchVndbUserCollection,
	updateVndbUserCollection,
} from "@/metadata/api/vndb";
import {
	getAnySourceId,
	type SourceIdentityPayload,
} from "@/metadata/sourceRecord";
import { queryClient } from "@/providers/queryClient";
import { withBgmAuth } from "@/services/oauth/bgmAuthSession";
import { withHikarinagiAuth } from "@/services/oauth/hikarinagiAuthSession";
import { withNextmoeUserAuth } from "@/services/oauth/nextmoeAuthSession";
import { getNetworkRequestContext } from "@/services/requestContext";
import { useStore } from "@/store/appStore";
import type { PlayStatus } from "@/types/collection";
import {
	type CloudPlayStatusContext,
	getBgmUsername,
	getVndbToken,
	mapBgmTypeToPlayStatus,
	mapHikarinagiStatusToPlayStatus,
	mapNextmoeStateToPlayStatus,
	mapPlayStatusToHikarinagiStatus,
	mapPlayStatusToNextmoeState,
	mapPlayStatusToVndbLabelId,
	mapVndbCollectionToPlayStatus,
	resolveCloudPlayStatusFromContext,
	VNDB_NORMAL_STATUS_LABEL_IDS,
} from "./shared";

type CollectionSyncSource = "bgm" | "vndb" | "hikarinagi" | "kun";

async function resolveBgmPlayStatus(game: SourceIdentityPayload) {
	const bgmId = getAnySourceId(game, "bgm");
	if (!bgmId) return undefined;

	try {
		const collection = await withBgmAuth(async (token) => {
			if (!token) return undefined;

			const username = await getBgmUsername(token);
			return fetchUserCollection(
				username,
				bgmId,
				token,
				getNetworkRequestContext(),
			);
		});
		return mapBgmTypeToPlayStatus(collection?.type);
	} catch (error) {
		console.error("解析 BGM 收藏状态失败:", error);
		return undefined;
	}
}

async function resolveVndbPlayStatus(game: SourceIdentityPayload) {
	const vndbId = getAnySourceId(game, "vndb");
	if (!vndbId) return undefined;

	try {
		const token = await getVndbToken();
		if (!token) return undefined;
		const profile = await fetchVndbCurrentUserProfileCached(queryClient, token);
		if (!profile?.permissions.includes("listread")) return undefined;

		const collection = await fetchVndbUserCollection(
			vndbId,
			token,
			profile.id,
			getNetworkRequestContext(),
		);
		return mapVndbCollectionToPlayStatus(collection);
	} catch (error) {
		console.error("解析 VNDB 收藏状态失败:", error);
		return undefined;
	}
}

async function resolveHikarinagiPlayStatus(game: SourceIdentityPayload) {
	const hikarinagiId = getAnySourceId(game, "hikarinagi");
	if (!hikarinagiId) return undefined;

	try {
		const rate = await withHikarinagiAuth(async (token) => {
			if (!token) return undefined;
			return fetchHikarinagiGameRate(
				hikarinagiId,
				token,
				getNetworkRequestContext(),
			);
		});
		return mapHikarinagiStatusToPlayStatus(rate?.status);
	} catch (error) {
		console.error("获取 Hikarinagi 游玩状态失败:", error);
		return undefined;
	}
}

async function resolveKunPlayStatus(game: SourceIdentityPayload) {
	const kunId = getAnySourceId(game, "kun");
	if (!kunId) return undefined;
	try {
		const state = await withNextmoeUserAuth((token, auth) =>
			fetchNextmoeWorkState(kunId, token, {
				...getNetworkRequestContext(),
				nextmoeUserId: auth.user_id ?? undefined,
			}),
		);
		return mapNextmoeStateToPlayStatus(state?.state);
	} catch (error) {
		console.error("获取 Kungal 游玩状态失败:", error);
		return undefined;
	}
}

export async function resolveCloudPlayStatus(
	game: SourceIdentityPayload,
	context?: CloudPlayStatusContext,
) {
	const {
		syncBgmCollection,
		syncVndbCollection,
		syncHikarinagiCollection,
		syncKunCollection,
	} = useStore.getState();

	if (context) {
		const status = resolveCloudPlayStatusFromContext(game, context);
		if (status !== undefined) return status;
		return undefined;
	}

	if (syncBgmCollection) {
		const bgmStatus = await resolveBgmPlayStatus(game);
		if (bgmStatus !== undefined) return bgmStatus;
	}

	if (syncVndbCollection) {
		const vndbStatus = await resolveVndbPlayStatus(game);
		if (vndbStatus !== undefined) return vndbStatus;
	}

	if (syncHikarinagiCollection) {
		const hikarinagiStatus = await resolveHikarinagiPlayStatus(game);
		if (hikarinagiStatus !== undefined) return hikarinagiStatus;
	}
	if (syncKunCollection) {
		const kunStatus = await resolveKunPlayStatus(game);
		if (kunStatus !== undefined) return kunStatus;
	}

	return undefined;
}

async function syncPlayStatusToBgm(
	game: SourceIdentityPayload,
	newStatus: PlayStatus,
) {
	const bgmId = getAnySourceId(game, "bgm");
	if (!bgmId) return true;

	try {
		return await withBgmAuth((token) => {
			if (!token) return Promise.resolve(true);

			return updateUserCollection(
				bgmId,
				{ type: newStatus },
				token,
				getNetworkRequestContext(),
			);
		});
	} catch (error) {
		console.error("同步 BGM 收藏状态失败:", error);
		return false;
	}
}

async function syncPlayStatusToVndb(
	game: SourceIdentityPayload,
	newStatus: PlayStatus,
) {
	const vndbId = getAnySourceId(game, "vndb");
	if (!vndbId) return true;

	try {
		const token = await getVndbToken();
		if (!token) return true;
		const profile = await fetchVndbCurrentUserProfileCached(queryClient, token);
		if (!profile?.permissions.includes("listwrite")) return true;

		const targetLabelId = mapPlayStatusToVndbLabelId(newStatus);
		if (!targetLabelId) return true;

		return await updateVndbUserCollection(
			vndbId,
			{
				labels_set: [targetLabelId],
				labels_unset: VNDB_NORMAL_STATUS_LABEL_IDS.filter(
					(labelId) => labelId !== targetLabelId,
				),
			},
			token,
			getNetworkRequestContext(),
		);
	} catch (error) {
		console.error("同步 VNDB 收藏状态失败:", error);
		return false;
	}
}

async function syncPlayStatusToHikarinagi(
	game: SourceIdentityPayload,
	newStatus: PlayStatus,
) {
	const hikarinagiId = getAnySourceId(game, "hikarinagi");
	if (!hikarinagiId) return true;

	try {
		return await withHikarinagiAuth(async (token) => {
			if (!token) return true;
			return updateHikarinagiGameRate(
				hikarinagiId,
				{ status: mapPlayStatusToHikarinagiStatus(newStatus) },
				token,
				getNetworkRequestContext(),
			);
		});
	} catch (error) {
		console.error("同步 Hikarinagi 游玩状态失败:", error);
		return false;
	}
}

async function syncPlayStatusToKun(
	game: SourceIdentityPayload,
	newStatus: PlayStatus,
) {
	const kunId = getAnySourceId(game, "kun");
	if (!kunId) return true;
	try {
		return await withNextmoeUserAuth((token, auth) =>
			updateNextmoeWorkState(
				kunId,
				mapPlayStatusToNextmoeState(newStatus),
				token,
				{
					...getNetworkRequestContext(),
					nextmoeUserId: auth.user_id ?? undefined,
				},
			),
		);
	} catch (error) {
		console.error("同步 Kungal 游玩状态失败:", error);
		return false;
	}
}

const syncHandlers: Record<
	CollectionSyncSource,
	(game: SourceIdentityPayload, status: PlayStatus) => Promise<boolean>
> = {
	bgm: syncPlayStatusToBgm,
	vndb: syncPlayStatusToVndb,
	hikarinagi: syncPlayStatusToHikarinagi,
	kun: syncPlayStatusToKun,
};

const pendingStatusSyncs = new Map<string, Promise<boolean>>();

async function enqueueStatusSync(
	source: CollectionSyncSource,
	id: string,
	status: PlayStatus,
): Promise<boolean> {
	const key = `${source}:${id}`;
	// 串行的是完整同步任务，包含鉴权、读取和重试，避免旧状态稍后覆盖新状态。
	// 使用云端身份作为键，让绑定同一条目的不同本地游戏也共享顺序。
	const task = () =>
		syncHandlers[source]({ sourceIds: { [source]: id } }, status);
	const previous = pendingStatusSyncs.get(key) ?? Promise.resolve(true);
	const result = previous.then(task, task);
	pendingStatusSyncs.set(key, result);
	try {
		return await result;
	} finally {
		if (pendingStatusSyncs.get(key) === result) pendingStatusSyncs.delete(key);
	}
}

export async function syncPlayStatusToCloud(
	game: SourceIdentityPayload,
	newStatus: PlayStatus,
): Promise<CollectionSyncSource[]> {
	const {
		syncBgmCollection,
		syncVndbCollection,
		syncHikarinagiCollection,
		syncKunCollection,
	} = useStore.getState();
	const enabled: Record<CollectionSyncSource, boolean> = {
		bgm: syncBgmCollection,
		vndb: syncVndbCollection,
		hikarinagi: syncHikarinagiCollection,
		kun: syncKunCollection,
	};
	// 入队前固定本次采用的身份和开关；各来源独立执行并分别返回失败结果。
	const results = await Promise.all(
		(Object.keys(syncHandlers) as CollectionSyncSource[]).map(
			async (source) => {
				const id = getAnySourceId(game, source);
				if (!enabled[source] || !id) return [];
				const success = await enqueueStatusSync(source, id, newStatus);
				return success ? [] : [source];
			},
		),
	);
	return results.flat();
}
