import i18n from "@/providers/i18n";
import type { DlsiteData, GameMetadataDraft } from "@/types";
import { isAbortError } from "@/utils/async";
import { AppError, isApiRateLimitError } from "@/utils/errors";
import {
	createGameCandidate,
	createSourceCandidateRecord,
} from "../sourceCandidate";
import http, {
	type NetworkRequestContext,
	type TauriHttpOptions,
} from "./http";

const DLSITE_BASE = "https://www.dlsite.com";
const DLSITE_LOCALE = "ja";

const dlsiteIdRegex = /\b(?:RJ|RE|VJ)\d{4,}\b/i;

interface DlsiteSearchItem {
	id: string;
	name: string;
	image?: string;
	developer?: string;
}

interface RawDlsiteProductInfo {
	work_name?: string;
	product_name?: string;
	name?: string;
	work_image?: string;
	circle?: string;
	brand?: string;
	maker_name?: string;
	publisher?: string;
	description?: string;
	regist_date?: string;
	age_category?: number | string;
	genre?: string[];
}

type RawDlsiteProductInfoResponse = Record<string, RawDlsiteProductInfo>;

function mapDlsiteLocale(language: string | undefined): string {
	if (language?.startsWith("zh-CN")) return "zh_CN";
	if (language?.startsWith("zh-TW")) return "zh_TW";
	if (language?.startsWith("ja")) return "ja";
	if (language?.startsWith("en")) return "en_US";
	return DLSITE_LOCALE;
}

function buildSearchLocales(): string[] {
	return Array.from(new Set([mapDlsiteLocale(i18n.language), "zh_CN"]));
}

function buildAcceptLanguage(locale: string): string {
	if (locale === "zh_CN") return "zh-CN,zh;q=0.9,ja;q=0.8,en;q=0.7";
	if (locale === "zh_TW") return "zh-TW,zh;q=0.9,ja;q=0.8,en;q=0.7";
	if (locale === "en_US") return "en-US,en;q=0.9,ja;q=0.8";
	return "ja,en;q=0.8";
}

function buildDlsiteOptions(
	options: TauriHttpOptions = {},
	locale = DLSITE_LOCALE,
): TauriHttpOptions {
	return {
		...options,
		headers: {
			Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
			"Accept-Language": buildAcceptLanguage(locale),
			Cookie: `adultchecked=1; locale=${locale}`,
			...options.headers,
		},
		rateLimit: {
			source: "dlsite",
			minIntervalMs: 600,
			defaultBackoffMs: 0,
			maxRetries: 0,
		},
	};
}

