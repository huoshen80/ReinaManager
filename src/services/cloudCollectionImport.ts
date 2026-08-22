import { fetchBgmById, fetchUserGameCollections } from "@/metadata/api/bgm";
import {
	fetchHikarinagiById,
	fetchHikarinagiRatesPage,
} from "@/metadata/api/hikarinagi";
import {
	fetchVndbCurrentUserProfile,
	fetchVndbUserImportCollections,
} from "@/metadata/api/vndb";
import { getCandidateSourceData } from "@/metadata/sourceCandidate";
import {
	getBgmUsername,
	getVndbToken,
	mapBgmTypeToPlayStatus,
	mapHikarinagiStatusToPlayStatus,
	mapVndbCollectionToPlayStatus,
} from "@/services/cloudPlayStatus/shared";
import { withBgmAuth } from "@/services/oauth/bgmAuthSession";
import {
	hasHikarinagiScope,
	withHikarinagiAuth,
} from "@/services/oauth/hikarinagiAuthSession";
import {
	getMetadataRequestContext,
	getNetworkRequestContext,
} from "@/services/requestContext";
import type {
	CloudCollectionSource,
	GameMetadataDraft,
	VndbData,
} from "@/types";
import type { PlayStatus } from "@/types/collection";
import { isAbortError } from "@/utils/async";
import { AppError } from "@/utils/errors";

export interface CloudCollectionItem {
	developer?: string;
	externalId: string;
	image?: string;
	key: string;
	metadata?: GameMetadataDraft;
	name: string;
	nameCn?: string;
	originalName?: string;
	playStatus?: PlayStatus;
	releaseDate?: string;
	source: CloudCollectionSource;
	userRating?: number;
	userReview?: string;
}

export interface PreparedCloudCollectionItem {
	error?: unknown;
	item: CloudCollectionItem;
	metadata?: GameMetadataDraft;
}

function createItemKey(source: CloudCollectionSource, externalId: string) {
	return `${source}:${externalId}`;
}

function normalizeRating(value?: number | null) {
	if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
		return undefined;
	}
	return Math.min(10, Math.max(1, Math.round(value * 10) / 10));
}

function normalizeReview(value?: string | null) {
	const review = value?.trim();
	return review || undefined;
}

function withPersonalData(
	metadata: GameMetadataDraft,
	item: CloudCollectionItem,
): GameMetadataDraft {
	const userRating = normalizeRating(item.userRating);
	const userReview = normalizeReview(item.userReview);
	if (userRating === undefined && userReview === undefined) return metadata;

	return {
		...metadata,
		custom_data: {
			...metadata.custom_data,
			...(userRating === undefined ? {} : { user_rating: userRating }),
			...(userReview === undefined ? {} : { user_review: userReview }),
		},
	};
}

async function loadBgmCollection(signal?: AbortSignal) {
	return withBgmAuth(async (token) => {
		if (!token) {
			throw new AppError({
				code: "bgm_auth_missing",
				message: "请先登录 Bangumi 账号",
			});
		}
		const username = await getBgmUsername(token);
		const collections = await fetchUserGameCollections(
			username,
			token,
			getNetworkRequestContext(signal),
		);
		return collections.map((collection): CloudCollectionItem => {
			const externalId = String(collection.subject_id);
			return {
				key: createItemKey("bgm", externalId),
				source: "bgm",
				externalId,
				name: collection.subject?.name || `Bangumi #${externalId}`,
				nameCn: collection.subject?.name_cn || undefined,
				originalName: collection.subject?.name || undefined,
				image:
					collection.subject?.images?.large ??
					collection.subject?.images?.common,
				playStatus: mapBgmTypeToPlayStatus(collection.type),
				releaseDate: collection.subject?.date,
				userRating: normalizeRating(collection.rate),
				userReview: normalizeReview(collection.comment),
			};
		});
	});
}

async function loadVndbCollection(signal?: AbortSignal) {
	const token = await getVndbToken();
	if (!token) {
		throw new AppError({
			code: "vndb_token_missing",
			message: "请先配置 VNDB Token",
		});
	}
	const context = getMetadataRequestContext({ signal });
	const profile = await fetchVndbCurrentUserProfile(token, context);
	if (!profile?.permissions.includes("listread")) {
		throw new AppError({
			code: "vndb_listread_missing",
			message: "VNDB Token 缺少 listread 权限",
		});
	}
	const collections = await fetchVndbUserImportCollections(
		token,
		profile.id,
		context,
	);
	return collections.map((collection): CloudCollectionItem => {
		const data = getCandidateSourceData<VndbData>(collection.metadata, "vndb");
		return {
			developer: data?.developer,
			key: createItemKey("vndb", collection.id),
			source: "vndb",
			externalId: collection.id,
			name: data?.name || `VNDB ${collection.id}`,
			nameCn: data?.name_cn,
			originalName: data?.name,
			image: data?.image,
			playStatus: mapVndbCollectionToPlayStatus(collection),
			releaseDate: data?.date,
			userRating: collection.vote == null ? undefined : collection.vote / 10,
			userReview: normalizeReview(collection.notes),
			metadata: collection.metadata,
		};
	});
}

