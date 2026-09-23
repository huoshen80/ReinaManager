import { fetchVndbCurrentUserProfileCached } from "@/hooks/queries/useSettings";
import { fetchUserCollection, updateUserCollection } from "@/metadata/api/bgm";
import {
	fetchHikarinagiGameRate,
	updateHikarinagiGameRate,
} from "@/metadata/api/hikarinagi";
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
import { getNetworkRequestContext } from "@/services/requestContext";
import { useStore } from "@/store/appStore";
import type { PlayStatus } from "@/types/collection";
import {
	type CloudPlayStatusContext,
	getBgmUsername,
	getVndbToken,
	mapBgmTypeToPlayStatus,
	mapHikarinagiStatusToPlayStatus,
	mapPlayStatusToHikarinagiStatus,
	mapPlayStatusToVndbLabelId,
	mapVndbCollectionToPlayStatus,
	resolveCloudPlayStatusFromContext,
	VNDB_NORMAL_STATUS_LABEL_IDS,
} from "./shared";

type CollectionSyncSource = "bgm" | "vndb" | "hikarinagi";

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

export async function resolveCloudPlayStatus(
	game: SourceIdentityPayload,
	context?: CloudPlayStatusContext,
) {
	const { syncBgmCollection, syncVndbCollection, syncHikarinagiCollection } =
		useStore.getState();

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

		return updateVndbUserCollection(
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

export async function syncPlayStatusToCloud(
	game: SourceIdentityPayload,
	newStatus: PlayStatus,
): Promise<CollectionSyncSource[]> {
	const { syncBgmCollection, syncVndbCollection, syncHikarinagiCollection } =
		useStore.getState();
	const failedSources: CollectionSyncSource[] = [];

	if (syncBgmCollection) {
		const success = await syncPlayStatusToBgm(game, newStatus);
		if (!success) failedSources.push("bgm");
	}

	if (syncVndbCollection) {
		const success = await syncPlayStatusToVndb(game, newStatus);
		if (!success) failedSources.push("vndb");
	}

	if (syncHikarinagiCollection) {
		const success = await syncPlayStatusToHikarinagi(game, newStatus);
		if (!success) failedSources.push("hikarinagi");
	}

	return failedSources;
}
