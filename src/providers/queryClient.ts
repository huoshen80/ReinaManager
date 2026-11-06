import { QueryClient } from "@tanstack/react-query";

export const LOCAL_QUERY_STALE_TIME = Number.POSITIVE_INFINITY;
export const LOCAL_QUERY_GC_TIME = Number.POSITIVE_INFINITY;
export const REMOTE_QUERY_STALE_TIME = 5 * 60_000;
export const REMOTE_QUERY_GC_TIME = 30 * 60_000;

export const remoteQueryOptions = {
	staleTime: REMOTE_QUERY_STALE_TIME,
	gcTime: REMOTE_QUERY_GC_TIME,
};

export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: LOCAL_QUERY_STALE_TIME,
			gcTime: LOCAL_QUERY_GC_TIME,
			retry: 1,
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		},
	},
});

// 索引包含 Map 和指向主缓存的数组引用，二次结构共享会破坏 rawList 的引用契约。
queryClient.setQueryDefaults(["games", "index"], { structuralSharing: false });
