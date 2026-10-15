import type { ErogameScapeData, GameMetadataDraft } from "@/types";
import { AppError } from "@/utils/errors";
import {
	createGameCandidate,
	createSourceCandidateRecord,
} from "../sourceCandidate";
import http, {
	type NetworkRequestContext,
	type TauriHttpOptions,
} from "./http";

const EROGAMESCAPE_BASE = "https://erogamescape.org/~ap2/ero/toukei_kaiseki";

const EROGAMESCAPE_HEADERS = {
	Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
	"Accept-Language": "ja,en;q=0.8",
} as const;

const erogamescapeGameQueryRegex = /(?:\?|&|#|\/)game=(\d+)/i;

interface ErogameScapeSearchItem {
	id: string;
	name: string;
	developer?: string;
	date?: string;
}

function buildErogameScapeOptions(
	options: TauriHttpOptions = {},
): TauriHttpOptions {
	return {
		...options,
		headers: {
			...EROGAMESCAPE_HEADERS,
			...options.headers,
		},
		rateLimit: {
			source: "erogamescape",
			minIntervalMs: 3000,
			defaultBackoffMs: 0,
			maxRetries: 0,
		},
	};
}

function normalizeText(raw: string | null | undefined): string {
	return (raw ?? "").trim().replace(/\s+/g, " ");
}

function normalizeNumericId(value: string): string | undefined {
	const trimmed = value.trim();
	if (!/^\d+$/.test(trimmed)) return undefined;
	const normalized = trimmed.replace(/^0+/, "");
	return normalized || undefined;
}

export function normalizeErogameScapeId(raw: string): string | undefined {
	const value = raw.trim();
	if (!value) return undefined;

	const queryMatch = value.match(erogamescapeGameQueryRegex);
	if (queryMatch?.[1]) {
		return normalizeNumericId(queryMatch[1]);
	}

	try {
		const parsedUrl = new URL(value);
		const gameId = parsedUrl.searchParams.get("game");
		if (gameId) return normalizeNumericId(gameId);
	} catch {
		// 非 URL 输入继续按纯数字处理。
	}

	return normalizeNumericId(value);
}

function parseHtml(html: string): Document {
	return new DOMParser().parseFromString(html, "text/html");
}

function buildUrl(path: string, params: Record<string, string>) {
	const url = new URL(`${EROGAMESCAPE_BASE}${path}`);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}
	return url.toString();
}

async function fetchDocument(
	path: string,
	params: Record<string, string>,
	context: NetworkRequestContext = {},
): Promise<Document> {
	const response = await http.getText(
		buildUrl(path, params),
		buildErogameScapeOptions(context),
	);
	return parseHtml(response.data);
}

function extractGameIdFromHref(href: string | null): string | undefined {
	return href ? normalizeErogameScapeId(href) : undefined;
}

function parseSearchDocument(doc: Document): ErogameScapeSearchItem[] {
	const rows = Array.from(doc.querySelectorAll("#result tr"));
	if (rows.length <= 1) return [];

	const positionMap = {
		name: 0,
		brand: 1,
		releaseDate: 2,
	};

	const headerCells = Array.from(rows[0].querySelectorAll("th"));
	headerCells.forEach((cell, index) => {
		const label = normalizeText(cell.textContent);
		if (label === "ゲーム名") positionMap.name = index;
		if (label === "ブランド名") positionMap.brand = index;
		if (label === "発売日") positionMap.releaseDate = index;
	});

	return rows.slice(1).flatMap((row) => {
		const cells = Array.from(row.querySelectorAll("td"));
		const nameCell = cells[positionMap.name];
		const nameAnchor = nameCell?.querySelector("a");
		const id = extractGameIdFromHref(nameAnchor?.getAttribute("href") ?? null);
		const name = normalizeText(
			`${nameAnchor?.textContent ?? ""}${
				nameCell?.querySelector("span")?.textContent ?? ""
			}`,
		);
		if (!id || !name) return [];

		return [
			{
				id,
				name,
				developer: normalizeText(cells[positionMap.brand]?.textContent),
				date: normalizeDate(cells[positionMap.releaseDate]?.textContent),
			},
		];
	});
}

function normalizeSourceUrl(raw: string | null, baseUrl = EROGAMESCAPE_BASE) {
	const value = raw?.trim();
	if (!value) return undefined;
	if (value.startsWith("//")) return `https:${value}`;
	if (value.startsWith("http://") || value.startsWith("https://")) {
		return value;
	}
	if (value.startsWith("/")) {
		return `${baseUrl.replace(/\/$/, "")}${value}`;
	}
	return value;
}

