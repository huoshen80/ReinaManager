import type { TFunction } from "i18next";
import { useCallback, useMemo, useState } from "react";
import {
	gameMetadataService,
	getRuntimeSourceAdapter,
	REGISTERED_SOURCE_KEYS,
	SEARCHABLE_SOURCE_KEYS,
	type SourceCandidate,
} from "@/metadata";
import type {
	MixedSourceCandidates,
	MixedSourceEnabled,
	MixedSourceSelection,
} from "@/metadata/data/metadata";
import { isBgmAuthExpiredError, withBgmAuth } from "@/services/bgmAuthSession";
import type { apiSourceType, GameMetadataDraft, SourceType } from "@/types";
import { isAbortError } from "@/utils/async";
import { getUserErrorMessage } from "@/utils/errors";

interface SearchResultState {
	open: boolean;
	results: SourceCandidate[];
	apiSource: SourceType;
	defaults?: Partial<GameMetadataDraft>;
}

interface MixedCandidateState {
	open: boolean;
	candidates: MixedSourceCandidates;
}

interface SearchMetadataParams {
	query: string;
	source: apiSourceType;
	defaults?: Partial<GameMetadataDraft>;
	withAbort?: <T>(promise: Promise<T>) => Promise<T>;
	signal?: AbortSignal;
}

interface MetadataSearchFlowOptions {
	mixedEnabledSources?: readonly SourceType[];
	t: TFunction;
	onResolved: (gameData: GameMetadataDraft) => void | Promise<void>;
	onError: (message: string) => void;
}

const EMPTY_MIXED_CANDIDATES = REGISTERED_SOURCE_KEYS.reduce(
	(candidates, source) => {
		candidates[source] = [];
		return candidates;
	},
	{} as MixedSourceCandidates,
);

const initialSearchResultState: SearchResultState = {
	open: false,
	results: [],
	apiSource: SEARCHABLE_SOURCE_KEYS[0] as SourceType,
};

function hasAnyMixedCandidate(candidates: MixedSourceCandidates): boolean {
	return Object.values(candidates).some(
		(sourceCandidates) => sourceCandidates.length > 0,
	);
}

function getDefaultNoResultsMessage(
	t: TFunction,
	source: apiSourceType,
): string {
	if (source === "mixed") {
		return t("components.AddModal.noResultsMixed", "所有数据源均未找到该游戏");
	}

	return t(
		"components.AddModal.noResultsSource",
		"未在 {{source}} 找到该游戏，请尝试其他名称或检查 ID",
		{ source: getRuntimeSourceAdapter(source).label },
	);
}

