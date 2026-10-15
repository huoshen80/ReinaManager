import type { GameMetadataDraft, KunData, SourceType } from "@/types";
import type {
	NextmoeList,
	NextmoePlayState,
	NextmoeRatingInput,
	NextmoeUserRating,
	NextmoeUserWork,
	NextmoeWork,
	NextmoeWorkState,
	NextmoeWorkTag,
} from "@/types/nextmoe";
import { AppError, HttpResponseError, isHttpStatus } from "@/utils/errors";
import { USER_AGENT } from "../constants";
import type { SourceIdMap } from "../sourceAdapter";
import {
	createGameCandidate,
	createSourceCandidateRecord,
} from "../sourceCandidate";
import { normalizeDlsiteId } from "./dlsite";
import http, {
	type NetworkRequestContext,
	type TauriHttpOptions,
} from "./http";
import { parseRateLimitSeconds, readApiResponseCode } from "./rateLimit";

export interface NextmoeRequestContext extends NetworkRequestContext {
	nextmoeUserId?: string;
}

const NEXTMOE_API_BASE_URL = "https://api.nextmoe.dev/v2/catalog";
const NEXTMOE_USER_API_BASE_URL = "https://api.nextmoe.dev/v2/me";
const NEXTMOE_DETAIL_INCLUDE =
	"titles,refs,intros,companies,ratings,tags,playtimes,releases";
const NEXTMOE_DETAIL_FIELDS =
	"medium,display_name,latin,localized,olang,content_rating,content_limit,cover,titles,refs,intros,companies,ratings,tags,playtimes,releases";

const NEXTMOE_SOURCE_MAP: Partial<Record<string, SourceType>> = {
	bangumi: "bgm",
	vndb: "vndb",
	dlsite: "dlsite",
	erogamescape: "erogamescape",
};

// 标签来源只在本次获取和清洗中使用，避免把多源原始结构泄漏到入库模型。
const draftTagOrigins = new WeakMap<KunData, NextmoeWorkTag[]>();
const draftRefOrigins = new WeakMap<KunData, SourceIdMap>();

async function buildNextmoeOptions(
	token: string | undefined,
	context: NextmoeRequestContext,
): Promise<TauriHttpOptions> {
	const credential = token?.trim();
	// 用户身份跨 Token 刷新保持不变；缺少用户信息时按凭据隔离，匿名按代理出口配置隔离。
	// 只保存摘要作为额度标识，不在队列或日志中保存凭据原文。
	const identity = credential
		? context.nextmoeUserId
			? `user:${context.nextmoeUserId}`
			: `credential:${credential}`
		: `anonymous:${context.proxyUrl?.trim() || "direct"}`;
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(identity),
	);
	const scope = [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
	return {
		...context,
		headers: {
			Accept: "application/json",
			"User-Agent": USER_AGENT,
			...(credential ? { Authorization: `Bearer ${credential}` } : {}),
		},
		rateLimit: {
			source: "nextmoe",
			scope,
			minIntervalMs: credential ? 400 : 800,
			defaultBackoffMs: 60000,
			maxBackoffMs: 60000,
			maxRetries: 2,
			classifyResponse: (status, body) =>
				status === 429 && readApiResponseCode(body) === "QUOTA_EXCEEDED"
					? "quota_exhausted"
					: undefined,
			getResetAfterMs: (headers, reason) => {
				// 分钟 Reset 不能代表日配额恢复；日配额缺少 Retry-After 时保持未知。
				if (reason === "quota_exhausted") return undefined;
				const legacyReset = parseRateLimitSeconds(
					headers.get("X-RateLimit-Reset"),
				);
				const reset =
					/(?:^|,)\s*reset\s*=\s*(\d+(?:\.\d+)?)(?:\s*(?:,|$))/i.exec(
						headers.get("RateLimit") ?? "",
					);
				return legacyReset ?? parseRateLimitSeconds(reset?.[1] ?? null);
			},
		},
	};
}

function uniqueNames(names: Array<string | null | undefined>): string[] {
	return [
		...new Set(names.map((name) => name?.trim()).filter(Boolean)),
	] as string[];
}

