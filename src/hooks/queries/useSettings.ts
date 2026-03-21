/**
 * @file 用户设置查询层
 * @description 使用 React Query 管理用户设置相关的数据获取和写入
 * @module src/hooks/queries/useSettings
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCurrentUserProfile } from "@/api/bgm";
import { fetchVndbCurrentUserProfile } from "@/api/vndb";
import { settingsService } from "@/services/invoke";
import type { LogLevel, UpdateSettingsParams } from "@/types";

// ============================================================================
// Key Factory - 统一的 Query Key 前缀
// ============================================================================

export const settingsKeys = {
	all: ["settings"] as const,
	allSettings: () => [...settingsKeys.all, "allSettings"] as const,
	bgmToken: () => [...settingsKeys.all, "bgmToken"] as const,
	bgmCurrentUserProfile: () =>
		[...settingsKeys.all, "bgmCurrentUserProfile"] as const,
	bgmCurrentUserProfileByToken: (token: string) =>
		[...settingsKeys.bgmCurrentUserProfile(), token] as const,
	vndbToken: () => [...settingsKeys.all, "vndbToken"] as const,
	vndbCurrentUserProfile: () =>
		[...settingsKeys.all, "vndbCurrentUserProfile"] as const,
	vndbCurrentUserProfileByToken: (token: string) =>
		[...settingsKeys.vndbCurrentUserProfile(), token] as const,
	logLevel: () => [...settingsKeys.all, "logLevel"] as const,
	saveRootPath: () => [...settingsKeys.all, "saveRootPath"] as const,
	dbBackupPath: () => [...settingsKeys.all, "dbBackupPath"] as const,
	portableMode: () => [...settingsKeys.all, "portableMode"] as const,
	lePath: () => [...settingsKeys.all, "lePath"] as const,
	magpiePath: () => [...settingsKeys.all, "magpiePath"] as const,
};

type BgmToken = string;
type VndbToken = string;
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
 * 获取当前 BGM Token 对应的用户资料
 */
export function useBgmCurrentUserProfile(options?: SettingsQueryOptions) {
	const { data: bgmToken = "" } = useBgmToken(options);

	return useQuery({
		queryKey: settingsKeys.bgmCurrentUserProfileByToken(bgmToken),
		queryFn: () => fetchCurrentUserProfile(bgmToken),
		enabled: (options?.enabled ?? true) && Boolean(bgmToken),
	});
}

/**
 * 获取 VNDB Token
 */
export function useVndbToken(options?: SettingsQueryOptions) {
	return useQuery({
		queryKey: settingsKeys.vndbToken(),
		queryFn: () => settingsService.getVndbToken(),
		enabled: options?.enabled,
	});
}

/**
 * 获取当前 VNDB Token 对应的用户资料
 */
export function useVndbCurrentUserProfile(options?: SettingsQueryOptions) {
	const { data: vndbToken = "" } = useVndbToken(options);

	return useQuery({
		queryKey: settingsKeys.vndbCurrentUserProfileByToken(vndbToken),
		queryFn: () => fetchVndbCurrentUserProfile(vndbToken),
		enabled: (options?.enabled ?? true) && Boolean(vndbToken),
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
 * 获取所有设置
 */
export function useAllSettings(options?: SettingsQueryOptions) {
	return useQuery({
		queryKey: settingsKeys.allSettings(),
		queryFn: () => settingsService.getAllSettings(),
		enabled: options?.enabled,
		refetchOnWindowFocus: false,
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
			queryClient.invalidateQueries({
				queryKey: settingsKeys.bgmCurrentUserProfile(),
			});
		},
	});
}

/**
 * 设置 VNDB Token
 */
export function useSetVndbToken() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (token: VndbToken) => settingsService.setVndbToken(token),
		onSuccess: () => {
			queryClient.invalidateQueries({
				queryKey: settingsKeys.vndbToken(),
			});
			queryClient.invalidateQueries({
				queryKey: settingsKeys.vndbCurrentUserProfile(),
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

/**
 * 批量更新设置
 */
export function useUpdateSettings() {
	const queryClient = useQueryClient();

	return useMutation({
		mutationFn: (updates: UpdateSettingsParams) =>
			settingsService.updateSettings(updates),
		onSuccess: (_data, updates) => {
			queryClient.invalidateQueries({
				queryKey: settingsKeys.allSettings(),
			});

			if (updates.bgmToken !== undefined) {
				queryClient.invalidateQueries({
					queryKey: settingsKeys.bgmToken(),
				});
				queryClient.invalidateQueries({
					queryKey: settingsKeys.bgmCurrentUserProfile(),
				});
			}

			if (updates.vndbToken !== undefined) {
				queryClient.invalidateQueries({
					queryKey: settingsKeys.vndbToken(),
				});
				queryClient.invalidateQueries({
					queryKey: settingsKeys.vndbCurrentUserProfile(),
				});
			}

			if (updates.saveRootPath !== undefined) {
				queryClient.invalidateQueries({
					queryKey: settingsKeys.saveRootPath(),
				});
			}

			if (updates.dbBackupPath !== undefined) {
				queryClient.invalidateQueries({
					queryKey: settingsKeys.dbBackupPath(),
				});
			}

			if (updates.lePath !== undefined) {
				queryClient.invalidateQueries({
					queryKey: settingsKeys.lePath(),
				});
			}

			if (updates.magpiePath !== undefined) {
				queryClient.invalidateQueries({
					queryKey: settingsKeys.magpiePath(),
				});
			}
		},
	});
}
