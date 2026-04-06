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
	bgmCurrentUserProfile: () =>
		[...settingsKeys.all, "bgmCurrentUserProfile"] as const,
	bgmCurrentUserProfileByToken: (token: string) =>
		[...settingsKeys.bgmCurrentUserProfile(), token] as const,
	vndbCurrentUserProfile: () =>
		[...settingsKeys.all, "vndbCurrentUserProfile"] as const,
	vndbCurrentUserProfileByToken: (token: string) =>
		[...settingsKeys.vndbCurrentUserProfile(), token] as const,
	logLevel: () => [...settingsKeys.all, "logLevel"] as const,
};

type SettingsQueryOptions = {
	enabled?: boolean;
};

// ============================================================================
// Queries - 数据获取 hooks
// ============================================================================

/**
 * 获取当前 BGM Token 对应的用户资料
 */
export function useBgmCurrentUserProfile(options?: SettingsQueryOptions) {
	const { data: settings } = useAllSettings(options);
	const bgmToken = settings?.bgm_token ?? "";

	return useQuery({
		queryKey: settingsKeys.bgmCurrentUserProfileByToken(bgmToken),
		queryFn: () => fetchCurrentUserProfile(bgmToken),
		enabled: (options?.enabled ?? true) && Boolean(bgmToken),
	});
}

/**
 * 获取当前 VNDB Token 对应的用户资料
 */
export function useVndbCurrentUserProfile(options?: SettingsQueryOptions) {
	const { data: settings } = useAllSettings(options);
	const vndbToken = settings?.vndb_token ?? "";

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

// ============================================================================
// Mutations - 数据操作 hooks
// ============================================================================

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
					queryKey: settingsKeys.bgmCurrentUserProfile(),
				});
			}

			if (updates.vndbToken !== undefined) {
				queryClient.invalidateQueries({
					queryKey: settingsKeys.vndbCurrentUserProfile(),
				});
			}
		},
	});
}
