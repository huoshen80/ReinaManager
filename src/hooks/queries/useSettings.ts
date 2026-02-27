/**
 * @file 用户设置查询层
 * @description 使用 React Query 管理用户设置相关的数据获取和写入
 * @module src/hooks/queries/useSettings
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type PortableModeResult, settingsService } from "@/services";
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

// ============================================================================
// Queries - 数据获取 hooks
// ============================================================================

/**
 * 获取 BGM Token
 */
function useBgmToken() {
	return useQuery({
		queryKey: settingsKeys.bgmToken(),
		queryFn: () => settingsService.getBgmToken(),
		// BGM Token 变化频率低，使用长缓存避免不必要请求
		staleTime: Infinity,
	});
}

/**
 * 获取 BGM Profile
 */
function useBgmProfile() {
	return useQuery({
		queryKey: settingsKeys.bgmProfile(),
		queryFn: () => settingsService.getBgmProfile(),
		staleTime: Infinity,
	});
}

/**
 * 获取当前日志级别
 */
function useLogLevel() {
	return useQuery({
		queryKey: settingsKeys.logLevel(),
		queryFn: () => settingsService.getLogLevel(),
	});
}

/**
 * 获取便携模式状态
 */
function usePortableMode() {
	return useQuery({
		queryKey: settingsKeys.portableMode(),
		queryFn: () => settingsService.getPortableMode(),
	});
}

// ============================================================================
// Mutations - 数据操作 hooks
// ============================================================================

/**
 * 设置 BGM Token
 */
function useSetBgmToken() {
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

function useSetBgmProfile() {
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
function useSetLogLevel() {
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
function useSetPortableMode() {
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
 * Settings 统一资源导出入口
 */
export function useSettingsResources() {
	const bgmTokenQuery = useBgmToken();
	const setBgmTokenMutation = useSetBgmToken();

	const bgmProfileQuery = useBgmProfile();
	const setBgmProfileMutation = useSetBgmProfile();

	const logLevelQuery = useLogLevel();
	const setLogLevelMutation = useSetLogLevel();

	const portableModeQuery = usePortableMode();
	const setPortableModeMutation = useSetPortableMode();

	return {
		// BGM Token & Profile
		bgmToken: bgmTokenQuery.data ?? "",
		setBgmToken: setBgmTokenMutation.mutateAsync,
		isSavingBgmToken: setBgmTokenMutation.isPending,
		bgmProfileUsername: bgmProfileQuery.data?.[0] ?? "",
		bgmProfileAvatar: bgmProfileQuery.data?.[1] ?? "",
		setBgmProfile: setBgmProfileMutation.mutateAsync,

		// 日志级别
		logLevel: logLevelQuery.data ?? "error",
		setLogLevel: setLogLevelMutation.mutateAsync,
		isSettingLogLevel: setLogLevelMutation.isPending,

		// 便携模式
		portableMode: portableModeQuery.data ?? false,
		setPortableMode: setPortableModeMutation.mutateAsync,
		isSettingPortableMode: setPortableModeMutation.isPending,
		portableModeResult:
			(setPortableModeMutation.data as PortableModeResult | undefined) ??
			undefined,
	};
}
