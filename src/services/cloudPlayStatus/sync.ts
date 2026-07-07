import { fetchUserCollection, updateUserCollection } from "@/metadata/api/bgm";
import {
	fetchVndbUserCollection,
	updateVndbUserCollection,
} from "@/metadata/api/vndb";
import {
	getAnySourceId,
	type SourceIdentityPayload,
} from "@/metadata/sourceRecord";
import { withBgmAuth } from "@/services/bgmAuthSession";
import { useStore } from "@/store/appStore";
import type { PlayStatus } from "@/types/collection";
import {
	type CloudPlayStatusContext,
	getBgmUsername,
	getVndbToken,
	mapBgmTypeToPlayStatus,
	mapPlayStatusToVndbLabelId,
	mapVndbCollectionToPlayStatus,
	resolveCloudPlayStatusFromContext,
	VNDB_NORMAL_STATUS_LABEL_IDS,
} from "./shared";

type CollectionSyncSource = "bgm" | "vndb";

async function resolveBgmPlayStatus(game: SourceIdentityPayload) {
	const bgmId = getAnySourceId(game, "bgm");
	if (!bgmId) return undefined;

	try {
		const collection = await withBgmAuth(async (token) => {
			if (!token) return undefined;

			const username = await getBgmUsername(token);
			return fetchUserCollection(username, bgmId, token);
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

		const collection = await fetchVndbUserCollection(vndbId, token);
		return mapVndbCollectionToPlayStatus(collection);
	} catch (error) {
		console.error("解析 VNDB 收藏状态失败:", error);
		return undefined;
	}
}

export async function resolveCloudPlayStatus(
	game: SourceIdentityPayload,
	context?: CloudPlayStatusContext,
) {
	const { syncBgmCollection, syncVndbCollection } = useStore.getState();

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

			return updateUserCollection(bgmId, { type: newStatus }, token);
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
		);
	} catch (error) {
		console.error("同步 VNDB 收藏状态失败:", error);
		return false;
	}
}

export async function syncPlayStatusToCloud(
	game: SourceIdentityPayload,
	newStatus: PlayStatus,
): Promise<CollectionSyncSource[]> {
	const { syncBgmCollection, syncVndbCollection } = useStore.getState();
	const failedSources: CollectionSyncSource[] = [];

	if (syncBgmCollection) {
		const success = await syncPlayStatusToBgm(game, newStatus);
		if (!success) failedSources.push("bgm");
	}

	if (syncVndbCollection) {
		const success = await syncPlayStatusToVndb(game, newStatus);
		if (!success) failedSources.push("vndb");
	}

	return failedSources;
}
