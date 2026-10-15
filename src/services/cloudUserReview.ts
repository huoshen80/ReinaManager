import { updateUserCollection } from "@/metadata/api/bgm";
import { updateHikarinagiGameRate } from "@/metadata/api/hikarinagi";
import {
	updateNextmoePlaytime,
	updateNextmoeUserRating,
} from "@/metadata/api/nextmoe";
import {
	fetchVndbCurrentUserProfile,
	updateVndbUserCollection,
} from "@/metadata/api/vndb";
import {
	getAnySourceId,
	type SourceIdentityPayload,
} from "@/metadata/sourceRecord";
import { getVndbToken } from "@/services/cloudPlayStatus/shared";
import { withBgmAuth } from "@/services/oauth/bgmAuthSession";
import { withHikarinagiAuth } from "@/services/oauth/hikarinagiAuthSession";
import { withNextmoeUserAuth } from "@/services/oauth/nextmoeAuthSession";
import { getNetworkRequestContext } from "@/services/requestContext";
import { AppError } from "@/utils/errors";

export type UserReviewPushSource = "bgm" | "vndb" | "hikarinagi" | "kun";

export interface UserReviewPushPayload {
	rating: number;
	review: string;
	pushBgm: boolean;
	pushVndb: boolean;
	pushHikarinagi: boolean;
	pushKun: boolean;
	bgmPrivate: boolean;
	hikarinagiPrivate: boolean;
	hikarinagiSpoiler: boolean;
	kunSpoiler: boolean;
	hikarinagiTimeToFinishMinutes?: number;
	kunPlaytimeMinutes?: number;
}

export interface UserReviewPushResult {
	source: UserReviewPushSource;
	kind: "review" | "playtime";
	success: boolean;
	error?: unknown;
}

export function normalizeUserRating(value: number): number {
	if (!Number.isFinite(value) || value <= 0) return 0;
	const rounded = Math.round(value * 10) / 10;
	return Math.min(10, Math.max(1, rounded));
}

export function hasUserRating(
	value: number | null | undefined,
): value is number {
	return typeof value === "number" && value > 0;
}

export function shouldPushUserReview(
	source: UserReviewPushSource,
	rating: number,
): boolean {
	// Kungal 的评价必须带评分；其它站点仍允许用 0 清空云端评分。
	return source !== "kun" || hasUserRating(normalizeUserRating(rating));
}

function mapRatingToBgmRate(rating: number) {
	return rating <= 0 ? 0 : Math.round(rating);
}

function mapRatingToHikarinagiRate(rating: number) {
	return rating <= 0 ? null : Math.round(rating);
}

function mapRatingToVndbVote(rating: number) {
	return rating <= 0 ? null : Math.round(rating * 10);
}

function getReviewText(review: string) {
	return review.trim() ? review : "";
}

export async function pushGameUserReviewToBgm(
	game: SourceIdentityPayload,
	payload: UserReviewPushPayload,
) {
	const bgmId = getAnySourceId(game, "bgm");
	if (!bgmId) {
		throw new AppError({
			code: "bgm_id_missing",
			message: "当前游戏没有 Bangumi ID",
		});
	}

	return withBgmAuth(async (token) => {
		if (!token) {
			throw new AppError({
				code: "bgm_auth_missing",
				message: "未配置 Bangumi 登录",
			});
		}

		return updateUserCollection(
			bgmId,
			{
				rate: mapRatingToBgmRate(normalizeUserRating(payload.rating)),
				comment: getReviewText(payload.review),
				private: payload.bgmPrivate,
			},
			token,
			getNetworkRequestContext(),
		);
	});
}

export async function pushGameUserReviewToVndb(
	game: SourceIdentityPayload,
	payload: UserReviewPushPayload,
) {
	const vndbId = getAnySourceId(game, "vndb");
	if (!vndbId) {
		throw new AppError({
			code: "vndb_id_missing",
			message: "当前游戏没有 VNDB ID",
		});
	}

	const token = await getVndbToken();
	if (!token) {
		throw new AppError({
			code: "vndb_token_missing",
			message: "未配置 VNDB Token",
		});
	}

	const profile = await fetchVndbCurrentUserProfile(
		token,
		getNetworkRequestContext(),
	);
	if (!profile?.permissions.includes("listwrite")) {
		throw new AppError({
			code: "vndb_listwrite_missing",
			message: "VNDB Token 缺少 listwrite 权限",
		});
	}

	const review = getReviewText(payload.review);
	return updateVndbUserCollection(
		vndbId,
		{
			vote: mapRatingToVndbVote(normalizeUserRating(payload.rating)),
			notes: review ? review : null,
		},
		token,
		getNetworkRequestContext(),
	);
}