async function loadHikarinagiCollection(signal?: AbortSignal) {
	return withHikarinagiAuth(async (token, auth) => {
		if (!token) {
			throw new AppError({
				code: "hikarinagi_auth_missing",
				message: "请先登录 Hikarinagi 账号",
			});
		}
		if (!hasHikarinagiScope(auth, "catalog:full")) {
			throw new AppError({
				code: "hikarinagi_catalog_full_missing",
				message: "Hikarinagi 授权缺少 catalog:full，请重新授权",
			});
		}

		const items: CloudCollectionItem[] = [];
		let pageNumber = 1;
		while (true) {
			const page = await fetchHikarinagiRatesPage(
				token,
				{ page: pageNumber, pageSize: 100 },
				getNetworkRequestContext(signal),
			);
			for (const rate of page.items) {
				const externalId = String(rate.id);
				items.push({
					key: createItemKey("hikarinagi", externalId),
					source: "hikarinagi",
					externalId,
					name: rate.title?.trim() || `Hikarinagi #${externalId}`,
					image: rate.cover?.src,
					playStatus: mapHikarinagiStatusToPlayStatus(rate.status),
					userRating: normalizeRating(rate.rate),
					userReview: normalizeReview(rate.rate_content),
				});
			}
			if (page.items.length === 0 || page.meta.page >= page.meta.total_pages) {
				break;
			}
			pageNumber += 1;
		}
		return items;
	});
}

export function loadCloudCollection(
	source: CloudCollectionSource,
	signal?: AbortSignal,
) {
	switch (source) {
		case "bgm":
			return loadBgmCollection(signal);
		case "vndb":
			return loadVndbCollection(signal);
		case "hikarinagi":
			return loadHikarinagiCollection(signal);
	}
}

export async function prepareCloudCollectionItems(
	items: CloudCollectionItem[],
	signal: AbortSignal,
	onProgress: (completed: number, total: number) => void,
): Promise<PreparedCloudCollectionItem[]> {
	if (items.length === 0) return [];
	const source = items[0].source;
	const prepared: PreparedCloudCollectionItem[] = [];

	const prepare = async (
		fetchDetails: (item: CloudCollectionItem) => Promise<GameMetadataDraft>,
	) => {
		for (let index = 0; index < items.length; index++) {
			const item = items[index];
			try {
				const metadata = await fetchDetails(item);
				prepared.push({ item, metadata: withPersonalData(metadata, item) });
			} catch (error) {
				if (isAbortError(error)) throw error;
				prepared.push({ item, error });
			}
			onProgress(index + 1, items.length);
		}
	};

	if (source === "vndb") {
		await prepare(async (item) => {
			if (!item.metadata) {
				throw new AppError({
					code: "vndb_import_metadata_missing",
					message: `VNDB 元数据缺失: ${item.externalId}`,
				});
			}
			return item.metadata;
		});
		return prepared;
	}

	if (source === "bgm") {
		await withBgmAuth(async (token) => {
			if (!token) {
				throw new AppError({
					code: "bgm_auth_missing",
					message: "请先登录 Bangumi 账号",
				});
			}
			await prepare((item) =>
				fetchBgmById(item.externalId, token, getNetworkRequestContext(signal)),
			);
		});
		return prepared;
	}

	await withHikarinagiAuth(async (token, auth) => {
		if (!token) {
			throw new AppError({
				code: "hikarinagi_auth_missing",
				message: "请先登录 Hikarinagi 账号",
			});
		}
		if (!hasHikarinagiScope(auth, "catalog:full")) {
			throw new AppError({
				code: "hikarinagi_catalog_full_missing",
				message: "Hikarinagi 授权缺少 catalog:full，请重新授权",
			});
		}
		await prepare((item) =>
			fetchHikarinagiById(
				item.externalId,
				token,
				getNetworkRequestContext(signal),
			),
		);
	});

	return prepared;
}
