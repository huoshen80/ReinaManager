import { useMutation } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import {
	useAddGame,
	useAllGames,
	useBatchAddGames,
} from "@/hooks/queries/useGames";
import {
	type BatchImportGameCandidate,
	buildBulkImportGameData,
	buildInsertGameData,
	getGameIdentityKeys,
} from "@/metadata/data/metadata";
import { getSourceId, type SourceRecordPayload } from "@/metadata/sourceRecord";
import i18n from "@/providers/i18n";
import { createCloudPlayStatusContext } from "@/services/cloudPlayStatus";
import type {
	BatchOperationResult,
	GameCandidateData,
	InsertGameParams,
} from "@/types";
import { getUserErrorMessage } from "@/utils/errors";

export interface BulkImportActionInput extends BatchImportGameCandidate {
	status?: string;
}

export interface BulkImportPreparationError {
	itemIndex: number;
	message: string;
}

export interface BulkImportPendingPayload {
	itemIndex: number;
	payloadIndex: number;
}

export interface BulkImportActionResult {
	pendingPayloads: BulkImportPendingPayload[];
	duplicateItemIndices: number[];
	preparationErrors: BulkImportPreparationError[];
	batchResult?: BatchOperationResult;
	mutationError?: string;
}

export function useGameDuplicateChecker() {
	const { data: allGames = [] } = useAllGames();
	const existingGameKeys = useMemo(() => {
		const keys = new Set<string>();
		for (const game of allGames) {
			for (const key of getGameIdentityKeys(game)) {
				keys.add(key);
			}
		}
		return keys;
	}, [allGames]);

	const checkGameExists = useCallback(
		(gameData: SourceRecordPayload) => {
			return getGameIdentityKeys(gameData).some((key) =>
				existingGameKeys.has(key),
			);
		},
		[existingGameKeys],
	);

	return {
		checkGameExists,
	};
}

export function useSingleGameAddActions() {
	const addGameMutation = useAddGame();
	const { checkGameExists } = useGameDuplicateChecker();
	const metadataAddActionMutation = useMutation({
		mutationFn: async ({
			gameData,
		}: {
			gameData: GameCandidateData;
			options?: {
				localpath?: string;
				fallbackIdType?: string;
				fallbackDate?: string;
			};
		}) => {
			const insertData = await buildInsertGameData(gameData);

			if (checkGameExists(insertData)) {
				throw new Error(i18n.t("components.AddModal.gameExists", "游戏已存在"));
			}

			return addGameMutation.mutateAsync(insertData);
		},
	});

	const addGameFromMetadata = useCallback(
		async (gameData: GameCandidateData) => {
			return metadataAddActionMutation.mutateAsync({
				gameData,
			});
		},
		[metadataAddActionMutation],
	);

	return {
		addGameFromMetadata,
		isAddingGame: metadataAddActionMutation.isPending,
	};
}

export function useBulkGameAddActions() {
	const batchAddGamesMutation = useBatchAddGames();
	const { checkGameExists } = useGameDuplicateChecker();
	const [isPreparingGames, setIsPreparingGames] = useState(false);

	const addGamesFromBulkImport = useCallback(
		async (items: BulkImportActionInput[]): Promise<BulkImportActionResult> => {
			setIsPreparingGames(true);
			try {
				const payloads: InsertGameParams[] = [];
				const queuedIds = new Set<string>();
				const duplicateItemIndices: number[] = [];
				const preparationErrors: BulkImportPreparationError[] = [];
				const pendingPayloads: BulkImportPendingPayload[] = [];
				// 云端游玩状态同步目前只支持 BGM/VNDB；YMGal/KUN 不参与预取。
				const cloudBgmIds = new Set<string>();
				const cloudVndbIds = new Set<string>();
				for (const item of items) {
					if (item.status === "imported") {
						continue;
					}
					const bgmId = item.matchedData
						? getSourceId(item.matchedData, "bgm")
						: undefined;
					const vndbId = item.matchedData
						? getSourceId(item.matchedData, "vndb")
						: undefined;
					if (bgmId) {
						cloudBgmIds.add(bgmId);
					}
					if (vndbId) {
						cloudVndbIds.add(vndbId);
					}
				}
				const cloudStatusContext = await createCloudPlayStatusContext({
					bgmIds: cloudBgmIds,
					vndbIds: cloudVndbIds,
				});

				for (let index = 0; index < items.length; index++) {
					if (items[index].status === "imported") {
						continue;
					}

					let payload: InsertGameParams;
					try {
						payload = await buildBulkImportGameData(
							items[index],
							cloudStatusContext,
						);
					} catch (error) {
						const message = getUserErrorMessage(
							error,
							i18n.t.bind(i18n),
							i18n.t("errors.unknownError", "未知错误"),
						);
						preparationErrors.push({
							itemIndex: index,
							message,
						});
						continue;
					}

					const identityKeys = getGameIdentityKeys(payload);
					const existsInLibrary = checkGameExists(payload);
					const duplicatedInCurrentBatch = identityKeys.some((key) =>
						queuedIds.has(key),
					);

					if (existsInLibrary || duplicatedInCurrentBatch) {
						duplicateItemIndices.push(index);
						continue;
					}

					for (const key of identityKeys) {
						queuedIds.add(key);
					}

					pendingPayloads.push({
						itemIndex: index,
						payloadIndex: payloads.length,
					});
					payloads.push(payload);
				}

				if (payloads.length === 0) {
					return {
						pendingPayloads,
						duplicateItemIndices,
						preparationErrors,
					};
				}

				try {
					const batchResult = await batchAddGamesMutation.mutateAsync(payloads);
					return {
						pendingPayloads,
						duplicateItemIndices,
						preparationErrors,
						batchResult,
					};
				} catch (error) {
					const mutationError = getUserErrorMessage(
						error,
						i18n.t.bind(i18n),
						i18n.t("errors.unknownError", "未知错误"),
					);
					return {
						pendingPayloads,
						duplicateItemIndices,
						preparationErrors,
						mutationError,
					};
				}
			} finally {
				setIsPreparingGames(false);
			}
		},
		[batchAddGamesMutation, checkGameExists],
	);

	return {
		addGamesFromBulkImport,
		isAddingGames: isPreparingGames,
	};
}
