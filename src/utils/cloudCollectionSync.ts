import {
	fetchCurrentUserProfile,
	fetchUserCollection,
	updateUserCollection,
} from "@/api/bgm";
import {
	fetchGalgameById,
	fetchCurrentUserProfile as fetchKunProfile,
	toggleLike,
	toggleFavorite,
} from "@/api/kun";
import { fetchVndbUserCollection, updateVndbUserCollection } from "@/api/vndb";
import { settingsKeys } from "@/hooks/queries/useSettings";
import { queryClient } from "@/providers/queryClient";
import { settingsService } from "@/services/invoke";
import { useStore } from "@/store/appStore";
import type { FullGameData, GameData, KunData } from "@/types";
import { PlayStatus } from "@/types/collection";

type CollectionSyncSource = "bgm" | "vndb" | "kun";

// 定义一个包含所有可能同步源的扩展类型
type SyncableGame = (GameData | FullGameData) & { kun_data?: KunData | null };

const VNDB_STATUS_LABEL_IDS = {
	PLAYING: 1,
	PLAYED: 2,
	ON_HOLD: 3,
	DROPPED: 4,
	WISH: 5,
} as const;

const VNDB_STATUS_LABEL_NAMES = {
	PLAYING: "Playing",
	PLAYED: "Finished",
	ON_HOLD: "Stalled",
	DROPPED: "Dropped",
	WISH: "Wishlist",
} as const;

const VNDB_NORMAL_STATUS_LABEL_IDS = [
	VNDB_STATUS_LABEL_IDS.PLAYING,
	VNDB_STATUS_LABEL_IDS.PLAYED,
	VNDB_STATUS_LABEL_IDS.ON_HOLD,
	VNDB_STATUS_LABEL_IDS.DROPPED,
	VNDB_STATUS_LABEL_IDS.WISH,
];

async function getBgmToken() {
	try {
		return await queryClient.fetchQuery({
			queryKey: settingsKeys.bgmToken(),
			queryFn: () => settingsService.getBgmToken(),
		});
	} catch (error) {
		console.error("获取 BGM Token 失败:", error);
		return "";
	}
}

async function getVndbToken() {
	try {
		return await queryClient.fetchQuery({
			queryKey: settingsKeys.vndbToken(),
			queryFn: () => settingsService.getVndbToken(),
		});
	} catch (error) {
		console.error("获取 VNDB Token 失败:", error);
		return "";
	}
}

async function getKunToken() {
	const { kunToken } = useStore.getState();
	return kunToken || "";
}

async function getBgmUsername(token: string) {
	try {
		const profile = await queryClient.fetchQuery({
			queryKey: settingsKeys.bgmCurrentUserProfileByToken(token),
			queryFn: () => fetchCurrentUserProfile(token),
		});
		return profile?.username ?? null;
	} catch (error) {
		console.error("获取 BGM 用户名失败:", error);
		return null;
	}
}

function mapBgmTypeToPlayStatus(type?: number | null) {
	switch (type) {
		case PlayStatus.WISH:
		case PlayStatus.PLAYED:
		case PlayStatus.PLAYING:
		case PlayStatus.ON_HOLD:
		case PlayStatus.DROPPED:
			return type;
		default:
			return undefined;
	}
}

function mapVndbCollectionToPlayStatus(
	collection: Awaited<ReturnType<typeof fetchVndbUserCollection>>,
) {
	if (!collection?.labels?.length) return undefined;

	const hasLabel = (id: number, name: string) =>
		collection.labels.some((label) => label.id === id || label.label === name);

	if (
		hasLabel(VNDB_STATUS_LABEL_IDS.PLAYING, VNDB_STATUS_LABEL_NAMES.PLAYING)
	) {
		return PlayStatus.PLAYING;
	}
	if (hasLabel(VNDB_STATUS_LABEL_IDS.PLAYED, VNDB_STATUS_LABEL_NAMES.PLAYED)) {
		return PlayStatus.PLAYED;
	}
	if (
		hasLabel(VNDB_STATUS_LABEL_IDS.ON_HOLD, VNDB_STATUS_LABEL_NAMES.ON_HOLD)
	) {
		return PlayStatus.ON_HOLD;
	}
	if (
		hasLabel(VNDB_STATUS_LABEL_IDS.DROPPED, VNDB_STATUS_LABEL_NAMES.DROPPED)
	) {
		return PlayStatus.DROPPED;
	}
	if (hasLabel(VNDB_STATUS_LABEL_IDS.WISH, VNDB_STATUS_LABEL_NAMES.WISH)) {
		return PlayStatus.WISH;
	}

	return undefined;
}

function mapPlayStatusToVndbLabelId(status: PlayStatus) {
	switch (status) {
		case PlayStatus.PLAYING:
			return VNDB_STATUS_LABEL_IDS.PLAYING;
		case PlayStatus.PLAYED:
			return VNDB_STATUS_LABEL_IDS.PLAYED;
		case PlayStatus.ON_HOLD:
			return VNDB_STATUS_LABEL_IDS.ON_HOLD;
		case PlayStatus.DROPPED:
			return VNDB_STATUS_LABEL_IDS.DROPPED;
		case PlayStatus.WISH:
			return VNDB_STATUS_LABEL_IDS.WISH;
		default:
			return undefined;
	}
}

