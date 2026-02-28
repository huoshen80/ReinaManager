/**
 * @file 用户设置查询层
 * @description 使用 React Query 管理用户设置相关的数据获取和写入
 * @module src/hooks/queries/useSettings
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { settingsService } from "@/services";
import type { LogLevel } from "@/types";

// ============================================================================
// Key Factory - 统一的 Query Key 前缀
// ============================================================================

export const settingsKeys = {
	all: ["settings"] as const,
	bgmToken: () => [...settingsKeys.all, "bgmToken"] as const,
	bgmProfile: () => [...settingsKeys.all, "bgmProfile"] as const,
	logLevel: () => [...settingsKeys.all, "logLevel"] as const,
	saveRootPath: () => [...settingsKeys.all, "saveRootPath"] as const,
	dbBackupPath: () => [...settingsKeys.all, "dbBackupPath"] as const,
	portableMode: () => [...settingsKeys.all, "portableMode"] as const,
	lePath: () => [...settingsKeys.all, "lePath"] as const,
	magpiePath: () => [...settingsKeys.all, "magpiePath"] as const,
};

type BgmToken = string;
type SettingPath = string;
type SettingsQueryOptions = {
	enabled?: boolean;
};

// ============================================================================
// Queries - 数据获取 hooks
// ============================================================================

/**
 * 获取 BGM Token
 */
export function useBgmToken(options?: SettingsQueryOptions) {
	return useQuery({
		queryKey: settingsKeys.bgmToken(),
		queryFn: () => settingsService.getBgmToken(),
		enabled: options?.enabled,
	});
}

/**
 * 获取 BGM Profile
 */
export function useBgmProfile() {
	return useQuery({
		queryKey: settingsKeys.bgmProfile(),
		queryFn: () => settingsService.getBgmProfile(),
	});
}

/**
 * 获取当前日志级别
 */
export function useLogLevel(options?: SettingsQueryOptions) {
	return useQuery({
		queryKey: settingsKeys.logLevel(),
		queryFn: () => settingsService.getLogLevel(),
		enabled: options?.enabled,
	});
}

/**
 * 获取便携模式状态
 */
export function usePortableMode(options?: SettingsQueryOptions) {
	return useQuery({
		queryKey: settingsKeys.portableMode(),
		queryFn: () => settingsService.getPortableMode(),
		enabled: options?.enabled,
	});
}

/**
 * 获取存档备份根目录
 */
export function useSaveRootPath(options?: SettingsQueryOptions) {
	return useQuery({
		queryKey: settingsKeys.saveRootPath(),
		queryFn: () => settingsService.getSaveRootPath(),
		enabled: options?.enabled,
	});
}

/**
 * 获取数据库备份路径
 */
export function useDbBackupPath(options?: SettingsQueryOptions) {
	return useQuery({
		queryKey: settingsKeys.dbBackupPath(),
		queryFn: () => settingsService.getDbBackupPath(),
		enabled: options?.enabled,
	});
}

/**
 * 获取 LE 路径
 */
export function useLePath(options?: SettingsQueryOptions) {
	return useQuery({
		queryKey: settingsKeys.lePath(),
		queryFn: () => settingsService.getLePath(),
		enabled: options?.enabled,
	});
}

/**
 * 获取 Magpie 路径
 */
export function useMagpiePath(options?: SettingsQueryOptions) {
	return useQuery({
		queryKey: settingsKeys.magpiePath(),
		queryFn: () => settingsService.getMagpiePath(),
		enabled: options?.enabled,
	});
}

// ============================================================================
// Mutations - 数据操作 hooks
// ============================================================================

/**
 * 设置 BGM Token
 */
export function useSetBgmToken() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (token: BgmToken) => settingsService.setBgmToken(token),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: settingsKeys.bgmToken(),
			});
		},
	});
}

export function useSetBgmProfile() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: ({
			username,
			avatar,
		}: {
			username?: string | null;
			avatar?: string | null;
		}) => settingsService.setBgmProfile(username, avatar),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: settingsKeys.bgmProfile(),
			});
		},
	});
}

/**
 * 设置日志级别
 */
export function useSetLogLevel() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (level: LogLevel) => settingsService.setLogLevel(level),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: settingsKeys.logLevel(),
			});
		},
	});
}

/**
 * 设置便携模式
 */
export function useSetPortableMode() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (enabled: boolean) => settingsService.setPortableMode(enabled),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: settingsKeys.portableMode(),
			});
		},
	});
}

/**
 * 设置存档备份根目录
 */
export function useSetSaveRootPath() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (path: SettingPath) => settingsService.setSaveRootPath(path),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: settingsKeys.saveRootPath(),
			});
		},
	});
}

/**
 * 设置数据库备份路径
 */
export function useSetDbBackupPath() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (path: SettingPath) => settingsService.setDbBackupPath(path),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: settingsKeys.dbBackupPath(),
			});
		},
	});
}

/**
 * 设置 LE 路径
 */
export function useSetLePath() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (path: SettingPath) => settingsService.setLePath(path),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: settingsKeys.lePath(),
			});
		},
	});
}

/**
 * 设置 Magpie 路径
 */
export function useSetMagpiePath() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (path: SettingPath) => settingsService.setMagpiePath(path),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: settingsKeys.magpiePath(),
			});
		},
	});
}
