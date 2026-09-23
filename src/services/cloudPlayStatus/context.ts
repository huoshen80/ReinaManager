import { fetchVndbCurrentUserProfileCached } from "@/hooks/queries/useSettings";
import {
	type BgmUserCollection,
	fetchUserCollection,
	fetchUserGameCollectionsPage,
} from "@/metadata/api/bgm";
import {
	fetchHikarinagiGameRate,
	fetchHikarinagiRatesPage,
} from "@/metadata/api/hikarinagi";
import {
	fetchVndbUserCollection,
	fetchVndbUserCollectionsPage,
	type VndbUserCollectionItem,
} from "@/metadata/api/vndb";
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
	mapVndbCollectionToPlayStatus,
} from "./shared";

export interface CloudPlayStatusContextInput {
	bgmIds?: Iterable<string>;
	vndbIds?: Iterable<string>;
	hikarinagiIds?: Iterable<string>;
}

const DIRECT_COLLECTION_LOOKUP_THRESHOLD = 1;
const BGM_COLLECTION_PAGE_SIZE = 50;
const VNDB_COLLECTION_PAGE_SIZE = 100;
const HIKARINAGI_COLLECTION_PAGE_SIZE = 100;

interface BgmCollectionPage {
	offset: number;
	limit: number;
	total: number;
	data: BgmUserCollection[];
}

interface VndbCollectionPage {
	results: VndbUserCollectionItem[];
	more: boolean;
	count?: number;
}

async function fetchBgmCollectionPage(
	username: string,
	token: string,
	params: { limit: number; offset: number },
): Promise<BgmCollectionPage> {
	const page = await fetchUserGameCollectionsPage(
		username,
		token,
		params,
		getNetworkRequestContext(),
	);
	return {
		offset: page.offset ?? params.offset,
		limit: page.limit ?? params.limit,
		total: page.total ?? 0,
		data: Array.isArray(page.data) ? page.data : [],
	};
}

async function fetchVndbCollectionPage(
	token: string,
	params: { userId: string; page: number; count?: boolean },
): Promise<VndbCollectionPage> {
	const page = await fetchVndbUserCollectionsPage(
		token,
		params,
		getNetworkRequestContext(),
	);
	return {
		results: Array.isArray(page.results) ? page.results : [],
		more: Boolean(page.more),
		count: page.count,
	};
}

function appendBgmCollectionsToStatusMap(
	statusMap: Map<string, PlayStatus>,
	collections: BgmUserCollection[],
) {
	for (const collection of collections) {
		const status = mapBgmTypeToPlayStatus(collection.type);
		if (status !== undefined) {
			statusMap.set(String(collection.subject_id), status);
		}
	}
}

function appendVndbCollectionsToStatusMap(
	statusMap: Map<string, PlayStatus>,
	collections: VndbUserCollectionItem[],
) {
	for (const collection of collections) {
		const status = mapVndbCollectionToPlayStatus(collection);
		if (status !== undefined) {
			statusMap.set(collection.id, status);
		}
	}
}

async function createBgmDirectPlayStatusMap(
	username: string,
	token: string,
	ids: string[],
) {
	const statusMap = new Map<string, PlayStatus>();
	for (const id of ids) {
		const collection = await fetchUserCollection(
			username,
			id,
			token,
			getNetworkRequestContext(),
		);
		const status = mapBgmTypeToPlayStatus(collection?.type);
		if (status !== undefined) {
			statusMap.set(id, status);
		}
	}
	return statusMap;
}

async function createBgmFullPlayStatusMap(
	username: string,
	token: string,
	firstPage?: BgmCollectionPage,
) {
	const statusMap = new Map<string, PlayStatus>();
	let page =
		firstPage ??
		(await fetchBgmCollectionPage(username, token, {
			limit: BGM_COLLECTION_PAGE_SIZE,
			offset: 0,
		}));
	appendBgmCollectionsToStatusMap(statusMap, page.data);

	while (true) {
		const nextOffset = page.offset + page.limit;
		if (page.data.length === 0 || nextOffset >= page.total) {
			break;
		}
		page = await fetchBgmCollectionPage(username, token, {
			limit: BGM_COLLECTION_PAGE_SIZE,
			offset: nextOffset,
		});
		appendBgmCollectionsToStatusMap(statusMap, page.data);
	}

	return statusMap;
}

