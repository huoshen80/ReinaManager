import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { snackbar } from "@/components/Snackbar";

export const queryClient = new QueryClient({
	queryCache: new QueryCache({
		onError: (error, query) => {
			if (query.meta?.errorMessage) {
				snackbar.error(`${query.meta.errorMessage}: ${error.message}`);
			}
		},
	}),
	mutationCache: new MutationCache({
		onError: (error, _variables, _context, mutation) => {
			if (mutation.meta?.errorMessage) {
				snackbar.error(`${mutation.meta.errorMessage}: ${error.message}`);
			}
		},
	}),
	defaultOptions: {
		queries: {
			staleTime: Number.POSITIVE_INFINITY,
			gcTime: 1000 * 60 * 15, // 15分钟
			retry: 1,
			refetchOnWindowFocus: false,
			refetchOnReconnect: false,
		},
	},
});
