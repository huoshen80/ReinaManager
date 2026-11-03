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
	type GameIdentityPayload,
	type GameRuntimeInsertOptions,
	getGameIdentityKeys,
} from "@/metadata/data/metadata";
import { getSourceIdFromRecords } from "@/metadata/sourceRecord";
import i18n from "@/providers/i18n";
import { createCloudPlayStatusContext } from "@/services/cloudPlayStatus";
import { gameService } from "@/services/invoke";
import type {
	BatchOperationResult,
	GameMetadataDraft,
	InsertGameParams,
} from "@/types";
import type { PlayStatus } from "@/types/collection";
import { getUserErrorMessage } from "@/utils/errors";

export interface BulkImportActionInput extends BatchImportGameCandidate {
	status?: string;
	playStatus?: PlayStatus;
}

export type BulkImportMode = "metadata" | "custom";

export interface BulkImportDuplicateGroup {
	readonly identityKey: string;
	readonly itemKeys: readonly string[];
}

export interface BulkImportDuplicate {
	itemKey: string;
	inLibrary: boolean;
	groups: readonly BulkImportDuplicateGroup[];
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
	const { data: allGames } = useAllGames();
	const existingGameKeys = useMemo(() => {
		const keys = new Set<string>();
		for (const game of allGames ?? []) {
			for (const key of getGameIdentityKeys(game)) keys.add(key);
		}
		return keys;
	}, [allGames]);

	const checkGameExists = useCallback(
		(gameData: GameIdentityPayload) =>
			getGameIdentityKeys(gameData).some((key) => existingGameKeys.has(key)),
		[existingGameKeys],
	);

	return { checkGameExists };
}

export function useSingleGameAddActions() {
	const addGameMutation = useAddGame();
	const { checkGameExists } = useGameDuplicateChecker();
	const metadataAddActionMutation = useMutation({
		mutationFn: async ({
			gameData,
			runtimeOptions,
		}: {
			gameData: GameMetadataDraft;
			runtimeOptions?: GameRuntimeInsertOptions;
		}) => {
			const insertData = await buildInsertGameData(gameData, runtimeOptions);

			if (checkGameExists(insertData)) {
				throw new Error(i18n.t("components.AddModal.gameExists", "游戏已存在"));
			}

			return addGameMutation.mutateAsync(insertData);
		},
	});

	const addGameFromMetadata = useCallback(
		async (
			gameData: GameMetadataDraft,
			runtimeOptions?: GameRuntimeInsertOptions,
		) => {
			return metadataAddActionMutation.mutateAsync({
				gameData,
				runtimeOptions,
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
	const findBulkImportDuplicates = useCallback(
		(
			items: (BulkImportActionInput & { key: string })[],
		): BulkImportDuplicate[] => {
			const membersByIdentity = new Map<string, string[]>();
			const candidates = items.map((item) => {
				const payload = {
					sources: item.matchedData?.sources ?? [],
					steam_launch_id: item.steam_launch_id,
				};
				const identities = getGameIdentityKeys(payload);
				for (const identity of identities) {
					const members = membersByIdentity.get(identity) ?? [];
					members.push(item.key);
					membersByIdentity.set(identity, members);
				}
				return {
					itemKey: item.key,
					identities,
					inLibrary: checkGameExists(payload),
				};
			});
			// 每个身份只保存一份成员列表，候选引用共享组，避免展开所有两两关系。
			const groupsByIdentity = new Map<string, BulkImportDuplicateGroup>();
			for (const [identityKey, itemKeys] of membersByIdentity) {
				if (itemKeys.length > 1)
					groupsByIdentity.set(identityKey, { identityKey, itemKeys });
			}
			return candidates.flatMap(({ itemKey, identities, inLibrary }) => {
				const groups = identities.flatMap((identity) => {
					const group = groupsByIdentity.get(identity);
					return group ? [group] : [];
				});
				return inLibrary || groups.length
					? [{ itemKey, inLibrary, groups }]
					: [];
			});
		},
		[checkGameExists],
	);

	const addGamesFromBulkImport = useCallback(
		async (
			items: BulkImportActionInput[],
			{
				skipBatchDuplicateCheck = false,
			}: { skipBatchDuplicateCheck?: boolean } = {},
		): Promise<BulkImportActionResult> => {
			setIsPreparingGames(true);
			try {
				const payloads: InsertGameParams[] = [];
				const prepared: Array<{
					itemIndex: number;
					payload: InsertGameParams;
				}> = [];
				const queuedIds = new Set<string>();
				const duplicateItemIndices: number[] = [];
				const preparationErrors: BulkImportPreparationError[] = [];
				const pendingPayloads: BulkImportPendingPayload[] = [];
				// 云端游玩状态同步只预取已接入账号的数据源。
				const cloudBgmIds = new Set<string>();
				const cloudVndbIds = new Set<string>();
				const cloudHikarinagiIds = new Set<string>();
				const cloudKunIds = new Set<string>();
				for (const item of items) {
					if (item.status === "imported") {
						continue;
					}
					if (item.skipCloudStatusLookup) {
						continue;
					}
					const bgmId = item.matchedData
						? getSourceIdFromRecords(item.matchedData, "bgm")
						: undefined;
					const vndbId = item.matchedData
						? getSourceIdFromRecords(item.matchedData, "vndb")
						: undefined;
					const hikarinagiId = item.matchedData
						? getSourceIdFromRecords(item.matchedData, "hikarinagi")
						: undefined;
					const kunId = item.matchedData
						? getSourceIdFromRecords(item.matchedData, "kun")
						: undefined;
					if (bgmId) {
						cloudBgmIds.add(bgmId);
					}
					if (vndbId) {
						cloudVndbIds.add(vndbId);
					}
					if (hikarinagiId) {
						cloudHikarinagiIds.add(hikarinagiId);
					}
					if (kunId) cloudKunIds.add(kunId);
				}
				const cloudStatusContext = await createCloudPlayStatusContext({
					bgmIds: cloudBgmIds,
					vndbIds: cloudVndbIds,
					hikarinagiIds: cloudHikarinagiIds,
					kunIds: cloudKunIds,
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

					prepared.push({ itemIndex: index, payload });
				}

				if (prepared.length > 0) {
					// 网络准备期间后台安装可能入库，最终判重不能沿用开始时的缓存快照。
					const games = await gameService.getAllGames();
					const existingIds = new Set(games.flatMap(getGameIdentityKeys));
					for (const { itemIndex, payload } of prepared) {
						const identityKeys = getGameIdentityKeys(payload);
						if (
							identityKeys.some((key) => existingIds.has(key)) ||
							(!skipBatchDuplicateCheck &&
								identityKeys.some((key) => queuedIds.has(key)))
						) {
							duplicateItemIndices.push(itemIndex);
							continue;
						}
						for (const key of identityKeys) queuedIds.add(key);
						pendingPayloads.push({ itemIndex, payloadIndex: payloads.length });
						payloads.push(payload);
					}
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
		[batchAddGamesMutation],
	);

	return {
		addGamesFromBulkImport,
		findBulkImportDuplicates,
		checkGameExists,
		isAddingGames: isPreparingGames,
	};
}
