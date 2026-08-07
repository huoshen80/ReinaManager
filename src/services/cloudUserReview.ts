import { updateUserCollection } from "@/metadata/api/bgm";
import { updateHikarinagiGameRate } from "@/metadata/api/hikarinagi";
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
import { getNetworkRequestContext } from "@/services/requestContext";
import { AppError } from "@/utils/errors";

export type UserReviewPushSource = "bgm" | "vndb" | "hikarinagi";

export interface UserReviewPushPayload {
	rating: number;
	review: string;
	pushBgm: boolean;
	pushVndb: boolean;
	pushHikarinagi: boolean;
	bgmPrivate: boolean;
	hikarinagiSpoiler: boolean;
	hikarinagiTimeToFinishMinutes?: number;
}

export interface UserReviewPushResult {
	source: UserReviewPushSource;
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

async function runPushTarget(
	source: UserReviewPushSource,
	push: () => Promise<boolean>,
): Promise<UserReviewPushResult> {
	try {
		const success = await push();
		return { source, success };
	} catch (error) {
		return { source, success: false, error };
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

	return Promise.all(tasks);
}