function normalizeText(raw: string | null | undefined): string {
	return (raw ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeDlsiteId(raw: string): string | undefined {
	const match = raw.trim().match(dlsiteIdRegex);
	return match?.[0]?.toUpperCase();
}

function getDlsiteSection(id: string): "maniax" | "pro" {
	return id.startsWith("VJ") ? "pro" : "maniax";
}

function buildWorkUrl(id: string) {
	const section = getDlsiteSection(id);
	return `${DLSITE_BASE}/${section}/work/=/product_id/${id}.html?locale=${DLSITE_LOCALE}`;
}

function buildSearchUrl(keyword: string) {
	const encoded = encodeURIComponent(keyword).replace(/%20/g, "+");
	return (locale: string) =>
		`${DLSITE_BASE}/maniax/fsr/=/language/jp/keyword/${encoded}/?locale=${locale}`;
}

function parseHtml(html: string): Document {
	return new DOMParser().parseFromString(html, "text/html");
}

async function fetchDocument(
	url: string,
	context: NetworkRequestContext = {},
	locale = DLSITE_LOCALE,
) {
	const response = await http.getText(url, buildDlsiteOptions(context, locale));
	return parseHtml(response.data);
}

async function fetchProductInfo(
	sourceId: string,
	context: NetworkRequestContext = {},
): Promise<RawDlsiteProductInfo | undefined> {
	const response = await http.get<RawDlsiteProductInfoResponse>(
		`${DLSITE_BASE}/maniax/product/info/ajax`,
		buildDlsiteOptions(
			{
				...context,
				params: {
					product_id: sourceId,
					locale: DLSITE_LOCALE,
				},
				headers: {
					Accept: "application/json",
				},
			},
			DLSITE_LOCALE,
		),
	);

	return response.data?.[sourceId];
}

function normalizeSourceUrl(raw: string | null, baseUrl = DLSITE_BASE) {
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

function firstSrcSetUrl(srcset: string | null): string | undefined {
	const first = srcset?.split(",")[0]?.trim();
	if (!first) return undefined;
	return first.split(/\s+/)[0] || undefined;
}

function getImageCandidates(element: Element): string[] {
	return [
		element.getAttribute("data-src"),
		firstSrcSetUrl(element.getAttribute("srcset")) ?? null,
		element.getAttribute("src"),
	].flatMap((value) => {
		const normalized = normalizeSourceUrl(value);
		return normalized ? [normalized] : [];
	});
}

function extractImageFromElement(root: ParentNode): string | undefined {
	let fallback: string | undefined;

	for (const element of Array.from(root.querySelectorAll("img, source"))) {
		for (const candidate of getImageCandidates(element)) {
			if (!fallback && candidate.includes("_img_smp")) {
				fallback = candidate;
			}
			if (candidate.includes("_img_main")) {
				return candidate;
			}
		}
	}

	return fallback;
}

function normalizeDlsiteListImage(raw: string | null): string | undefined {
	const image = normalizeSourceUrl(raw);
	if (!image || image.startsWith("data:")) return undefined;

	return image
		.replace("/resize/", "/modpub/")
		.replace(/main_240x240\.jpg$/, "main.webp");
}

function extractImageUrlFromText(raw: string | null): string | undefined {
	const match = raw?.match(
		/(?:https?:)?\/\/[^'"\s]+\.(?:webp|jpe?g|png)(?:\?[^'"\s]*)?/i,
	);
	return normalizeDlsiteListImage(match?.[0] ?? null);
}

function extractListThumbnailFromElement(root: ParentNode): string | undefined {
	for (const element of Array.from(root.querySelectorAll("*"))) {
		const candidate =
			extractImageUrlFromText(element.getAttribute("thumb-candidates")) ||
			extractImageUrlFromText(element.getAttribute(":thumb-candidates"));
		if (candidate) return candidate;
	}

	for (const image of Array.from(root.querySelectorAll("img"))) {
		const candidate =
			normalizeDlsiteListImage(
				image.getAttribute("data-src") || image.getAttribute("src"),
			) || extractImageUrlFromText(image.getAttribute(":src"));
		if (candidate) return candidate;
	}
}

function normalizeDate(raw: string | null | undefined): string | undefined {
	const text = normalizeText(raw);
	if (!text) return undefined;

	const match = text.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
	if (!match) return text;

	const [, year, month, day] = match;
	return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

function findInfoCell(
	doc: Document,
	labels: readonly string[],
): Element | null {
	for (const header of Array.from(doc.querySelectorAll("th"))) {
		const label = normalizeText(header.textContent);
		if (labels.some((target) => label.includes(target))) {
			return header.nextElementSibling;
		}
	}
	return null;
}

function extractInfoText(doc: Document, labels: readonly string[]) {
	return normalizeText(findInfoCell(doc, labels)?.textContent);
}

function extractTags(doc: Document): string[] {
	const tags: string[] = [];
	const addTag = (raw: string | null | undefined) => {
		const tag = normalizeText(raw);
		if (tag && !tags.includes(tag)) tags.push(tag);
	};

	for (const link of Array.from(doc.querySelectorAll(".main_genre a"))) {
		addTag(link.textContent);
	}

	for (const labels of [
		["ジャンル"],
		["作品形式"],
		["販売形式"],
		["年齢指定"],
	] as const) {
		const cell = findInfoCell(doc, labels);
		for (const link of Array.from(cell?.querySelectorAll("a") ?? [])) {
			addTag(link.textContent);
		}
	}

	return tags;
}

function extractNsfw(doc: Document): boolean | undefined {
	const ageText = extractInfoText(doc, ["年齢指定", "対象年齢"]);
	if (!ageText) return undefined;
	if (ageText.includes("全年齢") || ageText.includes("一般")) return false;
	if (
		ageText.includes("18") ||
		ageText.includes("成人向け") ||
		ageText.includes("R-18")
	) {
		return true;
	}
}

function computeNsfwFromProductInfo(
	info: RawDlsiteProductInfo | undefined,
): boolean | undefined {
	if (info?.age_category === 3 || info?.age_category === "3") return true;
	if (info?.age_category === 1 || info?.age_category === "1") return false;
}

function mergeTags(
	...tagGroups: Array<readonly string[] | undefined>
): string[] {
	return Array.from(
		new Set(tagGroups.flatMap((tags) => tags?.map(normalizeText) ?? [])),
	).filter(Boolean);
}

function extractProductIdFromElement(element: Element): string | undefined {
	const productId = normalizeDlsiteId(
		element.getAttribute("data-list_item_product_id") ?? "",
	);
	if (productId) return productId;

	const href =
		element.querySelector("a.work_thumb_inner")?.getAttribute("href") ??
		element.querySelector("a[href*='product_id']")?.getAttribute("href") ??
		"";
	return normalizeDlsiteId(href);
}

function getSearchResultRoots(doc: Document): Element[] {
	const roots = new Set<Element>();

	for (const element of Array.from(
		doc.querySelectorAll(".search_result_img_box_inner"),
	)) {
		roots.add(element);
	}

	for (const element of Array.from(
		doc.querySelectorAll("[data-list_item_product_id]"),
	)) {
		const root =
			element.closest(".search_result_img_box_inner") ??
			element.closest("li, tr, .n_worklist_item, .worklist_item") ??
			element;
		roots.add(root);
	}

	return Array.from(roots);
}

function extractSearchResultName(element: Element): string {
	const nameLink =
		element.querySelector(".work_name a") ??
		element.querySelector("[itemprop='name']") ??
		element.querySelector("a[href*='product_id']");
	return normalizeText(
		nameLink?.getAttribute("title") ||
			nameLink?.getAttribute("alt") ||
			nameLink?.textContent,
	);
}

function parseSearchDocument(doc: Document): DlsiteSearchItem[] {
	return getSearchResultRoots(doc).flatMap((element) => {
		const id = extractProductIdFromElement(element);
		const name = extractSearchResultName(element);
		if (!id || !name) return [];

		return [
			{
				id,
				name,
				image: extractListThumbnailFromElement(element),
				developer:
					normalizeText(element.querySelector(".maker_name a")?.textContent) ||
					undefined,
			},
		];
	});
}

function searchItemToDraft(item: DlsiteSearchItem): GameMetadataDraft {
	const data: DlsiteData = {
		image: item.image,
		name: item.name,
		developer: item.developer,
	};

	return createGameCandidate({
		idType: "dlsite",
		source: createSourceCandidateRecord("dlsite", item.id, data),
	});
}

function transformDetailDocument(
	sourceId: string,
	info?: RawDlsiteProductInfo,
	doc?: Document,
): GameMetadataDraft {
	const name =
		normalizeText(doc?.querySelector("#work_name")?.textContent) ||
		normalizeText(info?.work_name) ||
		normalizeText(info?.product_name) ||
		normalizeText(info?.name);
	if (!name) {
		throw new AppError({
			code: "metadata_not_found",
			message: `DLsite entry not found: ${sourceId}`,
		});
	}

	const data: DlsiteData = {
		image:
			(doc ? extractImageFromElement(doc) : undefined) ||
			normalizeSourceUrl(info?.work_image ?? null),
		name,
		summary:
			normalizeText(
				doc?.querySelector('[itemprop="description"]')?.textContent,
			) ||
			normalizeText(info?.description) ||
			undefined,
		tags: mergeTags(info?.genre, doc ? extractTags(doc) : undefined),
		developer:
			normalizeText(doc?.querySelector(".maker_name a")?.textContent) ||
			normalizeText(info?.circle) ||
			normalizeText(info?.brand) ||
			normalizeText(info?.maker_name) ||
			normalizeText(info?.publisher) ||
			undefined,
		nsfw:
			(doc ? extractNsfw(doc) : undefined) ?? computeNsfwFromProductInfo(info),
		date: normalizeDate(
			(doc ? extractInfoText(doc, ["販売日", "発売日", "release"]) : "") ||
				info?.regist_date,
		),
	};

	return createGameCandidate({
		idType: "dlsite",
		source: createSourceCandidateRecord("dlsite", sourceId, data),
	});
}

export async function fetchDlsiteByName(
	name: string,
	limit = 8,
	context: NetworkRequestContext = {},
): Promise<GameMetadataDraft[]> {
	const keyword = name.trim().normalize("NFKC");
	if (!keyword) return [];

	const searchUrl = buildSearchUrl(keyword);
	for (const locale of buildSearchLocales()) {
		const doc = await fetchDocument(searchUrl(locale), context, locale);
		const results = parseSearchDocument(doc);
		if (results.length > 0) {
			return results.slice(0, limit).map(searchItemToDraft);
		}
	}

	return [];
}

export async function fetchDlsiteById(
	id: string,
	context: NetworkRequestContext = {},
): Promise<GameMetadataDraft> {
	const normalizedId = normalizeDlsiteId(id);
	if (!normalizedId) {
		throw new AppError({
			code: "invalid_game_id",
			message: `Invalid DLsite id: ${id}`,
		});
	}

	let info: RawDlsiteProductInfo | undefined;
	let infoError: unknown;
	try {
		info = await fetchProductInfo(normalizedId, context);
	} catch (error) {
		if (isApiRateLimitError(error) || isAbortError(error)) throw error;
		infoError = error;
	}

	let doc: Document | undefined;
	try {
		doc = await fetchDocument(buildWorkUrl(normalizedId), context);
	} catch (error) {
		if (isApiRateLimitError(error) || isAbortError(error)) throw error;
		if (!info) throw infoError ?? error;
	}

	return transformDetailDocument(normalizedId, info, doc);
}