async function createBgmPlayStatusMap(ids: Iterable<string>) {
	try {
		const uniqueIds = [...new Set(ids)].filter(Boolean);
		if (uniqueIds.length === 0) {
			return new Map<string, PlayStatus>();
		}

		return await withBgmAuth(async (token) => {
			if (!token) return undefined;

			const username = await getBgmUsername(token);
			if (uniqueIds.length <= DIRECT_COLLECTION_LOOKUP_THRESHOLD) {
				return createBgmDirectPlayStatusMap(username, token, uniqueIds);
			}

			const firstPage = await fetchBgmCollectionPage(username, token, {
				limit: BGM_COLLECTION_PAGE_SIZE,
				offset: 0,
			});
			const fullFetchRequests = Math.ceil(
				firstPage.total / BGM_COLLECTION_PAGE_SIZE,
			);

			if (uniqueIds.length < fullFetchRequests) {
				return createBgmDirectPlayStatusMap(username, token, uniqueIds);
			}

			return createBgmFullPlayStatusMap(username, token, firstPage);
		});
	} catch (error) {
		console.error("获取 BGM 收藏列表失败:", error);
		return undefined;
	}
}

async function createVndbDirectPlayStatusMap(
	token: string,
	userId: string,
	ids: string[],
) {
	const statusMap = new Map<string, PlayStatus>();
	for (const id of ids) {
		const collection = await fetchVndbUserCollection(
			id,
			token,
			userId,
			getNetworkRequestContext(),
		);
		const status = mapVndbCollectionToPlayStatus(collection);
		if (status !== undefined) {
			statusMap.set(id, status);
		}
	}
	return statusMap;
}

async function createVndbFullPlayStatusMap(
	token: string,
	userId: string,
	firstPage?: VndbCollectionPage,
) {
	const statusMap = new Map<string, PlayStatus>();
	let page =
		firstPage ??
		(await fetchVndbCollectionPage(token, {
			userId,
			page: 1,
		}));
	appendVndbCollectionsToStatusMap(statusMap, page.results);

	let pageNumber = 2;
	while (page.more && page.results.length > 0) {
		page = await fetchVndbCollectionPage(token, {
			userId,
			page: pageNumber,
		});
		appendVndbCollectionsToStatusMap(statusMap, page.results);
		pageNumber += 1;
	}

	return statusMap;
}

async function createVndbPlayStatusMap(ids: Iterable<string>) {
	try {
		const uniqueIds = [...new Set(ids)].filter(Boolean);
		if (uniqueIds.length === 0) {
			return new Map<string, PlayStatus>();
		}

		const token = await getVndbToken();
		if (!token) return undefined;

		const profile = await fetchVndbCurrentUserProfileCached(queryClient, token);
		const userId = profile?.id;
		if (!userId || !profile.permissions.includes("listread")) {
			return undefined;
		}

		if (uniqueIds.length <= DIRECT_COLLECTION_LOOKUP_THRESHOLD) {
			return createVndbDirectPlayStatusMap(token, userId, uniqueIds);
		}

		const firstPage = await fetchVndbCollectionPage(token, {
			userId,
			page: 1,
			count: true,
		});
		const total = firstPage.count ?? 0;
		const fullFetchRequests = Math.ceil(total / VNDB_COLLECTION_PAGE_SIZE);

		if (uniqueIds.length < fullFetchRequests) {
			return createVndbDirectPlayStatusMap(token, userId, uniqueIds);
		}

		return createVndbFullPlayStatusMap(token, userId, firstPage);
	} catch (error) {
		console.error("获取 VNDB 收藏列表失败:", error);
		return undefined;
	}
}