async function resolveBgmPlayStatus(game: Pick<FullGameData, "bgm_id">) {
	if (!game.bgm_id) return undefined;

	try {
		const token = await getBgmToken();
		if (!token) return undefined;

		const username = await getBgmUsername(token);
		if (!username) return undefined;

		const collection = await fetchUserCollection(username, game.bgm_id, token);
		return mapBgmTypeToPlayStatus(collection?.type);
	} catch (error) {
		console.error("解析 BGM 收藏状态失败:", error);
		return undefined;
	}
}

async function resolveVndbPlayStatus(game: Pick<FullGameData, "vndb_id">) {
	if (!game.vndb_id) return undefined;

	try {
		const token = await getVndbToken();
		if (!token) return undefined;

		const collection = await fetchVndbUserCollection(game.vndb_id, token);
		return mapVndbCollectionToPlayStatus(collection);
	} catch (error) {
		console.error("解析 VNDB 收藏状态失败:", error);
		return undefined;
	}
}

async function resolveKunPlayStatus(game: Pick<FullGameData, "kun_data">) {
	if (!game.kun_data?.id) return undefined;

	try {
		const token = await getKunToken();
		if (!token) return undefined;

		const profile = await fetchKunProfile(token);
		if (!profile) return undefined;
		const kunId = String(game.kun_data.id);
		const fullData = await fetchGalgameById(kunId, token);

		const rawKunData = (fullData as any)._raw;
		if (rawKunData?.isFavorite) return PlayStatus.PLAYED;
		if (rawKunData?.isLike) return PlayStatus.WISH;

		return undefined;
	} catch (error) {
		console.error("解析 Kungal 收藏状态失败:", error);
		return undefined;
	}
}

export async function resolveCloudPlayStatus(
	game: SyncableGame,
) {
	const { syncBgmCollection, syncVndbCollection, syncKunCollection } = useStore.getState();

	if (syncBgmCollection) {
		const bgmStatus = await resolveBgmPlayStatus(game);
		if (bgmStatus !== undefined) return bgmStatus;
	}

	if (syncVndbCollection) {
		const vndbStatus = await resolveVndbPlayStatus(game);
		if (vndbStatus !== undefined) return vndbStatus;
	}

	if (syncKunCollection && game.kun_data) {
		const kunStatus = await resolveKunPlayStatus({ kun_data: game.kun_data });
		if (kunStatus !== undefined) return kunStatus;
	}

	return undefined;
}

async function syncPlayStatusToBgm(
	game: Pick<GameData, "bgm_id">,
	newStatus: PlayStatus,
) {
	if (!game.bgm_id) return true;

	try {
		const token = await getBgmToken();
		if (!token) return true;

		const username = await getBgmUsername(token);
		if (!username) return false;

		return updateUserCollection(username, game.bgm_id, newStatus, token);
	} catch (error) {
		console.error("同步 BGM 收藏状态失败:", error);
		return false;
	}
}

async function syncPlayStatusToVndb(
	game: Pick<GameData, "vndb_id">,
	newStatus: PlayStatus,
) {
	if (!game.vndb_id) return true;

	try {
		const token = await getVndbToken();
		if (!token) return true;

		const targetLabelId = mapPlayStatusToVndbLabelId(newStatus);
		if (!targetLabelId) return true;

		return updateVndbUserCollection(
			game.vndb_id,
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

async function syncPlayStatusToKun(
	gameId: number,
	newStatus: PlayStatus,
) {
	try {
		const token = await getKunToken();
		if (!token) return true;

		// 映射逻辑：
		// PLAYED -> Favorite (收藏)
		// WISH -> Like (点赞)
		// 其他状态目前不对应 Kungal 操作，或根据需求定义
		if (newStatus === PlayStatus.PLAYED) {
			await toggleFavorite(gameId, token);
		} else if (newStatus === PlayStatus.WISH) {
			await toggleLike(gameId, token);
		}
		return true;
	} catch (error) {
		console.error("同步 Kungal 状态失败:", error);
		return false;
	}
}

export async function syncPlayStatusToCloud(
	game: SyncableGame,
	newStatus: PlayStatus,
): Promise<CollectionSyncSource[]> {
	const { syncBgmCollection, syncVndbCollection, syncKunCollection } = useStore.getState();
	const failedSources: CollectionSyncSource[] = [];

	if (syncBgmCollection) {
		const success = await syncPlayStatusToBgm(game, newStatus);
		if (!success) failedSources.push("bgm");
	}

	if (syncVndbCollection) {
		const success = await syncPlayStatusToVndb(game, newStatus);
		if (!success) failedSources.push("vndb");
	}

	if (syncKunCollection && game.kun_data?.id) {
		const success = await syncPlayStatusToKun(game.kun_data.id, newStatus);
		if (!success) failedSources.push("kun");
	}

	return failedSources;
}
