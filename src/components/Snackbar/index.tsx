import type { OptionsObject } from "notistack";
import { useSnackbar } from "notistack";
import type React from "react";

let snackbarRef: ReturnType<typeof useSnackbar> | null = null;

export const SnackbarUtilsConfigurator: React.FC = () => {
	snackbarRef = useSnackbar();
	return null;
};

// 全局调用
export const snackbar = {
	success(msg: string, options?: OptionsObject) {
		snackbarRef?.enqueueSnackbar(msg, { variant: "success", ...options });
	},
	error(msg: string, options?: OptionsObject) {
		snackbarRef?.enqueueSnackbar(msg, { variant: "error", ...options });
	},
	warning(msg: string, options?: OptionsObject) {
		snackbarRef?.enqueueSnackbar(msg, { variant: "warning", ...options });
	},
	info(msg: string, options?: OptionsObject) {
		snackbarRef?.enqueueSnackbar(msg, { variant: "info", ...options });
	},
};