function normalizeDate(raw: string | null | undefined): string | undefined {
	const text = normalizeText(raw);
	if (!text) return undefined;

	const match = text.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
	if (!match) return text;

	const [, year, month, day] = match;
	return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function parseScore(raw: string | null | undefined): number | undefined {
	const match = normalizeText(raw).match(/\d+(?:\.\d+)?/);
	if (!match) return undefined;

	const score = Number(match[0]);
	if (!Number.isFinite(score) || score <= 0) return undefined;
	return Number((score > 10 ? score / 10 : score).toFixed(2));
}

function extractScore(doc: Document): number | undefined {
	const selectors = ["tr#median > td", "tr#average > td"];
	for (const selector of selectors) {
		const score = parseScore(doc.querySelector(selector)?.textContent);
		if (score) return score;
	}

	for (const row of Array.from(doc.querySelectorAll("tr"))) {
		const label = normalizeText(row.querySelector("th")?.textContent);
		if (!label.includes("中央値") && !label.includes("平均値")) continue;

		const score = parseScore(row.querySelector("td")?.textContent);
		if (score) return score;
	}
}

function extractNsfw(doc: Document): boolean | undefined {
	const text = normalizeText(doc.querySelector("tr#erogame > td")?.textContent);
	if (!text) return undefined;
	if (text.includes("非18禁")) return false;
	if (text.includes("18禁")) return true;
}

function extractTags(doc: Document): string[] {
	const tags: string[] = [];
	const addTag = (tag: string) => {
		const normalized = normalizeText(tag);
		if (normalized && !tags.includes(normalized)) {
			tags.push(normalized);
		}
	};

	const nsfwText = normalizeText(
		doc.querySelector("tr#erogame > td")?.textContent,
	);
	for (const token of [
		"18禁",
		"非18禁",
		"抜きゲー",
		"非抜きゲー",
		"和姦もの",
		"陵辱もの",
		"どちらともいえない",
	]) {
		if (nsfwText.includes(token)) addTag(token);
	}

	const allowedHeaders = new Set([
		"公式ジャンル",
		"ジャンル",
		"タグ",
		"シチュエーション",
		"エロシーン",
	]);

	for (const row of Array.from(
		doc.querySelectorAll("table#att_pov_table tr"),
	)) {
		const header = normalizeText(row.querySelector("th")?.textContent);
		if (!allowedHeaders.has(header)) continue;

		for (const link of Array.from(row.querySelectorAll("td a"))) {
			addTag(link.textContent ?? "");
		}
	}

	return tags;
}

function searchItemToDraft(item: ErogameScapeSearchItem): GameMetadataDraft {
	const data: ErogameScapeData = {
		name: item.name,
		developer: item.developer || undefined,
		date: item.date,
	};

	return createGameCandidate({
		idType: "erogamescape",
		source: createSourceCandidateRecord("erogamescape", item.id, data),
	});
}

function transformDetailDocument(
	doc: Document,
	sourceId: string,
): GameMetadataDraft {
	const name =
		normalizeText(
			doc.querySelector("div#soft-title > span.bold")?.textContent,
		) || normalizeText(doc.querySelector("#soft-title .bold")?.textContent);

	if (!name) {
		throw new AppError({
			code: "metadata_not_found",
			message: `ErogameScape entry not found: ${sourceId}`,
		});
	}

	const data: ErogameScapeData = {
		image: normalizeSourceUrl(
			doc.querySelector("div#main_image img")?.getAttribute("src") ?? null,
		),
		name,
		developer:
			normalizeText(doc.querySelector("tr#brand > td")?.textContent) ||
			undefined,
		score: extractScore(doc) ?? null,
		tags: extractTags(doc),
		nsfw: extractNsfw(doc),
		date: normalizeDate(doc.querySelector("tr#sellday > td")?.textContent),
	};

	return createGameCandidate({
		idType: "erogamescape",
		source: createSourceCandidateRecord("erogamescape", sourceId, data),
	});
}

export async function fetchErogameScapeByName(
	name: string,
	limit = 8,
	context: NetworkRequestContext = {},
): Promise<GameMetadataDraft[]> {
	const keyword = name.trim();
	if (!keyword) return [];

	const doc = await fetchDocument(
		"/kensaku.php",
		{
			category: "game",
			word_category: "name",
			mode: "normal",
			word: keyword,
		},
		context,
	);

	return parseSearchDocument(doc).slice(0, limit).map(searchItemToDraft);
}

export async function fetchErogameScapeById(
	id: string,
	context: NetworkRequestContext = {},
): Promise<GameMetadataDraft> {
	const normalizedId = normalizeErogameScapeId(id);
	if (!normalizedId) {
		throw new AppError({
			code: "invalid_game_id",
			message: `Invalid ErogameScape id: ${id}`,
		});
	}

	const doc = await fetchDocument(
		"/game.php",
		{
			game: normalizedId,
		},
		context,
	);

	return transformDetailDocument(doc, normalizedId);
}