function appendHikarinagiRatesToStatusMap(
	statusMap: Map<string, PlayStatus>,
	rates: Awaited<ReturnType<typeof fetchHikarinagiRatesPage>>["items"],
) {
	for (const rate of rates) {
		const status = mapHikarinagiStatusToPlayStatus(rate.status);
		if (status !== undefined) {
			statusMap.set(String(rate.id), status);
		}
	}
}

async function createHikarinagiDirectPlayStatusMap(
	token: string,
	ids: string[],
) {
	const statusMap = new Map<string, PlayStatus>();
	for (const id of ids) {
		const rate = await fetchHikarinagiGameRate(
			id,
			token,
			getNetworkRequestContext(),
		);
		const status = mapHikarinagiStatusToPlayStatus(rate?.status);
		if (status !== undefined) {
			statusMap.set(id, status);
		}
	}
	return statusMap;
}

async function createHikarinagiFullPlayStatusMap(
	token: string,
	firstPage?: Awaited<ReturnType<typeof fetchHikarinagiRatesPage>>,
) {
	const statusMap = new Map<string, PlayStatus>();
	let page =
		firstPage ??
		(await fetchHikarinagiRatesPage(
			token,
			{ page: 1, pageSize: HIKARINAGI_COLLECTION_PAGE_SIZE },
			getNetworkRequestContext(),
		));
	appendHikarinagiRatesToStatusMap(statusMap, page.items);

	while (page.meta.page < page.meta.total_pages && page.items.length > 0) {
		page = await fetchHikarinagiRatesPage(
			token,
			{ page: page.meta.page + 1, pageSize: HIKARINAGI_COLLECTION_PAGE_SIZE },
			getNetworkRequestContext(),
		);
		appendHikarinagiRatesToStatusMap(statusMap, page.items);
	}

	return statusMap;
}

async function createHikarinagiPlayStatusMap(ids: Iterable<string>) {
	try {
		const uniqueIds = [...new Set(ids)].filter(Boolean);
		if (uniqueIds.length === 0) {
			return new Map<string, PlayStatus>();
		}

		return await withHikarinagiAuth(async (token) => {
			if (!token) return undefined;
			if (uniqueIds.length <= DIRECT_COLLECTION_LOOKUP_THRESHOLD) {
				return createHikarinagiDirectPlayStatusMap(token, uniqueIds);
			}

			const firstPage = await fetchHikarinagiRatesPage(
				token,
				{ page: 1, pageSize: HIKARINAGI_COLLECTION_PAGE_SIZE },
				getNetworkRequestContext(),
			);
			const fullFetchRequests = Math.ceil(
				firstPage.meta.total_items / HIKARINAGI_COLLECTION_PAGE_SIZE,
			);
			if (uniqueIds.length < fullFetchRequests) {
				return createHikarinagiDirectPlayStatusMap(token, uniqueIds);
			}

			return createHikarinagiFullPlayStatusMap(token, firstPage);
		});
	} catch (error) {
		console.error("获取 Hikarinagi 游玩状态失败:", error);
		return undefined;
	}
}

export async function createCloudPlayStatusContext(
	input: CloudPlayStatusContextInput = {},
): Promise<CloudPlayStatusContext> {
	const { syncBgmCollection, syncVndbCollection, syncHikarinagiCollection } =
		useStore.getState();
	const [bgm, vndb, hikarinagi] = await Promise.all([
		syncBgmCollection
			? createBgmPlayStatusMap(input.bgmIds ?? [])
			: Promise.resolve(undefined),
		syncVndbCollection
			? createVndbPlayStatusMap(input.vndbIds ?? [])
			: Promise.resolve(undefined),
		syncHikarinagiCollection
			? createHikarinagiPlayStatusMap(input.hikarinagiIds ?? [])
			: Promise.resolve(undefined),
	]);

	return {
		...(bgm ? { bgm } : {}),
		...(vndb ? { vndb } : {}),
		...(hikarinagi ? { hikarinagi } : {}),
	};
}