function isGameWork(work: NextmoeWork): boolean {
	return work.medium === "galgame" || work.medium === "doujin_game";
}

function assertNextmoeWorkId(id: string): void {
	if (!/^\d+$/.test(id)) {
		throw new AppError({
			code: "invalid_game_id",
			message: `Invalid NextMoe id: ${id}`,
		});
	}
}

function normalizeRefId(source: SourceType, id: string): string | undefined {
	const value = id.trim();
	switch (source) {
		case "vndb":
			// 作品 refs 同时可能带 release r-ID，不能当成 VN 身份写入。
			return /^v\d+$/i.test(value) ? value.toLowerCase() : undefined;
		case "dlsite":
			return /^(RJ|VJ)\d+$/i.test(value) ? normalizeDlsiteId(value) : undefined;
		case "bgm":
		case "erogamescape":
			return /^\d+$/.test(value) ? value : undefined;
		default:
			return undefined;
	}
}

/** 同源出现多个有效作品 ID 时不自动挑选，避免将不同版本误绑定。 */
export function extractNextmoeSourceIds(work: NextmoeWork): SourceIdMap {
	const references = new Map<SourceType, Set<string>>();
	for (const ref of work.refs ?? []) {
		const source = NEXTMOE_SOURCE_MAP[ref.source];
		if (typeof source !== "string") continue;
		const id = normalizeRefId(source, ref.external_id);
		if (!id) continue;
		const ids = references.get(source) ?? new Set<string>();
		ids.add(id);
		references.set(source, ids);
	}
	const sourceIds: SourceIdMap = {};
	for (const [source, ids] of references) {
		if (ids.size === 1) sourceIds[source] = [...ids][0];
	}
	return sourceIds;
}

function cleanTags(
	tags: readonly NextmoeWorkTag[],
	spoilerLevel: number,
	replacedSources: ReadonlySet<SourceType> = new Set(),
): string[] {
	const levels = { none: 0, minor: 1, major: 2 };
	return uniqueNames(
		tags
			.filter((tag) => {
				const source = NEXTMOE_SOURCE_MAP[tag.source];
				return (
					tag.tier !== "hidden" &&
					levels[tag.spoiler] <= spoilerLevel &&
					(typeof source !== "string" || !replacedSources.has(source))
				);
			})
			.map((tag) => tag.display_name),
	);
}

/** 只使用正式发行日期，不能用体验版的最早日期代替作品正式发售日。 */
export function getNextmoeFormalReleaseDate(
	work: NextmoeWork,
): string | undefined {
	const dates = (work.releases ?? [])
		.filter((release) =>
			["default", "digital", "physical"].includes(release.release_kind),
		)
		.map((release) => release.date)
		.filter((date): date is string => {
			if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
			const time = Date.parse(`${date}T00:00:00Z`);
			return (
				Number.isFinite(time) &&
				new Date(time).toISOString().slice(0, 10) === date
			);
		});
	return dates.toSorted()[0];
}

/** 样本数优先；未提供有效样本数和同票时，使用稳定的来源优先级。 */
export function getNextmoeAverageHours(work: NextmoeWork): number | undefined {
	let selected: { minutes: number; votes: number } | undefined;
	for (const source of ["vndb", "erogamescape", "nextmoe"]) {
		for (const item of work.playtimes ?? []) {
			if (
				item.source !== source ||
				!Number.isFinite(item.minutes) ||
				item.minutes <= 0
			)
				continue;
			const votes =
				Number.isFinite(item.vote_count) && item.vote_count > 0
					? item.vote_count
					: 0;
			if (!selected || votes > selected.votes)
				selected = { minutes: item.minutes, votes };
		}
	}
	return selected ? Number((selected.minutes / 60).toFixed(1)) : undefined;
}

