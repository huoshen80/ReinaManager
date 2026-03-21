import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import {
	useAddGame,
	useAllGames,
	useBatchAddGames,
} from "@/hooks/queries/useGames";
import type {
	BatchOperationResult,
	FullGameData,
	InsertGameParams,
} from "@/types";
import { getUserErrorMessage } from "@/utils/errors";
import i18n from "@/utils/i18n";
import {
	type BatchImportGameCandidate,
	getGameIdentityKeys,
	prepareBulkImportInsertGameData,
	prepareInsertGameDataFromMetadata,
} from "@/utils/metadata";

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

	const checkGameExists = useCallback(
		(gameData: Pick<InsertGameParams, "bgm_id" | "vndb_id" | "ymgal_id">) => {
			return allGames.some(
				(game) =>
					(gameData.bgm_id && game.bgm_id === gameData.bgm_id) ||
					(gameData.vndb_id && game.vndb_id === gameData.vndb_id) ||
					(gameData.ymgal_id && game.ymgal_id === gameData.ymgal_id),
			);
		},
		[allGames],
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
			options,
		}: {
			gameData: FullGameData;
			options?: {
				localpath?: string;
				fallbackIdType?: string;
				fallbackDate?: string;
			};
		}) => {
			const insertData = await prepareInsertGameDataFromMetadata(
				gameData,
				options,
			);

			if (checkGameExists(insertData)) {
				throw new Error(i18n.t("components.AddModal.gameExists"));
			}

			return addGameMutation.mutateAsync(insertData);
		},
	});

	const addGameFromMetadata = useCallback(
		async (
			gameData: FullGameData,
			options?: {
				localpath?: string;
				fallbackIdType?: string;
				fallbackDate?: string;
			},
		) => {
			return metadataAddActionMutation.mutateAsync({
				gameData,
				options,
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

				for (let index = 0; index < items.length; index++) {
					if (items[index].status === "imported") {
						continue;
					}

					let payload: InsertGameParams;
					try {
						payload = await prepareBulkImportInsertGameData(items[index]);
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
