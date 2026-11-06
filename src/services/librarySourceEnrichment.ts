import { getDisplayGameData } from "@/metadata/data/dataTransform";
import { getDisplayPreferences } from "@/metadata/data/displayPreferences";
import { GameMetadataSession } from "@/metadata/data/gameMetadataService";
import { getGameIdentityKeys } from "@/metadata/data/metadata";
import { candidateSourcesToGameSources } from "@/metadata/sourceCandidate";
import { getRuntimeSourceAdapter } from "@/metadata/sourceRegistry";
import i18n from "@/providers/i18n";
import { gameService, settingsService } from "@/services/invoke";
import { getMetadataRequestContext } from "@/services/requestContext";
import { useStore } from "@/store/appStore";
import type {
	FullGameData,
	GameMetadataDraft,
	SourceType,
	UpdateGameParams,
} from "@/types";
import { isSourceType } from "@/types";
import { isAbortError } from "@/utils/async";
import { getUserErrorMessage } from "@/utils/errors";
import { getGameDisplayName } from "@/utils/game";

export interface LibraryEnrichmentItem {
	game: FullGameData;
	name: string;
	origin: "kun" | "hikarinagi";
	originId: string;
	missingSources: SourceType[];
	draft?: GameMetadataDraft;
	failedSources: SourceType[];
	conflicts: string[];
	associationConflicts?: string[];
	kunFallbackCompleted?: boolean;
	error?: string;
	completed?: boolean;
}

function getLibraryEnrichmentTargets(
	game: FullGameData,
	enabledSources: readonly SourceType[],
): SourceType[] {
	const available = new Set<SourceType>();
	for (const record of game.sources) {
		if (!isSourceType(record.source) || !record.external_id) continue;
		const adapter = getRuntimeSourceAdapter(record.source);
		if (!adapter.validateId(record.external_id)) continue;
		available.add(record.source);
		for (const source of adapter.associatedSourceKeys ?? [])
			available.add(source);
	}
	return enabledSources.filter((source) => available.has(source));
}

export function createLibraryEnrichmentItems(
	games: FullGameData[],
	enabledSources: readonly SourceType[],
): LibraryEnrichmentItem[] {
	const items = games.flatMap((game): LibraryEnrichmentItem[] => {
		if (!["kun", "hikarinagi", "mixed"].includes(game.id_type ?? "")) return [];
		const origin = game.sources.some(
			(record) =>
				record.source === "hikarinagi" &&
				record.external_id &&
				getRuntimeSourceAdapter("hikarinagi").validateId(record.external_id),
		)
			? "hikarinagi"
			: "kun";
		const id = game.sources.find(
			(record) => record.source === origin,
		)?.external_id;
		if (!id || !getRuntimeSourceAdapter(origin).validateId(id)) return [];
		const targets = [
			...new Set<SourceType>([
				origin,
				...getLibraryEnrichmentTargets(game, enabledSources),
			]),
		];
		// 缺少无法取得关联的来源不构成补全任务；多个 ID 仍可能只有空资料。
		if (
			targets.every((source) =>
				game.sources.some(
					(record) => record.source === source && record.data != null,
				),
			)
		)
			return [];
		return [
			{
				game,
				name: getGameDisplayName(
					getDisplayGameData(game, getDisplayPreferences(useStore.getState())),
				),
				origin,
				originId: id,
				missingSources: targets.filter((source) =>
					game.sources.some(
						(record) =>
							record.source === source &&
							record.data == null &&
							record.external_id &&
							getRuntimeSourceAdapter(source).validateId(record.external_id),
					),
				),
				failedSources: [],
				conflicts: [],
			},
		];
	});
	return checkLibraryEnrichmentConflicts(items, games);
}

/** 只补缺失来源或已有 ID 的空资料，不刷新旧资料，也不写入运行配置。 */
export function buildLibraryEnrichmentUpdate(
	item: LibraryEnrichmentItem,
	game: FullGameData,
): UpdateGameParams {
	const additions = (item.draft?.sources ?? []).filter((record) => {
		const existing = game.sources.find((old) => old.source === record.source);
		return (
			!existing ||
			(existing.data == null &&
				record.data != null &&
				(!existing.external_id || existing.external_id === record.external_id))
		);
	});
	const sources = new Map(
		game.sources.map((record) => [record.source, record]),
	);
	const upserts = candidateSourcesToGameSources(additions);
	for (const record of upserts) sources.set(record.source, record);
	return {
		upsert_sources: upserts,
		...(upserts.length &&
		[...sources.values()].filter((record) => record.data != null).length >= 2
			? { id_type: "mixed" }
			: {}),
	};
}