export function transformNextmoeWork(
	work: NextmoeWork,
	spoilerLevel = 0,
): GameMetadataDraft {
	const chineseTitle =
		work.localized?.["zh-Hans"]?.value ||
		work.titles?.find((title) => /^zh(-Hans|-CN)?$/i.test(title.lang))?.title ||
		work.localized?.["zh-Hant"]?.value ||
		work.titles?.find((title) => /^zh/i.test(title.lang))?.title;
	const intros = (work.intros ?? []).filter((intro) => intro.value?.trim());
	const summary =
		intros.find((intro) => /^zh/i.test(intro.lang) && !intro.is_machine) ||
		intros.find((intro) => /^zh/i.test(intro.lang)) ||
		intros.find((intro) => intro.lang === work.olang && !intro.is_machine) ||
		intros.find((intro) => !intro.is_machine) ||
		intros[0];
	const rating = work.ratings?.find((item) => item.source === "nextmoe");
	const rawTags = (work.tags ?? []).filter(
		(tag) =>
			tag.tier !== "hidden" &&
			{ none: 0, minor: 1, major: 2 }[tag.spoiler] <= spoilerLevel,
	);
	const allTitles = uniqueNames([
		work.display_name,
		work.latin,
		...Object.values(work.localized ?? {}).map((title) => title.value),
		...(work.titles ?? []).flatMap((title) => [title.title, title.latin]),
	]);
	const data: KunData = {
		name: work.display_name,
		name_cn: chineseTitle,
		image: work.cover?.url,
		summary: summary?.value,
		developer:
			uniqueNames(
				(work.companies ?? [])
					.filter((company) => company.attribution_role === "developer")
					.map((company) => company.display_name),
			).join("/") || undefined,
		date: getNextmoeFormalReleaseDate(work),
		nsfw: work.content_rating === "r18" || work.content_limit === "nsfw",
		all_titles: allTitles,
		aliases: allTitles.filter(
			(title) => title !== work.display_name && title !== chineseTitle,
		),
		tags: cleanTags(rawTags, spoilerLevel),
		// 不把来自其他站点的评分伪装成 NextMoe 或真实上游元数据。
		score: rating && Number.isFinite(rating.score) ? rating.score : undefined,
		average_hours: getNextmoeAverageHours(work),
	};
	draftTagOrigins.set(data, rawTags);
	const references = extractNextmoeSourceIds(work);
	draftRefOrigins.set(data, references);
	return createGameCandidate({
		idType: "kun",
		sources: [
			createSourceCandidateRecord("kun", work.id, data),
			...Object.entries(references).map(([source, id]) =>
				createSourceCandidateRecord(source as SourceType, id, null),
			),
		],
	});
}

/** 扩展成功后只移除该源的转译标签，失败和未知来源的标签仍然保留。 */
export function cleanNextmoeTags(
	data: KunData,
	adoptedIds: SourceIdMap,
): KunData {
	const rawTags = draftTagOrigins.get(data);
	if (!rawTags) return data;
	const refs = draftRefOrigins.get(data) ?? {};
	const replacedSources = new Set(
		(Object.keys(adoptedIds) as SourceType[]).filter(
			(source) => !refs[source] || refs[source] === adoptedIds[source],
		),
	);
	const cleaned = { ...data, tags: cleanTags(rawTags, 2, replacedSources) };
	draftTagOrigins.set(
		cleaned,
		rawTags.filter((tag) => {
			const source = NEXTMOE_SOURCE_MAP[tag.source];
			return typeof source !== "string" || !replacedSources.has(source);
		}),
	);
	draftRefOrigins.set(cleaned, refs);
	return cleaned;
}