export async function pushGameUserReviewToHikarinagi(
	game: SourceIdentityPayload,
	payload: UserReviewPushPayload,
) {
	const hikarinagiId = getAnySourceId(game, "hikarinagi");
	if (!hikarinagiId) {
		throw new AppError({
			code: "hikarinagi_id_missing",
			message: "当前游戏没有 Hikarinagi ID",
		});
	}

	return withHikarinagiAuth(async (token) => {
		if (!token) {
			throw new AppError({
				code: "hikarinagi_auth_missing",
				message: "未配置 Hikarinagi 登录",
			});
		}

		const updatePayload = {
			rate: mapRatingToHikarinagiRate(normalizeUserRating(payload.rating)),
			rate_content: getReviewText(payload.review),
			is_spoiler: payload.hikarinagiSpoiler,
			status_private: payload.hikarinagiPrivate,
			...(payload.hikarinagiTimeToFinishMinutes !== undefined
				? { time_to_finish_minutes: payload.hikarinagiTimeToFinishMinutes }
				: {}),
		};

		return updateHikarinagiGameRate(
			hikarinagiId,
			updatePayload,
			token,
			getNetworkRequestContext(),
		);
	});
}

export async function pushGameUserReviewToKun(
	game: SourceIdentityPayload,
	payload: UserReviewPushPayload,
) {
	const kunId = getAnySourceId(game, "kun");
	if (!kunId) {
		throw new AppError({
			code: "kun_id_missing",
			message: "当前游戏没有 Kungal ID",
		});
	}
	return withNextmoeUserAuth((token, auth) =>
		updateNextmoeUserRating(
			kunId,
			{
				overall: Math.round(normalizeUserRating(payload.rating)),
				short_summary: getReviewText(payload.review),
				// 二态开关不区分剧透程度，开启时使用最严格的标记以免泄露剧情。
				spoiler_level: payload.kunSpoiler ? "serious" : "none",
			},
			token,
			{
				...getNetworkRequestContext(),
				nextmoeUserId: auth.user_id ?? undefined,
			},
		),
	);
}

export async function pushGamePlaytimeToKun(
	game: SourceIdentityPayload,
	minutes: number,
) {
	const kunId = getAnySourceId(game, "kun");
	if (!kunId) {
		throw new AppError({
			code: "kun_id_missing",
			message: "当前游戏没有 Kungal ID",
		});
	}
	return withNextmoeUserAuth((token, auth) =>
		updateNextmoePlaytime(kunId, minutes, token, {
			...getNetworkRequestContext(),
			nextmoeUserId: auth.user_id ?? undefined,
		}),
	);
}

async function runPushTarget(
	source: UserReviewPushSource,
	push: () => Promise<boolean>,
	kind: UserReviewPushResult["kind"] = "review",
): Promise<UserReviewPushResult> {
	try {
		const success = await push();
		return { source, kind, success };
	} catch (error) {
		return { source, kind, success: false, error };
	}
}

export async function pushGameUserReviewToCloud(
	game: SourceIdentityPayload,
	payload: UserReviewPushPayload,
): Promise<UserReviewPushResult[]> {
	const tasks: Array<Promise<UserReviewPushResult>> = [];

	if (payload.pushBgm) {
		tasks.push(
			runPushTarget("bgm", () => pushGameUserReviewToBgm(game, payload)),
		);
	}
	if (payload.pushVndb) {
		tasks.push(
			runPushTarget("vndb", () => pushGameUserReviewToVndb(game, payload)),
		);
	}
	if (payload.pushHikarinagi) {
		tasks.push(
			runPushTarget("hikarinagi", () =>
				pushGameUserReviewToHikarinagi(game, payload),
			),
		);
	}
	if (payload.pushKun) {
		if (shouldPushUserReview("kun", payload.rating)) {
			tasks.push(
				runPushTarget("kun", () => pushGameUserReviewToKun(game, payload)),
			);
		}
		const minutes = payload.kunPlaytimeMinutes;
		if (minutes !== undefined) {
			tasks.push(
				runPushTarget(
					"kun",
					() => pushGamePlaytimeToKun(game, minutes),
					"playtime",
				),
			);
		}
	}

	return Promise.all(tasks);
}
