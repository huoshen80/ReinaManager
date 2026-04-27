import type { TFunction } from "i18next";
import { useCallback, useMemo, useState } from "react";
import { gameMetadataService } from "@/api";
import type { apiSourceType, FullGameData, SourceType } from "@/types";
import { isAbortError } from "@/utils/appUtils";
import { getUserErrorMessage } from "@/utils/errors";
import type {
	MixedSourceCandidates,
	MixedSourceEnabled,
	MixedSourceSelection,
} from "@/utils/metadata";

interface SearchResultState {
	open: boolean;
	results: FullGameData[];
	apiSource: SourceType;
}

interface MixedCandidateState {
	open: boolean;
	candidates: MixedSourceCandidates;
}

interface SearchMetadataParams {
	query: string;
	source: apiSourceType;
	defaults?: Partial<FullGameData>;
	withAbort?: <T>(promise: Promise<T>) => Promise<T>;
}

interface MetadataSearchFlowOptions {
	bgmToken?: string;
	mixedEnabledSources?: readonly SourceType[];
	t: TFunction;
	onResolved: (gameData: FullGameData) => void | Promise<void>;
	onError: (message: string) => void;
	getNoResultsMessage?: (source: apiSourceType) => string;
}

const EMPTY_MIXED_CANDIDATES: MixedSourceCandidates = {
	bgm: [],
	vndb: [],
	ymgal: [],
	kun: [],
};

const initialSearchResultState: SearchResultState = {
	open: false,
	results: [],
	apiSource: "bgm",
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

	return t("components.AddModal.noResults", "没有找到结果");
}

export function useMetadataSearchFlow({
	bgmToken,
	mixedEnabledSources,
	t,
	onResolved,
	onError,
	getNoResultsMessage,
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
		Partial<FullGameData> | undefined
	>();

	const getNoResultsText = useCallback(
		(source: apiSourceType) =>
			getNoResultsMessage?.(source) ?? getDefaultNoResultsMessage(t, source),
		[getNoResultsMessage, t],
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
		async ({ query, source, defaults, withAbort }: SearchMetadataParams) => {
			setIsSearching(true);
			setLastMixedDefaults(defaults);

			try {
				if (source === "mixed") {
					const candidatesPromise =
						gameMetadataService.searchMixedSourceCandidates({
							query,
							bgmToken,
							mixedEnabledSources,
							defaults,
						});
					const candidates = await (withAbort
						? withAbort(candidatesPromise)
						: candidatesPromise);

					if (!hasAnyMixedCandidate(candidates)) {
						throw new Error(getNoResultsText(source));
					}

					setMixedCandidateState({
						open: true,
						candidates,
					});
					return;
				}

				const searchPromise = gameMetadataService.searchGames({
					query,
					source,
					bgmToken,
					defaults,
				});
				const results = await (withAbort
					? withAbort(searchPromise)
					: searchPromise);

				if (results.length === 0) {
					throw new Error(getNoResultsText(source));
				}

				if (gameMetadataService.shouldUseIdSearch(query, source)) {
					await onResolved(results[0]);
					return;
				}

				setSearchResultState({
					open: true,
					results,
					apiSource: source,
				});
			} catch (error) {
				if (isAbortError(error)) {
					return;
				}
				onError(getUserErrorMessage(error, t));
			} finally {
				setIsSearching(false);
			}
		},
		[bgmToken, getNoResultsText, mixedEnabledSources, onError, onResolved, t],
	);

	const selectGame = useCallback(
		async (selectedGame: FullGameData) => {
			if (!selectedGame) {
				return;
			}

			setIsSearching(true);
			try {
				const resolvedGame =
					await gameMetadataService.enrichSelectedGameDetails({
						selectedGame,
						source: searchResultState.apiSource,
					});
				await onResolved(resolvedGame);
				closeSearchResult();
			} catch (error) {
				onError(getUserErrorMessage(error, t));
			} finally {
				setIsSearching(false);
			}
		},
		[closeSearchResult, onError, onResolved, searchResultState.apiSource, t],
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