export async function fetchNextmoeById(
	id: string,
	token?: string,
	spoilerLevel = 0,
	context: NextmoeRequestContext = {},
): Promise<GameMetadataDraft> {
	assertNextmoeWorkId(id);
	const visited = new Set<string>();
	let currentId = id;
	while (true) {
		context.signal?.throwIfAborted();
		visited.add(currentId);
		let work: NextmoeWork;
		try {
			work = (
				await http.get<NextmoeWork>(
					`${NEXTMOE_API_BASE_URL}/works/${currentId}`,
					{
						...(await buildNextmoeOptions(token, context)),
						params: {
							include: NEXTMOE_DETAIL_INCLUDE,
							fields: NEXTMOE_DETAIL_FIELDS,
							nsfw: true,
							spoiler:
								spoilerLevel >= 2
									? "major"
									: spoilerLevel >= 1
										? "minor"
										: "none",
						},
					},
				)
			).data;
		} catch (error) {
			const problem =
				error instanceof HttpResponseError ? error.body : undefined;
			// 只跟随作品合并的规范 ID，普通 404 保持失败；限制跳数并拒绝循环。
			if (
				error instanceof HttpResponseError &&
				error.status === 404 &&
				problem !== null &&
				typeof problem === "object" &&
				"code" in problem &&
				problem.code === "ENTITY_MERGED" &&
				"object" in problem &&
				problem.object === "work" &&
				"current_id" in problem &&
				typeof problem.current_id === "string" &&
				/^[1-9]\d*$/.test(problem.current_id) &&
				!visited.has(problem.current_id) &&
				visited.size <= 3
			) {
				currentId = problem.current_id;
				continue;
			}
			throw error;
		}
		if (!work?.id || work.object !== "work" || !isGameWork(work)) {
			throw new AppError({
				code: "metadata_not_found",
				message: `NextMoe game not found: ${currentId}`,
			});
		}
		return transformNextmoeWork(work, spoilerLevel);
	}
}

export async function fetchNextmoeByName(
	name: string,
	token?: string,
	limit = 8,
	context: NextmoeRequestContext = {},
): Promise<GameMetadataDraft[]> {
	const keyword = name.trim();
	if (!keyword) return [];
	// 作品列表按标题搜索即可返回预览，避免先取命中 ID 再批量读取作品。
	const works =
		(
			await http.get<NextmoeList<NextmoeWork>>(
				`${NEXTMOE_API_BASE_URL}/works`,
				{
					...(await buildNextmoeOptions(token, context)),
					params: {
						q: keyword,
						nsfw: true,
						limit: Number.isFinite(limit)
							? Math.min(100, Math.max(1, Math.floor(limit)))
							: 8,
						include: "titles,companies",
						fields:
							"medium,display_name,latin,localized,olang,content_rating,content_limit,cover,companies",
					},
				},
			)
		).data.items ?? [];
	return works.filter(isGameWork).map((work) => transformNextmoeWork(work));
}

/** 收藏列表仅取预览，用户采用条目时仍需补全详情。 */
export async function fetchNextmoeWorkPreviews(
	ids: readonly string[],
	token: string,
	context: NextmoeRequestContext = {},
): Promise<GameMetadataDraft[]> {
	ids.forEach(assertNextmoeWorkId);
	const games: GameMetadataDraft[] = [];
	for (let index = 0; index < ids.length; index += 100) {
		const page = (
			await http.get<NextmoeList<NextmoeWork>>(
				`${NEXTMOE_API_BASE_URL}/works`,
				{
					...(await buildNextmoeOptions(token, context)),
					params: {
						ids: ids.slice(index, index + 100).join(","),
						nsfw: true,
						include: "titles,companies",
					},
				},
			)
		).data;
		games.push(
			...page.items
				.filter(isGameWork)
				.map((work) => transformNextmoeWork(work)),
		);
	}
	return games;
}

export async function fetchNextmoeUserWorksPage(
	token: string,
	cursor?: string,
	context: NextmoeRequestContext = {},
): Promise<NextmoeList<NextmoeUserWork>> {
	return (
		await http.get<NextmoeList<NextmoeUserWork>>(
			`${NEXTMOE_USER_API_BASE_URL}/works`,
			{
				...(await buildNextmoeOptions(token, context)),
				params: { cursor, limit: 100, nsfw: true },
			},
		)
	).data;
}

