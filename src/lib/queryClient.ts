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
			staleTime: 60 * 1000,
			retry: 1,
		},
	},
});
