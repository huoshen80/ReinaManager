import { useSnackbar } from "notistack";
import React from "react";

let snackbarRef: ReturnType<typeof useSnackbar> | null = null;

export const SnackbarUtilsConfigurator: React.FC = () => {
    snackbarRef = useSnackbar();
    return null;
};

// 全局调用
export const snackbar = {
    success(msg: string) {
        snackbarRef?.enqueueSnackbar(msg, { variant: "success" });
    },
    error(msg: string) {
        snackbarRef?.enqueueSnackbar(msg, { variant: "error" });
    },
    warning(msg: string) {
        snackbarRef?.enqueueSnackbar(msg, { variant: "warning" });
    },
    info(msg: string) {
        snackbarRef?.enqueueSnackbar(msg, { variant: "info" });
    },
};
