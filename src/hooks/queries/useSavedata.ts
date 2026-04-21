/**
 * @file 存档备份数据查询层
 * @description 使用 React Query 管理存档备份相关的数据获取和操作
 * @module src/hooks/queries/useSaveData
 *
 * 包含：
 * - Key Factory：统一的 Query Key 前缀
 * - Queries：数据获取 hooks
 * - Mutations：数据操作 hooks
 */

import {
	type QueryClient,
	useMutation,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { join } from "pathe";
import { savedataService } from "@/services/invoke";
import type { SavedataRecord } from "@/types";
import {
	createGameSavedataBackup,
	getSavedataBackupPath,
} from "@/utils/appUtils";

// ============================================================================
// Key Factory - 统一的 Query Key 前缀
// ============================================================================

export const saveDataKeys = {
	all: ["saveData"] as const,
	backups: (gameId: number) => ["saveData", "backups", gameId] as const,
	backupCount: (gameId: number) => ["saveData", "backupCount", gameId] as const,
};

interface CreateBackupParams {
	gameId: number;
	savePath: string;
}

interface DeleteBackupParams {
	gameId: number;
	backup: SavedataRecord;
}

interface RestoreBackupParams {
	gameId: number;
	backup: SavedataRecord;
	savePath: string;
}

// ============================================================================
// Queries - 数据获取 hooks
// ============================================================================

/**
 * 获取指定游戏的备份列表
 * @param gameId 游戏 ID
 * @returns QueryResult<SavedataRecord[]>
 */
function useSaveDataBackups(gameId: number) {
	return useQuery({
		queryKey: saveDataKeys.backups(gameId),
		queryFn: async () => {
			return savedataService.getSavedataRecords(gameId);
		},
		enabled: !!gameId,
	});
}

export function useSaveDataBackupCount(gameId: number) {
	return useQuery({
		queryKey: saveDataKeys.backupCount(gameId),
		queryFn: async () => {
			return savedataService.getSavedataCount(gameId);
		},
	});
}

// ============================================================================
// Mutations - 数据操作 hooks
// ============================================================================

/**
 * 创建备份并同步刷新缓存 普通异步函数
 */
export async function createBackupAndSync(
	queryClient: QueryClient,
	{ gameId, savePath }: CreateBackupParams,
) {
	const backupInfo = await createGameSavedataBackup(gameId, savePath);

	await queryClient.invalidateQueries({
		queryKey: saveDataKeys.backups(gameId),
	});
	await queryClient.invalidateQueries({
		queryKey: saveDataKeys.backupCount(gameId),
	});

	return backupInfo;
}

/**
 * 创建备份
 */
function useCreateBackup() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ gameId, savePath }: CreateBackupParams) => {
			return createBackupAndSync(queryClient, { gameId, savePath });
		},
	});
}

/**
 * 删除备份
 */
function useDeleteBackup() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: async ({ backup }: DeleteBackupParams) => {
			// 直接调用后端二合一接口，同时删除文件和数据库记录
			await savedataService.deleteBackup(backup.id);
		},
		onSettled: (_, __, variables) => {
			// 无论成功失败都刷新备份列表
			queryClient.invalidateQueries({
				queryKey: saveDataKeys.backups(variables.gameId),
			});
			queryClient.invalidateQueries({
				queryKey: saveDataKeys.backupCount(variables.gameId),
			});
		},
	});
}

/**
 * 恢复备份
 */
function useRestoreBackup() {
	return useMutation({
		mutationFn: async ({ gameId, backup, savePath }: RestoreBackupParams) => {
			// 获取备份文件完整路径
			const savedataBackupPath = await getSavedataBackupPath(gameId);
			const backupFilePath = join(savedataBackupPath, backup.file);

			// 恢复备份
			await savedataService.restoreBackup(backupFilePath, savePath);
		},
	});
}

/**
 * 组合存档备份查询 + mutations
 * 用于页面层单入口消费
 */
export function useSaveDataResources(gameId: number) {
	const backupsQuery = useSaveDataBackups(gameId);

	const createBackupMutation = useCreateBackup();
	const deleteBackupMutation = useDeleteBackup();
	const restoreBackupMutation = useRestoreBackup();

	return {
		// queries
		backupList: backupsQuery.data ?? [],

		// mutations
		createBackupMutation,
		deleteBackupMutation,
		restoreBackupMutation,
	};
}