/** 同时索引库内身份与本轮草稿；排除自身，避免第一项自动占用身份。 */
export function checkLibraryEnrichmentConflicts(
	items: LibraryEnrichmentItem[],
	games: FullGameData[],
): LibraryEnrichmentItem[] {
	const library = new Map(games.map((game) => [game.id, game]));
	const names = new Map<number, string>(
		items.map((item) => [item.game.id, item.name]),
	);
	for (const game of games)
		names.set(
			game.id,
			getGameDisplayName(
				getDisplayGameData(game, getDisplayPreferences(useStore.getState())),
			),
		);
	const owners = new Map<string, Set<number>>();
	const register = (id: number, payload: FullGameData | GameMetadataDraft) => {
		for (const key of getGameIdentityKeys(payload)) {
			const members = owners.get(key) ?? new Set<number>();
			members.add(id);
			owners.set(key, members);
		}
	};
	for (const game of games) register(game.id, game);
	for (const item of items) if (item.draft) register(item.game.id, item.draft);
	return items.map((item) => {
		const game = library.get(item.game.id);
		const conflicts = [...(item.associationConflicts ?? [])];
		if (
			!game ||
			game.id_type !== item.game.id_type ||
			game.sources.find((record) => record.source === item.origin)
				?.external_id !== item.originId ||
			item.game.sources.some((before) => {
				const current = game?.sources.find(
					(record) => record.source === before.source,
				);
				return (
					before.external_id !== current?.external_id ||
					(before.data != null && current?.data == null)
				);
			})
		) {
			conflicts.push(
				i18n.t(
					"libraryEnrichment.changed",
					"游戏已删除或来源已更改，请关闭后重新打开。",
				),
			);
		}
		for (const record of item.draft?.sources ?? item.game.sources) {
			if (!isSourceType(record.source) || !record.external_id) continue;
			const existing = game?.sources.find(
				(old) => old.source === record.source,
			);
			const source = getRuntimeSourceAdapter(record.source).label;
			if (
				existing?.external_id &&
				existing.external_id !== record.external_id
			) {
				conflicts.push(
					i18n.t(
						"libraryEnrichment.idConflict",
						"{{source}}：已有 {{old}}，关联为 {{next}}",
						{
							source,
							old: existing.external_id,
							next: record.external_id,
						},
					),
				);
			}
			const others = [
				...(owners.get(`${record.source}:${record.external_id}`) ?? []),
			].filter((id) => id !== item.game.id);
			if (others.length)
				conflicts.push(
					i18n.t(
						"libraryEnrichment.libraryConflict",
						"{{source}} · {{id}} 与 {{games}} 关联冲突",
						{
							source,
							id: record.external_id,
							games: others.map((id) => names.get(id)).join("、"),
						},
					),
				);
		}
		return { ...item, conflicts };
	});
}

