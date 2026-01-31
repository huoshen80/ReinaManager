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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { join } from "pathe";
import { useTranslation } from "react-i18next";
import { snackbar } from "@/components/Snackbar";
import { savedataService } from "@/services";
import type { SavedataRecord } from "@/types";
import { createGameSavedataBackup, getSavedataBackupPath } from "@/utils";

// ============================================================================
// Key Factory - 统一的 Query Key 前缀
// ============================================================================

const saveDataKeys = {
	all: ["saveData"] as const,
	backups: (gameId: number) => ["saveData", "backups", gameId] as const,
};

// ============================================================================
// Queries - 数据获取 hooks
// ============================================================================

/**
 * 获取指定游戏的备份列表
 * @param gameId 游戏 ID
 * @returns QueryResult<SavedataRecord[]>
 */
export function useSaveDataBackups(gameId: number | undefined) {
	const { t } = useTranslation();

	return useQuery({
		queryKey: saveDataKeys.backups(gameId ?? 0),
		queryFn: async () => {
			if (!gameId) return [];
			return savedataService.getSavedataRecords(gameId);
		},
		enabled: !!gameId,
		staleTime: Infinity,
		refetchOnWindowFocus: false,
		retry: 1,
		meta: {
			errorMessage: t(
				"pages.Detail.Backup.loadBackupsFailed",
				"加载备份列表失败",
			),
		},
	});
}

// ============================================================================
// Mutations - 数据操作 hooks
// ============================================================================

/**
 * 创建备份
 */
export function useCreateBackup() {
	const queryClient = useQueryClient();
	const { t } = useTranslation();

	return useMutation({
		mutationFn: async ({
			gameId,
			savePath,
		}: {
			gameId: number;
			savePath: string;
		}) => {
			return createGameSavedataBackup(gameId, savePath);
		},
		onSuccess: (_, variables) => {
			snackbar.success(t("pages.Detail.Backup.backupSuccess", "备份创建成功"));
			queryClient.invalidateQueries({
				queryKey: saveDataKeys.backups(variables.gameId),
			});
		},
		onError: (error: Error) => {
			snackbar.error(
				`${t("pages.Detail.Backup.backupFailed", "备份失败")}: ${error.message}`,
			);
		},
	});
}

/**
 * 删除备份
 */
export function useDeleteBackup() {
	const queryClient = useQueryClient();
	const { t } = useTranslation();

	return useMutation({
		mutationFn: async ({
			backup,
		}: {
			gameId: number;
			backup: SavedataRecord;
		}) => {
			// 直接调用后端二合一接口，同时删除文件和数据库记录
			await savedataService.deleteBackup(backup.id);
		},
		onSuccess: () => {
			snackbar.success(t("pages.Detail.Backup.deleteSuccess", "备份删除成功"));
		},
		onError: (error: Error) => {
			snackbar.error(
				`${t("pages.Detail.Backup.deleteFailed", "删除失败")}: ${error}`,
			);
		},
		onSettled: (_, __, variables) => {
			// 无论成功失败都刷新备份列表
			queryClient.invalidateQueries({
				queryKey: saveDataKeys.backups(variables.gameId),
			});
		},
	});
}

/**
 * 恢复备份
 */
export function useRestoreBackup() {
	const { t } = useTranslation();

	return useMutation({
		mutationFn: async ({
			gameId,
			backup,
			savePath,
		}: {
			gameId: number;
			backup: SavedataRecord;
			savePath: string;
		}) => {
			// 获取备份文件完整路径
			const savedataBackupPath = await getSavedataBackupPath(gameId);
			const backupFilePath = join(savedataBackupPath, backup.file);

			// 恢复备份
			await savedataService.restoreBackup(backupFilePath, savePath);
		},
		onSuccess: () => {
			snackbar.success(t("pages.Detail.Backup.restoreSuccess", "存档恢复成功"));
		},
		onError: (error: Error) => {
			snackbar.error(
				`${t("pages.Detail.Backup.restoreFailed", "恢复失败")}: ${error.message}`,
			);
		},
	});
}