export async function fetchNextmoeWorkStates(
	ids: readonly string[],
	token: string,
	context: NextmoeRequestContext = {},
): Promise<NextmoeWorkState[]> {
	ids.forEach(assertNextmoeWorkId);
	const states: NextmoeWorkState[] = [];
	for (let index = 0; index < ids.length; index += 100) {
		const page = (
			await http.get<NextmoeList<NextmoeWorkState>>(
				`${NEXTMOE_USER_API_BASE_URL}/work-states`,
				{
					...(await buildNextmoeOptions(token, context)),
					params: {
						work_ids: ids.slice(index, index + 100).join(","),
						nsfw: true,
					},
				},
			)
		).data;
		states.push(...page.items);
	}
	return states;
}

export async function fetchNextmoeWorkState(
	id: string,
	token: string,
	context: NextmoeRequestContext = {},
): Promise<NextmoeWorkState | null> {
	assertNextmoeWorkId(id);
	try {
		return (
			await http.get<NextmoeWorkState>(
				`${NEXTMOE_USER_API_BASE_URL}/work-states/${id}`,
				await buildNextmoeOptions(token, context),
			)
		).data;
	} catch (error) {
		if (isHttpStatus(error, 404)) return null;
		throw error;
	}
}

export async function updateNextmoeWorkState(
	id: string,
	state: NextmoePlayState,
	token: string,
	context: NextmoeRequestContext = {},
): Promise<boolean> {
	assertNextmoeWorkId(id);
	// PUT 未携带 completion 会清空远端值；本地没有该字段时先读取并保留它。
	// wish 不允许 completion，回到想玩时则按接口规则移除。
	const previous =
		state === "wish" ? null : await fetchNextmoeWorkState(id, token, context);
	await http.put<NextmoeWorkState>(
		`${NEXTMOE_USER_API_BASE_URL}/work-states/${id}`,
		{
			state,
			...(previous?.completion ? { completion: previous.completion } : {}),
		},
		await buildNextmoeOptions(token, context),
	);
	return true;
}

export async function updateNextmoePlaytime(
	id: string,
	minutes: number,
	token: string,
	context: NextmoeRequestContext = {},
): Promise<boolean> {
	assertNextmoeWorkId(id);
	if (!Number.isInteger(minutes) || minutes < 0 || minutes > 60000) {
		throw new AppError({
			code: "nextmoe_playtime_invalid",
			message: "Kungal 游玩时长须为 0–60000 分钟（最多 1000 小时）。",
		});
	}
	// 上报本应用的累计总分钟数；可以调小，不读取云端值相加。
	await http.put(
		`${NEXTMOE_USER_API_BASE_URL}/playtimes/${id}`,
		{ minutes },
		await buildNextmoeOptions(token, context),
	);
	return true;
}

export async function updateNextmoeUserRating(
	id: string,
	rating: NextmoeRatingInput,
	token: string,
	context: NextmoeRequestContext = {},
): Promise<boolean> {
	assertNextmoeWorkId(id);
	if (
		!Number.isInteger(rating.overall) ||
		rating.overall < 1 ||
		rating.overall > 10
	) {
		throw new AppError({
			code: "nextmoe_rating_required",
			message: "Kungal 暂不支持单独清空评分，请填写 1–10 分或取消勾选 Kungal。",
		});
	}
	if (Array.from(rating.short_summary).length > 2000) {
		throw new AppError({
			code: "nextmoe_review_too_long",
			message: "Kungal 短评不能超过 2000 字，请缩短后重试。",
		});
	}
	const url = `${NEXTMOE_USER_API_BASE_URL}/ratings/${id}`;
	const options = await buildNextmoeOptions(token, context);
	let previous: NextmoeUserRating | null;
	try {
		previous = (await http.get<NextmoeUserRating>(url, options)).data;
	} catch (error) {
		if (!isHttpStatus(error, 404)) throw error;
		previous = null;
	}
	// PUT 整体替换评价；保留本地不编辑的字段，首次发布补齐接口要求的默认值。
	await http.put<NextmoeUserRating>(
		url,
		{
			...rating,
			recommend: previous?.recommend ?? "neutral",
			...(previous?.aspect_scores
				? { aspect_scores: previous.aspect_scores }
				: {}),
		},
		options,
	);
	return true;
}
