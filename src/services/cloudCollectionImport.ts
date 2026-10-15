import { fetchBgmById, fetchUserGameCollections } from "@/metadata/api/bgm";
import { fetchHikarinagiRatesPage } from "@/metadata/api/hikarinagi";
import {
	fetchNextmoeUserWorksPage,
	fetchNextmoeWorkPreviews,
} from "@/metadata/api/nextmoe";
import {
	fetchVndbCurrentUserProfile,
	fetchVndbUserImportCollections,
} from "@/metadata/api/vndb";
import { GameMetadataSession } from "@/metadata/data/gameMetadataService";
import {
	type GameIdentityPayload,
	getGameIdentityKeys,
} from "@/metadata/data/metadata";
import { getCandidateSourceData } from "@/metadata/sourceCandidate";
import {
	getBgmUsername,
	getVndbToken,
	mapBgmTypeToPlayStatus,
	mapHikarinagiStatusToPlayStatus,
	mapNextmoeStateToPlayStatus,
	mapVndbCollectionToPlayStatus,
} from "@/services/cloudPlayStatus/shared";
import { withBgmAuth } from "@/services/oauth/bgmAuthSession";
import {
	hasHikarinagiScope,
	withHikarinagiAuth,
} from "@/services/oauth/hikarinagiAuthSession";
import { withNextmoeUserAuth } from "@/services/oauth/nextmoeAuthSession";
import {
	getMetadataRequestContext,
	getNetworkRequestContext,
} from "@/services/requestContext";
import type {
	CloudCollectionSource,
	GameMetadataDraft,
	KunData,
	NextmoeUserWork,
	VndbData,
} from "@/types";
import type { PlayStatus } from "@/types/collection";
import { isAbortError } from "@/utils/async";
import { AppError, isApiRateLimitError } from "@/utils/errors";

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
	duplicate?: boolean;
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

async function loadKunCollection(signal?: AbortSignal) {
	return withNextmoeUserAuth(async (token, auth) => {
		const context = {
			...getNetworkRequestContext(signal),
			nextmoeUserId: auth.user_id ?? undefined,
		};
		const works = new Map<string, NextmoeUserWork>();
		let cursor: string | undefined;
		do {
			signal?.throwIfAborted();
			const page = await fetchNextmoeUserWorksPage(token, cursor, context);
			for (const work of page.items) {
				// 仅有游玩时长不等于收藏；收藏夹与游玩状态取并集，同一作品只导入一次。
				if (work.folder_ids.length > 0 || work.work_state)
					works.set(work.work_id, work);
			}
			cursor = page.next_cursor;
		} while (cursor);
		const previews = await fetchNextmoeWorkPreviews(
			[...works.keys()],
			token,
			context,
		);
		const dataById = new Map(
			previews.flatMap((game) =>
				game.sources
					.filter((record) => record.source === "kun")
					.map(
						(record) => [record.external_id, record.data as KunData] as const,
					),
			),
		);
		return [...works.values()].map((work): CloudCollectionItem => {
			const data = dataById.get(work.work_id);
			return {
				key: createItemKey("kun", work.work_id),
				source: "kun",
				externalId: work.work_id,
				name: data?.name || `Kungal #${work.work_id}`,
				nameCn: data?.name_cn,
				originalName: data?.name,
				image: data?.image,
				developer: data?.developer,
				playStatus: mapNextmoeStateToPlayStatus(work.work_state?.state),
				userRating: normalizeRating(work.rating?.overall),
				userReview: normalizeReview(work.rating?.short_summary),
			};
		});
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
		case "kun":
			return loadKunCollection(signal);
	}
}

export async function prepareCloudCollectionItems(
	items: CloudCollectionItem[],
	signal: AbortSignal,
	onItemPrepared: (result: PreparedCloudCollectionItem) => void,
	onProgress: (completed: number, total: number) => void,
	checkGameExists: (metadata: GameIdentityPayload) => boolean,
): Promise<PreparedCloudCollectionItem[]> {
	if (items.length === 0) return [];
	const source = items[0].source;
	const prepared: PreparedCloudCollectionItem[] = [];
	const queuedIds = new Set<string>();
	const context = getMetadataRequestContext({ signal });
	const session = new GameMetadataSession({
		...context,
		// Kun 主源保持用户身份，关联增强仍按实际目标来源鉴权。
		authenticateSource: (target, task) =>
			source === "kun" && target === "kun"
				? withNextmoeUserAuth((nextmoeToken, auth) =>
						task({ nextmoeToken, nextmoeUserId: auth.user_id ?? undefined }),
					)
				: context.authenticateSource
					? context.authenticateSource(target, task)
					: task({}),
	});
	const usesSingleSourceFlow = source === "kun" || source === "hikarinagi";
	const isDuplicate = (metadata: GameIdentityPayload) =>
		checkGameExists(metadata) ||
		getGameIdentityKeys(metadata).some((key) => queuedIds.has(key));
	const prepareItem = async (
		item: CloudCollectionItem,
		fetchDetails: (item: CloudCollectionItem) => Promise<GameMetadataDraft>,
	): Promise<PreparedCloudCollectionItem> => {
		if (isDuplicate({ sourceIds: { [item.source]: item.externalId } })) {
			return { item, duplicate: true };
		}
		let metadata = item.metadata ?? (await fetchDetails(item));
		signal.throwIfAborted();
		if (usesSingleSourceFlow) {
			metadata = session.filterSingleSourceDraft(metadata, source);
		}
		// 详情中的关联 ID 已足够判重，不必等待关联元数据请求成功。
		if (isDuplicate(metadata)) return { item, duplicate: true };
		if (usesSingleSourceFlow) {
			metadata = (await session.completeSingleSource(metadata, source)).data;
		}
		signal.throwIfAborted();
		// 增强可能带回新的间接关联，仍需再检查一次并记录最终身份。
		if (isDuplicate(metadata)) return { item, duplicate: true };
		for (const key of getGameIdentityKeys(metadata)) queuedIds.add(key);
		return { item, metadata: withPersonalData(metadata, item) };
	};

	const prepare = async (
		fetchDetails: (item: CloudCollectionItem) => Promise<GameMetadataDraft>,
	) => {
		for (let index = 0; index < items.length; index++) {
			signal.throwIfAborted();
			const item = items[index];
			try {
				const result = await prepareItem(item, fetchDetails);
				prepared.push(result);
				onItemPrepared(result);
			} catch (error) {
				signal.throwIfAborted();
				if (isAbortError(error)) throw error;
				const result = { item, error };
				prepared.push(result);
				onItemPrepared(result);
				// 请求层已完成允许的重试；停止整批，已准备的数据由回调保留供下次采用。
				if (isApiRateLimitError(error)) throw error;
			}
			onProgress(index + 1, items.length);
		}
	};

	if (items.every((item) => item.metadata)) {
		await prepare(async (item) => item.metadata as GameMetadataDraft);
		return prepared;
	}

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

	if (source === "kun") {
		await withNextmoeUserAuth(async () => {
			await prepare((item) => session.getGameByIdDraft(item.externalId, "kun"));
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
			session.getGameByIdDraft(item.externalId, "hikarinagi"),
		);
	});

	return prepared;
}