export function useMetadataSearchFlow({
	mixedEnabledSources,
	t,
	onResolved,
	onError,
}: MetadataSearchFlowOptions) {
	const [searchResultState, setSearchResultState] = useState<SearchResultState>(
		initialSearchResultState,
	);
	const [mixedCandidateState, setMixedCandidateState] =
		useState<MixedCandidateState>({
			open: false,
			candidates: EMPTY_MIXED_CANDIDATES,
		});
	const [isSearching, setIsSearching] = useState(false);
	const [lastMixedDefaults, setLastMixedDefaults] = useState<
		Partial<GameMetadataDraft> | undefined
	>();

	const getNoResultsText = useCallback(
		(source: apiSourceType) => getDefaultNoResultsMessage(t, source),
		[t],
	);

	const closeSearchResult = useCallback(() => {
		setSearchResultState(initialSearchResultState);
	}, []);

	const closeMixedCandidates = useCallback(() => {
		setMixedCandidateState({
			open: false,
			candidates: EMPTY_MIXED_CANDIDATES,
		});
	}, []);

	const reset = useCallback(() => {
		closeSearchResult();
		closeMixedCandidates();
		setIsSearching(false);
		setLastMixedDefaults(undefined);
	}, [closeMixedCandidates, closeSearchResult]);

	const searchMetadata = useCallback(
		async ({
			query,
			source,
			defaults,
			withAbort,
			signal,
		}: SearchMetadataParams) => {
			setIsSearching(true);
			setLastMixedDefaults(defaults);

			try {
				if (source === "mixed") {
					const searchMixedCandidates = (bgmToken?: string) => {
						const candidatesPromise =
							gameMetadataService.searchMixedSourceCandidates({
								query,
								bgmToken,
								mixedEnabledSources,
								defaults,
								signal,
							});
						return withAbort ? withAbort(candidatesPromise) : candidatesPromise;
					};
					const candidates =
						mixedEnabledSources?.includes("bgm") === false
							? await searchMixedCandidates()
							: await withBgmAuth(searchMixedCandidates);

					if (!hasAnyMixedCandidate(candidates)) {
						throw new Error(getNoResultsText(source));
					}

					setMixedCandidateState({
						open: true,
						candidates,
					});
					return;
				}

				if (gameMetadataService.shouldUseIdSearch(query, source)) {
					const searchById = (bgmToken?: string) => {
						const searchPromise = gameMetadataService.searchGames({
							query,
							source,
							bgmToken,
							defaults,
							signal,
						});
						return withAbort ? withAbort(searchPromise) : searchPromise;
					};
					const results =
						source === "bgm"
							? await withBgmAuth(searchById)
							: await searchById();

					if (results.length === 0) {
						throw new Error(getNoResultsText(source));
					}

					await onResolved(results[0]);
					return;
				}

				const searchCandidates = (bgmToken?: string) => {
					const searchPromise = gameMetadataService.searchByName({
						query,
						source,
						bgmToken,
						signal,
					});
					return withAbort ? withAbort(searchPromise) : searchPromise;
				};
				const results =
					source === "bgm"
						? await withBgmAuth(searchCandidates)
						: await searchCandidates();

				if (results.length === 0) {
					throw new Error(getNoResultsText(source));
				}

				setSearchResultState({
					open: true,
					results,
					apiSource: source,
					defaults,
				});
			} catch (error) {
				if (isAbortError(error)) {
					return;
				}
				if (isBgmAuthExpiredError(error)) {
					return;
				}
				onError(getUserErrorMessage(error, t));
			} finally {
				setIsSearching(false);
			}
		},
		[getNoResultsText, mixedEnabledSources, onError, onResolved, t],
	);

	const selectGame = useCallback(
		async (selectedCandidate: SourceCandidate) => {
			if (!selectedCandidate) {
				return;
			}

			setIsSearching(true);
			try {
				const resolvedGame =
					await gameMetadataService.resolveSourceCandidateSelection({
						candidate: selectedCandidate,
						defaults: searchResultState.defaults,
					});
				await onResolved(resolvedGame);
				closeSearchResult();
			} catch (error) {
				onError(getUserErrorMessage(error, t));
			} finally {
				setIsSearching(false);
			}
		},
		[closeSearchResult, onError, onResolved, searchResultState.defaults, t],
	);

	const confirmMixedSelection = useCallback(
		async (selection: MixedSourceSelection, enabled: MixedSourceEnabled) => {
			setIsSearching(true);
			try {
				const gameData = await gameMetadataService.resolveMixedSourceSelection({
					selection,
					enabled,
					defaults: lastMixedDefaults,
				});
				await onResolved(gameData);
				closeMixedCandidates();
			} catch (error) {
				closeMixedCandidates();
				onError(getUserErrorMessage(error, t));
			} finally {
				setIsSearching(false);
			}
		},
		[closeMixedCandidates, lastMixedDefaults, onError, onResolved, t],
	);

	return useMemo(
		() => ({
			searchResultState,
			mixedCandidateState,
			isSearching,
			searchMetadata,
			closeSearchResult,
			closeMixedCandidates,
			reset,
			selectGame,
			confirmMixedSelection,
		}),
		[
			closeMixedCandidates,
			closeSearchResult,
			confirmMixedSelection,
			isSearching,
			mixedCandidateState,
			reset,
			searchMetadata,
			searchResultState,
			selectGame,
		],
	);
}