export async function prepareLibraryEnrichment(
	items: LibraryEnrichmentItem[],
	selected: ReadonlySet<number>,
	signal: AbortSignal,
	onProgress: (
		stage: "primary" | "expansion",
		completed: number,
		total: number,
	) => void,
): Promise<LibraryEnrichmentItem[]> {
	const settings = await settingsService.getAllSettings();
	const context = getMetadataRequestContext({ signal });
	const enabled = (context.mixedEnabledSources ?? []).filter(
		(source) => source !== "bgm" || settings.bgm_auth?.access_token,
	);
	const session = new GameMetadataSession({
		...context,
		mixedEnabledSources: enabled,
		// 手动操作不受自动增强开关控制，来源范围仍使用 Mixed 设置。
		autoExpandSources: ["kun", "hikarinagi"],
	});
	let next = items.map((item) => ({ ...item }));
	const targets = next.filter((item) => selected.has(item.game.id));
	const failedLookups = new Set<number>();
	const hasMissingIds = (draft: GameMetadataDraft, game: FullGameData) =>
		getLibraryEnrichmentTargets(game, enabled).some(
			(source) =>
				!draft.sources.some(
					(record) =>
						record.source === source &&
						getRuntimeSourceAdapter(source).validateId(record.external_id),
				),
		);
	const fail = (item: LibraryEnrichmentItem, error: unknown) => {
		item.error = getUserErrorMessage(
			error,
			i18n.t.bind(i18n),
			i18n.t("errors.unknownError", "未知错误"),
		);
	};
	onProgress("primary", 0, targets.length);
	for (const [index, item] of targets.entries()) {
		if (signal.aborted) break;
		item.error = undefined;
		try {
			if (!item.draft) {
				const saved: GameMetadataDraft = {
					sources: item.game.sources.flatMap((record) =>
						isSourceType(record.source) && record.external_id
							? [
									{
										...record,
										source: record.source,
										external_id: record.external_id,
									},
								]
							: [],
					),
				};
				const hasOriginData = saved.sources.some(
					(record) => record.source === item.origin && record.data != null,
				);
				const needsDetails = !hasOriginData || hasMissingIds(saved, item.game);
				const fetched = needsDetails
					? await session.getGameByIdDraft(item.originId, item.origin, {
							referencesOnly: item.origin === "kun" && hasOriginData,
						})
					: saved;
				// 身份不一致时保留远端 ID 供判冲突；同身份的旧完整资料优先保留。
				item.draft = session.filterSingleSourceDraft(
					{
						sources: [
							...fetched.sources.map(
								(record) =>
									saved.sources.find(
										(old) =>
											old.source === record.source &&
											old.external_id === record.external_id &&
											old.data != null,
									) ?? record,
							),
							...saved.sources.filter(
								(record) =>
									!fetched.sources.some(
										(fresh) => fresh.source === record.source,
									),
							),
						],
					},
					item.origin,
				);
			}
			const kunId = item.game.sources.find(
				(record) => record.source === "kun",
			)?.external_id;
			if (
				item.origin === "hikarinagi" &&
				!item.kunFallbackCompleted &&
				hasMissingIds(item.draft, item.game) &&
				kunId &&
				getRuntimeSourceAdapter("kun").validateId(kunId)
			) {
				try {
					const fallback = session.filterSingleSourceDraft(
						await session.getGameByIdDraft(kunId, "kun", {
							referencesOnly: true,
						}),
						"kun",
					);
					const sources = [...item.draft.sources];
					const conflicts = [...(item.associationConflicts ?? [])];
					for (const record of fallback.sources) {
						const existing =
							sources.find((old) => old.source === record.source) ??
							item.game.sources.find((old) => old.source === record.source);
						if (
							existing?.external_id &&
							existing.external_id !== record.external_id
						) {
							conflicts.push(
								i18n.t(
									"libraryEnrichment.idConflict",
									"{{source}}：已有 {{old}}，关联为 {{next}}",
									{
										source: getRuntimeSourceAdapter(record.source).label,
										old: existing.external_id,
										next: record.external_id,
									},
								),
							);
						} else if (
							!existing ||
							(existing.data == null && record.data != null)
						) {
							const index = sources.findIndex(
								(old) => old.source === record.source,
							);
							if (index < 0) sources.push(record);
							else sources[index] = record;
						}
					}
					// Kungal 只补缺失身份；成功尝试过后，重试无需重复查询没有提供的关联。
					item.draft = session.filterSingleSourceDraft(
						{ sources },
						item.origin,
					);
					item.associationConflicts = conflicts;
					item.kunFallbackCompleted = true;
				} catch (error) {
					if (signal.aborted || isAbortError(error)) throw error;
					failedLookups.add(item.game.id);
				}
			}
		} catch (error) {
			if (signal.aborted || isAbortError(error)) break;
			fail(item, error);
		}
		onProgress("primary", index + 1, targets.length);
	}
	next = checkLibraryEnrichmentConflicts(next, await gameService.getAllGames());
	const expandable = next.filter(
		(item) =>
			selected.has(item.game.id) &&
			item.draft &&
			!item.conflicts.length &&
			!item.error,
	);
	onProgress("expansion", 0, expandable.length);
	for (const [index, item] of expandable.entries()) {
		if (signal.aborted) break;
		if (!item.draft) continue;
		try {
			const result = await session.completeSingleSource(
				item.draft,
				item.origin,
			);
			item.draft = result.data;
			item.failedSources = result.failedSources;
			if (
				failedLookups.has(item.game.id) &&
				!item.failedSources.includes("kun")
			)
				item.failedSources.push("kun");
			item.completed = true;
		} catch (error) {
			if (signal.aborted || isAbortError(error)) break;
			fail(item, error);
		}
		onProgress("expansion", index + 1, expandable.length);
	}
	return next;
}

export async function applyLibraryEnrichment(items: LibraryEnrichmentItem[]) {
	const games = await gameService.getAllGames();
	const checked = checkLibraryEnrichmentConflicts(items, games);
	const byId = new Map(games.map((game) => [game.id, game]));
	const updates: Array<[number, UpdateGameParams]> = [];
	for (const item of checked) {
		const game = byId.get(item.game.id);
		if (!game || item.conflicts.length || !item.completed) continue;
		const payload = buildLibraryEnrichmentUpdate(item, game);
		item.game = game;
		if (payload.upsert_sources?.some((record) => record.data != null))
			updates.push([game.id, payload]);
	}
	return {
		items: checked,
		games: updates.length ? await gameService.updateBatch(updates) : [],
	};
}
