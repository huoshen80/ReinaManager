import { Box, CircularProgress, TextField, Typography } from "@mui/material";
import type { TextFieldProps } from "@mui/material/TextField";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
	type UserPathInspectionState,
	useUserPathInspection,
} from "@/hooks/common/useUserPathInspection";
import { getUserErrorMessage } from "@/utils/errors";

export type PathType = "file" | "directory" | "file-or-directory";

interface PathInputProps
	extends Omit<TextFieldProps, "value" | "onChange" | "error" | "helperText"> {
	value: string;
	onChange: (value: string) => void;
	pathType: PathType;
	endAdornment?: ReactNode;
	helperText?: ReactNode;
	validationError?: ReactNode;
	inspectionState?: UserPathInspectionState;
}

function matchesExpectedType(
	kind: "file" | "directory" | "missing" | "other",
	pathType: PathType,
) {
	return (
		(pathType === "file-or-directory" &&
			(kind === "file" || kind === "directory")) ||
		(pathType === "file" && kind === "file") ||
		(pathType === "directory" && kind === "directory")
	);
}

export function PathInput({
	value,
	onChange,
	pathType,
	endAdornment,
	helperText,
	validationError,
	inspectionState,
	slotProps,
	...textFieldProps
}: PathInputProps) {
	const { t } = useTranslation();
	const internalInspectionState = useUserPathInspection(
		value,
		inspectionState === undefined,
	);
	const { inspection, error, isLoading } =
		inspectionState ?? internalInspectionState;
	const wrongType = Boolean(
		inspection &&
			inspection.kind !== "missing" &&
			!matchesExpectedType(inspection.kind, pathType),
	);
	const hasError = Boolean(error) || wrongType || Boolean(validationError);
	const variableHint =
		import.meta.env.TAURI_ENV_PLATFORM === "linux"
			? t(
					"components.PathInput.linuxHint",
					`支持路径开头的 $VAR、\${VAR} 和 ~/...`,
				)
			: t("components.PathInput.windowsHint", "支持路径开头的 %VAR%\\...");

	let status: ReactNode = null;
	if (validationError) {
		status = validationError;
	} else if (error) {
		status = getUserErrorMessage(error, t);
	} else if (inspection) {
		const stateText =
			inspection.kind === "missing"
				? t("components.PathInput.missing", "当前路径不存在")
				: wrongType
					? t("components.PathInput.wrongType", "路径类型不符合当前字段要求")
					: t("components.PathInput.available", "路径可用");
		status = (
			<Box component="span" className="block min-w-0">
				<Typography
					component="span"
					variant="caption"
					className="block truncate"
				>
					{t("components.PathInput.resolvedPath", "实际位置：{{path}}", {
						path: inspection.resolved_path,
					})}
				</Typography>
				<Typography
					component="span"
					variant="caption"
					color={
						wrongType
							? "error"
							: inspection.kind === "missing"
								? "warning.main"
								: "success.main"
					}
				>
					{stateText}
				</Typography>
			</Box>
		);
	}

	return (
		<TextField
			{...textFieldProps}
			value={value}
			onChange={(event) => onChange(event.target.value)}
			error={hasError}
			helperText={
				status ??
				helperText ??
				(isLoading ? (
					<Box component="span" className="inline-flex items-center gap-1">
						<CircularProgress size={14} />
						{variableHint}
					</Box>
				) : (
					variableHint
				))
			}
			slotProps={{
				...slotProps,
				input: {
					...slotProps?.input,
					endAdornment,
				},
			}}
		/>
	);
}
